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
  cartao: "💳 Cartão de Crédito (compra)",
  contas_pagar: "🧾 Despesas (competência)",
  direta: "📄 Receitas (emissão)",
};
const ORIGEM_ORDER: OrigemKind[] = ["cartao", "contas_pagar", "direta"];


export function DreGerencial() {
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  
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
      const enriched: MovDetail[] = [];

      // ============================================================
      // 1) CARTÃO DE CRÉDITO — competência pela data ORIGINAL da compra
      //    (posted_date). Parcelamentos: só a 1ª parcela entra, com o
      //    VALOR TOTAL (parcela × N) no mês da compra.
      // ============================================================
      const { data: ccInvoices } = await supabase
        .from("credit_card_invoices")
        .select("id, expense_id")
        .is("deleted_at", null);
      const ccExpenseIds = new Set<string>(
        (ccInvoices || []).filter((r: any) => r.expense_id).map((r: any) => r.expense_id),
      );
      const invoiceIds = (ccInvoices || []).map((r: any) => r.id);

      if (invoiceIds.length > 0) {
        let itemsQ: any = supabase
          .from("credit_card_invoice_items")
          .select("id, amount, plano_contas_id, ignored, posted_date, description, parcela_atual, parcela_total")
          .in("invoice_id", invoiceIds)
          .eq("ignored", false);
        if (dataInicio) itemsQ = itemsQ.gte("posted_date", dataInicio);
        if (dataFim) itemsQ = itemsQ.lte("posted_date", dataFim);
        const { data: items } = await itemsQ.limit(20000);
        (items || []).forEach((it: any) => {
          const val = Number(it.amount) || 0;
          if (val === 0) return;
          const atual = Number(it.parcela_atual) || 0;
          const total = Number(it.parcela_total) || 0;
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

      // ============================================================
      // 2) DESPESAS — competência pela data_competencia da despesa
      //    (fato gerador). Exclui despesas "mãe" de fatura de cartão
      //    para não dobrar (o cartão já foi explodido acima).
      // ============================================================
      let expQ: any = supabase
        .from("expenses")
        .select("id, descricao, plano_contas_id, valor_total, data_competencia, data_emissao, favorecido_nome")
        .is("deleted_at", null);
      if (dataInicio) expQ = expQ.gte("data_competencia", dataInicio);
      if (dataFim) expQ = expQ.lte("data_competencia", dataFim);
      const { data: expData, error: expErr } = await expQ.limit(20000);
      if (expErr) throw expErr;
      (expData || []).forEach((e: any) => {
        if (ccExpenseIds.has(e.id)) return; // fatura de cartão — já contabilizada
        const v = Number(e.valor_total) || 0;
        if (v === 0) return;
        enriched.push({
          tipo: "saida",
          valor: Math.abs(v),
          planoId: e.plano_contas_id || null,
          origem: "contas_pagar",
          data: e.data_competencia || e.data_emissao || null,
          descricao: (e.favorecido_nome ? `${e.favorecido_nome} — ` : "") + (e.descricao || "—"),
          parcela: "—",
        });
      });

      // ============================================================
      // 3) RECEITAS — competência pela data de emissão / previsão
      //    (previsoes_recebimento.data_prevista). Fato gerador da
      //    receita = emissão do CT-e / prestação do serviço.
      // ============================================================
      const chartRes = await supabase
        .from("chart_of_accounts")
        .select("id, codigo")
        .in("codigo", ["1.1.01", "1.1.02"]);
      const revenueByCodigo = new Map<string, string>();
      (chartRes.data || []).forEach((c: any) => revenueByCodigo.set(c.codigo, c.id));
      const planoCte = revenueByCodigo.get("1.1.01") || null;
      const planoColheita = revenueByCodigo.get("1.1.02") || null;

      let prevQ: any = supabase
        .from("previsoes_recebimento")
        .select("id, origem_tipo, valor, data_prevista");
      if (dataInicio) prevQ = prevQ.gte("data_prevista", dataInicio);
      if (dataFim) prevQ = prevQ.lte("data_prevista", dataFim);
      const { data: prevData, error: prevErr } = await prevQ.limit(20000);
      if (prevErr) throw prevErr;
      (prevData || []).forEach((p: any) => {
        const v = Number(p.valor) || 0;
        if (v === 0) return;
        const pid = p.origem_tipo === "colheita" ? planoColheita : planoCte;
        enriched.push({
          tipo: "entrada",
          valor: Math.abs(v),
          planoId: pid,
          origem: "direta",
          data: p.data_prevista || null,
          descricao: p.origem_tipo === "colheita" ? "Colheita — previsão" : "CT-e — previsão de receita",
          parcela: "—",
        });
      });

      setMovs(enriched);
      setGenerated(true);
    } catch (e: any) {
      toast.error("Erro ao gerar DRE", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);




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
        <ReportInfoTooltip text="Regime de COMPETÊNCIA PURA: receitas pela data de emissão do CT-e/serviço; despesas pela data de competência (fato gerador); cartão de crédito pela data original da compra com o valor total da compra parcelada lançado de uma vez." />
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
          <p className="text-[11px] text-muted-foreground">
            Regime de <b>competência pura</b>: compras do cartão entram pela <b>data original da compra</b> (posted_date). Compras parceladas são lançadas pelo <b>valor total</b> (parcela × N) no mês em que ocorreram — parcelas 2/N, 3/N... não aparecem em meses futuros. Clique no valor de uma linha de <i>Origem</i> para auditar os lançamentos individuais.
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
