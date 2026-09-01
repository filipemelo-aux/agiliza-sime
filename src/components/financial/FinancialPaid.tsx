import { useState, useEffect, useMemo } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
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
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { PeriodFilter } from "@/components/PeriodFilter";
import { EmpresaFilter, EmpresaBadge } from "./EmpresaControls";


interface InstallmentInfo {
  id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: string | null;
}

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  due_date: string | null;
  creditor_name: string | null;
  source: "expense_payment" | "legacy" | "group";
  expense_id: string | null;
  forma_pagamento?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
  documento_fiscal_numero?: string | null;
  lote_id?: string | null;
  group_count?: number;
  group_payment_ids?: string[];
  installment?: InstallmentInfo | null;
  payment_id?: string | null;
  empresa_id?: string | null;
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
  const [origemFilter, setOrigemFilter] = useState<"todos" | "expense_payment" | "legacy">("todos");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailExpense, setDetailExpense] = useState<ExpenseDetail | null>(null);
  const [detailPayments, setDetailPayments] = useState<PaymentRecord[]>([]);
  const [detailChart, setDetailChart] = useState<ChartAccount | null>(null);
  const [detailInstallment, setDetailInstallment] = useState<InstallmentInfo | null>(null);


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

    const [{ data: expensePayments }, { data: paidLegacy }] = await Promise.all([
      supabase
        .from("expense_payments" as any)
        .select(`
          id,
          valor,
          data_pagamento,
          forma_pagamento,
          expense_id,
          installment_id,
          created_by,
          created_at,
          lote_id,
          skip_cashflow,
          expenses:expense_id (
            descricao,
            favorecido_nome,
            data_vencimento,
            data_emissao,
            documento_fiscal_numero,
            empresa_id
          ),
          installment:installment_id (
            id,
            data_vencimento,
            numero_parcela,
            total_parcelas
          )
        `)
        .order("data_pagamento", { ascending: false }),
      supabase
        .from("accounts_payable")
        .select("id, description, amount, paid_at, paid_amount, creditor_name")
        .eq("status", "pago" as any)
        .order("paid_at", { ascending: false }),
    ]);

    // Fetch profile names for creators
    const creatorIds = [...new Set((expensePayments || []).map((p: any) => p.created_by).filter(Boolean))];
    let creatorsMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", creatorIds);
      (profiles || []).forEach((p: any) => { creatorsMap[p.user_id] = p.full_name; });
    }

    // Split grouped payments (skip_cashflow + lote_id) from individual ones
    const groupedMap = new Map<string, any[]>();
    const individualPayments: any[] = [];
    (expensePayments || []).forEach((p: any) => {
      if (p.skip_cashflow && p.lote_id) {
        const arr = groupedMap.get(p.lote_id) || [];
        arr.push(p);
        groupedMap.set(p.lote_id, arr);
      } else {
        individualPayments.push(p);
      }
    });

    const expenseIds = [...new Set(individualPayments.map((p: any) => p.expense_id).filter(Boolean))];
    const installmentsByExpense: Record<string, any[]> = {};
    if (expenseIds.length > 0) {
      const { data: paidInstallments } = await supabase
        .from("expense_installments")
        .select("id, expense_id, numero_parcela, total_parcelas, valor, data_vencimento, status")
        .in("expense_id", expenseIds)
        .eq("status", "pago" as any)
        .order("numero_parcela");

      ((paidInstallments as any[]) || []).forEach((inst) => {
        if (!installmentsByExpense[inst.expense_id]) installmentsByExpense[inst.expense_id] = [];
        installmentsByExpense[inst.expense_id].push(inst);
      });
    }

    const resolvedInstallmentByPayment: Record<string, any> = {};
    const paymentsByExpense = new Map<string, any[]>();
    individualPayments.forEach((p: any) => {
      if (!p.expense_id) return;
      const rows = paymentsByExpense.get(p.expense_id) || [];
      rows.push(p);
      paymentsByExpense.set(p.expense_id, rows);
    });

    paymentsByExpense.forEach((payments, expenseId) => {
      const installments = (installmentsByExpense[expenseId] || []).sort((a, b) => {
        if (Number(a.numero_parcela) !== Number(b.numero_parcela)) return Number(a.numero_parcela) - Number(b.numero_parcela);
        return String(a.data_vencimento || "").localeCompare(String(b.data_vencimento || ""));
      });
      if (installments.length === 0) return;

      const linkCounts = payments.reduce((acc: Record<string, number>, p: any) => {
        if (p.installment_id) acc[p.installment_id] = (acc[p.installment_id] || 0) + 1;
        return acc;
      }, {});
      const hasAmbiguousLinks = payments.some((p: any) => !p.installment_id || (p.installment_id && linkCounts[p.installment_id] > 1));

      if (hasAmbiguousLinks) {
        [...payments]
          .sort((a: any, b: any) => {
            const dateCmp = String(a.data_pagamento || "").localeCompare(String(b.data_pagamento || ""));
            if (dateCmp !== 0) return dateCmp;
            return String(a.created_at || "").localeCompare(String(b.created_at || ""));
          })
          .forEach((payment: any, index) => {
            resolvedInstallmentByPayment[payment.id] = installments[index] || installments.find((inst) => inst.id === payment.installment_id) || null;
          });
        return;
      }

      payments.forEach((payment: any) => {
        resolvedInstallmentByPayment[payment.id] = installments.find((inst) => inst.id === payment.installment_id) || payment.installment || null;
      });
    });

    const expenseItems: PaidItem[] = individualPayments.map((p: any) => {
      const resolvedInstallment = resolvedInstallmentByPayment[p.id] || p.installment;
      return {
        id: p.id,
        description: resolvedInstallment?.numero_parcela
          ? `${p.expenses?.descricao || "Pagamento de despesa"} (parcela ${resolvedInstallment.numero_parcela})`
          : (p.expenses?.descricao || "Pagamento de despesa"),
        amount: Number(p.valor || 0),
        paid_at: toDateOnly(p.data_pagamento),
        due_date: toDateOnly(resolvedInstallment?.data_vencimento || p.expenses?.data_vencimento || p.expenses?.data_emissao),
        creditor_name: p.expenses?.favorecido_nome || null,
        source: "expense_payment" as const,
        expense_id: p.expense_id,
        forma_pagamento: p.forma_pagamento || null,
        created_by_name: creatorsMap[p.created_by] || null,
        created_at: p.created_at || null,
        documento_fiscal_numero: p.expenses?.documento_fiscal_numero || null,
        empresa_id: p.expenses?.empresa_id || null,
        payment_id: p.id,
        installment: resolvedInstallment
          ? {
              id: resolvedInstallment.id,
              numero_parcela: Number(resolvedInstallment.numero_parcela),
              total_parcelas: Number(resolvedInstallment.total_parcelas),
              valor: Number(resolvedInstallment.valor ?? p.valor ?? 0),
              data_vencimento: toDateOnly(resolvedInstallment.data_vencimento),
            }
          : null,
      };
    });


    const groupItems: PaidItem[] = Array.from(groupedMap.entries()).map(([loteId, payments]) => {
      const total = payments.reduce((s, p) => s + Number(p.valor || 0), 0);
      const first = payments[0];
      const favorecidos = Array.from(new Set(payments.map(p => p.expenses?.favorecido_nome).filter(Boolean))) as string[];
      const creditor = favorecidos.length === 0
        ? "Sem favorecido"
        : favorecidos.length === 1
          ? favorecidos[0]
          : `${favorecidos.length} favorecidos: ${favorecidos.join(", ")}`;
      return {
        id: `group-${loteId}`,
        description: `Pagamento agrupado de ${payments.length} conta(s)`,
        amount: total,
        paid_at: toDateOnly(first.data_pagamento),
        due_date: null,
        creditor_name: creditor,
        source: "group" as const,
        expense_id: null,
        forma_pagamento: first.forma_pagamento || null,
        created_by_name: creatorsMap[first.created_by] || null,
        created_at: first.created_at || null,
        documento_fiscal_numero: null,
        empresa_id: first.expenses?.empresa_id || null,
        lote_id: loteId,
        group_count: payments.length,
        group_payment_ids: payments.map(p => p.id),
      };
    });

    const legacyItems: PaidItem[] = (paidLegacy || []).map((a: any) => ({
      id: `legacy-${a.id}`,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: toDateOnly(a.paid_at),
      due_date: null,
      creditor_name: a.creditor_name,
      source: "legacy" as const,
      expense_id: null,
      forma_pagamento: null,
    }));

    // Harvest payments now flow through the expense system (no longer shown separately)

    setItems(
      [...expenseItems, ...groupItems, ...legacyItems].sort((a, b) => {
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
        (i.creditor_name || "").toLowerCase().includes(q) ||
        (i.documento_fiscal_numero || "").toLowerCase().includes(q);

      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        const dateRef = i.paid_at || "";
        matchPeriodo = (!periodoInicio || dateRef >= periodoInicio) && (!periodoFim || dateRef <= periodoFim);
      }

      const matchOrigem = origemFilter === "todos" || i.source === origemFilter;
      const matchEmpresa = !filterEmpresa || i.empresa_id === filterEmpresa;

      return matchSearch && matchPeriodo && matchOrigem && matchEmpresa;
    });
  }, [items, search, periodoInicio, periodoFim, origemFilter, filterEmpresa]);

  const selectableIds = useMemo(() => filtered.filter(i => i.source === "expense_payment" || i.source === "group").map(i => i.id), [filtered]);

  const total = filtered.reduce((s, i) => s + i.amount, 0);
  const selectedTotal = useMemo(() => {
    let t = 0;
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) t += item.amount;
    });
    return t;
  }, [selectedIds, items]);

  const selectedItems = useMemo(
    () => items.filter(i => selectedIds.has(i.id)),
    [items, selectedIds]
  );

  const paidColumns: DataGridColumn<PaidItem>[] = useMemo(() => [
    {
      key: "empresa",
      header: "Emp.",
      width: "52px",
      align: "center",
      sortValue: (r) => r.empresa_id || "",
      cell: (r) => <EmpresaBadge empresaId={r.empresa_id} />,
    },
    {
      key: "creditor",
      header: "Favorecido",
      width: "220px",
      sortValue: (r) => r.creditor_name || "",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="font-medium text-foreground truncate block">
            {r.creditor_name || "Sem favorecido"}
          </span>
          {r.created_by_name && (
            <span className="text-[10px] text-muted-foreground truncate block">
              por {r.created_by_name}
            </span>
          )}
        </span>
      ),

    },
    {
      key: "description",
      header: "Descrição",
      sortValue: (r) => r.description,
      cell: (r) => <span className="truncate block">{r.description}</span>,
    },
    {
      key: "due_date",
      header: "Vencimento",
      width: "100px",
      sortValue: (r) => r.due_date || "",
      cell: (r) => (r.due_date ? formatDateBR(r.due_date) : "—"),
    },
    {
      key: "paid_at",
      header: "Data Pgto",
      width: "100px",
      sortValue: (r) => r.paid_at || "",
      cell: (r) => formatDateBR(r.paid_at),
    },
    {
      key: "forma",
      header: "Forma",
      width: "110px",
      sortValue: (r) => r.forma_pagamento || "",
      cell: (r) => (
        <span className="capitalize">
          {r.forma_pagamento ? (FORMA_PAGAMENTO_MAP[r.forma_pagamento] || r.forma_pagamento) : "—"}
        </span>
      ),
    },
    {
      key: "origem",
      header: "Origem",
      width: "110px",
      align: "center",
      sortValue: (r) => r.source,
      cell: (r) => (
        <Badge
          variant={r.source === "legacy" ? "secondary" : "default"}
          className={`text-[10px] ${r.source === "group" ? "bg-primary/80" : ""}`}
        >
          {r.source === "legacy" ? "Legado" : r.source === "group" ? `Agrupado · ${r.group_count}` : "Pago"}
        </Badge>
      ),
    },
    {
      key: "amount",
      header: "Valor Pago",
      width: "120px",
      align: "right",
      sortValue: (r) => r.amount,
      cell: (r) => <span className="font-mono font-semibold text-success">{formatCurrency(r.amount)}</span>,
    },
  ], []);


  const hasFilters = search !== "" || periodoInicio !== "" || periodoFim !== "" || origemFilter !== "todos" || filterEmpresa !== "";

  const clearFilters = () => {
    setSearch("");
    setPeriodoInicio("");
    setPeriodoFim("");
    setOrigemFilter("todos");
    setFilterEmpresa("");
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
    if (item.source === "group" && item.lote_id) {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailExpense(null);
      setDetailPayments([]);
      setDetailChart(null);
      setDetailInstallment(null);

      const { data: payments } = await supabase
        .from("expense_payments" as any)
        .select(`
          id, valor, forma_pagamento, data_pagamento, observacoes,
          expenses:expense_id ( descricao, favorecido_nome, documento_fiscal_numero )
        `)
        .eq("lote_id", item.lote_id)
        .order("created_at");
      setDetailPayments((payments || []) as any);
      setDetailLoading(false);
      return;
    }

    if (!item.expense_id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailExpense(null);
    setDetailPayments([]);
    setDetailChart(null);
    setDetailInstallment(item.installment || null);

    // When the clicked row is a specific installment, filter payments to that installment only.
    // Otherwise show all payments of the expense.
    let payQuery = supabase
      .from("expense_payments" as any)
      .select("id, valor, forma_pagamento, data_pagamento, observacoes, installment_id")
      .eq("expense_id", item.expense_id)
      .order("data_pagamento");
    if (item.installment?.id) {
      payQuery = payQuery.eq("installment_id", item.installment.id);
    }

    const [expRes, payRes] = await Promise.all([
      supabase.from("expenses").select("*").eq("id", item.expense_id).maybeSingle(),
      payQuery,
    ]);

    if (expRes.error) console.error("[FinancialPaid] erro ao buscar despesa", item.expense_id, expRes.error);
    if (payRes.error) console.error("[FinancialPaid] erro ao buscar pagamentos", item.expense_id, payRes.error);

    let exp = expRes.data as any;

    // Fallback: if expense fetch returned nothing (e.g. soft-deleted/RLS edge case),
    // synthesize a minimal expense view from the clicked item so the dialog still renders.
    if (!exp) {
      exp = {
        id: item.expense_id,
        favorecido_nome: item.creditor_name,
        descricao: item.description,
        valor_total: item.amount,
        valor_pago: item.amount,
        status: "pago",
        data_emissao: item.paid_at,
        data_vencimento: item.due_date,
        documento_fiscal_numero: item.documento_fiscal_numero,
        centro_custo: null,
        observacoes: "(Conta original removida ou inacessível — exibindo dados do pagamento)",
      };
    } else if (exp.plano_contas_id) {
      const chart = chartAccounts.find(c => c.id === exp.plano_contas_id);
      setDetailChart(chart || null);
    }
    setDetailExpense(exp);
    setDetailPayments((payRes.data || []) as unknown as PaymentRecord[]);

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
    if (item.source === "legacy") return;
    const label = item.source === "group"
      ? `o pagamento agrupado de ${item.group_count} conta(s)`
      : `o pagamento de "${item.creditor_name || item.description}"`;
    if (!await confirm({
      title: "Estornar pagamento",
      description: `Deseja estornar ${label}? Os registros serão removidos e os saldos das despesas recalculados.`,
    })) return;

    setReversing(true);
    try {
      if (item.source === "group") {
        await reverseGroup(item);
      } else {
        await reversePayment(item);
      }
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
        if (!item) continue;
        if (item.source === "group") {
          await reverseGroup(item);
        } else if (item.source === "expense_payment") {
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

  const reverseGroup = async (item: PaidItem) => {
    if (!item.lote_id) return;
    // Fetch all payments in lote with their expense_id
    const { data: payments } = await supabase
      .from("expense_payments" as any)
      .select("id, expense_id")
      .eq("lote_id", item.lote_id);

    const expenseIds = [...new Set((payments || []).map((p: any) => p.expense_id))];

    // Delete all payments (trigger handles consolidated cash flow cleanup)
    await supabase.from("expense_payments" as any).delete().eq("lote_id", item.lote_id);

    // Recalc each touched expense
    for (const expenseId of expenseIds) {
      const { data: remaining } = await supabase
        .from("expense_payments" as any)
        .select("valor, juros")
        .eq("expense_id", expenseId);
      const totalPago = (remaining || []).reduce(
        (s: number, p: any) => s + (Number(p.valor) - Number(p.juros || 0)),
        0,
      );
      const { data: expense } = await supabase
        .from("expenses").select("valor_total").eq("id", expenseId).maybeSingle();
      const valorTotal = expense ? Number((expense as any).valor_total) : 0;
      let newStatus = "pendente";
      if (totalPago + 0.005 >= valorTotal && totalPago > 0) newStatus = "pago";
      else if (totalPago !== 0) newStatus = "parcial";

      await supabase.from("expenses").update({
        valor_pago: totalPago,
        status: newStatus,
        ...(totalPago === 0 ? { data_pagamento: null } : {}),
      } as any).eq("id", expenseId);

      // Reset installments if needed
      const { data: insts } = await supabase
        .from("expense_installments")
        .select("id, valor, status")
        .eq("expense_id", expenseId)
        .eq("status", "pago" as any);
      const totalInstPago = (insts || []).reduce((s: number, i: any) => s + Number(i.valor), 0);
      if (insts && insts.length > 0 && totalPago < totalInstPago) {
        const sorted = [...insts].reverse();
        let deficit = totalInstPago - totalPago;
        for (const inst of sorted) {
          if (deficit <= 0) break;
          await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
          deficit -= Number(inst.valor);
        }
      }
    }
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
            <PeriodFilter
              size="sm"
              allowClear
              inicio={periodoInicio}
              fim={periodoFim}
              onChange={(i, f) => { setPeriodoInicio(i); setPeriodoFim(f); }}
            />
          </div>
          <EmpresaFilter value={filterEmpresa} onChange={setFilterEmpresa} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-0 relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por nome, descrição ou nº da nota..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
          </div>
          <Select value={origemFilter} onValueChange={(v) => setOrigemFilter(v as any)}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas origens</SelectItem>
              <SelectItem value="expense_payment">Despesas</SelectItem>
              <SelectItem value="legacy">Legado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Global Toolbar */}
      <GlobalToolbar
        actions={[
          {
            key: "detail",
            label: "Detalhes",
            icon: Eye,
            mode: "single",
            onClick: () => { const it = selectedItems[0]; if (it) openDetail(it); },
          },
          {
            key: "edit",
            label: "Editar",
            icon: Pencil,
            mode: "single",
            disabled: !selectedItems[0]?.expense_id,
            onClick: () => { const it = selectedItems[0]; if (it) openEdit(it); },
          },
          {
            key: "reverse",
            label: reversing ? "Processando..." : "Estornar",
            icon: Undo2,
            mode: "single+batch",
            disabled: reversing,
            onClick: handleBatchReverse,
          },
        ]}
        selectedCount={selectedIds.size}
      >
        {selectedIds.size > 0 && (
          <span className="text-[11px] font-mono text-primary">{formatCurrency(selectedTotal)}</span>
        )}
      </GlobalToolbar>

      {/* Data Grid */}
      <DataGrid
        rows={filtered}
        columns={paidColumns}
        rowId={(r) => r.id}
        selected={selectedIds}
        onSelectedChange={setSelectedIds}
        isSelectable={(r) => r.source === "expense_payment" || r.source === "group"}
        rowClassName={() => rowToneClass("resolved")}
        loading={loading}
        minWidth={1060}
        emptyMessage="Nenhuma conta paga encontrada."
        footer={
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filtered.length} registro(s)</span>
            <span className="font-mono">Total: {formatCurrency(total)}</span>
          </div>
        }
      />

      <StatusLegend className="px-1" items={[{ tone: "resolved", label: "Pago / quitado" }]} />


      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md overflow-x-hidden max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailInstallment
                ? `Detalhes da Parcela ${detailInstallment.numero_parcela}/${detailInstallment.total_parcelas}`
                : "Detalhes do Pagamento"}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : detailExpense ? (
            <div className="space-y-4 text-sm">
              {detailInstallment && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    Parcela {detailInstallment.numero_parcela} de {detailInstallment.total_parcelas}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Valor da parcela</span>
                      <p className="font-mono font-bold text-primary">{formatCurrency(Number(detailInstallment.valor))}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vencimento</span>
                      <p className="text-foreground">{detailInstallment.data_vencimento ? formatDateBR(detailInstallment.data_vencimento) : "—"}</p>
                    </div>
                  </div>
                </div>
              )}
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
                  <span className="text-xs text-muted-foreground">
                    {detailInstallment ? "Total da Despesa" : "Valor Total"}
                  </span>
                  <p className="font-mono font-bold text-foreground">{formatCurrency(Number(detailExpense.valor_total))}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    {detailInstallment ? "Pago (esta parcela)" : "Valor Pago"}
                  </span>
                  <p className="font-mono font-bold text-success">
                    {formatCurrency(
                      detailInstallment
                        ? detailPayments.reduce((s, p) => s + Number(p.valor || 0), 0)
                        : Number(detailExpense.valor_pago)
                    )}
                  </p>
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
                {!detailInstallment && detailExpense.data_vencimento && (
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
                    {detailInstallment
                      ? `Pagamentos desta parcela (${detailPayments.length})`
                      : `Histórico de Pagamentos (${detailPayments.length})`}
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


            </div>
          ) : detailPayments.length > 0 ? (
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted-foreground">
                Pagamento agrupado · {detailPayments.length} conta(s) · Total{" "}
                <span className="font-mono font-bold text-success">
                  {formatCurrency(detailPayments.reduce((s, p) => s + Number(p.valor), 0))}
                </span>
              </p>
              <div className="space-y-1.5 border-t border-border pt-2">
                {detailPayments.map((pay: any) => (
                  <div key={pay.id} className="flex flex-col gap-0.5 text-xs p-2 rounded bg-success/10">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground truncate flex-1">
                        {pay.expenses?.favorecido_nome || "—"}
                      </span>
                      <span className="font-mono font-semibold shrink-0">{formatCurrency(Number(pay.valor))}</span>
                    </div>
                    <span className="text-muted-foreground truncate">{pay.expenses?.descricao || ""}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateBR(toDateOnly(pay.data_pagamento))} · {FORMA_PAGAMENTO_MAP[pay.forma_pagamento] || pay.forma_pagamento}
                    </span>
                  </div>
                ))}
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
