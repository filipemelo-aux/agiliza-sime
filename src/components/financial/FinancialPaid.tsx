import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CheckCircle2, TrendingUp, DollarSign, CalendarIcon, X, Undo2, Eye, Pencil } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { ExpenseFormDialog } from "./ExpenseFormDialog";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "expense_payment" | "legacy" | "harvest";
  expense_id: string | null;
  forma_pagamento?: string | null;
}

interface ExpenseDetail {
  id: string;
  descricao: string;
  plano_contas_id: string | null;
  centro_custo: string;
  valor_total: number;
  valor_pago: number;
  data_emissao: string;
  data_vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  observacoes: string | null;
  veiculo_placa: string | null;
  veiculo_id: string | null;
  litros: number | null;
  km_odometro: number | null;
  numero_multa: string | null;
  origem: string;
  created_at: string;
  data_pagamento: string | null;
  documento_fiscal_importado?: boolean;
  xml_original?: string | null;
  fornecedor_cnpj?: string | null;
  empresa_id?: string;
  unidade_id?: string | null;
  tipo_manutencao?: string | null;
  km_atual?: number | null;
  fornecedor_mecanica?: string | null;
  tempo_parado?: string | null;
  proxima_manutencao_km?: number | null;
}

interface PaymentRecord {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
}

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  conta_pai_id: string | null;
  tipo_operacional?: string | null;
}

const CENTRO_CUSTO_MAP: Record<string, string> = {
  frota_propria: "Frota Própria",
  frota_terceiros: "Frota Terceiros",
  administrativo: "Administrativo",
  operacional: "Operacional",
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  parcial: { label: "Parcial", variant: "secondary" },
};

const FORMA_PAGAMENTO_MAP: Record<string, string> = {
  pix: "PIX",
  ted: "TED",
  boleto: "Boleto",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cheque: "Cheque",
};

const toDateOnly = (value?: string | null) => {
  if (!value) return null;
  return String(value).slice(0, 10);
};

export function FinancialPaid() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState(false);
  const [search, setSearch] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [origemFilter, setOrigemFilter] = useState<"todos" | "expense_payment" | "legacy" | "harvest">("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExpense, setDetailExpense] = useState<ExpenseDetail | null>(null);
  const [detailPayments, setDetailPayments] = useState<PaymentRecord[]>([]);
  const [detailChart, setDetailChart] = useState<ChartAccount | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<ExpenseDetail | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [empresaId, setEmpresaId] = useState("");

  useEffect(() => { fetchData(); fetchMeta(); }, []);

  const fetchMeta = async () => {
    const [{ data: charts }, { data: estab }] = await Promise.all([
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("ativo", true).order("codigo"),
      supabase.from("fiscal_establishments").select("id").eq("type", "matriz" as any).limit(1).maybeSingle(),
    ]);
    setChartAccounts((charts || []) as ChartAccount[]);
    if (estab) setEmpresaId(estab.id);
  };

  const fetchData = async () => {
    setLoading(true);

    const [{ data: expensePayments }, { data: paidLegacy }, { data: harvestPayments }] = await Promise.all([
      supabase
        .from("expense_payments" as any)
        .select(`
          id,
          valor,
          data_pagamento,
          forma_pagamento,
          expense_id,
          expenses:expense_id (
            descricao,
            favorecido_nome
          )
        `)
        .order("data_pagamento", { ascending: false }),
      supabase
        .from("accounts_payable")
        .select("id, description, amount, paid_at, paid_amount, creditor_name")
        .eq("status", "pago" as any)
        .order("paid_at", { ascending: false }),
      supabase
        .from("harvest_payments")
        .select(`
          id,
          total_amount,
          period_start,
          period_end,
          notes,
          harvest_jobs:harvest_job_id (
            farm_name,
            client_id,
            profiles:client_id ( full_name )
          )
        `)
        .order("period_end", { ascending: false }),
    ]);

    const expenseItems: PaidItem[] = (expensePayments || []).map((p: any) => ({
      id: p.id,
      description: p.expenses?.descricao || "Pagamento de despesa",
      amount: Number(p.valor || 0),
      paid_at: toDateOnly(p.data_pagamento),
      creditor_name: p.expenses?.favorecido_nome || null,
      source: "expense_payment" as const,
      expense_id: p.expense_id,
      forma_pagamento: p.forma_pagamento || null,
    }));

    const legacyItems: PaidItem[] = (paidLegacy || []).map((a: any) => ({
      id: `legacy-${a.id}`,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: toDateOnly(a.paid_at),
      creditor_name: a.creditor_name,
      source: "legacy" as const,
      expense_id: null,
      forma_pagamento: null,
    }));

    const harvestItems: PaidItem[] = (harvestPayments || []).map((h: any) => {
      const farmName = h.harvest_jobs?.farm_name || "";
      const clientName = h.harvest_jobs?.profiles?.full_name || "";
      return {
        id: `harvest-${h.id}`,
        description: `Colheita - ${farmName}${clientName ? ` (${clientName})` : ""}`,
        amount: Number(h.total_amount || 0),
        paid_at: toDateOnly(h.period_end),
        creditor_name: clientName || farmName || "Colheita",
        source: "harvest" as const,
        expense_id: null,
        forma_pagamento: null,
      };
    });

    setItems(
      [...expenseItems, ...legacyItems, ...harvestItems].sort((a, b) => {
        const dateA = a.paid_at ? new Date(`${a.paid_at}T12:00:00`).getTime() : 0;
        const dateB = b.paid_at ? new Date(`${b.paid_at}T12:00:00`).getTime() : 0;
        return dateB - dateA;
      }),
    );

    setLoading(false);
  };

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        i.description.toLowerCase().includes(q) ||
        (i.creditor_name || "").toLowerCase().includes(q);

      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        const dateRef = i.paid_at || "";
        matchPeriodo = (!periodoInicio || dateRef >= periodoInicio) && (!periodoFim || dateRef <= periodoFim);
      }

      return matchSearch && matchPeriodo;
    });
  }, [items, search, periodoInicio, periodoFim]);

  const selectableIds = useMemo(() => filtered.filter(i => i.source === "expense_payment").map(i => i.id), [filtered]);

  const total = filtered.reduce((s, i) => s + i.amount, 0);
  const selectedTotal = useMemo(() => {
    let t = 0;
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) t += item.amount;
    });
    return t;
  }, [selectedIds, items]);

  const hasFilters = search !== "" || periodoInicio !== "" || periodoFim !== "";

  const clearFilters = () => {
    setSearch("");
    setPeriodoInicio("");
    setPeriodoFim("");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableIds.length && selectableIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  // --- Detail ---
  const openDetail = async (item: PaidItem) => {
    if (!item.expense_id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailExpense(null);
    setDetailPayments([]);
    setDetailChart(null);

    const [{ data: exp }, { data: payments }] = await Promise.all([
      supabase.from("expenses").select("*").eq("id", item.expense_id).maybeSingle(),
      supabase.from("expense_payments" as any).select("id, valor, forma_pagamento, data_pagamento, observacoes").eq("expense_id", item.expense_id).order("data_pagamento"),
    ]);

    if (exp) {
      setDetailExpense(exp as any);
      if (exp.plano_contas_id) {
        const chart = chartAccounts.find(c => c.id === exp.plano_contas_id);
        setDetailChart(chart || null);
      }
    }
    setDetailPayments((payments || []) as unknown as PaymentRecord[]);
    setDetailLoading(false);
  };

  // --- Edit ---
  const openEdit = async (item: PaidItem) => {
    if (!item.expense_id) return;
    const { data: exp } = await supabase.from("expenses").select("*").eq("id", item.expense_id).maybeSingle();
    if (exp) {
      setEditExpense(exp as any);
      setEditOpen(true);
    }
  };

  // --- Reverse ---
  const handleReverseSingle = async (item: PaidItem) => {
    if (item.source !== "expense_payment" || !item.expense_id) return;
    if (!await confirm({
      title: "Estornar pagamento",
      description: `Deseja estornar o pagamento de "${item.creditor_name || item.description}"? O registro será removido e o saldo da despesa recalculado.`,
    })) return;

    setReversing(true);
    try {
      await reversePayment(item);
      toast.success("Pagamento estornado com sucesso");
      setSelectedIds(new Set());
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar");
    }
    setReversing(false);
  };

  const handleBatchReverse = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({
      title: "Estornar selecionados",
      description: `Deseja estornar ${selectedIds.size} pagamento(s)? Os registros serão removidos e os saldos recalculados.`,
    })) return;

    setReversing(true);
    try {
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id);
        if (item && item.source === "expense_payment") {
          await reversePayment(item);
        }
      }
      toast.success(`${selectedIds.size} pagamento(s) estornado(s)`);
      setSelectedIds(new Set());
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar");
    }
    setReversing(false);
  };

  const reversePayment = async (item: PaidItem) => {
    if (!item.expense_id) return;

    await supabase.from("expense_payments" as any).delete().eq("id", item.id);

    const { data: remainingPayments } = await supabase
      .from("expense_payments" as any)
      .select("valor")
      .eq("expense_id", item.expense_id);

    const totalPago = (remainingPayments || []).reduce((s: number, p: any) => s + Number(p.valor), 0);

    const { data: expense } = await supabase
      .from("expenses")
      .select("valor_total")
      .eq("id", item.expense_id)
      .maybeSingle();

    let newStatus = "pendente";
    if (totalPago > 0 && expense && totalPago >= Number(expense.valor_total)) {
      newStatus = "pago";
    } else if (totalPago > 0) {
      newStatus = "parcial";
    }

    await supabase.from("expenses").update({
      valor_pago: totalPago,
      status: newStatus,
      ...(totalPago <= 0 ? { data_pagamento: null } : {}),
    } as any).eq("id", item.expense_id);

    const { data: installments } = await supabase
      .from("expense_installments")
      .select("id, valor, status")
      .eq("expense_id", item.expense_id)
      .eq("status", "pago" as any);

    if (installments && installments.length > 0 && totalPago < (installments || []).reduce((s: number, inst: any) => s + Number(inst.valor), 0)) {
      const sorted = [...installments].reverse();
      let deficit = (installments || []).reduce((s: number, inst: any) => s + Number(inst.valor), 0) - totalPago;
      for (const inst of sorted) {
        if (deficit <= 0) break;
        await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
        deficit -= Number(inst.valor);
      }
    }
  };

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <h1 className="text-lg font-bold text-foreground">Contas Pagas</h1>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={CheckCircle2} label="Total Pago" value={formatCurrency(total)} valueColor="green" />
        <SummaryCard icon={TrendingUp} label="Registros" value={filtered.length} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">Período:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            <span className="text-xs text-muted-foreground shrink-0">até</span>
            <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            {(periodoInicio || periodoFim) && (
              <button type="button" onClick={() => { setPeriodoInicio(""); setPeriodoFim(""); }} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Limpar período">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        {hasFilters && (
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Selection bar */}
      {selectableIds.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-2 flex-wrap">
          <Checkbox
            checked={selectedIds.size === selectableIds.length && selectableIds.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selecionada(s) — ${formatCurrency(selectedTotal)}`
              : "Selecionar todas"}
          </span>
          {selectedIds.size > 0 && (
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                onClick={handleBatchReverse}
                disabled={reversing}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {reversing ? "Processando..." : "Estornar"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cards List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <DollarSign className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma conta paga encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const isSelectable = item.source === "expense_payment";
            const isSelected = selectedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={`h-full transition-all ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
              >
                <CardContent className="flex h-full flex-col p-3">
                  {/* Row 1: Checkbox + Nome + Badge */}
                  <div className="mb-1 flex items-center gap-2">
                    {isSelectable && (
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.id)} />
                    )}
                    <p className="flex-1 truncate text-sm font-semibold text-foreground">{item.creditor_name || "Sem favorecido"}</p>
                    <Badge variant={item.source === "legacy" ? "secondary" : "default"} className="shrink-0 text-[10px]">
                      {item.source === "legacy" ? "Legado" : "Pago"}
                    </Badge>
                  </div>

                  {/* Row 2: Descrição */}
                  <p className="mb-1.5 truncate text-xs text-muted-foreground">{item.description}</p>

                  {/* Row 3: Dados */}
                  <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <div>
                      <span className="text-[11px] text-muted-foreground">Valor Pago</span>
                      <p className="font-mono font-semibold text-success">{formatCurrency(item.amount)}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground">Data Pgto</span>
                      <p className="font-medium text-foreground">{formatDateBR(item.paid_at)}</p>
                    </div>
                    {item.forma_pagamento && (
                      <div className="col-span-2">
                        <span className="text-[11px] text-muted-foreground">Forma Pgto</span>
                        <p className="text-[11px] capitalize text-foreground">{FORMA_PAGAMENTO_MAP[item.forma_pagamento] || item.forma_pagamento}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer: Action buttons */}
                  <div className="flex items-center gap-1 pt-1.5 mt-1.5 border-t border-border">
                    {isSelectable && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 text-primary"
                          onClick={() => openDetail(item)}
                          title="Detalhes"
                        >
                          <Eye className="h-3 w-3" /> Detalhes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground"
                          onClick={() => openEdit(item)}
                          title="Editar despesa"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </Button>
                        <div className="ml-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px] gap-1 text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                            onClick={() => handleReverseSingle(item)}
                            disabled={reversing}
                          >
                            <Undo2 className="h-3 w-3" /> Estornar
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md overflow-x-hidden max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Pagamento</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : detailExpense ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">Favorecido</span>
                  <p className="font-semibold text-foreground truncate">{detailExpense.favorecido_nome || "—"}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Emissão</span>
                  <p className="text-foreground">{formatDateBR(detailExpense.data_emissao)}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Valor Total</span>
                  <p className="font-mono font-bold text-foreground">{formatCurrency(Number(detailExpense.valor_total))}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Valor Pago</span>
                  <p className="font-mono font-bold text-success">{formatCurrency(Number(detailExpense.valor_pago))}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Badge variant={STATUS_MAP[detailExpense.status]?.variant || "outline"} className="text-[10px]">
                    {STATUS_MAP[detailExpense.status]?.label || detailExpense.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Centro de Custo</span>
                  <p className="text-foreground text-xs">{CENTRO_CUSTO_MAP[detailExpense.centro_custo] || detailExpense.centro_custo}</p>
                </div>
                {detailChart && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Conta Contábil</span>
                    <p className="text-xs text-foreground truncate">
                      <span className="font-mono mr-1">{detailChart.codigo}</span>{detailChart.nome}
                    </p>
                  </div>
                )}
                {detailExpense.documento_fiscal_numero && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Documento Fiscal</span>
                    <p className="text-foreground">{detailExpense.documento_fiscal_numero}</p>
                  </div>
                )}
                {detailExpense.veiculo_placa && (
                  <div>
                    <span className="text-xs text-muted-foreground">Veículo</span>
                    <p className="text-foreground">{detailExpense.veiculo_placa}</p>
                  </div>
                )}
                {detailExpense.data_vencimento && (
                  <div>
                    <span className="text-xs text-muted-foreground">Vencimento</span>
                    <p className="text-foreground">{formatDateBR(detailExpense.data_vencimento)}</p>
                  </div>
                )}
                {detailExpense.observacoes && (
                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground">Observações</span>
                    <p className="text-foreground text-xs break-words">{detailExpense.observacoes}</p>
                  </div>
                )}
              </div>

              {/* Payment history */}
              {detailPayments.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Histórico de Pagamentos ({detailPayments.length})
                  </p>
                  <div className="space-y-1.5">
                    {detailPayments.map((pay) => (
                      <div key={pay.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-success/10">
                        <span className="font-mono font-semibold shrink-0">{formatCurrency(Number(pay.valor))}</span>
                        <span className="text-muted-foreground shrink-0">{formatDateBR(toDateOnly(pay.data_pagamento))}</span>
                        <span className="text-muted-foreground truncate">{FORMA_PAGAMENTO_MAP[pay.forma_pagamento] || pay.forma_pagamento}</span>
                        {pay.observacoes && (
                          <span className="text-muted-foreground truncate ml-auto" title={pay.observacoes}>💬</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setDetailOpen(false);
                    if (detailExpense) {
                      setEditExpense(detailExpense);
                      setEditOpen(true);
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar Despesa
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Despesa não encontrada.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editExpense && empresaId && (
        <ExpenseFormDialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open);
            if (!open) setEditExpense(null);
          }}
          expense={editExpense as any}
          empresaId={empresaId}
          chartAccounts={chartAccounts as any}
          onSaved={() => {
            setEditOpen(false);
            setEditExpense(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
