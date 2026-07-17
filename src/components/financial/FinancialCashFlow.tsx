import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/components/SummaryCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/masks";
import { ArrowUpCircle, ArrowDownCircle, DollarSign, TrendingUp, Plus, Undo2 } from "lucide-react";
import { CashFlowFilters, CashFlowFilterValues } from "./CashFlowFilters";
import { ManualCashFlowDialog } from "./ManualCashFlowDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PlanoContasCombobox } from "./PlanoContasCombobox";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface Movimentacao {
  id: string;
  tipo: string;
  origem: string;
  origem_id: string;
  lote_id?: string | null;
  valor: number;
  data_movimentacao: string;
  descricao: string | null;
  created_at: string;
  plano_contas_id?: string | null;
}

interface MovimentacaoEnriquecida extends Movimentacao {
  pessoa_nome: string | null;
  plano_resolved_id: string | null;
}

export function FinancialCashFlow() {
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEnriquecida[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [editPlanoMov, setEditPlanoMov] = useState<MovimentacaoEnriquecida | null>(null);
  const [filters, setFilters] = useState<CashFlowFilterValues>({
    dataInicio: startOfMonth(new Date()),
    dataFim: endOfMonth(new Date()),
    tipo: "todos",
    origem: "todos",
    valorMin: "",
    valorMax: "",
    quickPeriod: "mes_atual",
    planoContasId: "todos",
  });

  useEffect(() => {
    supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
  }, []);

  const loadMovimentacoes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("movimentacoes_bancarias")
      .select("*")
      .order("data_movimentacao", { ascending: false });

    if (filters.dataInicio) query = query.gte("data_movimentacao", format(filters.dataInicio, "yyyy-MM-dd"));
    if (filters.dataFim) query = query.lte("data_movimentacao", format(filters.dataFim, "yyyy-MM-dd"));

    if (filters.tipo !== "todos") query = query.eq("tipo", filters.tipo);
    if (filters.origem === "despesas") {
      // "Despesas" filter should include legacy 'despesas', individual payments and grouped payments
      query = query.in("origem", ["despesas", "pagamento_despesa", "pagamento_agrupado"]);
    } else if (filters.origem !== "todos") {
      query = query.eq("origem", filters.origem);
    }
    if (filters.valorMin) query = query.gte("valor", Number(filters.valorMin));
    if (filters.valorMax) query = query.lte("valor", Number(filters.valorMax));

    const { data } = await query;
    const movs = (data as Movimentacao[]) || [];

    const pagarIds = movs.filter((m) => m.origem === "contas_pagar").map((m) => m.origem_id);
    const receberIds = movs.filter((m) => m.origem === "contas_receber").map((m) => m.origem_id);
    const despesaIds = movs.filter((m) => m.origem === "despesas").map((m) => m.origem_id);
    const pagDespesaIds = movs.filter((m) => m.origem === "pagamento_despesa").map((m) => m.origem_id);
    const pagamentoAgrupadoLoteIds = [...new Set(
      movs
        .filter((m) => m.origem === "pagamento_agrupado")
        .map((m) => m.lote_id || m.origem_id)
        .filter(Boolean),
    )];
    const colheitaIds = movs.filter((m) => m.origem === "colheitas").map((m) => m.origem_id);
    const recebParcialIds = movs.filter((m) => m.origem === "recebimento_conta_receber").map((m) => m.origem_id);

    const pessoaMap = new Map<string, string>();

    const [pagarRes, receberRes, despesaRes, colheitaRes, pagDespesaRes, recebParcialRes] = await Promise.all([
      pagarIds.length > 0 ? supabase.from("accounts_payable").select("id, creditor_name, creditor_id").in("id", pagarIds) : Promise.resolve({ data: [] }),
      receberIds.length > 0 ? supabase.from("contas_receber").select("id, cliente_id").in("id", receberIds) : Promise.resolve({ data: [] }),
      despesaIds.length > 0 ? supabase.from("expenses").select("id, favorecido_nome").in("id", despesaIds) : Promise.resolve({ data: [] }),
      colheitaIds.length > 0 ? supabase.from("harvest_payments").select("id, harvest_job_id, filter_context").in("id", colheitaIds) : Promise.resolve({ data: [] }),
      pagDespesaIds.length > 0 ? supabase.from("expense_payments").select("id, expense_id").in("id", pagDespesaIds) : Promise.resolve({ data: [] }),
      recebParcialIds.length > 0 ? supabase.from("receivable_payments").select("id, conta_receber_id").in("id", recebParcialIds) : Promise.resolve({ data: [] }),
    ]);


    (pagarRes.data || []).forEach((ap: any) => { if (ap.creditor_name) pessoaMap.set(ap.id, ap.creditor_name); });
    (despesaRes.data || []).forEach((e: any) => { if (e.favorecido_nome) pessoaMap.set(e.id, e.favorecido_nome); });

    // Enrich pagamento_despesa: look up expense favorecido_nome via expense_payments → expenses
    if ((pagDespesaRes.data || []).length > 0) {
      const expIds = [...new Set((pagDespesaRes.data || []).map((p: any) => p.expense_id).filter(Boolean))];
      if (expIds.length > 0) {
        const { data: exps } = await supabase.from("expenses").select("id, favorecido_nome").in("id", expIds);
        const expMap = new Map((exps || []).map((e: any) => [e.id, e.favorecido_nome]));
        (pagDespesaRes.data || []).forEach((p: any) => {
          const nome = expMap.get(p.expense_id);
          if (nome) pessoaMap.set(p.id, nome);
        });
      }
    }

    // Enrich pagamento_agrupado: origem_id/lote_id points to a batch, not a single payment.
    if (pagamentoAgrupadoLoteIds.length > 0) {
      const { data: groupPayments } = await supabase
        .from("expense_payments" as any)
        .select("lote_id, expense_id")
        .in("lote_id", pagamentoAgrupadoLoteIds);
      const groupExpenseIds = [...new Set(((groupPayments as any[]) || []).map((p) => p.expense_id).filter(Boolean))];
      if (groupExpenseIds.length > 0) {
        const { data: groupExpenses } = await supabase
          .from("expenses")
          .select("id, favorecido_nome")
          .in("id", groupExpenseIds);
        const expenseNameMap = new Map((groupExpenses || []).map((e: any) => [e.id, e.favorecido_nome]));
        const loteNamesMap = new Map<string, Set<string>>();

        ((groupPayments as any[]) || []).forEach((payment) => {
          const nome = expenseNameMap.get(payment.expense_id);
          if (!nome || !payment.lote_id) return;
          const names = loteNamesMap.get(payment.lote_id) || new Set<string>();
          names.add(nome);
          loteNamesMap.set(payment.lote_id, names);
        });

        loteNamesMap.forEach((namesSet, loteId) => {
          const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
          pessoaMap.set(loteId, names.length === 1 ? names[0] : `${names.length} favorecidos: ${names.join(", ")}`);
        });
      }
    }

    // Enrich colheitas: resolve vehicle owner name via filter_context → vehicles → profiles
    const colheitaData = colheitaRes.data || [];
    if (colheitaData.length > 0) {
      const allDriverIds = [...new Set(colheitaData.flatMap((hp: any) => (hp.filter_context || "").split(",").filter(Boolean)))];
      const { data: hvVehicles } = allDriverIds.length > 0
        ? await supabase.from("vehicles").select("driver_id, owner_id").in("driver_id", allDriverIds)
        : { data: [] };
      const ownerIds = [...new Set((hvVehicles || []).map((v: any) => v.owner_id).filter(Boolean))];
      const { data: ownerProfiles } = ownerIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name, nome_fantasia").in("user_id", ownerIds)
        : { data: [] };
      const ownerMap = new Map((ownerProfiles || []).map((p: any) => [p.user_id, p.nome_fantasia || p.full_name]));
      const driverOwnerMap = new Map((hvVehicles || []).map((v: any) => [v.driver_id, v.owner_id]));

      colheitaData.forEach((hp: any) => {
        let ownerName = "";
        if (hp.filter_context) {
          const userIds = hp.filter_context.split(",").filter(Boolean);
          for (const uid of userIds) {
            const oid = driverOwnerMap.get(uid);
            if (oid && ownerMap.has(oid)) { ownerName = ownerMap.get(oid)!; break; }
          }
        }
        if (ownerName) pessoaMap.set(hp.id, ownerName);
      });
    }

    // Resolve receivable partial payments → contas_receber → cliente
    const recebParcialCrIds = [...new Set((recebParcialRes.data || []).map((rp: any) => rp.conta_receber_id).filter(Boolean))];
    let extraContasReceber: any[] = [];
    if (recebParcialCrIds.length > 0) {
      const { data: extraCr } = await supabase.from("contas_receber").select("id, cliente_id").in("id", recebParcialCrIds);
      extraContasReceber = extraCr || [];
    }
    const crClienteMap = new Map<string, string>();
    [...(receberRes.data || []), ...extraContasReceber].forEach((cr: any) => {
      if (cr.cliente_id) crClienteMap.set(cr.id, cr.cliente_id);
    });

    const clienteIds = [...new Set([...crClienteMap.values()])];
    if (clienteIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, nome_fantasia").in("id", clienteIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.nome_fantasia || p.full_name]));
      (receberRes.data || []).forEach((cr: any) => { const nome = profileMap.get(cr.cliente_id); if (nome) pessoaMap.set(cr.id, nome); });
      (recebParcialRes.data || []).forEach((rp: any) => {
        const clienteId = crClienteMap.get(rp.conta_receber_id);
        const nome = clienteId ? profileMap.get(clienteId) : null;
        if (nome) pessoaMap.set(rp.id, nome);
      });
    }


    // Plano de contas resolution map (keyed by origem_id or lote_id)
    const planoMap = new Map<string, string>();
    (pagarRes.data || []).forEach((ap: any) => { if (ap.category_id) planoMap.set(ap.id, ap.category_id); });

    const despesaExpIdsForPlano = [
      ...despesaIds,
      ...((pagDespesaRes.data || []).map((p: any) => p.expense_id).filter(Boolean)),
    ];
    if (despesaExpIdsForPlano.length > 0) {
      const uniqueExpIds = [...new Set(despesaExpIdsForPlano)];
      const { data: expPlanos } = await supabase.from("expenses").select("id, plano_contas_id").in("id", uniqueExpIds);
      const expPlanoMap = new Map((expPlanos || []).map((e: any) => [e.id, e.plano_contas_id]));
      despesaIds.forEach((id) => { const p = expPlanoMap.get(id); if (p) planoMap.set(id, p as string); });
      (pagDespesaRes.data || []).forEach((pd: any) => {
        const p = expPlanoMap.get(pd.expense_id);
        if (p) planoMap.set(pd.id, p as string);
      });
    }

    // Refetch accounts_payable with category_id
    if (pagarIds.length > 0) {
      const { data: apPlano } = await supabase.from("accounts_payable").select("id, category_id").in("id", pagarIds);
      (apPlano || []).forEach((ap: any) => { if (ap.category_id) planoMap.set(ap.id, ap.category_id); });
    }

    let enriched: MovimentacaoEnriquecida[] = movs.map((m) => ({
      ...m,
      pessoa_nome: pessoaMap.get(m.origem_id) || pessoaMap.get(m.lote_id || "") || null,
      plano_resolved_id: m.plano_contas_id || planoMap.get(m.origem_id) || planoMap.get(m.lote_id || "") || null,
    }));

    if (filters.planoContasId === "sem_classificacao") {
      enriched = enriched.filter((m) => !m.plano_resolved_id);
    } else if (filters.planoContasId !== "todos") {
      // subtree of accounts
      const buildSubtree = (rootId: string): Set<string> => {
        const set = new Set<string>([rootId]);
        const stack = [rootId];
        while (stack.length) {
          const cur = stack.pop()!;
          chartAccounts.filter((c: any) => c.conta_pai_id === cur).forEach((c: any) => {
            if (!set.has(c.id)) { set.add(c.id); stack.push(c.id); }
          });
        }
        return set;
      };
      const ids = buildSubtree(filters.planoContasId);
      enriched = enriched.filter((m) => m.plano_resolved_id && ids.has(m.plano_resolved_id));
    }

    setMovimentacoes(enriched);
    setLoading(false);
  }, [filters, chartAccounts]);


  useEffect(() => { loadMovimentacoes(); }, [loadMovimentacoes]);

  const totals = useMemo(() => {
    const entradas = movimentacoes.filter((m) => m.tipo === "entrada").reduce((sum, m) => sum + Number(m.valor), 0);
    const saidas = movimentacoes.filter((m) => m.tipo === "saida").reduce((sum, m) => sum + Number(m.valor), 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [movimentacoes]);

  const dailySummary = useMemo(() => {
    if (!movimentacoes.length) return [];
    const byDay = new Map<string, { entradas: number; saidas: number }>();
    movimentacoes.forEach((m) => {
      const day = m.data_movimentacao;
      const current = byDay.get(day) || { entradas: 0, saidas: 0 };
      if (m.tipo === "entrada") current.entradas += Number(m.valor);
      else current.saidas += Number(m.valor);
      byDay.set(day, current);
    });

    let saldoAcumulado = 0;
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => {
        saldoAcumulado += vals.entradas - vals.saidas;
        return { date, ...vals, saldo: saldoAcumulado };
      });
  }, [movimentacoes]);

  const chartData = useMemo(() => {
    return dailySummary.map((d) => ({
      name: formatDateBR(d.date, "dd/MM"),
      Entradas: d.entradas,
      Saídas: d.saidas,
      Saldo: d.saldo,
    }));
  }, [dailySummary]);

  const origemLabel = (o: string) => {
    if (o === "contas_pagar") return "Conta a Pagar";
    if (o === "contas_receber") return "Conta a Receber";
    if (o === "recebimento_conta_receber") return "Recebimento Parcial";

    if (o === "despesas" || o === "pagamento_despesa") return "Despesa";
    if (o === "pagamento_agrupado") return "Pagamento Agrupado";
    if (o === "colheitas") return "Colheita";
    if (o === "manual") return "Manual";
    return o;
  };

  const handleReverseManual = async (m: MovimentacaoEnriquecida) => {
    if (m.origem !== "manual") return;
    const ok = await confirm({
      title: "Estornar movimentação manual",
      description: `Confirma o estorno de ${formatCurrency(Number(m.valor))} (${m.descricao || "sem descrição"})? Esta ação não pode ser desfeita.`,
      variant: "destructive",
      confirmLabel: "Estornar",
    });
    if (!ok) return;
    const { error } = await supabase.from("movimentacoes_bancarias").delete().eq("id", m.id).eq("origem", "manual");
    if (error) { toast.error("Erro ao estornar: " + error.message); return; }
    toast.success("Movimentação estornada");
    loadMovimentacoes();
  };

  const planoAccountsMap = useMemo(() => new Map<string, any>(chartAccounts.map((c: any) => [c.id, c])), [chartAccounts]);

  const canEditPlano = (m: MovimentacaoEnriquecida) =>
    ["contas_pagar", "despesas", "pagamento_despesa", "manual"].includes(m.origem);

  const savePlanoClassificacao = async (m: MovimentacaoEnriquecida, planoId: string) => {
    try {
      if (m.origem === "contas_pagar") {
        const { error } = await supabase.from("accounts_payable").update({ category_id: planoId }).eq("id", m.origem_id);
        if (error) throw error;
      } else if (m.origem === "despesas") {
        const { error } = await supabase.from("expenses").update({ plano_contas_id: planoId }).eq("id", m.origem_id);
        if (error) throw error;
      } else if (m.origem === "pagamento_despesa") {
        const { data: ep } = await supabase.from("expense_payments").select("expense_id").eq("id", m.origem_id).single();
        if (!ep?.expense_id) throw new Error("Despesa vinculada não localizada");
        const { error } = await supabase.from("expenses").update({ plano_contas_id: planoId }).eq("id", ep.expense_id);
        if (error) throw error;
      } else if (m.origem === "manual") {
        const { error } = await supabase.from("movimentacoes_bancarias").update({ plano_contas_id: planoId } as any).eq("id", m.id);
        if (error) throw error;
      } else {
        throw new Error("Origem não suporta classificação rápida");
      }
      toast.success("Plano de contas atualizado");
      setEditPlanoMov(null);
      loadMovimentacoes();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };



  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">Fluxo de Caixa</h1>
            <ReportInfoTooltip text="Baseado em Regime de Caixa (Data de Pagamento / Valor da Parcela). Mostra o dinheiro real entrando e saindo da conta — cada parcela paga aparece na data em que efetivamente saiu do caixa." />
          </div>
          <Button size="sm" className="gap-1" onClick={() => setManualDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova Movimentação
          </Button>
        </div>
        <CashFlowFilters filters={filters} onChange={setFilters} chartAccounts={chartAccounts} />
      </div>

      {/* Summary cards - compact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard icon={ArrowUpCircle} label="Entradas" value={formatCurrency(totals.entradas)} valueColor="green" />
        <SummaryCard icon={ArrowDownCircle} label="Saídas" value={formatCurrency(totals.saidas)} valueColor="red" />
        <SummaryCard icon={DollarSign} label="Saldo" value={formatCurrency(totals.saldo)} valueColor={totals.saldo >= 0 ? "green" : "red"} />
        <SummaryCard icon={TrendingUp} label="Movimentações" value={movimentacoes.length} />
      </div>

      {/* Chart - entrada vs saída */}
      {chartData.length > 1 && (
        <Card>
          <CardContent className="p-3 pt-4">
            <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Entradas vs Saídas</p>
            <div className="h-[220px] md:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 4, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Entradas" fill="hsl(142 70% 40%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Saídas" fill="hsl(0 72% 51%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily summary - compact */}
      {dailySummary.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider">Extrato</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs text-right">Entradas</TableHead>
                    <TableHead className="text-xs text-right">Saídas</TableHead>
                    <TableHead className="text-xs text-right">Saldo Acum.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySummary.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="text-xs whitespace-nowrap py-2">{formatDateBR(d.date, isMobile ? "dd/MM" : "dd/MM/yyyy (EEE)")}</TableCell>
                      <TableCell className="text-right text-xs text-green-600 font-mono py-2">{d.entradas > 0 ? formatCurrency(d.entradas) : "—"}</TableCell>
                      <TableCell className="text-right text-xs text-red-600 font-mono py-2">{d.saidas > 0 ? formatCurrency(d.saidas) : "—"}</TableCell>
                      <TableCell className={cn("text-right text-xs font-mono font-semibold py-2", d.saldo >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(d.saldo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail - mobile cards or table */}
      <Card>
        <CardContent className="p-0">
          <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider">
            Movimentações ({movimentacoes.length})
          </p>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : movimentacoes.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma movimentação no período</p>
          ) : isMobile ? (
            <div className="divide-y divide-border">
              {movimentacoes.map((m) => (
                <div key={m.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={m.tipo === "entrada" ? "default" : "destructive"}
                      className={cn("text-[10px] shrink-0", m.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
                    >
                      {m.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                    <span className={cn("text-sm font-mono font-bold", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                      {m.tipo === "saida" ? "- " : ""}{formatCurrency(Number(m.valor))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDateBR(m.data_movimentacao)}</span>
                    <Badge variant="outline" className="text-[9px]">{origemLabel(m.origem)}</Badge>
                  </div>
                  {(m.pessoa_nome || m.descricao) && (
                    <p className="text-xs text-foreground truncate">
                      {m.pessoa_nome || m.descricao}
                    </p>
                  )}
                  {(() => {
                    const plano = m.plano_resolved_id ? planoAccountsMap.get(m.plano_resolved_id) : null;
                    return plano ? (
                      <button type="button" className="text-[10px] text-muted-foreground text-left hover:underline" onClick={() => canEditPlano(m) && setEditPlanoMov(m)}>
                        <span className="font-mono mr-1">{plano.codigo}</span>{plano.nome}
                      </button>
                    ) : canEditPlano(m) ? (
                      <button type="button" className="text-[10px] text-amber-600 text-left hover:underline" onClick={() => setEditPlanoMov(m)}>
                        ⚠️ Sem classificação — classificar
                      </button>
                    ) : (
                      <span className="text-[10px] text-amber-600">⚠️ Sem classificação</span>
                    );
                  })()}
                  {m.origem === "manual" && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1" onClick={() => handleReverseManual(m)}>
                        <Undo2 className="h-3 w-3" /> Estornar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Origem</TableHead>
                    <TableHead className="text-xs">Cliente / Fornecedor</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="text-xs">Plano de Contas</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentacoes.map((m) => {
                    const plano = m.plano_resolved_id ? planoAccountsMap.get(m.plano_resolved_id) : null;
                    return (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs whitespace-nowrap py-2">{formatDateBR(m.data_movimentacao)}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant={m.tipo === "entrada" ? "default" : "destructive"} className={cn("text-[10px]", m.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}>
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap py-2">{origemLabel(m.origem)}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate py-2">{m.pessoa_nome || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate py-2">{m.descricao || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] py-2">
                        {plano ? (
                          <button
                            type="button"
                            className="text-left hover:underline truncate block w-full"
                            onClick={() => canEditPlano(m) && setEditPlanoMov(m)}
                            disabled={!canEditPlano(m)}
                            title={canEditPlano(m) ? "Clique para reclassificar" : ""}
                          >
                            <span className="font-mono text-[10px] mr-1 text-muted-foreground">{plano.codigo}</span>
                            {plano.nome}
                          </button>
                        ) : canEditPlano(m) ? (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-amber-600 hover:text-amber-700" onClick={() => setEditPlanoMov(m)}>
                            ⚠️ Sem classificação
                          </Button>
                        ) : (
                          <span className="text-amber-600 text-[10px]">⚠️ Sem classificação</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("text-right font-mono text-xs font-semibold whitespace-nowrap py-2", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                        {m.tipo === "saida" ? "- " : ""}{formatCurrency(Number(m.valor))}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {m.origem === "manual" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleReverseManual(m)} title="Estornar">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ManualCashFlowDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        onSaved={loadMovimentacoes}
        chartAccounts={chartAccounts}
      />
      {ConfirmDialog}

      <Dialog open={!!editPlanoMov} onOpenChange={(o) => !o && setEditPlanoMov(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Forçar Classificação</DialogTitle>
          </DialogHeader>
          {editPlanoMov && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p><strong>Data:</strong> {formatDateBR(editPlanoMov.data_movimentacao)}</p>
                <p><strong>Origem:</strong> {origemLabel(editPlanoMov.origem)}</p>
                {editPlanoMov.descricao && <p><strong>Descrição:</strong> {editPlanoMov.descricao}</p>}
                <p><strong>Valor:</strong> {formatCurrency(Number(editPlanoMov.valor))}</p>
              </div>
              <div>
                <label className="text-xs font-medium">Plano de Contas</label>
                <PlanoContasCombobox
                  value={editPlanoMov.plano_resolved_id || null}
                  onChange={(v) => savePlanoClassificacao(editPlanoMov, v)}
                  options={chartAccounts}
                  size="sm"
                  placeholder="Selecione a conta..."
                  defaultTipo={editPlanoMov.tipo === "entrada" ? "receita" : "despesa"}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                A alteração é aplicada na origem do lançamento ({origemLabel(editPlanoMov.origem)}) e refletirá em todos os relatórios.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditPlanoMov(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
