import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/masks";
import { ArrowUpCircle, ArrowDownCircle, DollarSign } from "lucide-react";
import { CashFlowFilters, CashFlowFilterValues } from "./CashFlowFilters";

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

    if (filters.tipo !== "todos") {
      query = query.eq("tipo", filters.tipo);
    }
    if (filters.origem !== "todos") {
      query = query.eq("origem", filters.origem);
    }
    if (filters.valorMin) {
      query = query.gte("valor", Number(filters.valorMin));
    }
    if (filters.valorMax) {
      query = query.lte("valor", Number(filters.valorMax));
    }

    const { data } = await query;
    const movs = (data as Movimentacao[]) || [];

    // Enrich with client/supplier names in batch
    const pagarIds = movs.filter((m) => m.origem === "contas_pagar").map((m) => m.origem_id);
    const receberIds = movs.filter((m) => m.origem === "contas_receber").map((m) => m.origem_id);
    const despesaIds = movs.filter((m) => m.origem === "despesas").map((m) => m.origem_id);
    const colheitaIds = movs.filter((m) => m.origem === "colheitas").map((m) => m.origem_id);

    const pessoaMap = new Map<string, string>();

    const [pagarRes, receberRes, despesaRes, colheitaRes] = await Promise.all([
      pagarIds.length > 0
        ? supabase
            .from("accounts_payable")
            .select("id, creditor_name, creditor_id")
            .in("id", pagarIds)
        : Promise.resolve({ data: [] }),
      receberIds.length > 0
        ? supabase
            .from("contas_receber")
            .select("id, cliente_id")
            .in("id", receberIds)
        : Promise.resolve({ data: [] }),
      despesaIds.length > 0
        ? supabase
            .from("expenses")
            .select("id, favorecido_nome")
            .in("id", despesaIds)
        : Promise.resolve({ data: [] }),
      colheitaIds.length > 0
        ? supabase
            .from("harvest_payments")
            .select("id, harvest_job_id")
            .in("id", colheitaIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Map payable creditor names
    (pagarRes.data || []).forEach((ap: any) => {
      if (ap.creditor_name) pessoaMap.set(ap.id, ap.creditor_name);
    });

    // Map expense supplier names
    (despesaRes.data || []).forEach((e: any) => {
      if (e.favorecido_nome) pessoaMap.set(e.id, e.favorecido_nome);
    });

    // Fetch farm names for harvest payments
    const jobIds = [...new Set((colheitaRes.data || []).map((hp: any) => hp.harvest_job_id).filter(Boolean))];
    if (jobIds.length > 0) {
      const { data: jobs } = await supabase
        .from("harvest_jobs")
        .select("id, farm_name")
        .in("id", jobIds);
      const jobMap = new Map((jobs || []).map((j: any) => [j.id, j.farm_name]));
      (colheitaRes.data || []).forEach((hp: any) => {
        const farmName = jobMap.get(hp.harvest_job_id);
        if (farmName) pessoaMap.set(hp.id, farmName);
      });
    }

    // Fetch client names for receivables
    const clienteIds = [...new Set((receberRes.data || []).map((cr: any) => cr.cliente_id).filter(Boolean))];
    if (clienteIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", clienteIds);
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));
      (receberRes.data || []).forEach((cr: any) => {
        const nome = profileMap.get(cr.cliente_id);
        if (nome) pessoaMap.set(cr.id, nome);
      });
    }

    const enriched: MovimentacaoEnriquecida[] = movs.map((m) => ({
      ...m,
      pessoa_nome: pessoaMap.get(m.origem_id) || null,
    }));

    setMovimentacoes(enriched);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadMovimentacoes();
  }, [loadMovimentacoes]);

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
    if (o === "despesas") return "Despesa";
    if (o === "colheitas") return "Colheita";
    return o;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-foreground">Fluxo de Caixa</h1>
        <CashFlowFilters filters={filters} onChange={setFilters} />
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
                  <TableHead>Cliente / Fornecedor</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
                ) : movimentacoes.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma movimentação no período</TableCell></TableRow>
                ) : (
                  movimentacoes.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm whitespace-nowrap">{format(parseISO(m.data_movimentacao), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <Badge variant={m.tipo === "entrada" ? "default" : "destructive"} className={cn(m.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}>
                          {m.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{origemLabel(m.origem)}</TableCell>
                      <TableCell className="text-sm max-w-[160px] truncate">{m.pessoa_nome || "—"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{m.descricao || "—"}</TableCell>
                      <TableCell className={cn("text-right font-mono font-semibold whitespace-nowrap", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
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
