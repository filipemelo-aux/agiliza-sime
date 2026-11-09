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
import { PlanoContasCombobox } from "@/components/financial/PlanoContasCombobox";
import { useUserRole } from "@/hooks/useUserRole";
import { DEFAULT_PORTAL_REASONS, sortPortalReasons, validatePortalReasons } from "../../../supabase/functions/_shared/driverPortalReasons";

type Row = { id: string; reason: string };

export function PortalReasonsSettings() {
  const { tenant } = useTenant();
  const { isAdmin } = useUserRole();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ original: string | null; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const query = useQuery({
    queryKey: ["driver-portal-reasons", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      if (!tenant) throw new Error("Empresa não disponível");
      const { data, error } = await supabase.from("driver_portal_settings").select("reimbursement_reasons, reimbursement_accounts").eq("tenant_id", tenant.id).maybeSingle();
      if (error) throw error;
      return { reasons: data ? validatePortalReasons(data.reimbursement_reasons as string[]) : [...DEFAULT_PORTAL_REASONS], accounts: (data?.reimbursement_accounts ?? {}) as Record<string, string> };
    },
  });
  const reasons = query.data?.reasons ?? [];
  const accounts = query.data?.accounts ?? {};
  const accountQuery = useQuery({
    queryKey: ["portal-reason-chart", tenant?.id], enabled: !!tenant,
    queryFn: async () => {
      if (!tenant) return [];
      const { data, error } = await supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, ativo").eq("tenant_id", tenant.id).order("codigo");
      if (error) throw error;
      const parents = new Set((data ?? []).map(a => a.conta_pai_id).filter(Boolean));
      return (data ?? []).filter(a => a.ativo && a.tipo === "despesa" && !parents.has(a.id));
    },
  });
  const rows: Row[] = useMemo(() => sortPortalReasons(reasons).map((r) => ({ id: r, reason: r })), [reasons]);
  const sel = [...selected][0] ?? null;

  const persist = async (next: string[], msg: string, mapping = accounts) => {
    if (!tenant || !isAdmin) return false;
    setSaving(true);
    try {
      const valid = validatePortalReasons(sortPortalReasons(next));
      const filteredMapping = Object.fromEntries(Object.entries(mapping).filter(([reason, id]) => valid.includes(reason) && id));
      const { error } = await supabase.from("driver_portal_settings").upsert({ tenant_id: tenant.id, reimbursement_reasons: valid, reimbursement_accounts: filteredMapping });
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
    const mapping = { ...accounts };
    if (dialog.original && mapping[dialog.original]) { mapping[value] = mapping[dialog.original]; if (value !== dialog.original) delete mapping[dialog.original]; }
    if (await persist(next, dialog.original ? "Motivo atualizado." : "Motivo adicionado.", mapping)) { setDialog(null); setSelected(new Set([value])); }
  };

  const actions: ToolbarAction[] = [
    { key: "add", label: "Adicionar motivo", icon: Plus, mode: "always", priority: true, disabled: saving || reasons.length >= 100, onClick: () => setDialog({ original: null, value: "" }) },
    { key: "edit", label: "Editar motivo", icon: Pencil, mode: "single", disabled: saving, onClick: () => sel && setDialog({ original: sel, value: sel }) },
    { key: "del", label: "Excluir motivo", icon: Trash2, mode: "single", variant: "destructive", disabled: saving || reasons.length <= 1, onClick: async () => { if (sel && await persist(reasons.filter((r) => r !== sel), "Motivo excluído.")) setSelected(new Set()); } },
  ];
  const columns: DataGridColumn<Row>[] = [
    { key: "reason", header: "Motivo", cell: (r) => r.reason, sortValue: (r) => r.reason },
    { key: "account", header: "Plano de contas", cell: (r) => (
      <div onClick={e => e.stopPropagation()} className="min-w-64">
        <PlanoContasCombobox size="sm" value={accounts[r.reason]} options={accountQuery.data ?? []} allowCreate={false} disabled={!isAdmin || saving || accountQuery.isLoading}
          includeAll allValue="" allLabel="Não definido" placeholder="Selecionar plano de contas"
          onChange={id => { void persist(reasons, "Plano de contas salvo.", { ...accounts, [r.reason]: id }); }} />
      </div>
    ) },
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
