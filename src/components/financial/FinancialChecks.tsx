import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { EmpresaFilter, EmpresaBadge } from "./EmpresaControls";
import { CheckIssueStandaloneDialog } from "./CheckIssueStandaloneDialog";
import { CheckPayDialog } from "./CheckPayDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { limitDisplayText } from "@/lib/displayText";
import { formatDateBR } from "@/lib/date";
import { rowToneClass, StatusLegend, type RowTone } from "@/components/ui/status-row";
import { toast } from "sonner";
import { Banknote, CalendarDays, CheckCircle2, Plus, RefreshCw, Search, WalletCards, XCircle } from "lucide-react";

interface CheckRow {
  id: string;
  empresa_id: string | null;
  numero_cheque: string | null;
  valor: number;
  favorecido_nome: string;
  data_emissao: string;
  data_vencimento: string | null;
  predatado: boolean | null;
  historico: string | null;
  vinculo_tipo: string;
  status: string;
  expense_id: string | null;
  freight_contract_id: string | null;
  movimentacao_id: string | null;
  conta_bancaria_id: string | null;
  plano_contas_id: string | null;
  data_pagamento: string | null;
}

const typeLabel: Record<string, string> = { conta_pagar: "Conta a pagar", contrato_frete: "Contrato de frete", movimentacao: "Movimentação", avulso: "Avulso" };
const statusLabel: Record<string, string> = { emitido: "Emitido", compensado: "Compensado", cancelado: "Cancelado" };

interface CheckLinkInfo {
  expenseIds: string[];
  pago: boolean;
  parcial: boolean;
  conciliado: boolean;
  vencido: boolean;
}

export function FinancialChecks({ reportMode = false }: { reportMode?: boolean }) {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [links, setLinks] = useState<Record<string, CheckLinkInfo>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [type, setType] = useState("todos");
  const [empresa, setEmpresa] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cheques" as any).select("*").order("data_emissao", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
    if (error) toast.error("Não foi possível carregar os cheques", { description: error.message });
    const list = ((data as unknown) as CheckRow[]) || [];
    setRows(list);
    setSelected(new Set());
    setLoading(false);
    void loadLinks(list);
  }, []);

  const loadLinks = async (list: CheckRow[]) => {
    if (!list.length) return setLinks({});
    try {
      const chequeIds = list.map((r) => r.id);
      const { data: linkRows } = await supabase
        .from("cheque_expense_links" as any)
        .select("cheque_id, expense_id")
        .in("cheque_id", chequeIds);

      const byCheque = new Map<string, string[]>();
      for (const row of ((linkRows as any[]) || [])) {
        const arr = byCheque.get(row.cheque_id) || [];
        arr.push(row.expense_id);
        byCheque.set(row.cheque_id, arr);
      }
      for (const r of list) {
        if (r.expense_id) {
          const arr = byCheque.get(r.id) || [];
          if (!arr.includes(r.expense_id)) arr.push(r.expense_id);
          byCheque.set(r.id, arr);
        }
      }

      const expenseIds = Array.from(new Set(Array.from(byCheque.values()).flat()));
      if (!expenseIds.length) return setLinks({});

      const [{ data: expenseRows }, { data: paymentRows }] = await Promise.all([
        supabase.from("expenses").select("id, status").in("id", expenseIds),
        supabase.from("expense_payments").select("id, expense_id").in("expense_id", expenseIds),
      ]);

      const statusByExpense = new Map<string, string>(((expenseRows as any[]) || []).map((e) => [e.id, e.status]));
      const payments = ((paymentRows as any[]) || []);
      const paymentIds = payments.map((p) => p.id);

      let movsByExpense = new Map<string, string[]>();
      let reconciledMovs = new Set<string>();
      if (paymentIds.length) {
        const { data: movRows } = await supabase
          .from("movimentacoes_bancarias")
          .select("id, origem_id")
          .eq("origem", "pagamento_despesa")
          .in("origem_id", paymentIds);
        const expenseByPayment = new Map<string, string>(payments.map((p) => [p.id, p.expense_id]));
        const movIds: string[] = [];
        for (const m of ((movRows as any[]) || [])) {
          const expId = expenseByPayment.get(m.origem_id);
          if (!expId) continue;
          movIds.push(m.id);
          const arr = movsByExpense.get(expId) || [];
          arr.push(m.id);
          movsByExpense.set(expId, arr);
        }
        if (movIds.length) {
          const [{ data: recLinks }, { data: recItems }] = await Promise.all([
            supabase.from("bank_reconciliation_item_links").select("movimentacao_id").in("movimentacao_id", movIds),
            supabase.from("bank_reconciliation_items").select("matched_movimentacao_id").in("matched_movimentacao_id", movIds),
          ]);
          reconciledMovs = new Set([
            ...((recLinks as any[]) || []).map((l) => l.movimentacao_id),
            ...((recItems as any[]) || []).map((l) => l.matched_movimentacao_id),
          ].filter(Boolean));
        }
      }

      const result: Record<string, CheckLinkInfo> = {};
      for (const [chequeId, ids] of byCheque.entries()) {
        const statuses = ids.map((id) => statusByExpense.get(id)).filter(Boolean) as string[];
        result[chequeId] = {
          expenseIds: ids,
          pago: statuses.length > 0 && statuses.every((s) => s === "pago"),
          parcial: statuses.some((s) => s === "parcial") || (statuses.some((s) => s === "pago") && statuses.some((s) => s !== "pago")),
          conciliado: ids.some((id) => (movsByExpense.get(id) || []).some((m) => reconciledMovs.has(m))),
          vencido: statuses.some((s) => s === "atrasado"),
        };
      }
      setLinks(result);
    } catch {
      setLinks({});
    }
  };

  useEffect(() => { void load(); }, [load]);



  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "todos" && row.status !== status) return false;
      if (type !== "todos" && row.vinculo_tipo !== type) return false;
      if (empresa && row.empresa_id !== empresa) return false;
      if (!term) return true;
      return [row.numero_cheque, row.favorecido_nome, row.historico, typeLabel[row.vinculo_tipo], row.status].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [rows, search, status, type, empresa]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const cancelSelected = async () => {
    const active = selectedRows.filter((row) => row.status !== "cancelado");
    if (!active.length) return;
    const { error } = await supabase.from("cheques" as any).update({ status: "cancelado" }).in("id", active.map((row) => row.id));
    if (error) return toast.error("Não foi possível cancelar os cheques", { description: error.message });
    toast.success(`${active.length} cheque(s) cancelado(s)`);
    await load();
  };

  const actions: ToolbarAction[] = [
    ...(!reportMode ? [{ key: "pay", label: "Pagar cheque", icon: Banknote, mode: "single" as const, priority: true, className: "bg-success text-success-foreground hover:bg-success/90 border-transparent", onClick: () => { const alvo = selectedRows.filter((r) => r.status === "emitido"); if (!alvo.length) return toast.info("Selecione um cheque em aberto (emitido)"); if (alvo.length > 1) return toast.info("Pague um cheque por vez"); setPayOpen(true); } }] : []),
    ...(!reportMode ? [{ key: "new", label: "Novo cheque", icon: Plus, mode: "create" as const, variant: "default" as const, onClick: () => setDialogOpen(true) }] : []),
    { key: "refresh", label: "Atualizar", icon: RefreshCw, mode: "always", variant: "outline", className: "border-border text-muted-foreground hover:bg-muted", onClick: () => { void load(); } },
    ...(!reportMode ? [{ key: "cancel", label: "Cancelar cheque", icon: XCircle, mode: "single+batch" as const, variant: "destructive" as const, onClick: () => { void cancelSelected(); } }] : []),
  ];


  const columns: DataGridColumn<CheckRow>[] = [
    { key: "numero", header: "Cheque", width: "76px", cell: (row) => <span className="whitespace-nowrap font-mono text-xs font-medium">{row.numero_cheque || "Sem número"}</span>, sortValue: (row) => row.numero_cheque || "" },
    { key: "data", header: "Emissão", width: "86px", cell: (row) => <span className="whitespace-nowrap text-xs">{formatDateBR(row.data_emissao)}</span>, sortValue: (row) => row.data_emissao },
    { key: "bomPara", header: "Bom para", width: "86px", cell: (row) => { const isPre = row.predatado || (!!row.data_vencimento && !!row.data_emissao && row.data_vencimento !== row.data_emissao); return isPre ? <span className="whitespace-nowrap text-xs font-medium text-warning">{formatDateBR(row.data_vencimento)}</span> : <span className="whitespace-nowrap text-[10px] text-muted-foreground">À vista</span>; }, sortValue: (row) => { const isPre = row.predatado || (!!row.data_vencimento && !!row.data_emissao && row.data_vencimento !== row.data_emissao); return isPre ? row.data_vencimento || "" : ""; } },
    { key: "favorecido", header: "Favorecido / Origem", cell: (row) => <div className="min-w-0"><div className="truncate whitespace-nowrap text-xs font-medium" title={row.favorecido_nome}>{limitDisplayText(row.favorecido_nome || "—")}</div><div className="truncate text-[10px] text-muted-foreground" title={row.historico || ""}>{row.historico || "Sem descrição"}</div></div>, sortValue: (row) => row.favorecido_nome },
    { key: "tipo", header: "Vínculo", width: "130px", cell: (row) => <span className="text-xs">{typeLabel[row.vinculo_tipo] || row.vinculo_tipo}</span>, sortValue: (row) => typeLabel[row.vinculo_tipo] || row.vinculo_tipo },
    { key: "empresa", header: "Empresa", width: "90px", cell: (row) => <EmpresaBadge empresaId={row.empresa_id} /> },
    { key: "valor", header: "Valor", width: "110px", align: "right", cell: (row) => <span className="font-mono text-xs font-medium">{formatCurrency(Number(row.valor))}</span>, sortValue: (row) => Number(row.valor) },
  ];

  const chequeRowTone = (row: CheckRow): RowTone => {
    if (row.status === "cancelado") return "overdue"; // Cancelado
    if (row.status === "compensado") return "resolved"; // Cheque pago / compensado
    const info = links[row.id];
    const hasLink = !!(info && info.expenseIds.length);
    if (hasLink) {
      if (info.conciliado) return "resolved";            // Pago e conciliado
      if (info.pago || info.parcial) return "pending";   // Pago não conciliado
      if (info.vencido) return "overdue";                 // Vencido (conta atrasada)
      return "neutral";                                  // A vencer (conta em aberto)
    }
    return "neutral"; // Sem conta a pagar vinculada
  };


  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><div><h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><WalletCards className="h-5 w-5 text-primary" /> {reportMode ? "Relatório de Cheques" : "Emissor de Cheques"}</h1><p className="text-[11px] text-muted-foreground">Acompanhe emissão, favorecido, origem e conta relacionada.</p></div><div className="hidden items-center gap-2 sm:flex"><span className="text-xs text-muted-foreground">{filtered.length} registro(s)</span><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div></div>
      <GlobalToolbar actions={actions} selectedCount={selected.size} filtersFirstOnMobile iconOnlyOnDesktop>
        <div className="relative"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 w-[190px] pl-7 text-xs" placeholder="Buscar cheque, favorecido..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[118px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos" className="text-xs">Todas situações</SelectItem><SelectItem value="emitido" className="text-xs">Emitidos</SelectItem><SelectItem value="compensado" className="text-xs">Compensados</SelectItem><SelectItem value="cancelado" className="text-xs">Cancelados</SelectItem></SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos" className="text-xs">Todos os vínculos</SelectItem><SelectItem value="conta_pagar" className="text-xs">Conta a pagar</SelectItem><SelectItem value="contrato_frete" className="text-xs">Contrato de frete</SelectItem><SelectItem value="movimentacao" className="text-xs">Movimentação</SelectItem></SelectContent></Select>
        <EmpresaFilter value={empresa} onChange={setEmpresa} />
        <span className="hidden items-center gap-1 text-[10px] text-muted-foreground xl:inline-flex"><CalendarDays className="h-3 w-3" /> Ordenado por emissão</span>
      </GlobalToolbar>
      <DataGrid rows={filtered} columns={columns} rowId={(row) => row.id} selected={selected} onSelectedChange={setSelected} loading={loading} emptyMessage="Nenhum cheque registrado" minWidth={980} rowClassName={(row) => rowToneClass(chequeRowTone(row))} footer={<StatusLegend items={[{ tone: "resolved", label: "Pago e conciliado" }, { tone: "pending", label: "Pago não conciliado" }, { tone: "neutral", label: "A vencer" }, { tone: "overdue", label: "Vencido" }, { tone: "overdue", label: "Cancelado" }]} />} />
      <CheckPayDialog open={payOpen} onOpenChange={setPayOpen} cheques={selectedRows.filter((r) => r.status === "emitido")} onPaid={() => { void load(); }} />
      <CheckIssueStandaloneDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => { setDialogOpen(false); void load(); }} />
    </div>
  );
}
