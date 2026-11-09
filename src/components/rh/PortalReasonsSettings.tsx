import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Save, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { maskSentence } from "@/lib/masks";
import { cn } from "@/lib/utils";
import { DEFAULT_PORTAL_REASONS, sortPortalReasons, validatePortalReasons } from "../../../supabase/functions/_shared/driverPortalReasons";

export function PortalReasonsSettings() {
  const { tenant } = useTenant();
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const query = useQuery({
    queryKey: ["driver-portal-reasons", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      if (!tenant) throw new Error("Empresa não encontrada.");
      const { data, error } = await supabase.from("driver_portal_settings").select("reimbursement_reasons").eq("tenant_id", tenant.id).maybeSingle();
      if (error) throw error;
      return data ? validatePortalReasons(data.reimbursement_reasons as string[]) : [...DEFAULT_PORTAL_REASONS];
    },
  });
  useEffect(() => { if (query.data) setDraft(query.data); }, [query.data]);

  const startEdit = (index: number) => { setSelected(index); setEditing(index); setEditValue(draft[index] ?? ""); };
  const cancelEdit = () => {
    if (editing !== null && !draft[editing]?.trim()) { setDraft(draft.filter((_, i) => i !== editing)); setSelected(null); }
    setEditing(null);
  };
  const confirmEdit = () => {
    if (editing === null) return;
    const value = editValue.trim();
    if (!value) { toast.error("Informe o motivo."); return; }
    if (draft.some((r, i) => i !== editing && r.trim().toLowerCase() === value.toLowerCase())) { toast.error("Motivo já existe."); return; }
    const next = sortPortalReasons(draft.map((r, i) => (i === editing ? value : r)));
    setDraft(next);
    setSelected(next.indexOf(value));
    setEditing(null);
  };
  const add = () => {
    const next = [...draft, ""];
    setDraft(next);
    startEdit(next.length - 1);
  };
  const remove = () => {
    if (selected === null) return;
    setDraft(draft.filter((_, i) => i !== selected));
    setSelected(null); setEditing(null);
  };
  const save = async () => {
    if (!tenant) return;
    if (editing !== null) { toast.error("Conclua a edição antes de salvar."); return; }
    setSaving(true);
    try {
      const reasons = validatePortalReasons(draft);
      const { error } = await supabase.from("driver_portal_settings").upsert({ tenant_id: tenant.id, reimbursement_reasons: reasons });
      if (error) throw error;
      await query.refetch();
      toast.success("Motivos de reembolso salvos.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar os motivos."); }
    finally { setSaving(false); }
  };

  const busy = saving || editing !== null;
  return <section className="space-y-2 max-w-xl">
    <h3 className="text-sm font-semibold">Motivos de reembolso</h3>
    {query.isLoading || !tenant ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : query.isError ? <div className="flex items-center gap-2"><p className="text-xs text-destructive">Não foi possível carregar os motivos.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div> : <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 border-b bg-muted/40 px-2 py-1">
        <Button variant="ghost" size="icon" title="Adicionar motivo" aria-label="Adicionar motivo" disabled={busy || draft.length >= 100} onClick={add}><Plus className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" title="Editar motivo" aria-label="Editar motivo" disabled={busy || selected === null} onClick={() => selected !== null && startEdit(selected)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" title="Excluir motivo" aria-label="Excluir motivo" disabled={busy || selected === null || draft.length <= 1} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground mr-2">{draft.length} motivo(s)</span>
        <Button size="sm" disabled={busy} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Salvar</Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted z-10">
            <tr><th className="w-12 px-3 py-2 text-left font-medium">#</th><th className="px-3 py-2 text-left font-medium">Motivo</th></tr>
          </thead>
          <tbody>
            {draft.map((reason, index) => <tr key={index} onClick={() => editing === null && setSelected(index)} onDoubleClick={() => editing === null && startEdit(index)} className={cn("border-t cursor-pointer", selected === index ? "bg-primary/10" : "hover:bg-muted/50")}>
              <td className="px-3 py-1.5 text-muted-foreground">{index + 1}</td>
              <td className="px-3 py-1">
                {editing === index ? <div className="flex items-center gap-1">
                  <Input autoFocus value={editValue} maxLength={80} className="h-7 text-xs" onChange={(e) => setEditValue(maskSentence(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") cancelEdit(); }} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Confirmar" onClick={confirmEdit}><Check className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Cancelar" onClick={cancelEdit}><X className="h-4 w-4" /></Button>
                </div> : <span className="block truncate">{reason}</span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>}
  </section>;
}
