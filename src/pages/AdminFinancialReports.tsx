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

  const getEstLabel = (id: string | null) => {
    if (!id) return "Sem unidade";
    const e = estMap.get(id);
    if (!e) return "Desconhecida";
    return `${e.type === "matriz" ? "Matriz" : "Filial"}: ${e.nome_fantasia || e.razao_social}`;
  };

  const caMap = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chartAccounts.forEach(c => m.set(c.id, c));
    return m;
  }, [chartAccounts]);

  // ========== RESULTADO POR UNIDADE ==========
  const resultadoData = useMemo(() => {
    const map: Record<string, { entradas: number; saidas: number }> = {};
    for (const est of establishments) {
      map[est.id] = { entradas: 0, saidas: 0 };
    }
    map["sem_unidade"] = { entradas: 0, saidas: 0 };

    for (const tx of transactions) {
      const uid = tx.unidade_id || "sem_unidade";
      if (!map[uid]) map[uid] = { entradas: 0, saidas: 0 };
      if (tx.tipo === "entrada") map[uid].entradas += Number(tx.valor);
      else map[uid].saidas += Number(tx.valor);
    }

    return Object.entries(map)
      .filter(([, v]) => v.entradas > 0 || v.saidas > 0)
      .sort((a, b) => {
        const ea = estMap.get(a[0]);
        const eb = estMap.get(b[0]);
        if (ea?.type === "matriz") return -1;
        if (eb?.type === "matriz") return 1;
        return 0;
      });
  }, [transactions, establishments, estMap]);

  const totalGeralEntradas = resultadoData.reduce((s, [, v]) => s + v.entradas, 0);
  const totalGeralSaidas = resultadoData.reduce((s, [, v]) => s + v.saidas, 0);

  // ========== FLUXO POR UNIDADE (daily flow) ==========
  const fluxoData = useMemo(() => {
    const dateMap: Record<string, Record<string, { entradas: number; saidas: number }>> = {};

    for (const tx of transactions) {
      const date = tx.data_movimentacao;
      const uid = tx.unidade_id || "sem_unidade";
      if (!dateMap[date]) dateMap[date] = {};
      if (!dateMap[date][uid]) dateMap[date][uid] = { entradas: 0, saidas: 0 };
      if (tx.tipo === "entrada") dateMap[date][uid].entradas += Number(tx.valor);
      else dateMap[date][uid].saidas += Number(tx.valor);
    }

    const unitIds = [...new Set(transactions.map(t => t.unidade_id || "sem_unidade"))];
    const dates = Object.keys(dateMap).sort();

    return { dates, unitIds, dateMap };
  }, [transactions]);

  // ========== CUSTO POR UNIDADE (expenses grouped) ==========
  const custoData = useMemo(() => {
    const map: Record<string, { total: number; pago: number; items: { descricao: string; plano: string; centroCusto: string; valor: number }[] }> = {};

    for (const est of establishments) {
      map[est.id] = { total: 0, pago: 0, items: [] };
    }
    map["sem_unidade"] = { total: 0, pago: 0, items: [] };

    for (const exp of expenses) {
      const uid = exp.unidade_id || exp.empresa_id || "sem_unidade";
      if (!map[uid]) map[uid] = { total: 0, pago: 0, items: [] };
      map[uid].total += Number(exp.valor_total);
      map[uid].pago += Number(exp.valor_pago);
      const ca = exp.plano_contas_id ? caMap.get(exp.plano_contas_id) : null;
      map[uid].items.push({
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

  // ========== DRE POR UNIDADE (simple P&L) ==========
  const dreData = useMemo(() => {
    const map: Record<string, Record<string, { receitas: number; despesas: number }>> = {};

    for (const tx of transactions) {
      const uid = tx.unidade_id || "sem_unidade";
      if (!map[uid]) map[uid] = {};

      const ca = tx.plano_contas_id ? caMap.get(tx.plano_contas_id) : null;
      const catKey = ca ? `${ca.codigo} - ${ca.nome}` : "Sem classificação";

      if (!map[uid][catKey]) map[uid][catKey] = { receitas: 0, despesas: 0 };
      if (tx.tipo === "entrada") map[uid][catKey].receitas += Number(tx.valor);
      else map[uid][catKey].despesas += Number(tx.valor);
    }

    return Object.entries(map)
      .filter(([, cats]) => Object.keys(cats).length > 0)
      .sort((a, b) => {
        const ea = estMap.get(a[0]);
        const eb = estMap.get(b[0]);
        if (ea?.type === "matriz") return -1;
        if (eb?.type === "matriz") return 1;
        return 0;
      });
  }, [transactions, estMap, caMap]);

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
            Relatórios por Unidade
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
                    <CardTitle className="text-sm flex items-center justify-between">
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
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Descrição</TableHead>
                            <TableHead>Plano de Contas</TableHead>
                            <TableHead>Centro de Custo</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.items.slice(0, 20).map((item, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{item.descricao}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.plano}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">
                                  {CENTRO_CUSTO_LABELS[item.centroCusto] || item.centroCusto}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs font-mono font-semibold">{formatCurrency(item.valor)}</TableCell>
                            </TableRow>
                          ))}
                          {data.items.length > 20 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-xs text-muted-foreground text-center">
                                ... e mais {data.items.length - 20} itens
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
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
                    <CardContent className="pt-0">
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Conta</TableHead>
                              <TableHead className="text-right">Receitas</TableHead>
                              <TableHead className="text-right">Despesas</TableHead>
                              <TableHead className="text-right">Resultado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedCats.map(([catName, vals]) => (
                              <TableRow key={catName}>
                                <TableCell className="text-xs">{catName}</TableCell>
                                <TableCell className="text-right text-xs font-mono text-emerald-600">
                                  {vals.receitas > 0 ? formatCurrency(vals.receitas) : "—"}
                                </TableCell>
                                <TableCell className="text-right text-xs font-mono text-red-600">
                                  {vals.despesas > 0 ? formatCurrency(vals.despesas) : "—"}
                                </TableCell>
                                <TableCell className={`text-right text-xs font-mono font-semibold ${vals.receitas - vals.despesas >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {formatCurrency(vals.receitas - vals.despesas)}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Totals */}
                            <TableRow className="bg-muted/30 font-bold">
                              <TableCell className="text-xs font-bold">TOTAL</TableCell>
                              <TableCell className="text-right text-xs font-mono font-bold text-emerald-600">{formatCurrency(totalReceitas)}</TableCell>
                              <TableCell className="text-right text-xs font-mono font-bold text-red-600">{formatCurrency(totalDespesas)}</TableCell>
                              <TableCell className={`text-right text-xs font-mono font-bold ${resultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {formatCurrency(resultado)}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
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
