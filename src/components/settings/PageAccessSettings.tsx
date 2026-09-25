import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listSystemPages } from "@/components/AdminLayout";
import { usePageRules, PAGE_RULES_KEY, type PageMode, type PageRule } from "@/hooks/usePageAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

const MODE_LABEL: Record<PageMode, string> = { active: "Ativa", hidden: "Oculta", maintenance: "Em manutenção" };
const MODE_VARIANT: Record<PageMode, "outline" | "secondary" | "destructive"> = { active: "outline", hidden: "destructive", maintenance: "secondary" };

export function PageAccessSettings() {
  const qc = useQueryClient();
  const { data: rules = [] } = usePageRules();
  const [users, setUsers] = useState<{ user_id: string; full_name: string }[]>([]);
  const [filter, setFilter] = useState("");
  const [addFor, setAddFor] = useState<Record<string, { user: string; mode: PageMode }>>({});
  const pages = useMemo(() => listSystemPages().filter((p) => p.url !== "/admin/settings"), []);

  useEffect(() => {
    supabase.from("profiles").select("user_id, full_name").not("user_id", "is", null).order("full_name")
      .then(({ data }) => setUsers((data || []) as any));
  }, []);

  const userName = (id: string) => users.find((u) => u.user_id === id)?.full_name || "Usuário";
  const refresh = () => qc.invalidateQueries({ queryKey: PAGE_RULES_KEY });
  const db = () => (supabase as any).from("page_access_rules");

  const setGlobal = async (url: string, mode: PageMode, current?: PageRule) => {
    let error;
    if (mode === "active") { if (current) ({ error } = await db().delete().eq("id", current.id)); }
    else if (current) ({ error } = await db().update({ mode }).eq("id", current.id));
    else ({ error } = await db().insert({ page_url: url, mode, user_id: null }));
    if (error) return toast.error(error.message);
    refresh();
  };

  const saveMessage = async (rule: PageRule, message: string) => {
    if ((rule.message || "") === message) return;
    const { error } = await db().update({ message: message || null }).eq("id", rule.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const addUserRule = async (url: string) => {
    const a = addFor[url];
    if (!a?.user) return toast.error("Escolha o usuário");
    const existing = rules.find((r) => r.page_url === url && r.user_id === a.user);
    const { error } = existing
      ? await db().update({ mode: a.mode }).eq("id", existing.id)
      : await db().insert({ page_url: url, mode: a.mode, user_id: a.user });
    if (error) return toast.error(error.message);
    setAddFor((s) => ({ ...s, [url]: { user: "", mode: a.mode } }));
    refresh();
  };

  const removeRule = async (id: string) => {
    const { error } = await db().delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const visible = pages.filter((p) => `${p.group} ${p.title}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Páginas do Sistema</h2>
        <p className="text-sm text-muted-foreground">
          Oculte ou coloque em manutenção qualquer página, para todos ou para usuários específicos. A regra do usuário tem prioridade sobre a regra geral. Administradores e moderadores sempre enxergam tudo.
        </p>
      </div>
      <Input placeholder="Buscar página..." value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 max-w-sm text-xs" />
      <div className="border border-border rounded-lg divide-y divide-border">
        {visible.map((p) => {
          const g = rules.find((r) => r.page_url === p.url && !r.user_id);
          const gMode: PageMode = g?.mode || "active";
          const userRules = rules.filter((r) => r.page_url === p.url && r.user_id);
          const a = addFor[p.url] || { user: "", mode: "active" as PageMode };
          return (
            <div key={p.url} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-xs font-medium">{p.title}</div>
                  <div className="text-[11px] text-muted-foreground">{p.group}</div>
                </div>
                <span className="text-[11px] text-muted-foreground">Para todos:</span>
                <Select value={gMode} onValueChange={(v) => setGlobal(p.url, v as PageMode, g)}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABEL) as PageMode[]).map((m) => <SelectItem key={m} value={m} className="text-xs">{MODE_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {g && gMode !== "active" && (
                <Input defaultValue={g.message || ""} placeholder="Mensagem exibida (opcional)" className="h-7 text-xs" onBlur={(e) => saveMessage(g, e.target.value.trim())} />
              )}
              {userRules.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {userRules.map((r) => (
                    <Badge key={r.id} variant={MODE_VARIANT[r.mode]} className="text-[11px] gap-1">
                      {userName(r.user_id!)}: {MODE_LABEL[r.mode]}
                      <button type="button" onClick={() => removeRule(r.id)} aria-label="Remover regra"><Trash2 className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={a.user} onValueChange={(v) => setAddFor((s) => ({ ...s, [p.url]: { ...a, user: v } }))}>
                  <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue placeholder="Usuário específico..." /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.user_id} value={u.user_id} className="text-xs">{u.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={a.mode} onValueChange={(v) => setAddFor((s) => ({ ...s, [p.url]: { ...a, mode: v as PageMode } }))}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(MODE_LABEL) as PageMode[]).map((m) => <SelectItem key={m} value={m} className="text-xs">{MODE_LABEL[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addUserRule(p.url)}>
                  <Plus className="h-3 w-3" /> Aplicar ao usuário
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
