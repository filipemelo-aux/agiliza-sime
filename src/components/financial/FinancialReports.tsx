import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Loader2, FileSpreadsheet, Search } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { PlanoContasCombobox } from "./PlanoContasCombobox";
import { DreGerencial } from "./DreGerencial";
import { PayablesDataGrid } from "./PayablesDataGrid";
import { CashFlowDailyGrid } from "./CashFlowDailyGrid";

type ReportType = "payables" | "receivables" | "cashflow" | "forecasts" | "dre";
type GroupBy = "none" | "plano" | "centro" | "favorecido" | "cliente" | "origem" | "status";

interface Filters {
  dataInicio: string;
  dataFim: string;
  tipoData: string; // payables: emissao|vencimento|pagamento; receivables: emissao|vencimento|recebimento
  status: string;
  planoContasId: string;
  planoContasExcetoId: string;
  centroCusto: string;
  favorecidoId: string;
  clienteId: string;
  origem: string;
  groupBy: GroupBy;
}

interface Row {
  id: string;
  data: string;
  descricao: string;
  pessoa: string;
  status: string;
  valor: number;
  origem: string;
  plano: string;
  planoId?: string | null;
  centro: string;
  tipo?: "entrada" | "saida";
  valorPago?: number;
  jurosPago?: number;
  saldo?: number;
  dataVencimento?: string | null;
  parcela?: string | null;
}

const initialFilters = (type: ReportType): Filters => ({
  dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  tipoData: "vencimento",
  status: "todos",
  planoContasId: "todos",
  planoContasExcetoId: "todos",
  centroCusto: "todos",
  favorecidoId: "todos",
  clienteId: "todos",
  origem: "todos",
  groupBy: type === "payables" ? "plano" : type === "receivables" ? "cliente" : type === "cashflow" ? "origem" : "status",
});

const TIPO_DATA_OPTIONS: Partial<Record<ReportType, { value: string; label: string }[]>> = {
  payables: [
    { value: "emissao", label: "Data de Emissão" },
    { value: "vencimento", label: "Data de Vencimento" },
    { value: "pagamento", label: "Data de Pagamento" },
  ],
  receivables: [
    { value: "emissao", label: "Data de Emissão" },
    { value: "vencimento", label: "Data de Vencimento" },
    { value: "recebimento", label: "Data de Recebimento" },
  ],
};

const STATUS_OPTIONS: Record<Exclude<ReportType, "dre">, { value: string; label: string }[]> = {
  payables: [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "atrasado", label: "Atrasado" },
    { value: "parcial", label: "Parcial" },
    { value: "pago", label: "Pago" },
  ],
  receivables: [
    { value: "todos", label: "Todos" },
    { value: "aberto", label: "Aberto" },
    { value: "recebido", label: "Recebido" },
  ],
  cashflow: [
    { value: "todos", label: "Todas" },
    { value: "entrada", label: "Entradas" },
    { value: "saida", label: "Saídas" },
  ],
  forecasts: [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "faturado", label: "Faturado" },
  ],
};

const ORIGEM_OPTIONS: Record<Exclude<ReportType, "dre">, { value: string; label: string }[]> = {
  payables: [
    { value: "todos", label: "Todas" },
    { value: "manual", label: "Manual" },
    { value: "abastecimento", label: "Abastecimento" },
    { value: "manutencao", label: "Manutenção" },
    { value: "colheita", label: "Colheita" },
    { value: "xml_import", label: "XML Importado" },
  ],
  receivables: [
    { value: "todos", label: "Todas" },
    { value: "fatura", label: "Faturas" },
    { value: "manual", label: "Entradas Manuais" },
  ],
  cashflow: [
    { value: "todos", label: "Todas" },
    { value: "contas_pagar", label: "Contas a Pagar" },
    { value: "contas_receber", label: "Contas a Receber" },
    { value: "pagamento_despesa", label: "Pagamento Despesa" },
    { value: "recebimento_conta_receber", label: "Recebimento" },
    { value: "manual", label: "Manual" },
  ],
  forecasts: [
    { value: "todos", label: "Todas" },
    { value: "cte", label: "CT-e" },
    { value: "manual", label: "Manual" },
    { value: "colheita", label: "Colheita" },
  ],
};

export function FinancialReports() {
  const isMobile = useIsMobile();
  const [reportType, setReportType] = useState<ReportType>("payables");
  const [favorecidoSearch, setFavorecidoSearch] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters("payables"));
  const [rows, setRows] = useState<Row[]>([]);

  // Lock status to "pago" when payables report uses "data de pagamento"
  useEffect(() => {
    if ((reportType as string) === "payables" && filters.tipoData === "pagamento" && filters.status !== "pago") {
      setFilters((f) => ({ ...f, status: "pago" }));
    }
  }, [reportType, filters.tipoData, filters.status]);
  const [loading, setLoading] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("chart_of_accounts").select("id, codigo, nome, conta_pai_id").eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
    supabase.from("profiles").select("id, full_name, nome_fantasia, razao_social, category").order("full_name").then(({ data }) => setProfiles(data || []));
  }, []);

  // Resolve a plano_contas_id into itself + all descendants (subtree) so that
  // selecting a parent account (e.g. "2.1 Despesas Operacionais") also matches
  // records posted to any leaf child account.
  const resolvePlanoSubtree = useCallback((rootId: string): string[] => {
    if (!rootId || rootId === "todos") return [];
    const childrenByParent = new Map<string, string[]>();
    chartAccounts.forEach((a: any) => {
      if (a.conta_pai_id) {
        if (!childrenByParent.has(a.conta_pai_id)) childrenByParent.set(a.conta_pai_id, []);
        childrenByParent.get(a.conta_pai_id)!.push(a.id);
      }
    });
    const out: string[] = [];
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      out.push(id);
      const kids = childrenByParent.get(id);
      if (kids) stack.push(...kids);
    }
    return out;
  }, [chartAccounts]);

  const handleTabChange = (t: string) => {
    const tt = t as ReportType;
    setReportType(tt);
    setFilters(initialFilters(tt));
    setRows([]);
    setNameSearch("");
  };

  const updateFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result: Row[] = [];
      if ((reportType as string) === "payables") {
        const tipoData = filters.tipoData || "vencimento";

        // When filtering by payment date, first resolve the set of expense_ids
        // that have payments in the selected window. This guarantees parity
        // with "Contas Pagas" (which lists expense_payments directly) and
        // avoids the 2000-row cap silently dropping older expenses.
        let expenseIdsByPayment: string[] | null = null;
        if (tipoData === "pagamento") {
          let pq: any = supabase.from("expense_payments").select("expense_id, data_pagamento");
          if (filters.dataInicio) pq = pq.gte("data_pagamento", filters.dataInicio);
          if (filters.dataFim) pq = pq.lte("data_pagamento", filters.dataFim);
          const { data: paysInRange, error: payErr } = await pq.limit(10000);
          if (payErr) throw payErr;
          expenseIdsByPayment = Array.from(new Set((paysInRange || []).map((p: any) => p.expense_id).filter(Boolean)));
          if (expenseIdsByPayment.length === 0) {
            setRows([]);
            setLoading(false);
            return;
          }
        }

        // Fetch expenses without date filter (installments may shift due dates)
        let q: any = supabase.from("expenses").select("*").is("deleted_at", null);
        if (filters.planoContasId === "sem_classificacao") {
          q = q.is("plano_contas_id", null);
        } else if (filters.planoContasId !== "todos") {
          const ids = resolvePlanoSubtree(filters.planoContasId);
          if (ids.length > 1) q = q.in("plano_contas_id", ids);
          else q = q.eq("plano_contas_id", filters.planoContasId);
        }
        if (filters.planoContasExcetoId === "sem_classificacao") {
          q = q.not("plano_contas_id", "is", null);
        } else if (filters.planoContasExcetoId !== "todos") {
          const exIds = resolvePlanoSubtree(filters.planoContasExcetoId);
          if (exIds.length > 1) q = q.or(`plano_contas_id.is.null,plano_contas_id.not.in.(${exIds.join(",")})`);
          else q = q.or(`plano_contas_id.is.null,plano_contas_id.neq.${filters.planoContasExcetoId}`);
        }
        if (filters.centroCusto !== "todos") q = q.eq("centro_custo", filters.centroCusto);
        if (filters.favorecidoId !== "todos") q = q.eq("favorecido_id", filters.favorecidoId);
        if (filters.origem !== "todos") q = q.eq("origem", filters.origem);
        // Quando filtro por emissão, restringe na query principal
        if (tipoData === "emissao") {
          if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
          if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim);
        }
        if (expenseIdsByPayment) q = q.in("id", expenseIdsByPayment);
        const { data, error } = await q.order("data_vencimento", { ascending: true }).limit(10000);
        if (error) throw error;
        const expenses = data || [];
        const expIds = expenses.map((e: any) => e.id);
        const installmentsByExp: Record<string, any[]> = {};
        if (expIds.length > 0) {
          const { data: insts } = await supabase
            .from("expense_installments")
            .select("*")
            .in("expense_id", expIds)
            .order("numero_parcela");
          (insts || []).forEach((i: any) => {
            (installmentsByExp[i.expense_id] ||= []).push(i);
          });
        }
        // Mapa de pagamentos por installment_id (data mais recente)
        const paymentByInst: Record<string, string> = {};
        const paymentByExp: Record<string, string> = {};
        const jurosByInst: Record<string, number> = {};
        const jurosByExp: Record<string, number> = {};
        const pagoByInst: Record<string, number> = {};
        const pagoByExp: Record<string, number> = {};
        if (expIds.length > 0) {
          let payQ: any = supabase
            .from("expense_payments")
            .select("expense_id, installment_id, data_pagamento, valor, juros")
            .in("expense_id", expIds);
          // When filtering by payment date, restrict payments aggregation to the
          // selected window so totals & dates match the "Contas Pagas" view.
          if (tipoData === "pagamento") {
            if (filters.dataInicio) payQ = payQ.gte("data_pagamento", filters.dataInicio);
            if (filters.dataFim) payQ = payQ.lte("data_pagamento", filters.dataFim);
          }
          const { data: pays } = await payQ.order("data_pagamento", { ascending: false });
          (pays || []).forEach((p: any) => {
            const d = (p.data_pagamento || "").slice(0, 10);
            const juros = Number(p.juros || 0);
            const valor = Number(p.valor || 0);
            if (p.installment_id) {
              if (d && !paymentByInst[p.installment_id]) paymentByInst[p.installment_id] = d;
              jurosByInst[p.installment_id] = (jurosByInst[p.installment_id] || 0) + juros;
              pagoByInst[p.installment_id] = (pagoByInst[p.installment_id] || 0) + valor;
            }
            if (d && !paymentByExp[p.expense_id]) paymentByExp[p.expense_id] = d;
            jurosByExp[p.expense_id] = (jurosByExp[p.expense_id] || 0) + juros;
            pagoByExp[p.expense_id] = (pagoByExp[p.expense_id] || 0) + valor;
          });
        }
        // Enriquecer descrição com Remetente → Recebedor para despesas vinculadas a Contratos de Frete
        const contractDescByExp: Record<string, string> = {};
        if (expIds.length > 0) {
          const { data: contracts } = await supabase
            .from("freight_contracts")
            .select("expense_id, numero, cte:ctes!freight_contracts_cte_id_fkey(remetente_nome, recebedor_nome, destinatario_nome)")
            .in("expense_id", expIds);
          const firstTwoWords = (s?: string | null) => (s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
          const truncTo = (s?: string | null, n = 60) => {
            const t = (s || "").trim();
            return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
          };
          (contracts || []).forEach((c: any) => {
            if (!c.expense_id) return;
            const remet = firstTwoWords(c.cte?.remetente_nome) || "—";
            const destin = truncTo(c.cte?.recebedor_nome || c.cte?.destinatario_nome) || "—";
            contractDescByExp[c.expense_id] = `Contrato de Frete Nº ${c.numero} - ${remet} → ${destin}`;
          });
        }
        const chartMap = new Map(chartAccounts.map((c) => [c.id, c]));
        const today = format(new Date(), "yyyy-MM-dd");
        const inRange = (d: string | null) => {
          if (!d) return false;
          if (filters.dataInicio && d < filters.dataInicio) return false;
          if (filters.dataFim && d > filters.dataFim) return false;
          return true;
        };
        const matchStatus = (s: string) => filters.status === "todos" || filters.status === s;
        const out: Row[] = [];
        expenses.forEach((e: any) => {
          const c = e.plano_contas_id ? chartMap.get(e.plano_contas_id) : null;
          const planoLabel = c ? `${c.codigo} ${c.nome}` : "—";
          const installs = installmentsByExp[e.id] || [];
          const baseDescricao = contractDescByExp[e.id] || e.descricao;
          const valorTotal = Number(e.valor_total);
          const valorPagoExp = Number(e.valor_pago || 0);
          const expIsParcial = valorPagoExp > 0 && valorPagoExp < valorTotal;
          if (installs.length > 0) {
            // Distribuir pagamentos sem installment_id entre as parcelas pagas que não têm pagoByInst próprio
            const totalAttributed = installs.reduce((s: number, i: any) => s + (pagoByInst[i.id] || 0), 0);
            const leftover = Math.max(0, (pagoByExp[e.id] || 0) - totalAttributed);
            const unattributedPaid = installs.filter((i: any) => i.status === "pago" && pagoByInst[i.id] === undefined);
            const sumFace = unattributedPaid.reduce((s: number, i: any) => s + Number(i.valor), 0);
            const distributedPago: Record<string, number> = {};
            if (leftover > 0 && unattributedPaid.length > 0 && sumFace > 0) {
              let acc = 0;
              unattributedPaid.forEach((i: any, idx: number) => {
                if (idx === unattributedPaid.length - 1) {
                  distributedPago[i.id] = Math.round((leftover - acc) * 100) / 100;
                } else {
                  const share = Math.round((leftover * Number(i.valor) / sumFace) * 100) / 100;
                  distributedPago[i.id] = share;
                  acc += share;
                }
              });
            }
            installs.forEach((inst: any) => {
              const hasOwnPayment = paymentByInst[inst.id] !== undefined;
              // Quando filtramos por data de pagamento, a existência do registro de pagamento
              // é a fonte da verdade — mesmo que o status da parcela esteja inconsistente
              // (dado legado), tratamos como "pago" para fins do relatório.
              const effectiveInstStatus = (tipoData === "pagamento" && hasOwnPayment) ? "pago" : inst.status;
              const isOverdue = inst.data_vencimento && inst.data_vencimento < today && effectiveInstStatus !== "pago";
              const status = isOverdue ? "atrasado" : effectiveInstStatus;
              // Data de referência conforme tipoData
              let dataRef: string | null = inst.data_vencimento;
              if (tipoData === "emissao") dataRef = e.data_emissao || inst.data_vencimento;
              else if (tipoData === "pagamento") {
                // Use APENAS a data do pagamento da própria parcela.
                // Não fazer fallback para paymentByExp (isso traria parcelas não pagas
                // de uma mesma despesa que tenha outra parcela paga no período).
                dataRef = paymentByInst[inst.id] || null;
                if (!dataRef && inst.status === "pago" && (pagoByInst[inst.id] !== undefined || (distributedPago[inst.id] || 0) > 0)) {
                  dataRef = paymentByExp[e.id] || null;
                }
              }
              if (tipoData === "pagamento" && !dataRef) return; // só parcelas com pagamento
              if (!inRange(dataRef)) return;
              if (!matchStatus(status)) return;
              const pagoEfetivo = pagoByInst[inst.id] !== undefined
                ? pagoByInst[inst.id]
                : (distributedPago[inst.id] !== undefined
                    ? distributedPago[inst.id]
                    : (inst.status === "pago" ? Number(inst.valor) : undefined));
              out.push({
                id: `${e.id}-${inst.id}`,
                data: dataRef!,
                descricao: baseDescricao,
                parcela: `${inst.numero_parcela}/${installs.length}`,
                pessoa: e.favorecido_nome || "—",
                status,
                valor: Number(inst.valor),
                origem: e.origem,
                plano: planoLabel,
                planoId: e.plano_contas_id,
                centro: e.centro_custo,
                valorPago: pagoEfetivo,
                jurosPago: jurosByInst[inst.id] || 0,
                saldo: pagoEfetivo !== undefined && pagoEfetivo < Number(inst.valor) ? Math.max(Number(inst.valor) - pagoEfetivo, 0) : undefined,
                dataVencimento: inst.data_vencimento,
              });
            });

          } else {
            let d: string | null = e.data_vencimento || e.data_emissao;
            if (tipoData === "emissao") d = e.data_emissao || e.data_vencimento;
            else if (tipoData === "pagamento") d = paymentByExp[e.id] || null;
            if (tipoData === "pagamento" && !d) return;
            if (!inRange(d)) return;
            if (!matchStatus(e.status)) return;
            out.push({
              id: e.id,
              data: d!,
              descricao: baseDescricao,
              pessoa: e.favorecido_nome || "—",
              status: e.status,
              valor: valorTotal,
              origem: e.origem,
              plano: planoLabel,
              planoId: e.plano_contas_id,
              centro: e.centro_custo,
              valorPago: expIsParcial ? valorPagoExp : (pagoByExp[e.id] || undefined),
              jurosPago: jurosByExp[e.id] || 0,
              saldo: expIsParcial ? Math.max(valorTotal - valorPagoExp, 0) : undefined,
              dataVencimento: e.data_vencimento || e.data_emissao,
            });
          }
        });
        out.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        result = out;
      } else if (reportType === "receivables") {
        const tipoData = filters.tipoData || "vencimento";
        const dateCol = tipoData === "emissao" ? "data_lancamento" : tipoData === "recebimento" ? "data_recebimento" : "data_vencimento";
        const chartMap = new Map(chartAccounts.map((c: any) => [c.id, c]));
        const out: Row[] = [];

        // 1) Contas a receber formais
        if (filters.origem === "todos" || filters.origem === "fatura") {
          let q: any = supabase.from("contas_receber").select("*, faturas_recebimento(numero, cliente_id), profile:cliente_id(full_name, nome_fantasia)");
          if (filters.dataInicio) q = q.gte(dateCol, filters.dataInicio);
          if (filters.dataFim) q = q.lte(dateCol, filters.dataFim);
          if (filters.status !== "todos") q = q.eq("status", filters.status);
          if (filters.clienteId !== "todos") q = q.eq("cliente_id", filters.clienteId);
          const { data, error } = await q.order(dateCol, { ascending: true }).limit(2000);
          if (error) throw error;
          (data || []).forEach((c: any) => out.push({
            id: c.id,
            data: (c as any)[dateCol] || c.data_recebimento || c.data_vencimento,
            descricao: `Fatura ${c.faturas_recebimento?.numero || "—"}`,
            pessoa: c.profile?.nome_fantasia || c.profile?.full_name || "—",
            status: c.status,
            valor: Number(c.valor),
            origem: "fatura",
            plano: "—",
            planoId: null,
            centro: "—",
            dataVencimento: c.data_vencimento,
          }));
        }

        // 2) Entradas manuais do fluxo de caixa (status "recebido" sempre)
        const statusAllowsRecebido = filters.status === "todos" || filters.status === "recebido";
        const clienteAllows = filters.clienteId === "todos"; // manuais não têm cliente
        const origemAllows = filters.origem === "todos" || filters.origem === "manual";
        if (statusAllowsRecebido && clienteAllows && origemAllows) {
          let qm: any = supabase.from("movimentacoes_bancarias").select("*").eq("tipo", "entrada").eq("origem", "manual");
          if (filters.dataInicio) qm = qm.gte("data_movimentacao", filters.dataInicio);
          if (filters.dataFim) qm = qm.lte("data_movimentacao", filters.dataFim);
          const { data: mans, error: errM } = await qm.order("data_movimentacao", { ascending: true }).limit(2000);
          if (errM) throw errM;
          (mans || []).forEach((m: any) => {
            const c = m.plano_contas_id ? chartMap.get(m.plano_contas_id) : null;
            out.push({
              id: `mov-${m.id}`,
              data: m.data_movimentacao,
              descricao: m.descricao || "Entrada manual",
              pessoa: "Entrada manual",
              status: "recebido",
              valor: Number(m.valor),
              origem: "manual",
              plano: c ? `${c.codigo} ${c.nome}` : "—",
              planoId: m.plano_contas_id || null,
              centro: "—",
            });
          });
        }
        out.sort((a, b) => (a.data || "").localeCompare(b.data || ""));
        result = out;
      } else if (reportType === "cashflow") {
        const chartMap = new Map(chartAccounts.map((c: any) => [c.id, c]));
        let q: any = supabase.from("movimentacoes_bancarias").select("*");
        if (filters.dataInicio) q = q.gte("data_movimentacao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_movimentacao", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("tipo", filters.status);
        if (filters.origem !== "todos") q = q.eq("origem", filters.origem);
        // Filtro por plano_contas_id aplicado client-side após enriquecimento (origens vinculadas a despesas não têm plano direto)
        const { data, error } = await q.order("data_movimentacao", { ascending: false }).limit(2000);
        if (error) throw error;
        const movs = data || [];

        // Enriquecimento: busca plano_contas_id a partir da origem vinculada
        const payPaymentIds = movs.filter((m: any) => m.origem === "pagamento_despesa").map((m: any) => m.origem_id);
        const directExpenseIds = movs.filter((m: any) => m.origem === "despesas").map((m: any) => m.origem_id);
        const apIds = movs.filter((m: any) => m.origem === "contas_pagar").map((m: any) => m.origem_id);
        const loteIds = movs.filter((m: any) => m.origem === "pagamento_agrupado").map((m: any) => m.origem_id);

        const [paysRes, apRes, loteRes, expRes] = await Promise.all([
          payPaymentIds.length
            ? supabase.from("expense_payments").select("id, expense_id, expenses:expense_id(plano_contas_id)").in("id", payPaymentIds)
            : Promise.resolve({ data: [] as any[] } as any),
          apIds.length
            ? supabase.from("accounts_payable").select("id, category_id").in("id", apIds)
            : Promise.resolve({ data: [] as any[] } as any),
          loteIds.length
            ? supabase.from("expense_payments").select("lote_id, expenses:expense_id(plano_contas_id)").in("lote_id", loteIds)
            : Promise.resolve({ data: [] as any[] } as any),
          directExpenseIds.length
            ? supabase.from("expenses").select("id, plano_contas_id").in("id", directExpenseIds)
            : Promise.resolve({ data: [] as any[] } as any),
        ]);

        const planoByPaymentId = new Map<string, string | null>();
        (paysRes.data || []).forEach((p: any) => planoByPaymentId.set(p.id, p.expenses?.plano_contas_id || null));
        const planoByApId = new Map<string, string | null>();
        (apRes.data || []).forEach((a: any) => planoByApId.set(a.id, a.category_id || null));
        const planoByLote = new Map<string, string | null>();
        (loteRes.data || []).forEach((p: any) => {
          if (!planoByLote.has(p.lote_id)) planoByLote.set(p.lote_id, p.expenses?.plano_contas_id || null);
        });
        const planoByExpId = new Map<string, string | null>();
        (expRes.data || []).forEach((e: any) => planoByExpId.set(e.id, e.plano_contas_id || null));

        result = movs.map((m: any) => {
          let pid: string | null = m.plano_contas_id || null;
          if (!pid) {
            if (m.origem === "pagamento_despesa") pid = planoByPaymentId.get(m.origem_id) || null;
            else if (m.origem === "contas_pagar") pid = planoByApId.get(m.origem_id) || null;
            else if (m.origem === "pagamento_agrupado") pid = planoByLote.get(m.origem_id) || null;
            else if (m.origem === "despesas") pid = planoByExpId.get(m.origem_id) || null;
          }
          const c = pid ? chartMap.get(pid) : null;
          return {
            id: m.id,
            data: m.data_movimentacao,
            descricao: m.descricao || "—",
            pessoa: "—",
            status: m.tipo,
            valor: Number(m.valor),
            origem: m.origem,
            plano: c ? `${c.codigo} ${c.nome}` : "—",
            planoId: pid,
            centro: "—",
            tipo: m.tipo,
          };
        });

        if (filters.planoContasId === "sem_classificacao") {
          result = result.filter((r) => !r.planoId);
        } else if (filters.planoContasId !== "todos") {
          const ids = new Set(resolvePlanoSubtree(filters.planoContasId));
          result = result.filter((r) => r.planoId && ids.has(r.planoId));
        }
        if (filters.planoContasExcetoId === "sem_classificacao") {
          result = result.filter((r) => !!r.planoId);
        } else if (filters.planoContasExcetoId !== "todos") {
          const exIds = new Set(resolvePlanoSubtree(filters.planoContasExcetoId));
          result = result.filter((r) => !r.planoId || !exIds.has(r.planoId));
        }
      } else if (reportType === "forecasts") {
        let q: any = supabase.from("previsoes_recebimento").select("*, profile:cliente_id(full_name, nome_fantasia)");
        if (filters.dataInicio) q = q.gte("data_prevista", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_prevista", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("cliente_id", filters.clienteId);
        if (filters.origem !== "todos") q = q.eq("origem_tipo", filters.origem);
        const { data, error } = await q.order("data_prevista", { ascending: true }).limit(2000);
        if (error) throw error;
        result = (data || []).map((p: any) => ({
          id: p.id,
          data: p.data_prevista,
          descricao: `${p.origem_tipo?.toUpperCase() || ""} ${p.metadata?.descricao || ""}`.trim(),
          pessoa: p.profile?.nome_fantasia || p.profile?.full_name || "—",
          status: p.status,
          valor: Number(p.valor),
          origem: p.origem_tipo,
          plano: "—",
          planoId: null,
          centro: "—",
        }));
      }

      // Filtro adicional por plano de contas (client-side) para tabelas sem plano_contas_id próprio
      if (reportType !== "payables" && reportType !== "cashflow") {
        if (filters.planoContasId === "sem_classificacao") {
          result = result.filter((r) => !r.planoId);
        } else if (filters.planoContasId !== "todos") {
          const ids = new Set(resolvePlanoSubtree(filters.planoContasId));
          result = result.filter((r) => r.planoId && ids.has(r.planoId));
        }
        if (filters.planoContasExcetoId === "sem_classificacao") {
          result = result.filter((r) => !!r.planoId);
        } else if (filters.planoContasExcetoId !== "todos") {
          const exIds = new Set(resolvePlanoSubtree(filters.planoContasExcetoId));
          result = result.filter((r) => !r.planoId || !exIds.has(r.planoId));
        }
      }
      setRows(result);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [reportType, filters, chartAccounts, resolvePlanoSubtree]);

  // Quando o usuário digita uma busca por nome, limpa qualquer favorecido/cliente selecionado
  // e dispara a busca automaticamente (debounce) para garantir abrangência total.
  useEffect(() => {
    if (!nameSearch.trim()) return;
    const needsClear = filters.favorecidoId !== "todos" || filters.clienteId !== "todos";
    if (needsClear) {
      setFilters((f) => ({ ...f, favorecidoId: "todos", clienteId: "todos" }));
      return; // próximo efeito re-dispara após o estado mudar
    }
    const t = setTimeout(() => { fetchData(); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameSearch, filters.favorecidoId, filters.clienteId, reportType]);

  // Após uma busca inicial (período aplicado), refazer pesquisa em tempo real ao mudar filtros
  const hasInitialSearchRef = useRef(false);
  useEffect(() => { hasInitialSearchRef.current = false; }, [reportType]);
  useEffect(() => { if (rows.length > 0) hasInitialSearchRef.current = true; }, [rows]);
  useEffect(() => {
    if (!hasInitialSearchRef.current) return;
    const t = setTimeout(() => { fetchData(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const filteredRows = useMemo(() => {
    const term = nameSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => (r.pessoa || "").toLowerCase().includes(term) || (r.descricao || "").toLowerCase().includes(term));
  }, [rows, nameSearch]);

  const grouped = useMemo(() => {
    const gb = filters.groupBy;
    if (gb === "none") return [{ key: "Todos", rows: filteredRows }];
    const map = new Map<string, Row[]>();
    filteredRows.forEach((r) => {
      let k = "—";
      if (gb === "plano") k = r.plano;
      else if (gb === "centro") k = r.centro;
      else if (gb === "favorecido" || gb === "cliente") k = r.pessoa;
      else if (gb === "origem") k = r.origem;
      else if (gb === "status") k = r.status;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => ({ key, rows: rs }));
  }, [filteredRows, filters.groupBy]);

  const totals = useMemo(() => {
    if (reportType === "cashflow") {
      const entradas = filteredRows.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
      const saidas = filteredRows.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
      return { total: entradas - saidas, count: filteredRows.length, entradas, saidas, saldoRestante: 0 };
    }
    const saldoRestante = filteredRows.reduce((s, r) => {
      if (r.saldo !== undefined) return s + r.saldo;
      if (r.status !== "pago" && r.status !== "recebido") return s + r.valor;
      return s;
    }, 0);
    const totalJuros = filteredRows.reduce((s, r) => s + (r.jurosPago || 0), 0);
    const totalPago = filteredRows.reduce((s, r) => s + (r.valorPago || 0), 0);
    return { total: filteredRows.reduce((s, r) => s + r.valor, 0), count: filteredRows.length, saldoRestante, totalJuros, totalPago };
  }, [filteredRows, reportType]);

  const REPORT_TITLE: Record<Exclude<ReportType, "dre">, string> = {
    payables: "RELATÓRIO DE CONTAS A PAGAR",
    receivables: "RELATÓRIO DE CONTAS A RECEBER",
    cashflow: "RELATÓRIO DE FLUXO DE CAIXA",
    forecasts: "RELATÓRIO DE PREVISÕES DE RECEBIMENTO",
  };

  const handlePrint = async () => {
    if (!rows.length) {
      toast.warning("Nenhum dado para imprimir");
      return;
    }
    let estName = "";
    let estCnpjFooter = "";
    let matrizInfo: any = null;
    try {
      const { data } = await supabase
        .from("fiscal_establishments")
        .select("razao_social,cnpj,type,inscricao_estadual,endereco_logradouro,endereco_numero,endereco_bairro,endereco_municipio,endereco_uf,endereco_cep")
        .eq("active", true)
        .order("type");
      if (data && data.length > 0) {
        matrizInfo = data.find((e: any) => e.type === "matriz") || data[0];
        estName = matrizInfo?.razao_social || "";
        const fmtCnpj = (c: string) => c ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : "";
        estCnpjFooter = data.map((e: any) => fmtCnpj(e.cnpj)).filter(Boolean).join(" | ");
      }
    } catch {}
    const matrizCnpjFmt = matrizInfo?.cnpj ? `${matrizInfo.cnpj.slice(0,2)}.${matrizInfo.cnpj.slice(2,5)}.${matrizInfo.cnpj.slice(5,8)}/${matrizInfo.cnpj.slice(8,12)}-${matrizInfo.cnpj.slice(12)}` : "";
    const matrizAddr = [matrizInfo?.endereco_logradouro, matrizInfo?.endereco_numero, matrizInfo?.endereco_bairro].filter(Boolean).join(", ");
    const matrizCity = [matrizInfo?.endereco_municipio, matrizInfo?.endereco_uf].filter(Boolean).join("/");
    const matrizCep = matrizInfo?.endereco_cep ? `CEP ${matrizInfo.endereco_cep}` : "";
    const matrizAddrLine = [matrizAddr, matrizCity, matrizCep].filter(Boolean).join(" — ");
    const matrizDocLine = [matrizCnpjFmt ? `CNPJ ${matrizCnpjFmt}` : "", matrizInfo?.inscricao_estadual ? `IE ${matrizInfo.inscricao_estadual}` : ""].filter(Boolean).join("  •  ");

    const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
    const periodoLabel = `${formatDateBR(filters.dataInicio)} a ${formatDateBR(filters.dataFim)}`;
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

    const isCashflow = reportType === "cashflow";
    const isReceivable = reportType === "receivables" || reportType === "forecasts";
    const showFavor = !isCashflow;
    const favorLabel = isReceivable ? "Cliente" : "Favorecido";
    // Columns: Data | [Favorecido/Cliente] | Descrição | Plano | Status | Valor
    // Cashflow: Data | Descrição | Origem | Status | Valor
    const isPayables = (reportType as string) === "payables";
    // Payables ganha 3 colunas extras: Vencimento, Parcela e Pago
    const colCount = (showFavor ? 6 : 5) + (isPayables ? 3 : 0);
    const labelColspan = colCount - 1; // colspan before the value column for subtotal/total label

    const renderRow = (r: Row) => {
      const valorColor = r.tipo === "saida" ? "neg" : "val";
      const valorPrefix = r.tipo === "saida" ? "− " : "";
      const isParcial = r.status === "parcial" || r.valorPago !== undefined;
      const parcialInfo = isPayables ? "" : (isParcial
        ? `<div class="t2" style="color:#004085;font-weight:700">Pagamento parcial — Pago ${formatCurrency(r.valorPago || 0)} • Saldo ${formatCurrency(r.saldo ?? Math.max(r.valor - (r.valorPago || 0), 0))}</div>`
        : "");
      const vencInfo = !isPayables && r.dataVencimento
        ? `<div class="t2">Venc. original: ${formatDateBR(r.dataVencimento)}</div>`
        : "";
      const favorCell = showFavor ? `<td class="t1 nowrap ell">${esc(r.pessoa)}</td>` : "";
      const descCell = showFavor
        ? `<td class="ell"><div class="t2b ell">${esc(r.descricao || "—")}</div>${vencInfo}${parcialInfo}</td>`
        : `<td class="ell"><div class="t1 ell">${esc(r.descricao || "—")}</div>${vencInfo}${parcialInfo}</td>`;
      const planoCell = `<td class="t2b nowrap ell">${esc(isCashflow ? r.origem : r.plano)}</td>`;
      const pagoFinal = r.valorPago || 0;
      const vencCell = isPayables
        ? `<td class="nowrap">${r.dataVencimento ? formatDateBR(r.dataVencimento) : "—"}</td>`
        : "";
      const parcelaCell = isPayables
        ? `<td class="nowrap" style="text-align:center">${r.parcela ? esc(r.parcela) : "—"}</td>`
        : "";
      const pagoCell = isPayables
        ? `<td class="r" style="color:#059669;font-weight:700">${pagoFinal > 0 ? formatCurrency(pagoFinal) : "—"}</td>`
        : "";
      return `<tr>
        <td class="nowrap">${formatDateBR(r.data)}</td>
        ${favorCell}
        ${descCell}
        ${vencCell}
        ${parcelaCell}
        ${planoCell}
        <td class="st">${esc(r.status)}</td>
        <td class="r ${valorColor}">${valorPrefix}${formatCurrency(r.valor)}</td>
        ${pagoCell}
      </tr>`;
    };

    const headerRow = `<tr class="hdr">
      <th style="width:60px">Data</th>
      ${showFavor ? `<th style="width:140px">${favorLabel}</th>` : ""}
      <th>Descrição</th>
      ${isPayables ? `<th style="width:65px">Vencimento</th>` : ""}
      ${isPayables ? `<th style="width:50px;text-align:center">Parcela</th>` : ""}
      <th style="width:130px">${isCashflow ? "Origem" : "Plano de Contas"}</th>
      <th style="width:70px">Status</th>
      <th class="r" style="width:90px">Valor</th>
      ${isPayables ? `<th class="r" style="width:90px">Pago</th>` : ""}
    </tr>`;

    const sectionsHtml = grouped
      .map((g, idx) => {
        const tableRows = g.rows.map(renderRow).join("");
        const groupHeader =
          filters.groupBy !== "none"
            ? `<tr class="grp"><td colspan="${colCount}">${esc(g.key)} <span style="color:#6b7280;font-weight:500">(${g.rows.length})</span></td></tr>`
            : "";
        // Repeat column header below each group title; for ungrouped, show once at top
        const localHeader = filters.groupBy !== "none" ? headerRow : (idx === 0 ? headerRow : "");
        // Subtotal por grupo
        let groupSubtotal = "";
        if (filters.groupBy !== "none") {
          if (isCashflow) {
            const ent = g.rows.filter(r => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
            const sai = g.rows.filter(r => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
            const saldo = ent - sai;
            groupSubtotal = `<tr class="sub"><td colspan="${labelColspan}" class="r">Subtotal — Entradas ${formatCurrency(ent)} • Saídas ${formatCurrency(sai)} • Saldo</td><td class="r val" style="color:${saldo >= 0 ? "#2B4C7E" : "#b91c1c"}">${formatCurrency(saldo)}</td></tr>`;
          } else if (isPayables) {
            const sTotal = g.rows.reduce((s, r) => s + r.valor, 0);
            const sPago = g.rows.reduce((s, r) => s + (r.valorPago || 0), 0);
            groupSubtotal = `<tr class="sub"><td colspan="${colCount - 2}" class="r">Subtotal — ${g.rows.length} registro(s)</td><td class="r val">${formatCurrency(sTotal)}</td><td class="r val" style="color:#059669">${formatCurrency(sPago)}</td></tr>`;
          } else {
            const sTotal = g.rows.reduce((s, r) => s + r.valor, 0);
            groupSubtotal = `<tr class="sub"><td colspan="${labelColspan}" class="r">Subtotal — ${g.rows.length} registro(s)</td><td class="r val">${formatCurrency(sTotal)}</td></tr>`;
          }
        }
        return groupHeader + localHeader + tableRows + groupSubtotal;
      })
      .join("");


    const saldoRestanteLine =
      isPayables && (totals as any).saldoRestante > 0
        ? `<tr class="sub"><td colspan="${colCount - 1}" class="r" style="color:#004085">Saldo Restante a Pagar</td><td class="r val" style="color:#004085">${formatCurrency((totals as any).saldoRestante)}</td></tr>`
        : "";

    const pagoComJurosLine =
      isPayables && filters.status === "pago"
        ? `<tr class="sub"><td colspan="${colCount - 1}" class="r" style="color:#059669">Juros pagos no período</td><td class="r val" style="color:#059669">${formatCurrency((totals as any).totalJuros || 0)}</td></tr>`
        : "";

    const totalLine = isCashflow
      ? `<tr class="tot">
          <td colspan="${labelColspan}" class="r">TOTAL — Entradas ${formatCurrency((totals as any).entradas)} • Saídas ${formatCurrency((totals as any).saidas)} • Saldo</td>
          <td class="r val" style="color:${totals.total >= 0 ? "#2B4C7E" : "#b91c1c"}">${formatCurrency(totals.total)}</td>
        </tr>`
      : isPayables
      ? `<tr class="tot">
          <td colspan="${colCount - 2}" class="r">TOTAL DO FILTRO — ${filteredRows.length} registro(s)</td>
          <td class="r val">${formatCurrency(totals.total)}</td>
          <td class="r val" style="color:#059669">${formatCurrency((totals as any).totalPago || 0)}</td>
        </tr>`
      : `<tr class="tot">
          <td colspan="${labelColspan}" class="r">TOTAL DO FILTRO — ${filteredRows.length} registro(s)</td>
          <td class="r val">${formatCurrency(totals.total)}</td>
        </tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${REPORT_TITLE[reportType]}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
@media print { @page { margin: 6mm 5mm; size: A4 portrait; } html,body{margin:0!important;padding:0!important;background:#fff!important} .no-print{display:none!important} .sheet{box-shadow:none!important;border:none!important} tr{page-break-inside:avoid} thead{display:table-header-group} }
html,body{margin:0;padding:0;background:#f4f6f8;font-family:${FONT};color:#1f2937}
.toolbar{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 12px;display:flex;gap:8px;justify-content:flex-end}
.toolbar button{font-family:${FONT};font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid #d1d5db;background:#fff;color:#2B4C7E;cursor:pointer}
.toolbar button.primary{background:#2B4C7E;color:#fff;border-color:#2B4C7E}
.wrap{max-width:900px;margin:6px auto;padding:0 8px}
.head{display:flex;align-items:center;gap:10px;padding:4px 2px 6px;border-bottom:1.5px solid #2B4C7E;margin-bottom:4px}
.head img{height:30px;width:auto;display:block}
.head .est{font-size:9px;color:#555;line-height:1.25}
.head h1{margin:0;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:9px;color:#666;text-align:right;margin-top:1px}
table.sheet{width:100%;border-collapse:collapse;font-size:8.5px;background:#fff;border:1px solid #d0d7de;table-layout:auto}
table.sheet thead th, table.sheet tr.hdr th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:7.5px;letter-spacing:.2px;padding:3px 4px;border:1px solid #d0d7de;text-align:left}
table.sheet thead th.r, table.sheet tr.hdr th.r{text-align:right}
table.sheet tbody tr.hdr td, table.sheet tbody tr.hdr:nth-child(even) td{background:#eef2f6}
table.sheet tbody td{padding:2px 4px;border:1px solid #e5e7eb;vertical-align:top;font-size:8.5px;line-height:1.2}
table.sheet tbody tr:nth-child(even) td{background:#fafbfc}
.nowrap{white-space:nowrap}
table.sheet.fixed{table-layout:fixed}
table.sheet.fixed td.ell,table.sheet.fixed td.ell *{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.t1{font-weight:600;color:#111827}
.t2{font-size:7.5px;color:#6b7280;margin-top:1px}
.t2b{font-size:8.5px;color:#374151}
.st{font-size:8.5px;font-weight:600;color:#374151;text-transform:capitalize}
.neg{color:#b91c1c;font-weight:700}
.val{font-weight:700;color:#111827}
tr.grp td{background:#eef2f6!important;font-weight:700;font-size:9px;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;padding:3px 5px}
tr.sub td{background:#fafbfc!important;font-weight:700;font-size:9px;color:#374151;padding:3px 5px}
tr.tot td{background:#eef2f6!important;font-weight:800;font-size:9.5px;color:#2B4C7E;padding:4px 5px;border-top:1.5px solid #2B4C7E}
tr.tot td.val{color:#2B4C7E;font-size:10px}
.foot{margin-top:4px;display:flex;justify-content:space-between;font-size:8px;color:#6b7280;padding:0 2px}
</style></head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()" class="primary">🖨️ Imprimir</button>
</div>
<div class="wrap">
  <div class="head">
    <img src="${window.location.origin}/logo.png" alt="" />
    <div class="est">
      <div style="font-weight:700;color:#2B4C7E">${esc(estName)}</div>
      ${matrizAddrLine ? `<div>${esc(matrizAddrLine)}</div>` : ""}
      ${matrizDocLine ? `<div>${esc(matrizDocLine)}</div>` : ""}
    </div>
    <div style="flex:1">
      <h1>${REPORT_TITLE[reportType]}</h1>
      <div class="per">Período: ${periodoLabel} • ${filteredRows.length} registro(s)</div>
    </div>
  </div>
  <table class="sheet${isPayables ? " fixed" : ""}">
    <tbody>${sectionsHtml}${totalLine}${pagoComJurosLine}${saldoRestanteLine}</tbody>
  </table>
  <div class="foot">
    <div>SIME TRANSPORTES${estName ? ` — ${esc(estName)}` : ""}${estCnpjFooter ? ` — CNPJ ${esc(estCnpjFooter)}` : ""}</div>
    <div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
  </div>
</div>
</body></html>`;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Não foi possível abrir a impressão", { description: "Libere pop-ups para gerar o PDF na tela." });
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
  };


  const exportCsv = () => {
    if (!rows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Pessoa", "Descrição", "Plano de Contas", "Centro de Custo", "Origem", "Status", "Valor"];
    const lines = [header.join(";")];
    filteredRows.forEach((r) => {
      lines.push([formatDateBR(r.data), r.pessoa, r.descricao.replace(/;/g, ","), r.plano, r.centro, r.origem, r.status, r.valor.toFixed(2).replace(".", ",")].join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${reportType}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showFavorecido = (reportType as string) === "payables";
  const showCliente = reportType === "receivables" || reportType === "forecasts";
  const showPlanoContas = true;
  const showCentroCusto = (reportType as string) === "payables";
  const showOrigem = true;

  const groupOptions: { value: GroupBy; label: string }[] = useMemo(() => {
    const base: { value: GroupBy; label: string }[] = [{ value: "none", label: "Sem agrupamento" }, { value: "status", label: "Status" }];
    if (showPlanoContas) base.push({ value: "plano", label: "Plano de Contas" });
    if (showCentroCusto) base.push({ value: "centro", label: "Centro de Custo" });
    if (showFavorecido) base.push({ value: "favorecido", label: "Favorecido" });
    if (showCliente) base.push({ value: "cliente", label: "Cliente" });
    if (showOrigem) base.push({ value: "origem", label: "Origem" });
    return base;
  }, [reportType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-foreground">Relatórios Financeiros</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!rows.length} className="gap-1">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-3 md:grid-cols-5 w-full">
          <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="forecasts">Previsões</TabsTrigger>
          <TabsTrigger value="dre">DRE Gerencial</TabsTrigger>
        </TabsList>

        {reportType === "dre" ? (
          <TabsContent value="dre" className="mt-4">
            <DreGerencial />
          </TabsContent>
        ) : (reportType as string) === "payables" ? (
          <TabsContent value="payables" className="mt-4">
            <FinancialPayablesTree />
          </TabsContent>
        ) : (
        <TabsContent value={reportType} className="mt-4">
          <Card>
            <CardContent className="p-3 space-y-3">
              {TIPO_DATA_OPTIONS[reportType] && (
                <div className="space-y-1">
                  <Label className="text-xs">Filtrar período por</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {TIPO_DATA_OPTIONS[reportType]!.map((o) => (
                      <Button
                        key={o.value}
                        type="button"
                        size="sm"
                        variant={filters.tipoData === o.value ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => updateFilter("tipoData", o.value)}
                      >
                        {o.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data Inicial</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataInicio} onChange={(e) => updateFilter("dataInicio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data Final</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataFim} onChange={(e) => updateFilter("dataFim", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  {(reportType as string) === "payables" && filters.tipoData === "pagamento" ? (
                    <Input value="Pago" disabled className="h-8 text-xs bg-muted" />
                  ) : (
                    <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {showOrigem && (
                  <div className="space-y-1">
                    <Label className="text-xs">Origem</Label>
                    <Select value={filters.origem} onValueChange={(v) => updateFilter("origem", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORIGEM_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showPlanoContas && (
                  <div className="space-y-1">
                    <Label className="text-xs">Plano de Contas</Label>
                    <PlanoContasCombobox
                      value={filters.planoContasId}
                      onChange={(v) => updateFilter("planoContasId", v)}
                      options={chartAccounts}
                      size="sm"
                      includeAll
                      allValue="todos"
                      allLabel="Todos"
                      placeholder="Todos"
                      includeSemClassificacao
                    />
                  </div>
                )}
                {showPlanoContas && (
                  <div className="space-y-1">
                    <Label className="text-xs">Exceto</Label>
                    <PlanoContasCombobox
                      value={filters.planoContasExcetoId}
                      onChange={(v) => updateFilter("planoContasExcetoId", v)}
                      options={chartAccounts}
                      size="sm"
                      includeAll
                      allValue="todos"
                      allLabel="Nenhuma exceção"
                      placeholder="Nenhuma exceção"
                      includeSemClassificacao
                    />
                  </div>
                )}
                {showCentroCusto && (
                  <div className="space-y-1">
                    <Label className="text-xs">Centro de Custo</Label>
                    <Select value={filters.centroCusto} onValueChange={(v) => updateFilter("centroCusto", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        <SelectItem value="operacional" className="text-xs">Operacional</SelectItem>
                        <SelectItem value="administrativo" className="text-xs">Administrativo</SelectItem>
                        <SelectItem value="comercial" className="text-xs">Comercial</SelectItem>
                        <SelectItem value="financeiro" className="text-xs">Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showFavorecido && (() => {
                  const term = favorecidoSearch.trim().toLowerCase();
                  const list = term
                    ? profiles.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)))
                    : profiles;
                  return (
                    <div className="space-y-1">
                      <Label className="text-xs">Favorecido</Label>
                      <Select value={filters.favorecidoId} onValueChange={(v) => updateFilter("favorecidoId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                value={favorecidoSearch}
                                onChange={(e) => setFavorecidoSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Buscar..."
                                className="h-7 text-xs pl-7"
                              />
                            </div>
                          </div>
                          <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                          {list.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                          {list.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                {showCliente && (() => {
                  const term = clienteSearch.trim().toLowerCase();
                  const baseList = profiles.filter((p) => p.category === "cliente");
                  const list = term
                    ? baseList.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)))
                    : baseList;
                  return (
                    <div className="space-y-1">
                      <Label className="text-xs">Cliente</Label>
                      <Select value={filters.clienteId} onValueChange={(v) => updateFilter("clienteId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                value={clienteSearch}
                                onChange={(e) => setClienteSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Buscar..."
                                className="h-7 text-xs pl-7"
                              />
                            </div>
                          </div>
                          <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                          {list.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                          {list.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                <div className="space-y-1">
                  <Label className="text-xs">Agrupar por</Label>
                  <Select value={filters.groupBy} onValueChange={(v) => updateFilter("groupBy", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex flex-col justify-end">
                  <Button size="sm" onClick={fetchData} disabled={loading} className="gap-1 h-8">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Gerar
                  </Button>
                </div>
              </div>
              <div className="pt-1">
                <Label className="text-xs">Buscar por nome</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={nameSearch}
                    onChange={(e) => setNameSearch(e.target.value)}
                    placeholder="Filtrar em tempo real por favorecido, cliente ou descrição..."
                    className="h-8 text-xs pl-7"
                    disabled={rows.length === 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground">{filteredRows.length} de {rows.length} registro(s)</div>
                {reportType === "cashflow" ? (
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600 font-semibold">Entradas: {formatCurrency((totals as any).entradas)}</span>
                    <span className="text-red-600 font-semibold">Saídas: {formatCurrency((totals as any).saidas)}</span>
                    <span className={`font-bold ${totals.total >= 0 ? "text-primary" : "text-red-600"}`}>Saldo: {formatCurrency(totals.total)}</span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-primary">Total: {formatCurrency(totals.total)}</div>
                )}
              </div>

              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {grouped.map((g) => (
                    <div key={g.key} className="space-y-2">
                      {filters.groupBy !== "none" && (
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-bold text-primary uppercase">
                            {g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span>
                          </span>
                          <span className="text-[11px] font-bold text-primary tabular-nums">
                            {formatCurrency(g.rows.reduce((s, r) => s + (r.tipo === "saida" ? -r.valor : r.valor), 0))}
                          </span>
                        </div>
                      )}
                      {g.rows.map((r) => (
                        <Card key={r.id}>
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">{r.pessoa}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-muted-foreground truncate">
                                <span>{formatDateBR(r.data)}</span>
                                {r.parcela && <span className="shrink-0 font-medium text-foreground">· P{r.parcela}</span>}
                                <span className="truncate">· {r.descricao}</span>
                              </div>
                              <span className={`font-mono font-bold tabular-nums ${r.tipo === "saida" ? "text-red-600" : "text-foreground"}`}>
                                {r.tipo === "saida" ? "-" : ""}{formatCurrency(r.valor)}
                              </span>
                            </div>
                            {r.dataVencimento && (
                              <div className="text-[10px] text-muted-foreground">Vencimento: <span className="font-medium text-foreground">{formatDateBR(r.dataVencimento)}</span></div>
                            )}
                            {(reportType as string) === "payables" && (r.valorPago || 0) > 0 && (
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted-foreground">Pago:</span>
                                <span className="text-green-600 font-semibold tabular-nums">{formatCurrency(r.valorPago || 0)}</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium whitespace-nowrap w-[100px]">Data</th>
                          <th className="px-3 py-2 font-medium">Pessoa / Descrição</th>
                          {(reportType as string) === "payables" && (
                            <>
                              <th className="px-2 py-2 font-medium whitespace-nowrap w-[100px]">Vencimento</th>
                              <th className="px-2 py-2 font-medium text-center whitespace-nowrap w-[70px]">Parcela</th>
                            </>
                          )}
                          <th className="px-2 py-2 font-medium text-center w-[100px]">Status</th>
                          <th className="px-2 py-2 font-medium text-right w-[130px]">Valor</th>
                          {(reportType as string) === "payables" && (
                            <th className="px-2 py-2 font-medium text-right w-[130px]">Pago</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.map((g) => (
                          <Fragment key={g.key}>
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/40 border-t border-border">
                                <td colSpan={(reportType as string) === "payables" ? 7 : 4} className="px-3 py-1.5 text-xs font-bold text-primary uppercase">
                                  {g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span>
                                </td>
                              </tr>
                            )}
                            {g.rows.map((r) => {
                              const pagoFinal = r.valorPago || 0;
                              const isPayables = (reportType as string) === "payables";
                              return (
                              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                                <td className="px-3 py-2 whitespace-nowrap tabular-nums align-top">{formatDateBR(r.data)}</td>
                                <td className="px-3 py-2 align-top max-w-0">
                                  <div className="font-medium truncate">{r.pessoa}</div>
                                  <div className="text-[10px] text-muted-foreground truncate" title={r.descricao}>{r.descricao}</div>
                                  {!isPayables && r.dataVencimento && (
                                    <div className="text-[10px] text-muted-foreground">Venc. original: <span className="font-medium text-foreground">{formatDateBR(r.dataVencimento)}</span></div>
                                  )}
                                </td>
                                {isPayables && (
                                  <>
                                    <td className="px-2 py-2 whitespace-nowrap tabular-nums align-top">{r.dataVencimento ? formatDateBR(r.dataVencimento) : "—"}</td>
                                    <td className="px-2 py-2 text-center whitespace-nowrap tabular-nums align-top">{r.parcela || "—"}</td>
                                  </>
                                )}
                                <td className="px-2 py-2 text-center align-top">
                                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                                </td>
                                <td className={`px-2 py-2 text-right tabular-nums font-medium align-top ${r.tipo === "saida" ? "text-red-600" : "text-foreground"}`}>
                                  {r.tipo === "saida" ? "-" : ""}{formatCurrency(r.valor)}
                                </td>
                                {isPayables && (
                                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-green-600 align-top">
                                    {pagoFinal > 0 ? formatCurrency(pagoFinal) : "—"}
                                  </td>
                                )}
                              </tr>
                              );
                            })}
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/20 border-t border-border">
                                <td colSpan={(reportType as string) === "payables" ? 5 : 3} className="px-3 py-1.5 text-right text-xs font-semibold">Subtotal</td>
                                <td className="px-2 py-1.5 text-right text-xs font-bold text-primary tabular-nums">
                                  {formatCurrency(g.rows.reduce((s, r) => s + (r.tipo === "saida" ? -r.valor : r.valor), 0))}
                                </td>
                                {(reportType as string) === "payables" && (
                                  <td className="px-2 py-1.5 text-right text-xs font-bold text-green-600 tabular-nums">
                                    {formatCurrency(g.rows.reduce((s, r) => s + (r.valorPago || 0), 0))}
                                  </td>
                                )}
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
