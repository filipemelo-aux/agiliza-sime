import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, ChevronRight, ChevronDown, Plus, Pencil, DollarSign, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog, type InstallmentContext } from "./PaymentDischargeDialog";
import { ReportInfoTooltip } from "./ReportInfoTooltip";

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  conta_pai_id: string | null;
  nivel: number;
  ativo: boolean;
  tipo?: string | null;
  tipo_operacional?: string | null;
}
interface Vehicle { id: string; plate: string }
interface Expense {
  id: string;
  descricao: string;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  plano_contas_id: string | null;
  veiculo_id: string | null;
  veiculo_placa: string | null;
  valor_total: number;
  valor_pago: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  centro_custo: string;
  empresa_id?: string | null;
  unidade_id?: string | null;
}
interface Installment {
  id: string;
  expense_id: string;
  numero_parcela: number;
  total_parcelas: number | null;
  valor: number;
  data_vencimento: string;
  status: string;
}

type StatusBucket = "atrasado" | "a_vencer" | "pago";

interface PayableRow {
  key: string;
  expense: Expense;
  installment: Installment | null;
  valor: number;
  data_vencimento: string;
  status: StatusBucket;
  parcelaLabel: string;
}

const STATUS_META: Record<StatusBucket, { label: string; emoji: string; color: string; badgeCls: string; Icon: any }> = {
  atrasado: { label: "Atrasadas", emoji: "🔴", color: "text-red-600", badgeCls: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300", Icon: AlertTriangle },
  a_vencer: { label: "A Vencer (Em Aberto)", emoji: "🟡", color: "text-amber-600", badgeCls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", Icon: Clock },
  pago: { label: "Pagas", emoji: "🟢", color: "text-green-600", badgeCls: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300", Icon: CheckCircle2 },
};

const STATUS_ORDER: StatusBucket[] = ["atrasado", "a_vencer", "pago"];

export function FinancialPayablesTree() {
  const [periodoInicio, setPeriodoInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [periodoFim, setPeriodoFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<"all" | StatusBucket>("all");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [installmentsMap, setInstallmentsMap] = useState<Record<string, Installment[]>>({});
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<{ bucket: StatusBucket; rootId: string | null; rootLabel: string; rows: PayableRow[] } | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payExpense, setPayExpense] = useState<Expense | null>(null);
  const [payInstallment, setPayInstallment] = useState<InstallmentContext | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: estab } = await supabase
        .from("fiscal_establishments").select("id").eq("type", "matriz").limit(1).maybeSingle();
      setEmpresaId(estab?.id || "");

      const [{ data: expData }, { data: instData }, { data: chartData }, { data: vehData }] = await Promise.all([
        supabase.from("expenses").select("*").is("deleted_at", null).order("data_vencimento", { ascending: true }),
        supabase.from("expense_installments").select("*").order("numero_parcela"),
        supabase.from("chart_of_accounts").select("id, codigo, nome, conta_pai_id, nivel, ativo, tipo, tipo_operacional").eq("ativo", true).order("codigo"),
        supabase.from("vehicles").select("id, plate").eq("is_active", true).order("plate"),
      ]);

      const iMap: Record<string, Installment[]> = {};
      ((instData as any) || []).forEach((inst: Installment) => {
        if (!iMap[inst.expense_id]) iMap[inst.expense_id] = [];
        iMap[inst.expense_id].push(inst);
      });
      setInstallmentsMap(iMap);
      setExpenses(((expData as any) || []) as Expense[]);
      setChartAccounts(((chartData as any) || []) as ChartAccount[]);
      setVehicles(((vehData as any) || []) as Vehicle[]);
    } catch (e: any) {
      toast.error("Erro ao carregar contas a pagar", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const chartById = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chartAccounts.forEach((c) => m.set(c.id, c));
    return m;
  }, [chartAccounts]);

  const getRootAccount = useCallback((chartId: string | null | undefined): ChartAccount | null => {
    if (!chartId) return null;
    let cur = chartById.get(chartId);
    while (cur && cur.conta_pai_id && chartById.has(cur.conta_pai_id)) {
      cur = chartById.get(cur.conta_pai_id);
    }
    return cur || null;
  }, [chartById]);

  const today = format(new Date(), "yyyy-MM-dd");

  // Build one row per parcela (or per expense when no parcelas)
  const allRows = useMemo<PayableRow[]>(() => {
    const rows: PayableRow[] = [];
    for (const exp of expenses) {
      const insts = installmentsMap[exp.id];
      if (insts && insts.length > 0) {
        for (const inst of insts) {
          const paid = inst.status === "pago" || inst.status === "paga";
          const overdue = !paid && inst.data_vencimento < today;
          const bucket: StatusBucket = paid ? "pago" : overdue ? "atrasado" : "a_vencer";
          rows.push({
            key: `inst-${inst.id}`,
            expense: exp,
            installment: inst,
            valor: Number(inst.valor || 0),
            data_vencimento: inst.data_vencimento,
            status: bucket,
            parcelaLabel: `${inst.numero_parcela}/${inst.total_parcelas || insts.length}`,
          });
        }
      } else {
        const venc = exp.data_vencimento || "";
        const paid = exp.status === "pago";
        const overdue = !paid && !!venc && venc < today;
        const bucket: StatusBucket = paid ? "pago" : overdue ? "atrasado" : "a_vencer";
        rows.push({
          key: `exp-${exp.id}`,
          expense: exp,
          installment: null,
          valor: Number(exp.valor_total || 0),
          data_vencimento: venc,
          status: bucket,
          parcelaLabel: "—",
        });
      }
    }
    return rows;
  }, [expenses, installmentsMap, today]);

  // Apply filters
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!r.data_vencimento) return false;
      if (periodoInicio && r.data_vencimento < periodoInicio) return false;
      if (periodoFim && r.data_vencimento > periodoFim) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (vehicleFilter !== "all" && r.expense.veiculo_id !== vehicleFilter) return false;
      if (q) {
        const hay = `${r.expense.descricao} ${r.expense.favorecido_nome || ""} ${r.expense.veiculo_placa || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, periodoInicio, periodoFim, statusFilter, vehicleFilter, search]);

  // Group: bucket -> rootAccountId -> rows
  const grouped = useMemo(() => {
    const byBucket = new Map<StatusBucket, Map<string, { root: ChartAccount | null; rows: PayableRow[]; total: number }>>();
    for (const bucket of STATUS_ORDER) byBucket.set(bucket, new Map());
    for (const row of filteredRows) {
      const root = getRootAccount(row.expense.plano_contas_id);
      const key = root ? root.id : "__unclassified__";
      const bucketMap = byBucket.get(row.status)!;
      if (!bucketMap.has(key)) bucketMap.set(key, { root, rows: [], total: 0 });
      const entry = bucketMap.get(key)!;
      entry.rows.push(row);
      entry.total += row.valor;
    }
    // sort children entries by codigo, rows by vencimento asc
    const result = STATUS_ORDER.map((bucket) => {
      const bucketMap = byBucket.get(bucket)!;
      const total = Array.from(bucketMap.values()).reduce((s, e) => s + e.total, 0);
      const count = Array.from(bucketMap.values()).reduce((s, e) => s + e.rows.length, 0);
      const children = Array.from(bucketMap.entries())
        .map(([id, entry]) => {
          entry.rows.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
          return {
            id,
            label: entry.root ? `${entry.root.codigo} — ${entry.root.nome}` : "Sem Classificação",
            codigoSort: entry.root ? entry.root.codigo : "zzz",
            total: entry.total,
            count: entry.rows.length,
            rows: entry.rows,
          };
        })
        .sort((a, b) => a.codigoSort.localeCompare(b.codigoSort, undefined, { numeric: true, sensitivity: "base" }));
      return { bucket, total, count, children };
    });
    return result;
  }, [filteredRows, getRootAccount]);

  const totalGeral = useMemo(() => grouped.reduce((s, g) => s + g.total, 0), [grouped]);

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const openDrill = (bucket: StatusBucket, rootId: string, rootLabel: string, rows: PayableRow[]) => {
    setDrill({ bucket, rootId, rootLabel, rows });
  };

  const handlePay = (row: PayableRow) => {
    setPayExpense(row.expense);
    if (row.installment) {
      setPayInstallment({
        installmentId: row.installment.id,
        numeroParcela: row.installment.numero_parcela,
        totalParcelas: row.installment.total_parcelas || 1,
        valorParcela: Number(row.installment.valor),
        dataVencimentoParcela: row.installment.data_vencimento,
      });
    } else {
      setPayInstallment(null);
    }
    setPayOpen(true);
  };

  const handleEdit = (row: PayableRow) => {
    setEditingExpense(row.expense);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditingExpense(null);
    setFormOpen(true);
  };

  const refreshAfterMutation = async () => {
    // Preserve drill open state — refetch and rebuild rows for the drill
    const openedBucket = drill?.bucket;
    const openedRoot = drill?.rootId;
    await fetchData();
    if (openedBucket && openedRoot) {
      // reopen with fresh data after grouping recomputes
      setTimeout(() => {
        const grp = grouped.find((g) => g.bucket === openedBucket);
        const child = grp?.children.find((c) => c.id === openedRoot);
        if (child) setDrill({ bucket: openedBucket, rootId: openedRoot, rootLabel: child.label, rows: child.rows });
      }, 0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-foreground">Contas a Pagar</h1>
          <ReportInfoTooltip text="Visão de Obrigações — filtragem por data de vencimento (Regime de Caixa)." />
        </div>
        <Button size="sm" className="h-9 gap-1" onClick={handleNew}>
          <Plus className="h-4 w-4" /> Nova Despesa
        </Button>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Vencimento — Início</Label>
              <Input type="date" className="h-8 text-xs" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento — Fim</Label>
              <Input type="date" className="h-8 text-xs" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Veículo / Placa</Label>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">Todos os veículos</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Buscar (Fornecedor / Descrição)</Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 text-xs pl-7" placeholder="Digite para filtrar..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1">Status:</span>
            {[
              { v: "all" as const, label: "Todos" },
              { v: "atrasado" as const, label: "🔴 Atrasados" },
              { v: "a_vencer" as const, label: "🟡 Em Aberto" },
              { v: "pago" as const, label: "🟢 Pagos" },
            ].map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={statusFilter === opt.v ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setStatusFilter(opt.v)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex items-center justify-center text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Grupo</th>
                    <th className="px-3 py-2 font-medium text-right w-[110px]">Qtde</th>
                    <th className="px-3 py-2 font-medium text-right w-[180px]">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.every((g) => g.count === 0) && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                        Nenhuma conta a pagar no período selecionado.
                      </td>
                    </tr>
                  )}
                  {grouped.map((g) => {
                    if (g.count === 0) return null;
                    const meta = STATUS_META[g.bucket];
                    const isOpen = expanded[g.bucket] ?? true;
                    return (
                      <>
                        <tr
                          key={g.bucket}
                          onClick={() => toggle(g.bucket)}
                          className="border-b border-border/60 bg-muted/30 font-bold cursor-pointer hover:bg-muted/50"
                        >
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1.5">
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                              <span className="text-sm">{meta.emoji}</span>
                              <span className={cn("text-xs", meta.color)}>{meta.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{g.count}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums text-xs font-bold", meta.color)}>
                            {formatCurrency(g.total)}
                          </td>
                        </tr>
                        {isOpen && g.children.map((c) => (
                          <tr
                            key={`${g.bucket}-${c.id}`}
                            onClick={() => openDrill(g.bucket, c.id, c.label, c.rows)}
                            className="border-b border-border/60 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/20"
                          >
                            <td className="px-3 py-1.5" style={{ paddingLeft: 40 }}>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs">{c.label}</span>
                                <Badge variant="outline" className="h-4 text-[9px] px-1 gap-0.5">
                                  ver detalhes
                                </Badge>
                              </div>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-xs text-muted-foreground">{c.count}</td>
                            <td className={cn("px-3 py-1.5 text-right tabular-nums text-xs font-semibold", meta.color)}>
                              {formatCurrency(c.total)}
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-primary/60">
                  <tr className="bg-primary/10">
                    <td className="px-3 py-2.5 text-right font-bold text-sm" colSpan={2}>Total Geral (Período)</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-sm font-extrabold">
                      {formatCurrency(totalGeral)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down modal */}
      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {drill && (
                <>
                  <span>{STATUS_META[drill.bucket].emoji}</span>
                  <span className={STATUS_META[drill.bucket].color}>{STATUS_META[drill.bucket].label}</span>
                  <span className="text-muted-foreground">›</span>
                  <span>{drill.rootLabel}</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {drill?.rows.length ?? 0} título(s) — Total{" "}
              <b>{formatCurrency((drill?.rows || []).reduce((s, r) => s + r.valor, 0))}</b>
              {" — "}Ordenado por vencimento (mais antigo primeiro)
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium w-28">Vencimento</th>
                  <th className="px-2 py-1.5 font-medium">Fornecedor</th>
                  <th className="px-2 py-1.5 font-medium">Descrição</th>
                  <th className="px-2 py-1.5 font-medium w-20">Veículo</th>
                  <th className="px-2 py-1.5 font-medium w-16 text-center">Parcela</th>
                  <th className="px-2 py-1.5 font-medium w-28 text-right">Valor</th>
                  <th className="px-2 py-1.5 font-medium w-24 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(drill?.rows || []).map((r) => {
                  const overdue = r.status === "atrasado";
                  const paid = r.status === "pago";
                  return (
                    <tr key={r.key} className="border-b border-border/60 hover:bg-muted/30">
                      <td className={cn("px-2 py-1.5 tabular-nums", overdue && "text-red-600 font-bold")}>
                        {formatDateBR(r.data_vencimento)}
                        {overdue && (
                          <Badge className="ml-1 h-4 text-[9px] px-1 bg-red-600 text-white hover:bg-red-600">ATRASADO</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1.5 truncate max-w-[180px]" title={r.expense.favorecido_nome || ""}>
                        {r.expense.favorecido_nome || "—"}
                      </td>
                      <td className="px-2 py-1.5 truncate max-w-[260px]" title={r.expense.descricao}>
                        {r.expense.descricao}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">{r.expense.veiculo_placa || "—"}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{r.parcelaLabel}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">{formatCurrency(r.valor)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          {!paid && (
                            <Button size="sm" variant="default" className="h-6 px-2 text-[10px] gap-1" onClick={() => handlePay(r)}>
                              <DollarSign className="h-3 w-3" /> Pagar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1" onClick={() => handleEdit(r)}>
                            <Pencil className="h-3 w-3" /> Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(!drill?.rows || drill.rows.length === 0) && (
                  <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Nenhum título.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {formOpen && (
        <ExpenseFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          expense={editingExpense as any}
          empresaId={empresaId}
          chartAccounts={chartAccounts as any}
          onSaved={async () => {
            setFormOpen(false);
            setEditingExpense(null);
            await refreshAfterMutation();
          }}
        />
      )}

      {payOpen && payExpense && (
        <PaymentDischargeDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          expenseId={payExpense.id}
          valorTotal={Number(payExpense.valor_total)}
          valorPago={Number(payExpense.valor_pago)}
          planoContasId={payExpense.plano_contas_id}
          empresaId={payExpense.empresa_id || empresaId}
          unidadeId={payExpense.unidade_id}
          descricao={payExpense.descricao}
          favorecidoNome={payExpense.favorecido_nome}
          dataVencimento={payExpense.data_vencimento}
          installment={payInstallment}
          onSaved={async () => {
            setPayOpen(false);
            setPayExpense(null);
            setPayInstallment(null);
            await refreshAfterMutation();
          }}
        />
      )}
    </div>
  );
}
