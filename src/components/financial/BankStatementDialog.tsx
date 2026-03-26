import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ArrowUpCircle, ArrowDownCircle, Landmark, ExternalLink, Building2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";
import { format, parseISO, startOfMonth } from "date-fns";
import { useNavigate } from "react-router-dom";

interface BankAccount {
  id: string;
  nome: string;
  saldo_inicial: number;
  saldo_atual: number;
}

interface Transaction {
  id: string;
  tipo: string;
  valor: number;
  data_movimentacao: string;
  descricao: string;
  origem: string;
  origem_id: string | null;
  status: string;
  plano_contas_id: string | null;
  unidade_id: string | null;
  created_at: string;
  chart_of_accounts?: { nome: string; codigo: string } | null;
  fiscal_establishments?: { nome_fantasia: string | null; razao_social: string; type: string } | null;
}

interface ChartAccount {
  id: string;
  nome: string;
  codigo: string;
}

interface Establishment {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: BankAccount | null;
}

const origemLabel = (o: string) => {
  switch (o) {
    case "manual": return "Manual";
    case "ajuste": return "Ajuste";
    case "conta_pagar": return "Conta a Pagar";
    case "conta_receber": return "Conta a Receber";
    default: return o;
  }
};

export function BankStatementDialog({ open, onOpenChange, account }: Props) {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(false);
  const [inicio, setInicio] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [fim, setFim] = useState(() => getLocalDateISO());
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterUnidade, setFilterUnidade] = useState("all");
  const [saldoAnterior, setSaldoAnterior] = useState(0);

  // Fetch chart of accounts and establishments
  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("chart_of_accounts").select("id, nome, codigo").eq("ativo", true).order("codigo"),
      supabase.from("fiscal_establishments").select("id, razao_social, nome_fantasia, type").eq("active", true),
    ]).then(([caRes, estRes]) => {
      setChartAccounts(caRes.data ?? []);
      setEstablishments((estRes.data as any) ?? []);
    });
  }, [open]);

  const fetchTransactions = useCallback(async () => {
    if (!account) return;
    setLoading(true);

    // 1) Fetch balance before the period (saldo anterior)
    const { data: priorData } = await supabase
      .from("financial_transactions")
      .select("tipo, valor")
      .eq("conta_bancaria_id", account.id)
      .eq("status", "confirmado")
      .lt("data_movimentacao", inicio);

    const priorBalance = (priorData ?? []).reduce((acc, t) => {
      return acc + (t.tipo === "entrada" ? Number(t.valor) : -Number(t.valor));
    }, 0);
    setSaldoAnterior(Number(account.saldo_inicial) + priorBalance);

    // 2) Fetch period transactions
    let query = supabase
      .from("financial_transactions")
      .select("id, tipo, valor, data_movimentacao, descricao, origem, origem_id, status, plano_contas_id, unidade_id, created_at, chart_of_accounts:plano_contas_id(nome, codigo), fiscal_establishments:unidade_id(nome_fantasia, razao_social, type)")
      .eq("conta_bancaria_id", account.id)
      .eq("status", "confirmado")
      .gte("data_movimentacao", inicio)
      .lte("data_movimentacao", fim)
      .order("data_movimentacao", { ascending: true })
      .order("created_at", { ascending: true });

    const { data } = await query;
    setTransactions((data as any[]) ?? []);
    setLoading(false);
  }, [account, inicio, fim]);

  useEffect(() => {
    if (open && account) {
      setInicio(format(startOfMonth(new Date()), "yyyy-MM-dd"));
      setFim(getLocalDateISO());
    }
  }, [open, account?.id]);

  useEffect(() => {
    if (open && account) fetchTransactions();
  }, [open, account, fetchTransactions]);

  // Apply client-side filters
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (filterTipo !== "all" && tx.tipo !== filterTipo) return false;
      if (filterCategoria !== "all" && tx.plano_contas_id !== filterCategoria) return false;
      if (filterUnidade !== "all" && tx.unidade_id !== filterUnidade) return false;
      return true;
    });
  }, [transactions, filterTipo, filterCategoria, filterUnidade]);

  // Compute running balance
  const rows = useMemo(() => {
    let running = saldoAnterior;
    return filtered.map(tx => {
      running += tx.tipo === "entrada" ? Number(tx.valor) : -Number(tx.valor);
      return { ...tx, saldoAcumulado: running };
    });
  }, [filtered, saldoAnterior]);

  const totalEntradas = filtered.filter(t => t.tipo === "entrada").reduce((s, t) => s + Number(t.valor), 0);
  const totalSaidas = filtered.filter(t => t.tipo === "saida").reduce((s, t) => s + Number(t.valor), 0);
  const saldoFinal = saldoAnterior + totalEntradas - totalSaidas;

  // Unified company - no per-unit breakdown
  const unitSummary = useMemo(() => {
    const totals = { entradas: 0, saidas: 0 };
    for (const tx of transactions) {
      if (tx.tipo === "entrada") totals.entradas += Number(tx.valor);
      else totals.saidas += Number(tx.valor);
    }
    const matriz = establishments.find(e => (e as any).type === "matriz") || establishments[0];
    const label = matriz ? ((matriz as any).razao_social || "Sime Transporte Ltda") : "Sime Transporte Ltda";
    return [["unified", { label, type: "matriz", ...totals }]] as [string, { label: string; type: string; entradas: number; saidas: number }][];
  }, [transactions, establishments]);

  const getUnitLabel = (_tx: Transaction) => "";

  const handleOrigemClick = (tx: Transaction) => {
    if (!tx.origem_id) return;
    if (tx.origem === "conta_pagar") {
      navigate("/admin/financial", { state: { tab: "payables", highlightId: tx.origem_id } });
      onOpenChange(false);
    } else if (tx.origem === "conta_receber") {
      navigate("/admin/financial", { state: { tab: "receivables", highlightId: tx.origem_id } });
      onOpenChange(false);
    }
  };

  const isClickable = (tx: Transaction) =>
    tx.origem_id && (tx.origem === "conta_pagar" || tx.origem === "conta_receber");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Extrato — {account?.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" className="h-9 w-[150px]" value={inicio} onChange={e => setInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="date" className="h-9 w-[150px]" value={fim} onChange={e => setFim(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="entrada">Entradas</SelectItem>
                  <SelectItem value="saida">Saídas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {chartAccounts.map(ca => (
                    <SelectItem key={ca.id} value={ca.id}>{ca.codigo} - {ca.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Unidade filter removed - empresa unificada */}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Saldo Anterior</p>
                <p className={`text-sm font-bold font-mono ${saldoAnterior >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {formatCurrency(saldoAnterior)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Entradas</p>
                  <p className="text-sm font-bold text-emerald-600 font-mono">{formatCurrency(totalEntradas)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Saídas</p>
                  <p className="text-sm font-bold text-red-600 font-mono">{formatCurrency(totalSaidas)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground">Saldo Final</p>
                <p className={`text-sm font-bold font-mono ${saldoFinal >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {formatCurrency(saldoFinal)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Per-unit breakdown */}
          {unitSummary.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {unitSummary.map(([uid, data]) => (
                <Card key={uid} className="border-l-4 border-l-primary/40">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground">
                        {data.label}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Entradas</span>
                        <p className="font-mono font-semibold text-emerald-600">{formatCurrency(data.entradas)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Saídas</span>
                        <p className="font-mono font-semibold text-red-600">{formatCurrency(data.saidas)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Statement table */}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação no período.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[80px]">Categoria</TableHead>
                    <TableHead className="w-[110px]">Origem</TableHead>
                    <TableHead className="text-right w-[110px]">Valor</TableHead>
                    <TableHead className="text-right w-[120px]">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Saldo anterior row */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-xs font-medium">{format(parseISO(inicio), "dd/MM/yyyy")}</TableCell>
                    <TableCell colSpan={3} className="text-xs font-medium italic">Saldo anterior</TableCell>
                    <TableCell />
                    <TableCell className={`text-right text-xs font-mono font-bold ${saldoAnterior >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(saldoAnterior)}
                    </TableCell>
                  </TableRow>

                  {rows.map(tx => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(parseISO(tx.data_movimentacao), "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {tx.tipo === "entrada"
                            ? <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            : <ArrowDownCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <span className="text-xs truncate max-w-[200px]">{tx.descricao}</span>
                          {tx.chart_of_accounts && (
                            <Badge variant="outline" className="text-[9px] ml-1 shrink-0">
                              {(tx.chart_of_accounts as any).codigo}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[9px]">
                          {getUnitLabel(tx)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {isClickable(tx) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[10px] gap-1"
                            onClick={() => handleOrigemClick(tx)}
                          >
                            {origemLabel(tx.origem)}
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{origemLabel(tx.origem)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-mono font-semibold whitespace-nowrap ${tx.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                        {tx.tipo === "entrada" ? "+" : "−"} {formatCurrency(tx.valor)}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-mono font-bold whitespace-nowrap ${tx.saldoAcumulado >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {formatCurrency(tx.saldoAcumulado)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Saldo final row */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-xs font-medium">{format(parseISO(fim), "dd/MM/yyyy")}</TableCell>
                    <TableCell colSpan={3} className="text-xs font-medium italic">Saldo final</TableCell>
                    <TableCell />
                    <TableCell className={`text-right text-xs font-mono font-bold ${saldoFinal >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(saldoFinal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
