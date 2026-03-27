import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/masks";
import { CalendarIcon, TrendingUp, TrendingDown, DollarSign, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { Label } from "@/components/ui/label";

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

export function FinancialCashFlow() {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataInicio, setDataInicio] = useState<Date>(startOfMonth(new Date()));
  const [dataFim, setDataFim] = useState<Date>(endOfMonth(new Date()));

  useEffect(() => {
    loadMovimentacoes();
  }, [dataInicio, dataFim]);

  const loadMovimentacoes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("movimentacoes_bancarias")
      .select("*")
      .gte("data_movimentacao", format(dataInicio, "yyyy-MM-dd"))
      .lte("data_movimentacao", format(dataFim, "yyyy-MM-dd"))
      .order("data_movimentacao", { ascending: true });
    setMovimentacoes((data as Movimentacao[]) || []);
    setLoading(false);
  };

  const totals = useMemo(() => {
    const entradas = movimentacoes
      .filter((m) => m.tipo === "entrada")
      .reduce((sum, m) => sum + Number(m.valor), 0);
    const saidas = movimentacoes
      .filter((m) => m.tipo === "saida")
      .reduce((sum, m) => sum + Number(m.valor), 0);
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

  const origemLabel = (o: string) => {
    if (o === "contas_pagar") return "Conta a Pagar";
    if (o === "contas_receber") return "Conta a Receber";
    return o;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Fluxo de Caixa</h1>
        <div className="flex items-center gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">De</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {format(dataInicio, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dataInicio} onSelect={(d) => d && setDataInicio(d)} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Até</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[140px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {format(dataFim, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dataFim} onSelect={(d) => d && setDataFim(d)} locale={ptBR} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4 text-green-500" /> Entradas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.entradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownCircle className="h-4 w-4 text-red-500" /> Saídas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totals.saidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Saldo do Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-2xl font-bold", totals.saldo >= 0 ? "text-green-600" : "text-red-600")}>
              {formatCurrency(totals.saldo)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily summary */}
      {dailySummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo Diário</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saídas</TableHead>
                    <TableHead className="text-right">Saldo Acumulado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailySummary.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell>{format(parseISO(d.date), "dd/MM/yyyy (EEEE)", { locale: ptBR })}</TableCell>
                      <TableCell className="text-right text-green-600 font-mono">{d.entradas > 0 ? formatCurrency(d.entradas) : "—"}</TableCell>
                      <TableCell className="text-right text-red-600 font-mono">{d.saidas > 0 ? formatCurrency(d.saidas) : "—"}</TableCell>
                      <TableCell className={cn("text-right font-mono font-semibold", d.saldo >= 0 ? "text-green-600" : "text-red-600")}>
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

      {/* Detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Movimentações ({movimentacoes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : movimentacoes.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhuma movimentação no período</TableCell></TableRow>
                ) : (
                  movimentacoes.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm">{format(parseISO(m.data_movimentacao), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={m.tipo === "entrada" ? "default" : "destructive"} className={cn(m.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}>
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{origemLabel(m.origem)}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{m.descricao || "—"}</TableCell>
                      <TableCell className={cn("text-right font-mono font-semibold", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                        {m.tipo === "saida" ? "- " : ""}{formatCurrency(Number(m.valor))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
