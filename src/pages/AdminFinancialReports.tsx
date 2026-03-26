import { useState, useEffect, useMemo, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Building2, TrendingUp, TrendingDown, ArrowUpCircle, ArrowDownCircle, BarChart3, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";
import { format, parseISO, startOfMonth } from "date-fns";

interface Establishment {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  type: string;
}

interface Transaction {
  id: string;
  tipo: string;
  valor: number;
  data_movimentacao: string;
  descricao: string;
  origem: string;
  unidade_id: string | null;
  conta_bancaria_id: string;
  plano_contas_id: string | null;
  status: string;
}

interface ChartAccount {
  id: string;
  nome: string;
  codigo: string;
  tipo: string;
}

interface Expense {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  unidade_id: string | null;
  empresa_id: string;
  plano_contas_id: string | null;
  centro_custo: string;
  data_emissao: string;
  status: string;
}

export default function AdminFinancialReports() {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [inicio, setInicio] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fim, setFim] = useState(() => getLocalDateISO());
  const [activeTab, setActiveTab] = useState("resultado");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [estRes, txRes, expRes, caRes] = await Promise.all([
      supabase.from("fiscal_establishments").select("id, razao_social, nome_fantasia, type").eq("active", true),
      supabase
        .from("financial_transactions")
        .select("id, tipo, valor, data_movimentacao, descricao, origem, unidade_id, conta_bancaria_id, plano_contas_id, status")
        .eq("status", "confirmado")
        .gte("data_movimentacao", inicio)
        .lte("data_movimentacao", fim)
        .order("data_movimentacao"),
      supabase
        .from("expenses")
        .select("id, descricao, valor_total, valor_pago, unidade_id, empresa_id, plano_contas_id, centro_custo, data_emissao, status")
        .gte("data_emissao", inicio)
        .lte("data_emissao", fim)
        .is("deleted_at", null),
      supabase.from("chart_of_accounts").select("id, nome, codigo, tipo").eq("ativo", true).order("codigo"),
    ]);
    setEstablishments((estRes.data as any) || []);
    setTransactions((txRes.data as any) || []);
    setExpenses((expRes.data as any) || []);
    setChartAccounts((caRes.data as any) || []);
    setLoading(false);
  }, [inicio, fim]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const estMap = useMemo(() => {
    const m = new Map<string, Establishment>();
    establishments.forEach(e => m.set(e.id, e));
    return m;
  }, [establishments]);

  const getEstLabel = (_id: string | null) => {
    // Unified: all establishments shown as single company
    const matriz = establishments.find(e => e.type === "matriz") || establishments[0];
    return matriz?.razao_social || "Sime Transporte Ltda";
  };

  const caMap = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chartAccounts.forEach(c => m.set(c.id, c));
    return m;
  }, [chartAccounts]);

  // ========== RESULTADO UNIFICADO ==========
  const resultadoData = useMemo(() => {
    const unified = { entradas: 0, saidas: 0 };
    for (const tx of transactions) {
      if (tx.tipo === "entrada") unified.entradas += Number(tx.valor);
      else unified.saidas += Number(tx.valor);
    }
    if (unified.entradas === 0 && unified.saidas === 0) return [];
    const matrizId = establishments.find(e => e.type === "matriz")?.id || establishments[0]?.id || "unified";
    return [[matrizId, unified]] as [string, { entradas: number; saidas: number }][];
  }, [transactions, establishments]);

  const totalGeralEntradas = resultadoData.reduce((s, [, v]) => s + v.entradas, 0);
  const totalGeralSaidas = resultadoData.reduce((s, [, v]) => s + v.saidas, 0);

  // ========== FLUXO UNIFICADO (daily flow) ==========
  const fluxoData = useMemo(() => {
    const UNIFIED_KEY = "unified";
    const dateMap: Record<string, Record<string, { entradas: number; saidas: number }>> = {};

    for (const tx of transactions) {
      const date = tx.data_movimentacao;
      if (!dateMap[date]) dateMap[date] = {};
      if (!dateMap[date][UNIFIED_KEY]) dateMap[date][UNIFIED_KEY] = { entradas: 0, saidas: 0 };
      if (tx.tipo === "entrada") dateMap[date][UNIFIED_KEY].entradas += Number(tx.valor);
      else dateMap[date][UNIFIED_KEY].saidas += Number(tx.valor);
    }

    const unitIds = [UNIFIED_KEY];
    const dates = Object.keys(dateMap).sort();

    return { dates, unitIds, dateMap };
  }, [transactions]);

  // ========== CUSTO UNIFICADO (expenses grouped) ==========
  const custoData = useMemo(() => {
    const UNIFIED_KEY = establishments.find(e => e.type === "matriz")?.id || establishments[0]?.id || "unified";
    const map: Record<string, { total: number; pago: number; items: { descricao: string; plano: string; centroCusto: string; valor: number }[] }> = {};
    map[UNIFIED_KEY] = { total: 0, pago: 0, items: [] };

    for (const exp of expenses) {
      map[UNIFIED_KEY].total += Number(exp.valor_total);
      map[UNIFIED_KEY].pago += Number(exp.valor_pago);
      const ca = exp.plano_contas_id ? caMap.get(exp.plano_contas_id) : null;
      map[UNIFIED_KEY].items.push({
        descricao: exp.descricao,
        plano: ca ? `${ca.codigo} - ${ca.nome}` : "—",
        centroCusto: exp.centro_custo,
        valor: Number(exp.valor_total),
      });
    }

    return Object.entries(map)
      .filter(([, v]) => v.total > 0)
      .sort((a, b) => {
        const ea = estMap.get(a[0]);
        const eb = estMap.get(b[0]);
        if (ea?.type === "matriz") return -1;
        if (eb?.type === "matriz") return 1;
        return 0;
      });
  }, [expenses, establishments, estMap, caMap]);

  // ========== DRE UNIFICADO (simple P&L) ==========
  const dreData = useMemo(() => {
    const UNIFIED_KEY = establishments.find(e => e.type === "matriz")?.id || establishments[0]?.id || "unified";
    const map: Record<string, Record<string, { receitas: number; despesas: number }>> = {};
    map[UNIFIED_KEY] = {};

    for (const tx of transactions) {
      const ca = tx.plano_contas_id ? caMap.get(tx.plano_contas_id) : null;
      const catKey = ca ? `${ca.codigo} - ${ca.nome}` : "Sem classificação";

      if (!map[UNIFIED_KEY][catKey]) map[UNIFIED_KEY][catKey] = { receitas: 0, despesas: 0 };
      if (tx.tipo === "entrada") map[UNIFIED_KEY][catKey].receitas += Number(tx.valor);
      else map[UNIFIED_KEY][catKey].despesas += Number(tx.valor);
    }

    return Object.entries(map)
      .filter(([, cats]) => Object.keys(cats).length > 0);
  }, [transactions, establishments, caMap]);

  const CENTRO_CUSTO_LABELS: Record<string, string> = {
    frota_propria: "Frota Própria",
    frota_terceiros: "Frota Terceiros",
    administrativo: "Administrativo",
    operacional: "Operacional",
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Relatórios Financeiros
          </h1>
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Período Início</Label>
            <Input type="date" className="h-9 w-[160px]" value={inicio} onChange={e => setInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Período Fim</Label>
            <Input type="date" className="h-9 w-[160px]" value={fim} onChange={e => setFim(e.target.value)} />
          </div>
          {loading && <Badge variant="secondary" className="text-xs animate-pulse">Carregando...</Badge>}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="resultado">Resultado</TabsTrigger>
            <TabsTrigger value="fluxo">Fluxo</TabsTrigger>
            <TabsTrigger value="custo">Custos</TabsTrigger>
            <TabsTrigger value="dre">DRE</TabsTrigger>
          </TabsList>

          {/* ===== RESULTADO POR UNIDADE ===== */}
          <TabsContent value="resultado" className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <ArrowUpCircle className="h-8 w-8 text-emerald-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Receitas</p>
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalGeralEntradas)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <ArrowDownCircle className="h-8 w-8 text-red-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Despesas</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(totalGeralSaidas)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  {totalGeralEntradas - totalGeralSaidas >= 0
                    ? <TrendingUp className="h-8 w-8 text-emerald-500" />
                    : <TrendingDown className="h-8 w-8 text-red-500" />}
                  <div>
                    <p className="text-xs text-muted-foreground">Resultado Geral</p>
                    <p className={`text-lg font-bold ${totalGeralEntradas - totalGeralSaidas >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatCurrency(totalGeralEntradas - totalGeralSaidas)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Per-unit result */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {resultadoData.map(([uid, data]) => {
                const resultado = data.entradas - data.saidas;
                return (
                  <Card key={uid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {getEstLabel(uid === "sem_unidade" ? null : uid)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Receitas</span>
                          <p className="font-mono font-semibold text-emerald-600">{formatCurrency(data.entradas)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Despesas</span>
                          <p className="font-mono font-semibold text-red-600">{formatCurrency(data.saidas)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Resultado</span>
                          <p className={`font-mono font-bold ${resultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {formatCurrency(resultado)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* ===== FLUXO POR UNIDADE ===== */}
          <TabsContent value="fluxo" className="space-y-4">
            {fluxoData.dates.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhuma movimentação no período.</p>
            ) : (
              <div className="space-y-3">
                {fluxoData.dates.map(date => (
                  <Card key={date}>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-sm font-semibold">{format(parseISO(date), "dd/MM/yyyy")}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {fluxoData.unitIds.map(uid => {
                          const v = fluxoData.dateMap[date]?.[uid];
                          if (!v) return null;
                          return (
                            <div key={uid} className="border rounded-md p-2 bg-muted/20">
                              <p className="text-[10px] text-muted-foreground truncate mb-1">
                                {getEstLabel(uid === "sem_unidade" ? null : uid)}
                              </p>
                              <div className="flex items-center justify-between gap-2 text-xs font-mono">
                                <span className="text-emerald-600">+{formatCurrency(v.entradas)}</span>
                                <span className="text-destructive">−{formatCurrency(v.saidas)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== CUSTO POR UNIDADE ===== */}
          <TabsContent value="custo" className="space-y-4">
            {custoData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum custo no período.</p>
            ) : (
              custoData.map(([uid, data]) => (
                <Card key={uid}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-1">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {getEstLabel(uid === "sem_unidade" ? null : uid)}
                      </span>
                      <span className="text-xs text-muted-foreground font-normal">
                        Total: <span className="font-mono font-semibold text-foreground">{formatCurrency(data.total)}</span>
                        {" | "}Pago: <span className="font-mono font-semibold text-emerald-600">{formatCurrency(data.pago)}</span>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {data.items.slice(0, 20).map((item, i) => (
                        <div key={i} className="border rounded-md p-2 flex flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium truncate">{item.descricao}</span>
                            <span className="text-xs font-mono font-semibold shrink-0">{formatCurrency(item.valor)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground truncate">{item.plano}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {CENTRO_CUSTO_LABELS[item.centroCusto] || item.centroCusto}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {data.items.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center">
                          ... e mais {data.items.length - 20} itens
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ===== DRE POR UNIDADE ===== */}
          <TabsContent value="dre" className="space-y-4">
            {dreData.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Nenhum dado no período.</p>
            ) : (
              dreData.map(([uid, categories]) => {
                const totalReceitas = Object.values(categories).reduce((s, c) => s + c.receitas, 0);
                const totalDespesas = Object.values(categories).reduce((s, c) => s + c.despesas, 0);
                const resultado = totalReceitas - totalDespesas;
                const sortedCats = Object.entries(categories).sort((a, b) => a[0].localeCompare(b[0]));

                return (
                  <Card key={uid}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                        DRE — {getEstLabel(uid === "sem_unidade" ? null : uid)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {sortedCats.map(([catName, vals]) => {
                        const res = vals.receitas - vals.despesas;
                        return (
                          <div key={catName} className="border rounded-md p-2">
                            <p className="text-xs font-medium mb-1 truncate">{catName}</p>
                            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                              <div>
                                <span className="text-[10px] text-muted-foreground">Receitas</span>
                                <p className="text-emerald-600">{vals.receitas > 0 ? formatCurrency(vals.receitas) : "—"}</p>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground">Despesas</span>
                                <p className="text-destructive">{vals.despesas > 0 ? formatCurrency(vals.despesas) : "—"}</p>
                              </div>
                              <div>
                                <span className="text-[10px] text-muted-foreground">Resultado</span>
                                <p className={`font-semibold ${res >= 0 ? "text-emerald-600" : "text-destructive"}`}>{formatCurrency(res)}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Total */}
                      <div className="border rounded-md p-2 bg-muted/30">
                        <p className="text-xs font-bold mb-1">TOTAL</p>
                        <div className="grid grid-cols-3 gap-2 text-xs font-mono font-bold">
                          <p className="text-emerald-600">{formatCurrency(totalReceitas)}</p>
                          <p className="text-destructive">{formatCurrency(totalDespesas)}</p>
                          <p className={resultado >= 0 ? "text-emerald-600" : "text-destructive"}>{formatCurrency(resultado)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
