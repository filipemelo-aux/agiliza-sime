import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listSystemPages } from "@/components/AdminLayout";
import { usePageRules, PAGE_RULES_KEY, MENU_PREFIX, type PageMode, type PageRule } from "@/hooks/usePageAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";

const MODE_LABEL: Record<PageMode, string> = { active: "Ativa", hidden: "Oculta", maintenance: "Em manutenção" };
const MODE_VARIANT: Record<PageMode, "outline" | "secondary" | "destructive"> = { active: "outline", hidden: "destructive", maintenance: "secondary" };
type U = { user_id: string; full_name: string };

export function PageAccessSettings() {
  const qc = useQueryClient();
  const { data: rules = [] } = usePageRules();
  const [users, setUsers] = useState<U[]>([]);
  const [filter, setFilter] = useState("");
  const [addFor, setAddFor] = useState<Record<string, { users: string[]; mode: PageMode }>>({});
  const pages = useMemo(() => listSystemPages().filter((p) => p.url !== "/admin/settings"), []);
  const menus = useMemo(() => {
    const m = new Map<string, number>();
    pages.forEach((p) => { if (p.group !== "Geral") { const k = p.group.split(" › ")[0]; m.set(k, (m.get(k) || 0) + 1); } });
    return [...m.entries()].map(([name, count]) => ({ name, count }));
  }, [pages]);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id");
      const ids = [...new Set((roles || []).map((r: any) => r.user_id))];
      if (!ids.length) return setUsers([]);
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids).order("full_name");
      const seen = new Set<string>();
      setUsers(((data || []) as U[]).filter((u) => u.user_id && !seen.has(u.user_id) && seen.add(u.user_id)));
    })();
  }, []);

  const userName = (id: string) => users.find((u) => u.user_id === id)?.full_name || "Usuário";
  const refresh = () => qc.invalidateQueries({ queryKey: PAGE_RULES_KEY });
  const db = () => (supabase as any).from("page_access_rules");

  const addUserRules = async (key: string) => {
    const a = addFor[key];
    if (!a?.users.length) return toast.error("Escolha ao menos um usuário");
    for (const uid of a.users) {
      const existing = rules.find((r) => r.page_url === key && r.user_id === uid);
      const { error } = existing
        ? await db().update({ mode: a.mode }).eq("id", existing.id)
        : await db().insert({ page_url: key, mode: a.mode, user_id: uid });
      if (error) { toast.error(error.message); break; }
    }
    setAddFor((s) => ({ ...s, [key]: { users: [], mode: a.mode } }));
    toast.success(`Aplicado a ${a.users.length} usuário(s)`);
    refresh();
  };

  const removeRule = async (id: string) => {
    const { error } = await db().delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const renderRow = (key: string, title: string, subtitle: string) => {
    const g = rules.find((r) => r.page_url === key && !r.user_id);
    const gMode: PageMode = g?.mode || "active";
    const userRules = rules.filter((r) => r.page_url === key && r.user_id);
    const a = addFor[key] || { users: [], mode: "active" as PageMode };
    const setA = (v: Partial<typeof a>) => setAddFor((s) => ({ ...s, [key]: { ...a, ...v } }));
    const toggle = (id: string) => setA({ users: a.users.includes(id) ? a.users.filter((x) => x !== id) : [...a.users, id] });
    return (
      <div key={key} className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs font-medium">{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
          <span className="text-[11px] text-muted-foreground">Para todos:</span>
          <Select value={gMode} onValueChange={(v) => setGlobal(key, v as PageMode, g)}>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 w-[220px] justify-between text-xs font-normal">
                <span className="truncate">
                  {a.users.length === 0 ? "Usuários específicos..." : a.users.length === 1 ? userName(a.users[0]) : `${a.users.length} usuários selecionados`}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-2" align="start">
              <div className="flex justify-between mb-1 px-1">
                <button type="button" className="text-[11px] text-primary" onClick={() => setA({ users: users.map((u) => u.user_id) })}>Todos</button>
                <button type="button" className="text-[11px] text-muted-foreground" onClick={() => setA({ users: [] })}>Limpar</button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {users.length === 0 && <div className="text-[11px] text-muted-foreground p-1">Nenhum usuário com acesso.</div>}
                {users.map((u) => (
                  <label key={u.user_id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted cursor-pointer text-xs">
                    <Checkbox checked={a.users.includes(u.user_id)} onCheckedChange={() => toggle(u.user_id)} />
                    <span className="truncate">{u.full_name}</span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Select value={a.mode} onValueChange={(v) => setA({ mode: v as PageMode })}>
            <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(MODE_LABEL) as PageMode[]).map((m) => <SelectItem key={m} value={m} className="text-xs">{MODE_LABEL[m]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addUserRules(key)}>
            <Plus className="h-3 w-3" /> Aplicar aos usuários
          </Button>
        </div>
      </div>
    );
  };

  const f = filter.toLowerCase();
  const visible = pages.filter((p) => `${p.group} ${p.title}`.toLowerCase().includes(f));
  const visibleMenus = menus.filter((m) => m.name.toLowerCase().includes(f));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Páginas do Sistema</h2>
        <p className="text-sm text-muted-foreground">
          Oculte ou coloque em manutenção um menu inteiro ou qualquer página, para todos ou para usuários específicos. A regra do usuário tem prioridade sobre a geral, e a regra da página tem prioridade sobre a do menu. Administradores e moderadores sempre enxergam tudo.
        </p>
      </div>
      <Input placeholder="Buscar página ou menu..." value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 max-w-sm text-xs" />
      {visibleMenus.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Menus (aplica a todas as páginas do menu)</h3>
          <div className="border border-border rounded-lg divide-y divide-border">
            {visibleMenus.map((m) => renderRow(MENU_PREFIX + m.name, m.name, `${m.count} página(s)`))}
          </div>
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Páginas</h3>
        <div className="border border-border rounded-lg divide-y divide-border">
          {visible.map((p) => renderRow(p.url, p.title, p.group))}
        </div>
      </div>
    </div>
  );
}
