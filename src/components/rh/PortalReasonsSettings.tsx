import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlobalToolbar, ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { useTenant } from "@/hooks/useTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { DEFAULT_PORTAL_REASONS, sortPortalReasons, validatePortalReasons } from "../../../supabase/functions/_shared/driverPortalReasons";

type Row = { id: string; reason: string };

export function PortalReasonsSettings() {
  const { tenant } = useTenant();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ original: string | null; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["driver-portal-reasons", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_portal_settings").select("reimbursement_reasons").eq("tenant_id", tenant!.id).maybeSingle();
      if (error) throw error;
      return data ? validatePortalReasons(data.reimbursement_reasons as string[]) : [...DEFAULT_PORTAL_REASONS];
    },
  });
  const reasons = query.data ?? [];
  const rows: Row[] = useMemo(() => sortPortalReasons(reasons).map((r) => ({ id: r, reason: r })), [reasons]);
  const sel = [...selected][0] ?? null;

  const persist = async (next: string[], msg: string) => {
    if (!tenant) return false;
    setSaving(true);
    try {
      const valid = validatePortalReasons(sortPortalReasons(next));
      const { error } = await supabase.from("driver_portal_settings").upsert({ tenant_id: tenant.id, reimbursement_reasons: valid });
      if (error) throw error;
      await query.refetch();
      toast.success(msg);
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar os motivos."); return false; }
    finally { setSaving(false); }
  };

  const confirmDialog = async () => {
    if (!dialog) return;
    const value = dialog.value.trim();
    if (!value) { toast.error("Informe o motivo."); return; }
    if (reasons.some((r) => r !== dialog.original && r.toLowerCase() === value.toLowerCase())) { toast.error("Motivo já existe."); return; }
    const next = dialog.original ? reasons.map((r) => (r === dialog.original ? value : r)) : [...reasons, value];
    if (await persist(next, dialog.original ? "Motivo atualizado." : "Motivo adicionado.")) { setDialog(null); setSelected(new Set([value])); }
  };

  const actions: ToolbarAction[] = [
    { key: "add", label: "Adicionar motivo", icon: Plus, mode: "always", priority: true, disabled: saving || reasons.length >= 100, onClick: () => setDialog({ original: null, value: "" }) },
    { key: "edit", label: "Editar motivo", icon: Pencil, mode: "single", disabled: saving, onClick: () => sel && setDialog({ original: sel, value: sel }) },
    { key: "del", label: "Excluir motivo", icon: Trash2, mode: "single", variant: "destructive", disabled: saving || reasons.length <= 1, onClick: async () => { if (sel && await persist(reasons.filter((r) => r !== sel), "Motivo excluído.")) setSelected(new Set()); } },
  ];
  const columns: DataGridColumn<Row>[] = [
    { key: "reason", header: "Motivo", cell: (r) => r.reason, sortValue: (r) => r.reason },
  ];

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Motivos de reembolso</h3>
      <GlobalToolbar actions={actions} selectedCount={selected.size} />
      <DataGrid rows={rows} columns={columns} rowId={(r) => r.id} selected={selected} onSelectedChange={setSelected} singleSelection
        loading={query.isLoading || !tenant} minWidth={300} maxHeight="16rem" emptyMessage={query.isError ? "Não foi possível carregar os motivos." : "Nenhum motivo."}
        footer={<div className="text-[11px] text-muted-foreground">{rows.length} motivo(s)</div>} />
      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{dialog?.original ? "Editar motivo" : "Adicionar motivo"}</DialogTitle></DialogHeader>
          <Input autoFocus maxLength={60} value={dialog?.value ?? ""} onChange={(e) => setDialog((d) => d && { ...d, value: e.target.value })} onKeyDown={(e) => e.key === "Enter" && confirmDialog()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancelar</Button>
            <Button disabled={saving} onClick={confirmDialog}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
