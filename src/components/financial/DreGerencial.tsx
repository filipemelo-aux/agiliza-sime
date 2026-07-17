import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, ChevronRight, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ChartAccount {
  id: string;
  codigo: string;
  nome: string;
  conta_pai_id: string | null;
}

interface TreeNode {
  id: string; // account id or synthetic key
  codigo: string;
  nome: string;
  level: number;
  entradas: number;
  saidas: number;
  children: TreeNode[];
}

const UNCLASSIFIED_IN = "__unclassified_in__";
const UNCLASSIFIED_OUT = "__unclassified_out__";

export function DreGerencial() {
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [movs, setMovs] = useState<Array<{ tipo: "entrada" | "saida"; valor: number; planoId: string | null }>>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [generated, setGenerated] = useState(false);

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
        .select("id, tipo, valor, plano_contas_id, origem, origem_id");
      if (dataInicio) q = q.gte("data_movimentacao", dataInicio);
      if (dataFim) q = q.lte("data_movimentacao", dataFim);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      const list = (data || []) as any[];

      // 2) Identify credit card invoice expenses (to explode into detailed items)
      //    Any expense that is the "mother" of a credit_card_invoice must be excluded
      //    from bank-movement aggregation and replaced by its individual items.
      const { data: ccInvoices } = await supabase
        .from("credit_card_invoices")
        .select("id, expense_id")
        .not("expense_id", "is", null);
      const ccExpenseIds = new Set<string>((ccInvoices || []).map((r: any) => r.expense_id));
      const invoiceIdByExpenseId = new Map<string, string>();
      (ccInvoices || []).forEach((r: any) => invoiceIdByExpenseId.set(r.expense_id, r.id));

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
          ? supabase.from("accounts_payable").select("id, chart_account_id").in("id", contasPagarIds)
          : Promise.resolve({ data: [] as any[] } as any),
        despesasDirIds.length
          ? supabase.from("expenses").select("id, plano_contas_id").in("id", despesasDirIds)
          : Promise.resolve({ data: [] as any[] } as any),
        contasReceberIds.length
          ? supabase.from("contas_receber").select("id, fatura_id, fatura_previsoes:fatura_id(fatura_previsoes(previsao_id, previsoes_recebimento:previsao_id(origem_tipo)))").in("id", contasReceberIds)
          : Promise.resolve({ data: [] as any[] } as any),
        recebParcialIds.length
          ? supabase.from("receivable_payments").select("id, conta_receber_id").in("id", recebParcialIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      // Map revenue account by codigo (best-effort)
      const chartRes = await supabase.from("chart_of_accounts").select("id, codigo").in("codigo", ["1.1.01", "1.1.02"]);
      const revenueByCodigo = new Map<string, string>();
      (chartRes.data || []).forEach((c: any) => revenueByCodigo.set(c.codigo, c.id));
      const revenuePlanoFromOrigemTipo = (t?: string | null): string | null => {
        if (t === "cte") return revenueByCodigo.get("1.1.01") || null;
        if (t === "colheita") return revenueByCodigo.get("1.1.02") || null;
        return null;
      };

      // For contas_receber: resolve origem_tipo via first previsao in fatura
      const planoByContaReceber = new Map<string, string | null>();
      // The nested embedding above may not always resolve reliably; fall back to explicit query.
      let crFatMap = new Map<string, string>(); // conta_receber_id -> fatura_id
      (contasReceberRes.data || []).forEach((cr: any) => { if (cr.fatura_id) crFatMap.set(cr.id, cr.fatura_id); });
      // Also resolve for recebParcial → contas_receber
      const rpCrIds: string[] = [...new Set((recebParcialRes.data || []).map((rp: any) => String(rp.conta_receber_id)).filter(Boolean))];
      if (rpCrIds.length > 0) {
        const { data: extraCr } = await supabase.from("contas_receber").select("id, fatura_id").in("id", rpCrIds);

        (extraCr || []).forEach((cr: any) => { if (cr.fatura_id) crFatMap.set(cr.id, cr.fatura_id); });
      }
      const allFaturaIds = [...new Set([...crFatMap.values()])];
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
      (contasPagarRes.data || []).forEach((r: any) => planoByContaPagar.set(r.id, r.chart_account_id || null));
      const planoByDespesa = new Map<string, string | null>();
      (despesasDirRes.data || []).forEach((r: any) => planoByDespesa.set(r.id, r.plano_contas_id || null));
      const planoByRecebParcial = new Map<string, string | null>();
      (recebParcialRes.data || []).forEach((rp: any) => {
        planoByRecebParcial.set(rp.id, planoByContaReceber.get(rp.conta_receber_id) || null);
      });


      // 4) Filter out bank movements that represent the payment of a credit card
      //    invoice's mother expense (to avoid double counting when we add item detail).
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
          // Only exclude if ALL expenses in the batch are CC-invoice mothers.
          // Otherwise we'd wrongly drop mixed batches. For mixed batches we can't
          // safely split, so keep the aggregate and skip CC-item explosion for those.
          for (const eid of set) if (!ccExpenseIds.has(eid)) return false;
          return set.size > 0;
        }
        return false;
      };

      const filtered = list.filter((m) => !isCcInvoicePayment(m));

      const enriched = filtered.map((m) => {
        let pid: string | null = m.plano_contas_id || null;
        if (!pid) {
          if (m.origem === "pagamento_despesa") pid = planoByPayment.get(m.origem_id) || null;
          else if (m.origem === "pagamento_agrupado") pid = planoByLote.get(m.origem_id) || null;
        }
        return {
          tipo: m.tipo as "entrada" | "saida",
          valor: Number(m.valor) || 0,
          planoId: pid,
        };
      });

      // 5) Explode credit card invoice items by their ORIGINAL transaction date
      //    (regime de competência da compra). Only items belonging to invoices
      //    already closed (com expense vinculada = enviada ao Contas a Pagar)
      //    entram na DRE, garantindo que são despesas consolidadas.
      const closedInvoiceIds = (ccInvoices || []).map((r: any) => r.id);
      if (closedInvoiceIds.length > 0) {
        let itemsQ: any = supabase
          .from("credit_card_invoice_items")
          .select("amount, plano_contas_id, ignored, posted_date")
          .in("invoice_id", closedInvoiceIds);
        if (dataInicio) itemsQ = itemsQ.gte("posted_date", dataInicio);
        if (dataFim) itemsQ = itemsQ.lte("posted_date", dataFim);
        const { data: items } = await itemsQ.limit(20000);
        (items || []).forEach((it: any) => {
          if (it.ignored) return;
          const val = Number(it.amount) || 0;
          if (val === 0) return;
          enriched.push({
            tipo: val < 0 ? "entrada" : "saida",
            valor: Math.abs(val),
            planoId: it.plano_contas_id || null,
          });
        });
      }

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

    // Determine level by dot count in codigo (fallback)
    const levelOf = (codigo: string) => (codigo || "").split(".").length;

    // Build children map
    const childrenByParent = new Map<string | null, ChartAccount[]>();
    chartAccounts.forEach((a) => {
      const key = a.conta_pai_id || null;
      if (!childrenByParent.has(key)) childrenByParent.set(key, []);
      childrenByParent.get(key)!.push(a);
    });

    // Helper: build node recursively
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

    // Post accumulate by walking ancestors
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
    // Unclassified buckets
    let unclassifiedEnt = 0;
    let unclassifiedSai = 0;

    movs.forEach((m) => {
      if (m.tipo === "entrada") tEnt += m.valor;
      else tSai += m.valor;

      if (!m.planoId || !accountsById.has(m.planoId)) {
        if (m.tipo === "entrada") unclassifiedEnt += m.valor;
        else unclassifiedSai += m.valor;
        return;
      }
      ancestorsOf(m.planoId).forEach((aid) => {
        const n = nodeMap.get(aid);
        if (!n) return;
        if (m.tipo === "entrada") n.entradas += m.valor;
        else n.saidas += m.valor;
      });
    });

    const finalRoots: TreeNode[] = [...roots];
    if (unclassifiedEnt > 0) {
      finalRoots.push({
        id: UNCLASSIFIED_IN,
        codigo: "—",
        nome: "Entradas sem plano de contas",
        level: 0,
        entradas: unclassifiedEnt,
        saidas: 0,
        children: [],
      });
    }
    if (unclassifiedSai > 0) {
      finalRoots.push({
        id: UNCLASSIFIED_OUT,
        codigo: "—",
        nome: "Saídas sem plano de contas",
        level: 0,
        entradas: 0,
        saidas: unclassifiedSai,
        children: [],
      });
    }

    // Filter out roots with zero movement (both entradas & saidas)
    const prune = (n: TreeNode): TreeNode | null => {
      const kids = n.children.map(prune).filter(Boolean) as TreeNode[];
      if (n.entradas === 0 && n.saidas === 0 && kids.length === 0) return null;
      return { ...n, children: kids };
    };
    const filtered = finalRoots.map(prune).filter(Boolean) as TreeNode[];

    return { rootNodes: filtered, totalEntradas: tEnt, totalSaidas: tSai };
  }, [chartAccounts, movs]);

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
    const isRevenueBranch = n.codigo.startsWith("3") || n.id === UNCLASSIFIED_IN;
    const valor = isRevenueBranch ? n.entradas : n.saidas;
    const rows: JSX.Element[] = [
      <tr
        key={n.id}
        className={cn(
          "border-b border-border/60 hover:bg-muted/30",
          n.level === 0 && "bg-muted/40 font-bold",
          n.level === 1 && "font-semibold",
        )}
      >
        <td className="px-2 py-1.5" style={{ paddingLeft: `${8 + n.level * 16}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              <button onClick={() => toggle(n.id)} className="p-0.5 hover:bg-muted rounded">
                {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <span className="text-xs tabular-nums text-muted-foreground w-16 shrink-0">{n.codigo}</span>
            <span className="text-xs truncate">{n.nome}</span>
          </div>
        </td>
        <td className={cn("px-3 py-1.5 text-right tabular-nums text-xs whitespace-nowrap", isRevenueBranch ? "text-green-600" : "text-red-600")}>
          {formatCurrency(valor)}
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
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={expandAll}>Expandir</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={collapseAll}>Recolher</Button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Consolida entradas e saídas do período agrupadas pela hierarquia do Plano de Contas. Fontes: movimentações bancárias (fluxo de caixa) + itens detalhados de faturas de cartão de crédito já fechadas/enviadas ao Contas a Pagar, posicionados pela data original da compra (regime de competência). O pagamento agregado da fatura no banco é excluído para evitar duplicidade.
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
    </div>
  );
}
