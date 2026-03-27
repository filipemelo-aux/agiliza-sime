import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/masks";
import { ArrowUpCircle, ArrowDownCircle, DollarSign, TrendingUp } from "lucide-react";
import { CashFlowFilters, CashFlowFilterValues } from "./CashFlowFilters";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
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
  valor: number;
  data_movimentacao: string;
  descricao: string | null;
  created_at: string;
}

interface MovimentacaoEnriquecida extends Movimentacao {
  pessoa_nome: string | null;
}

export function FinancialCashFlow() {
  const isMobile = useIsMobile();
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEnriquecida[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CashFlowFilterValues>({
    dataInicio: startOfMonth(new Date()),
    dataFim: endOfMonth(new Date()),
    tipo: "todos",
    origem: "todos",
    valorMin: "",
    valorMax: "",
  });

  const loadMovimentacoes = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("movimentacoes_bancarias")
      .select("*")
      .gte("data_movimentacao", format(filters.dataInicio, "yyyy-MM-dd"))
      .lte("data_movimentacao", format(filters.dataFim, "yyyy-MM-dd"))
      .order("data_movimentacao", { ascending: false });

    if (filters.tipo !== "todos") query = query.eq("tipo", filters.tipo);
    if (filters.origem !== "todos") query = query.eq("origem", filters.origem);
    if (filters.valorMin) query = query.gte("valor", Number(filters.valorMin));
    if (filters.valorMax) query = query.lte("valor", Number(filters.valorMax));

    const { data } = await query;
    const movs = (data as Movimentacao[]) || [];

    const pagarIds = movs.filter((m) => m.origem === "contas_pagar").map((m) => m.origem_id);
    const receberIds = movs.filter((m) => m.origem === "contas_receber").map((m) => m.origem_id);
    const despesaIds = movs.filter((m) => m.origem === "despesas").map((m) => m.origem_id);
    const colheitaIds = movs.filter((m) => m.origem === "colheitas").map((m) => m.origem_id);

    const pessoaMap = new Map<string, string>();

    const [pagarRes, receberRes, despesaRes, colheitaRes] = await Promise.all([
      pagarIds.length > 0 ? supabase.from("accounts_payable").select("id, creditor_name, creditor_id").in("id", pagarIds) : Promise.resolve({ data: [] }),
      receberIds.length > 0 ? supabase.from("contas_receber").select("id, cliente_id").in("id", receberIds) : Promise.resolve({ data: [] }),
      despesaIds.length > 0 ? supabase.from("expenses").select("id, favorecido_nome").in("id", despesaIds) : Promise.resolve({ data: [] }),
      colheitaIds.length > 0 ? supabase.from("harvest_payments").select("id, harvest_job_id").in("id", colheitaIds) : Promise.resolve({ data: [] }),
    ]);

    (pagarRes.data || []).forEach((ap: any) => { if (ap.creditor_name) pessoaMap.set(ap.id, ap.creditor_name); });
    (despesaRes.data || []).forEach((e: any) => { if (e.favorecido_nome) pessoaMap.set(e.id, e.favorecido_nome); });

    const jobIds = [...new Set((colheitaRes.data || []).map((hp: any) => hp.harvest_job_id).filter(Boolean))];
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase.from("harvest_jobs").select("id, farm_name").in("id", jobIds);
      const jobMap = new Map((jobs || []).map((j: any) => [j.id, j.farm_name]));
      (colheitaRes.data || []).forEach((hp: any) => { const fn = jobMap.get(hp.harvest_job_id); if (fn) pessoaMap.set(hp.id, fn); });
    }

    const clienteIds = [...new Set((receberRes.data || []).map((cr: any) => cr.cliente_id).filter(Boolean))];
    if (clienteIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", clienteIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));
      (receberRes.data || []).forEach((cr: any) => { const nome = profileMap.get(cr.cliente_id); if (nome) pessoaMap.set(cr.id, nome); });
    }

    setMovimentacoes(movs.map((m) => ({ ...m, pessoa_nome: pessoaMap.get(m.origem_id) || null })));
    setLoading(false);
  }, [filters]);

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
    if (o === "despesas") return "Despesa";
    if (o === "colheitas") return "Colheita";
    return o;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-lg font-bold text-foreground">Fluxo de Caixa</h1>
        <CashFlowFilters filters={filters} onChange={setFilters} />
      </div>

      {/* Summary cards - compact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <ArrowUpCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Entradas</p>
              <p className="text-sm font-bold text-green-600 truncate">{formatCurrency(totals.entradas)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <ArrowDownCircle className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saídas</p>
              <p className="text-sm font-bold text-red-600 truncate">{formatCurrency(totals.saidas)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", totals.saldo >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
              <DollarSign className={cn("h-4 w-4", totals.saldo >= 0 ? "text-green-600" : "text-red-600")} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Saldo</p>
              <p className={cn("text-sm font-bold truncate", totals.saldo >= 0 ? "text-green-600" : "text-red-600")}>
                {formatCurrency(totals.saldo)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Movimentações</p>
              <p className="text-sm font-bold text-foreground">{movimentacoes.length}</p>
            </div>
          </CardContent>
        </Card>
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
            <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider">Resumo Diário</p>
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
                <div key={m.id} className="p-3 space-y-1">
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
                    <TableHead className="text-xs text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentacoes.map((m) => (
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
                      <TableCell className={cn("text-right font-mono text-xs font-semibold whitespace-nowrap py-2", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                        {m.tipo === "saida" ? "- " : ""}{formatCurrency(Number(m.valor))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
