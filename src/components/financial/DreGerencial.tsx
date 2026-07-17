import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ChevronRight, ChevronDown, Eye, Download, ScanSearch } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { exportToCsv } from "@/lib/csvExport";
import { ReportInfoTooltip } from "./ReportInfoTooltip";

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  conta_pai_id: string | null;
}

type OrigemKind = "cartao" | "contas_pagar" | "direta";

interface MovDetail {
  tipo: "entrada" | "saida";
  valor: number;
  planoId: string | null;
  origem: OrigemKind;
  data: string | null;
  descricao: string;
  parcela: string; // "X/Y" or "—"
  itemId?: string; // credit_card_invoice_items.id (only for origem === "cartao")
}

interface TreeNode {
  id: string; // account id or synthetic key
  codigo: string;
  nome: string;
  level: number;
  entradas: number;
  saidas: number;
  children: TreeNode[];
  isOrigem?: boolean;
  origemKind?: OrigemKind;
  leafId?: string | null; // account id (or null for unclassified) — used for drill-down
}

const UNCLASSIFIED_IN = "__unclassified_in__";
const UNCLASSIFIED_OUT = "__unclassified_out__";
const UNCLASSIFIED_KEY = "__unclassified__";

const ORIGEM_LABEL: Record<OrigemKind, string> = {
  cartao: "💳 Cartão de Crédito",
  contas_pagar: "🧾 Contas a Pagar",
  direta: "💸 Movimentação Direta",
};
const ORIGEM_ORDER: OrigemKind[] = ["cartao", "contas_pagar", "direta"];

export function DreGerencial() {
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [regime, setRegime] = useState<"competencia" | "caixa">("competencia");
  const [loading, setLoading] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [movs, setMovs] = useState<MovDetail[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [generated, setGenerated] = useState(false);
  const [drill, setDrill] = useState<{ title: string; rows: MovDetail[] } | null>(null);

  interface AuditRow {
    id: string;
    posted_date: string | null;
    description: string;
    amount: number;
    parcela: string;
    invoice_label: string;
    reason: string;
  }
  const [audit, setAudit] = useState<{ missing: AuditRow[]; extra: AuditRow[]; totalCc: number; totalDre: number } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, conta_pai_id")
      .order("codigo")
      .then(({ data }) => setChartAccounts((data as ChartAccount[]) || []));
  }, []);

  const gerar = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Read all bank movements in period (single source of truth for cash flow)
      let q: any = supabase
        .from("movimentacoes_bancarias")
        .select("id, tipo, valor, plano_contas_id, origem, origem_id, data_movimentacao, descricao");
      if (dataInicio) q = q.gte("data_movimentacao", dataInicio);
      if (dataFim) q = q.lte("data_movimentacao", dataFim);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      const list = (data || []) as any[];

      // 2) Identify credit card invoice expenses (to explode into detailed items)
      const { data: ccInvoices } = await supabase
        .from("credit_card_invoices")
        .select("id, expense_id")
        .not("expense_id", "is", null);
      const ccExpenseIds = new Set<string>((ccInvoices || []).map((r: any) => r.expense_id));

      // 3) Enrich plano_contas_id for movements linked to expenses
      const payPaymentIds = list.filter((m) => m.origem === "pagamento_despesa" && !m.plano_contas_id).map((m) => m.origem_id);
      const loteIds = list.filter((m) => m.origem === "pagamento_agrupado" && !m.plano_contas_id).map((m) => m.origem_id);
      const contasPagarIds = list.filter((m) => m.origem === "contas_pagar" && !m.plano_contas_id).map((m) => m.origem_id);
      const despesasDirIds = list.filter((m) => m.origem === "despesas" && !m.plano_contas_id).map((m) => m.origem_id);
      const contasReceberIds = list.filter((m) => m.origem === "contas_receber" && !m.plano_contas_id).map((m) => m.origem_id);
      const recebParcialIds = list.filter((m) => m.origem === "recebimento_conta_receber" && !m.plano_contas_id).map((m) => m.origem_id);

      const [paysRes, loteRes, contasPagarRes, despesasDirRes, contasReceberRes, recebParcialRes] = await Promise.all([
        payPaymentIds.length
          ? supabase.from("expense_payments").select("id, expense_id, expenses:expense_id(plano_contas_id)").in("id", payPaymentIds)
          : Promise.resolve({ data: [] as any[] } as any),
        loteIds.length
          ? supabase.from("expense_payments").select("lote_id, expense_id, expenses:expense_id(plano_contas_id)").in("lote_id", loteIds)
          : Promise.resolve({ data: [] as any[] } as any),
        contasPagarIds.length
          ? supabase.from("accounts_payable").select("id, category_id").in("id", contasPagarIds)
          : Promise.resolve({ data: [] as any[] } as any),
        despesasDirIds.length
          ? supabase.from("expenses").select("id, plano_contas_id").in("id", despesasDirIds)
          : Promise.resolve({ data: [] as any[] } as any),
        contasReceberIds.length
          ? supabase.from("contas_receber").select("id, fatura_id").in("id", contasReceberIds)
          : Promise.resolve({ data: [] as any[] } as any),
        recebParcialIds.length
          ? supabase.from("receivable_payments").select("id, conta_receber_id").in("id", recebParcialIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const chartRes = await supabase.from("chart_of_accounts").select("id, codigo").in("codigo", ["1.1.01", "1.1.02"]);
      const revenueByCodigo = new Map<string, string>();
      (chartRes.data || []).forEach((c: any) => revenueByCodigo.set(c.codigo, c.id));
      const revenuePlanoFromOrigemTipo = (t?: string | null): string | null => {
        if (t === "cte") return revenueByCodigo.get("1.1.01") || null;
        if (t === "colheita") return revenueByCodigo.get("1.1.02") || null;
        return null;
      };

      const planoByContaReceber = new Map<string, string | null>();
      const crFatMap = new Map<string, string>();
      (contasReceberRes.data || []).forEach((cr: any) => { if (cr.fatura_id) crFatMap.set(cr.id, cr.fatura_id); });
      const rpCrIds: string[] = Array.from(new Set(((recebParcialRes.data || []) as any[]).map((rp: any) => String(rp.conta_receber_id)).filter(Boolean)));
      if (rpCrIds.length > 0) {
        const { data: extraCr } = await supabase.from("contas_receber").select("id, fatura_id").in("id", rpCrIds);
        (extraCr || []).forEach((cr: any) => { if (cr.fatura_id) crFatMap.set(cr.id, cr.fatura_id); });
      }
      const allFaturaIds: string[] = Array.from(new Set(Array.from(crFatMap.values())));
      const faturaOrigemTipo = new Map<string, string>();
      if (allFaturaIds.length > 0) {
        const { data: fp } = await supabase
          .from("fatura_previsoes")
          .select("fatura_id, previsoes_recebimento:previsao_id(origem_tipo)")
          .in("fatura_id", allFaturaIds);
        (fp || []).forEach((row: any) => {
          const t = row.previsoes_recebimento?.origem_tipo;
          if (t && !faturaOrigemTipo.has(row.fatura_id)) faturaOrigemTipo.set(row.fatura_id, t);
        });
      }
      crFatMap.forEach((fatId, crId) => {
        planoByContaReceber.set(crId, revenuePlanoFromOrigemTipo(faturaOrigemTipo.get(fatId)));
      });

      const planoByPayment = new Map<string, string | null>();
      const expenseByPayment = new Map<string, string | null>();
      (paysRes.data || []).forEach((p: any) => {
        planoByPayment.set(p.id, p.expenses?.plano_contas_id || null);
        expenseByPayment.set(p.id, p.expense_id || null);
      });
      const planoByLote = new Map<string, string | null>();
      const expensesByLote = new Map<string, Set<string>>();
      (loteRes.data || []).forEach((p: any) => {
        if (!planoByLote.has(p.lote_id)) planoByLote.set(p.lote_id, p.expenses?.plano_contas_id || null);
        if (!expensesByLote.has(p.lote_id)) expensesByLote.set(p.lote_id, new Set());
        if (p.expense_id) expensesByLote.get(p.lote_id)!.add(p.expense_id);
      });
      const planoByContaPagar = new Map<string, string | null>();
      (contasPagarRes.data || []).forEach((r: any) => planoByContaPagar.set(r.id, r.category_id || null));
      const planoByDespesa = new Map<string, string | null>();
      (despesasDirRes.data || []).forEach((r: any) => planoByDespesa.set(r.id, r.plano_contas_id || null));
      const planoByRecebParcial = new Map<string, string | null>();
      (recebParcialRes.data || []).forEach((rp: any) => {
        planoByRecebParcial.set(rp.id, planoByContaReceber.get(rp.conta_receber_id) || null);
      });

      // 4) Filter out bank movements that represent the payment of a credit card
      //    invoice's mother expense (avoid double-counting when adding CC item detail).
      const isCcInvoicePayment = (m: any): boolean => {
        if (m.origem === "contas_pagar" || m.origem === "despesas") {
          return ccExpenseIds.has(m.origem_id);
        }
        if (m.origem === "pagamento_despesa") {
          const eid = expenseByPayment.get(m.origem_id);
          return !!eid && ccExpenseIds.has(eid);
        }
        if (m.origem === "pagamento_agrupado") {
          const set = expensesByLote.get(m.origem_id);
          if (!set) return false;
          for (const eid of set) if (!ccExpenseIds.has(eid)) return false;
          return set.size > 0;
        }
        return false;
      };

      const filtered = list.filter((m) => !isCcInvoicePayment(m));

      const CONTAS_PAGAR_ORIGENS = new Set(["despesas", "pagamento_despesa", "pagamento_agrupado", "contas_pagar"]);
      const enriched: MovDetail[] = filtered.map((m) => {
        let pid: string | null = m.plano_contas_id || null;
        if (!pid) {
          if (m.origem === "pagamento_despesa") pid = planoByPayment.get(m.origem_id) || null;
          else if (m.origem === "pagamento_agrupado") pid = planoByLote.get(m.origem_id) || null;
          else if (m.origem === "contas_pagar") pid = planoByContaPagar.get(m.origem_id) || null;
          else if (m.origem === "despesas") pid = planoByDespesa.get(m.origem_id) || null;
          else if (m.origem === "contas_receber") pid = planoByContaReceber.get(m.origem_id) || null;
          else if (m.origem === "recebimento_conta_receber") pid = planoByRecebParcial.get(m.origem_id) || null;
        }
        const origemKind: OrigemKind = CONTAS_PAGAR_ORIGENS.has(m.origem) ? "contas_pagar" : "direta";
        return {
          tipo: m.tipo as "entrada" | "saida",
          valor: Number(m.valor) || 0,
          planoId: pid,
          origem: origemKind,
          data: m.data_movimentacao || null,
          descricao: m.descricao || "—",
          parcela: "—",
        };
      });

      // 5) Explode credit card invoice items.
      //   - Competência: pela data ORIGINAL da compra (posted_date). Apenas
      //     compras à vista OU a 1ª parcela nascem no período. Parcelas 2/N...
      //     ficam na competência do mês em que a compra aconteceu.
      //   - Caixa (Fatura): pelo vencimento da fatura (due_date). Tudo o que
      //     está na fatura entra no mês em que ela vence — inclusive parcelas
      //     de compras anteriores. Espelha o que efetivamente sai da conta.
      if (regime === "competencia") {
        const closedInvoiceIds = (ccInvoices || []).map((r: any) => r.id);
        if (closedInvoiceIds.length > 0) {
          let itemsQ: any = supabase
            .from("credit_card_invoice_items")
            .select("id, amount, plano_contas_id, ignored, posted_date, description, parcela_atual, parcela_total")
            .in("invoice_id", closedInvoiceIds);
          if (dataInicio) itemsQ = itemsQ.gte("posted_date", dataInicio);
          if (dataFim) itemsQ = itemsQ.lte("posted_date", dataFim);
          const { data: items } = await itemsQ.limit(20000);
          (items || []).forEach((it: any) => {
            if (it.ignored) return;
            const val = Number(it.amount) || 0;
            if (val === 0) return;
            const atual = Number(it.parcela_atual) || 0;
            const total = Number(it.parcela_total) || 0;
            // REGIME DE COMPETÊNCIA PURA: só a 1ª parcela (ou compra à vista) entra,
            // mas com o VALOR TOTAL da compra (parcela × nº de parcelas).
            // Ex.: 10x de R$ 1.000 → competência lança R$ 10.000 no mês da compra.
            if (total > 0 && atual !== 1) return;
            const parcelaLabel = total > 0 ? `1/${total} • valor total ${total}x` : "à vista";
            const valorCompetencia = total > 0 ? Math.abs(val) * total : Math.abs(val);
            enriched.push({
              tipo: val < 0 ? "entrada" : "saida",
              valor: valorCompetencia,
              planoId: it.plano_contas_id || null,
              origem: "cartao",
              data: it.posted_date || null,
              descricao: it.description || "—",
              parcela: parcelaLabel,
              itemId: it.id,
            });
          });
        }
      } else {
        const { data: invsCaixa } = await supabase
          .from("credit_card_invoices")
          .select("id, due_date")
          .is("deleted_at", null)
          .gte("due_date", dataInicio)
          .lte("due_date", dataFim);
        const caixaInvoiceIds = (invsCaixa || []).map((i: any) => i.id);
        const dueByInv = new Map<string, string>();
        (invsCaixa || []).forEach((i: any) => dueByInv.set(i.id, i.due_date));
        if (caixaInvoiceIds.length > 0) {
          const { data: items } = await supabase
            .from("credit_card_invoice_items")
            .select("id, invoice_id, amount, plano_contas_id, ignored, posted_date, description, parcela_atual, parcela_total")
            .in("invoice_id", caixaInvoiceIds)
            .limit(20000);
          (items || []).forEach((it: any) => {
            if (it.ignored) return;
            const val = Number(it.amount) || 0;
            if (val === 0) return;
            const atual = Number(it.parcela_atual) || 0;
            const total = Number(it.parcela_total) || 0;
            const parcelaLabel = total > 0 ? `${atual}/${total}` : "à vista";
            enriched.push({
              tipo: val < 0 ? "entrada" : "saida",
              valor: Math.abs(val),
              planoId: it.plano_contas_id || null,
              origem: "cartao",
              data: dueByInv.get(it.invoice_id) || it.posted_date || null,
              descricao: it.description || "—",
              parcela: parcelaLabel,
              itemId: it.id,
            });
          });
        }
      }

      setMovs(enriched);
      setGenerated(true);
    } catch (e: any) {
      toast.error("Erro ao gerar DRE", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, regime]);


  // Build hierarchical tree
  const { rootNodes, totalEntradas, totalSaidas } = useMemo(() => {
    const accountsById = new Map<string, ChartAccount>();
    chartAccounts.forEach((a) => accountsById.set(a.id, a));

    const childrenByParent = new Map<string | null, ChartAccount[]>();
    chartAccounts.forEach((a) => {
      const key = a.conta_pai_id || null;
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key)!.push(a);
    });

    const nodeMap = new Map<string, TreeNode>();
    const buildNode = (a: ChartAccount, level: number): TreeNode => {
      const node: TreeNode = {
        id: a.id,
        codigo: a.codigo,
        nome: a.nome,
        level,
        entradas: 0,
        saidas: 0,
        children: (childrenByParent.get(a.id) || [])
          .sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true, sensitivity: "base" }))
          .map((c) => buildNode(c, level + 1)),
      };
      nodeMap.set(a.id, node);
      return node;
    };

    const roots = (childrenByParent.get(null) || [])
      .sort((x, y) => x.codigo.localeCompare(y.codigo, undefined, { numeric: true, sensitivity: "base" }))
      .map((r) => buildNode(r, 0));

    const ancestorsOf = (id: string): string[] => {
      const chain: string[] = [];
      let cur = accountsById.get(id);
      while (cur) {
        chain.push(cur.id);
        cur = cur.conta_pai_id ? accountsById.get(cur.conta_pai_id) : undefined;
      }
      return chain;
    };

    let tEnt = 0;
    let tSai = 0;
    const unclassifiedEnt: Record<OrigemKind, number> = { cartao: 0, contas_pagar: 0, direta: 0 };
    const unclassifiedSai: Record<OrigemKind, number> = { cartao: 0, contas_pagar: 0, direta: 0 };
    const leafOrigemMap = new Map<string, { entradas: Record<OrigemKind, number>; saidas: Record<OrigemKind, number> }>();
    const ensureLeafBucket = (aid: string) => {
      let b = leafOrigemMap.get(aid);
      if (!b) {
        b = {
          entradas: { cartao: 0, contas_pagar: 0, direta: 0 },
          saidas: { cartao: 0, contas_pagar: 0, direta: 0 },
        };
        leafOrigemMap.set(aid, b);
      }
      return b;
    };

    movs.forEach((m) => {
      if (m.tipo === "entrada") tEnt += m.valor;
      else tSai += m.valor;

      if (!m.planoId || !accountsById.has(m.planoId)) {
        if (m.tipo === "entrada") unclassifiedEnt[m.origem] += m.valor;
        else unclassifiedSai[m.origem] += m.valor;
        return;
      }
      const bucket = ensureLeafBucket(m.planoId);
      if (m.tipo === "entrada") bucket.entradas[m.origem] += m.valor;
      else bucket.saidas[m.origem] += m.valor;

      ancestorsOf(m.planoId).forEach((aid) => {
        const n = nodeMap.get(aid);
        if (!n) return;
        if (m.tipo === "entrada") n.entradas += m.valor;
        else n.saidas += m.valor;
      });
    });

    leafOrigemMap.forEach((bucket, aid) => {
      const n = nodeMap.get(aid);
      if (!n) return;
      if (n.children.length > 0) return;
      ORIGEM_ORDER.forEach((ok) => {
        const ent = bucket.entradas[ok];
        const sai = bucket.saidas[ok];
        if (ent === 0 && sai === 0) return;
        n.children.push({
          id: `${aid}__origem__${ok}`,
          codigo: "",
          nome: ORIGEM_LABEL[ok],
          level: n.level + 1,
          entradas: ent,
          saidas: sai,
          children: [],
          isOrigem: true,
          origemKind: ok,
          leafId: aid,
        });
      });
    });

    const finalRoots: TreeNode[] = [...roots];
    const buildUnclassifiedNode = (
      id: string,
      nome: string,
      totals: Record<OrigemKind, number>,
      tipo: "entrada" | "saida",
    ): TreeNode | null => {
      const sum = totals.cartao + totals.contas_pagar + totals.direta;
      if (sum === 0) return null;
      const children: TreeNode[] = ORIGEM_ORDER
        .filter((ok) => totals[ok] > 0)
        .map((ok) => ({
          id: `${id}__origem__${ok}`,
          codigo: "",
          nome: ORIGEM_LABEL[ok],
          level: 1,
          entradas: tipo === "entrada" ? totals[ok] : 0,
          saidas: tipo === "saida" ? totals[ok] : 0,
          children: [],
          isOrigem: true,
          origemKind: ok,
          leafId: null,
        }));
      return {
        id,
        codigo: "—",
        nome,
        level: 0,
        entradas: tipo === "entrada" ? sum : 0,
        saidas: tipo === "saida" ? sum : 0,
        children,
      };
    };
    const uEnt = buildUnclassifiedNode(UNCLASSIFIED_IN, "Entradas sem plano de contas", unclassifiedEnt, "entrada");
    const uSai = buildUnclassifiedNode(UNCLASSIFIED_OUT, "Saídas sem plano de contas", unclassifiedSai, "saida");
    if (uEnt) finalRoots.push(uEnt);
    if (uSai) finalRoots.push(uSai);

    const prune = (n: TreeNode): TreeNode | null => {
      const kids = n.children.map(prune).filter(Boolean) as TreeNode[];
      if (n.entradas === 0 && n.saidas === 0 && kids.length === 0) return null;
      return { ...n, children: kids };
    };
    const filtered = finalRoots.map(prune).filter(Boolean) as TreeNode[];

    return { rootNodes: filtered, totalEntradas: tEnt, totalSaidas: tSai };
  }, [chartAccounts, movs]);

  const openDrill = useCallback((n: TreeNode) => {
    if (!n.isOrigem || !n.origemKind) return;
    const tipo: "entrada" | "saida" = n.entradas > n.saidas ? "entrada" : "saida";
    const accountsById = new Map<string, ChartAccount>();
    chartAccounts.forEach((a) => accountsById.set(a.id, a));
    const rows = movs.filter((m) => {
      if (m.tipo !== tipo) return false;
      if (m.origem !== n.origemKind) return false;
      if (n.leafId === null || n.leafId === undefined) {
        // Unclassified bucket
        return !m.planoId || !accountsById.has(m.planoId);
      }
      return m.planoId === n.leafId;
    });
    const acct = n.leafId ? accountsById.get(n.leafId) : null;
    const contaLabel = acct ? `${acct.codigo} ${acct.nome}` : "Sem classificação";
    setDrill({
      title: `${contaLabel} — ${ORIGEM_LABEL[n.origemKind]}`,
      rows: rows.sort((a, b) => (a.data || "").localeCompare(b.data || "")),
    });
  }, [movs, chartAccounts]);

  const exportDrillCsv = useCallback(() => {
    if (!drill) return;
    const rows = drill.rows.map((r) => ({
      data: r.data ? formatDateBR(r.data) : "",
      descricao: r.descricao,
      parcela: r.parcela,
      valor: r.valor.toFixed(2).replace(".", ","),
    }));
    const filename = `dre-drill-${drill.title.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}-${dataInicio}_${dataFim}.csv`;
    exportToCsv(filename, rows, [
      { key: "data", label: "Data" },
      { key: "descricao", label: "Descrição" },
      { key: "parcela", label: "Parcela" },
      { key: "valor", label: "Valor" },
    ]);
  }, [drill, dataInicio, dataFim]);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      // 1) Buscar TODOS os itens de cartão do período (fonte "módulo Cartão")
      const { data: invs } = await supabase
        .from("credit_card_invoices")
        .select("id, card_name, reference_label, expense_id, deleted_at")
        .is("deleted_at", null);
      const invMap = new Map<string, { label: string; closed: boolean }>();
      (invs || []).forEach((inv: any) => {
        invMap.set(inv.id, {
          label: `${inv.card_name || "—"}${inv.reference_label ? " • " + inv.reference_label : ""}`,
          closed: !!inv.expense_id,
        });
      });
      const invIds = Array.from(invMap.keys());
      if (invIds.length === 0) {
        setAudit({ missing: [], extra: [], totalCc: 0, totalDre: 0 });
        return;
      }
      let q: any = supabase
        .from("credit_card_invoice_items")
        .select("id, invoice_id, amount, ignored, posted_date, description, parcela_atual, parcela_total")
        .in("invoice_id", invIds);
      if (dataInicio) q = q.gte("posted_date", dataInicio);
      if (dataFim) q = q.lte("posted_date", dataFim);
      const { data: items, error } = await q.limit(20000);
      if (error) throw error;

      const dreItemIds = new Set<string>(
        movs.filter((m) => m.origem === "cartao" && m.itemId).map((m) => m.itemId as string),
      );

      const ccRows: AuditRow[] = [];
      const dreExpected = new Set<string>();
      let totalCc = 0;
      (items || []).forEach((it: any) => {
        const val = Math.abs(Number(it.amount) || 0);
        if (val === 0) return;
        const atual = Number(it.parcela_atual) || 0;
        const total = Number(it.parcela_total) || 0;
        // REGRA DE COMPETÊNCIA: só à vista (total=0) ou 1ª parcela nascem no mês.
        // Parcelas 2/N, 3/N... pertencem à competência do mês da compra original.
        if (total > 0 && atual !== 1) return;

        // Regime de competência: para parcelamentos, considerar o VALOR TOTAL
        // da compra (parcela × N) no mês da compra original.
        const competenciaVal = total > 0 ? val * total : val;
        totalCc += competenciaVal;
        const inv = invMap.get(it.invoice_id) || { label: "—", closed: false };
        const parcela = total > 0 ? `1/${total} • total ${total}x` : "à vista";

        const reasons: string[] = [];
        if (it.ignored) reasons.push("Item marcado como Ignorado");
        if (!inv.closed) reasons.push("Fatura ainda em aberto (sem despesa gerada)");

        const row: AuditRow = {
          id: it.id,
          posted_date: it.posted_date,
          description: it.description || "—",
          amount: competenciaVal,
          parcela,
          invoice_label: inv.label,
          reason: reasons.join(" • ") || "OK — deveria estar na DRE",
        };
        ccRows.push(row);
        if (reasons.length === 0) dreExpected.add(it.id);
      });

      const missing: AuditRow[] = ccRows.filter((r) => !dreItemIds.has(r.id));
      // "extra": itens que a DRE contou mas que NÃO aparecem no módulo (período/filtro)
      const ccIds = new Set(ccRows.map((r) => r.id));
      const extra: AuditRow[] = [];
      movs
        .filter((m) => m.origem === "cartao" && m.itemId && !ccIds.has(m.itemId))
        .forEach((m) => {
          extra.push({
            id: m.itemId as string,
            posted_date: m.data,
            description: m.descricao,
            amount: m.valor,
            parcela: m.parcela,
            invoice_label: "—",
            reason: "Presente na DRE mas fora do período no módulo Cartão",
          });
        });

      let totalDre = 0;
      movs.forEach((m) => { if (m.origem === "cartao") totalDre += m.valor; });

      setAudit({ missing, extra, totalCc, totalDre });
    } catch (e: any) {
      toast.error("Erro na auditoria", { description: e.message });
    } finally {
      setAuditLoading(false);
    }
  }, [dataInicio, dataFim, movs]);

  const exportAuditCsv = useCallback((rows: AuditRow[], suffix: string) => {
    const mapped = rows.map((r) => ({
      data: r.posted_date ? formatDateBR(r.posted_date) : "",
      descricao: r.description,
      parcela: r.parcela,
      fatura: r.invoice_label,
      valor: r.amount.toFixed(2).replace(".", ","),
      motivo: r.reason,
    }));
    exportToCsv(`auditoria-${suffix}-${dataInicio}_${dataFim}.csv`, mapped, [
      { key: "data", label: "Data" },
      { key: "descricao", label: "Descrição" },
      { key: "parcela", label: "Parcela" },
      { key: "fatura", label: "Fatura" },
      { key: "valor", label: "Valor" },
      { key: "motivo", label: "Motivo" },
    ]);
  }, [dataInicio, dataFim]);


  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    const walk = (n: TreeNode) => {
      next[n.id] = true;
      n.children.forEach(walk);
    };
    rootNodes.forEach(walk);
    setExpanded(next);
  };
  const collapseAll = () => setExpanded({});

  const resultado = totalEntradas - totalSaidas;

  const renderRow = (n: TreeNode): JSX.Element[] => {
    const isOpen = expanded[n.id] ?? n.level === 0;
    const hasChildren = n.children.length > 0;
    const isRevenueBranch = n.isOrigem
      ? n.entradas > n.saidas
      : (n.codigo.startsWith("1") || n.codigo.startsWith("3") || n.id === UNCLASSIFIED_IN);
    const valor = isRevenueBranch ? n.entradas : n.saidas;
    const rows: JSX.Element[] = [
      <tr
        key={n.id}
        onClick={n.isOrigem ? () => openDrill(n) : undefined}
        className={cn(
          "border-b border-border/60 hover:bg-muted/30",
          n.level === 0 && "bg-muted/40 font-bold",
          n.level === 1 && !n.isOrigem && "font-semibold",
          n.isOrigem && "bg-blue-50/60 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-100/70 dark:hover:bg-blue-900/30",
        )}
      >
        <td className="px-2 py-1.5" style={{ paddingLeft: `${8 + n.level * 16}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggle(n.id); }}
                className="p-0.5 hover:bg-muted rounded"
              >
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            {!n.isOrigem && (
              <span className="text-xs tabular-nums text-muted-foreground w-16 shrink-0">{n.codigo}</span>
            )}
            <span className={cn("text-xs truncate flex items-center gap-1.5", n.isOrigem && "ml-16 font-medium text-blue-700 dark:text-blue-300")}>
              {n.nome}
              {n.isOrigem && (
                <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wide bg-blue-600 text-white px-1.5 py-0.5 rounded">
                  <Eye className="h-2.5 w-2.5" /> ver
                </span>
              )}
            </span>
          </div>
        </td>
        <td className={cn("px-3 py-1.5 text-right tabular-nums text-xs whitespace-nowrap", isRevenueBranch ? "text-green-600" : "text-red-600")}>
          {n.isOrigem ? (
            <button
              onClick={(e) => { e.stopPropagation(); openDrill(n); }}
              className="underline decoration-dotted underline-offset-2 hover:decoration-solid font-semibold focus:outline-none"
              title="Ver lançamentos detalhados"
            >
              {formatCurrency(valor)}
            </button>
          ) : (
            formatCurrency(valor)
          )}
        </td>
      </tr>,
    ];
    if (isOpen && hasChildren) {
      n.children.forEach((c) => rows.push(...renderRow(c)));
    }
    return rows;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold text-foreground">DRE Gerencial</h1>
        <ReportInfoTooltip text="Baseado em Regime de Competência (Data da Compra / Valor Total). Para parcelamentos, o valor total da compra é lançado no mês em que ocorreu — parcelas seguintes não aparecem em meses futuros." />
      </div>
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Data Inicial</Label>
              <Input type="date" className="h-8 text-xs" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data Final</Label>
              <Input type="date" className="h-8 text-xs" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            <div>
              <Button size="sm" onClick={gerar} disabled={loading} className="gap-1 h-8 w-full">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Gerar DRE
              </Button>
            </div>
            {generated && (
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={expandAll}>Expandir</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={collapseAll}>Recolher</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs w-full gap-1"
                  onClick={runAudit}
                  disabled={auditLoading}
                >
                  {auditLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
                  Auditoria de Divergências (Cartão × DRE)
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-xs text-muted-foreground">Regime:</Label>
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setRegime("competencia")}
                className={cn(
                  "px-3 h-7 text-[11px] font-medium transition-colors",
                  regime === "competencia" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                )}
              >
                Competência (padrão)
              </button>
              <button
                type="button"
                onClick={() => setRegime("caixa")}
                className={cn(
                  "px-3 h-7 text-[11px] font-medium border-l border-border transition-colors",
                  regime === "caixa" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
                )}
              >
                Caixa (Fatura)
              </button>
            </div>
            {generated && (
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                Alterou o regime? Clique em "Gerar DRE" novamente.
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {regime === "competencia" ? (
              <>Regime de <b>competência</b>: as compras do cartão entram pela <b>data original da compra</b> (posted_date) e apenas a <b>1ª parcela</b> (ou compras à vista) é considerada — parcelas seguintes de compras anteriores são ignoradas mesmo se a fatura for paga no período.</>
            ) : (
              <>Regime de <b>caixa (fatura)</b>: as compras do cartão entram pelo <b>vencimento da fatura</b>, incluindo todas as parcelas — espelha o extrato do cartão. Útil para conciliar com o valor efetivamente debitado da conta.</>
            )}
            {" "}Clique no valor de uma linha de <i>Origem</i> para auditar os lançamentos individuais.
          </p>
        </CardContent>
      </Card>

      {generated && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">Plano de Contas</th>
                    <th className="px-3 py-2 font-medium text-right w-[160px]">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {rootNodes.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                        Nenhuma movimentação encontrada no período.
                      </td>
                    </tr>
                  )}
                  {rootNodes.flatMap((n) => renderRow(n))}
                </tbody>
                <tfoot className="border-t-2 border-primary/60">
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-right font-semibold text-xs">Total Entradas</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs font-bold text-green-600">{formatCurrency(totalEntradas)}</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-right font-semibold text-xs">Total Saídas</td>
                    <td className="px-3 py-2 text-right tabular-nums text-xs font-bold text-red-600">{formatCurrency(totalSaidas)}</td>
                  </tr>
                  <tr className="bg-primary/10">
                    <td className="px-3 py-2.5 text-right font-bold text-sm">Resultado Líquido do Período</td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums text-sm font-extrabold", resultado >= 0 ? "text-green-700" : "text-red-700")}>
                      {formatCurrency(resultado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center justify-between gap-2 pr-6">
              <span>{drill?.title}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportDrillCsv} disabled={!drill?.rows.length}>
                <Download className="h-3 w-3" /> Exportar CSV
              </Button>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {drill?.rows.length ?? 0} lançamento(s) — Total{" "}
              <b>{formatCurrency((drill?.rows || []).reduce((s, r) => s + r.valor, 0))}</b>
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                <tr className="text-left">
                  <th className="px-2 py-1.5 font-medium w-24">Data</th>
                  <th className="px-2 py-1.5 font-medium">Descrição</th>
                  <th className="px-2 py-1.5 font-medium w-20 text-center">Parcela</th>
                  <th className="px-2 py-1.5 font-medium w-28 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(drill?.rows || []).map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-2 py-1.5 tabular-nums">{formatDateBR(r.data)}</td>
                    <td className="px-2 py-1.5 truncate max-w-[380px]" title={r.descricao}>{r.descricao}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{r.parcela}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.valor)}</td>
                  </tr>
                ))}
                {(!drill?.rows || drill.rows.length === 0) && (
                  <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nenhum lançamento.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!audit} onOpenChange={(o) => !o && setAudit(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Auditoria de Divergências — Cartão × DRE</DialogTitle>
            <DialogDescription className="text-xs">
              Período {formatDateBR(dataInicio)} até {formatDateBR(dataFim)} • Cartão:{" "}
              <b>{formatCurrency(audit?.totalCc || 0)}</b> • DRE:{" "}
              <b>{formatCurrency(audit?.totalDre || 0)}</b> • Diferença:{" "}
              <b className={cn((audit && (audit.totalCc - audit.totalDre) !== 0) && "text-red-600")}>
                {formatCurrency((audit?.totalCc || 0) - (audit?.totalDre || 0))}
              </b>
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto space-y-4">
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-red-700">
                  ❌ Faltando na DRE ({audit?.missing.length ?? 0}) — Total{" "}
                  {formatCurrency((audit?.missing || []).reduce((s, r) => s + r.amount, 0))}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => audit && exportAuditCsv(audit.missing, "faltando-na-dre")}
                  disabled={!audit?.missing.length}
                >
                  <Download className="h-3 w-3" /> CSV
                </Button>
              </div>
              <AuditTable rows={audit?.missing || []} />
            </section>
            <section className="space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-amber-700">
                  ⚠️ Sobrando na DRE ({audit?.extra.length ?? 0}) — Total{" "}
                  {formatCurrency((audit?.extra || []).reduce((s, r) => s + r.amount, 0))}
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => audit && exportAuditCsv(audit.extra, "sobrando-na-dre")}
                  disabled={!audit?.extra.length}
                >
                  <Download className="h-3 w-3" /> CSV
                </Button>
              </div>
              <AuditTable rows={audit?.extra || []} />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditTable({ rows }: { rows: Array<{
  id: string; posted_date: string | null; description: string; amount: number; parcela: string; invoice_label: string; reason: string;
}> }) {
  if (!rows.length) {
    return <div className="text-[11px] text-muted-foreground px-2 py-3 border rounded bg-muted/20">Nenhum item.</div>;
  }
  return (
    <div className="border rounded overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr className="text-left">
            <th className="px-2 py-1.5 font-medium w-24">Data</th>
            <th className="px-2 py-1.5 font-medium">Descrição</th>
            <th className="px-2 py-1.5 font-medium w-20 text-center">Parcela</th>
            <th className="px-2 py-1.5 font-medium w-24 text-right">Valor</th>
            <th className="px-2 py-1.5 font-medium">Motivo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/60">
              <td className="px-2 py-1.5 tabular-nums">{r.posted_date ? formatDateBR(r.posted_date) : "—"}</td>
              <td className="px-2 py-1.5 truncate max-w-[260px]" title={r.description}>{r.description}</td>
              <td className="px-2 py-1.5 text-center tabular-nums">{r.parcela}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(r.amount)}</td>
              <td className="px-2 py-1.5 text-[11px] text-muted-foreground" title={r.invoice_label}>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
