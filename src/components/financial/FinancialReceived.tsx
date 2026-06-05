import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CheckCircle2, TrendingUp, X, Undo2, Eye, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { ReceivablePaymentDialog } from "./ReceivablePaymentDialog";
import { useIsMobile } from "@/hooks/use-mobile";

interface ReceivedItem {
  id: string;
  conta_receber_id: string;
  valor: number;
  data_recebimento: string;
  forma_recebimento: string;
  observacoes: string | null;
  created_by_name?: string | null;
  cliente_nome: string | null;
  data_vencimento: string | null;
  fatura_numero?: string | null;
  valor_total_titulo: number;
}

interface ManualEntry {
  id: string;
  valor: number;
  data_movimentacao: string;
  descricao: string | null;
  created_by_name?: string | null;
}

const FORMA_MAP: Record<string, string> = {
  pix: "PIX",
  ted: "TED",
  boleto: "Boleto",
  cartao_credito: "Cartão de Crédito",
  cartao_debito: "Cartão de Débito",
  transferencia: "Transferência",
  dinheiro: "Dinheiro",
  cheque: "Cheque",
};

const toDateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : null);

export function FinancialReceived() {
  const isMobile = useIsMobile();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [formaFilter, setFormaFilter] = useState("todos");

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<{ id: string; valor: number } | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);

    const [payRes, manualRes] = await Promise.all([
      supabase
        .from("receivable_payments" as any)
        .select(`
          id, conta_receber_id, valor, data_recebimento, forma_recebimento, observacoes,
          created_by, created_at,
          conta:conta_receber_id (
            valor, data_vencimento, fatura_id,
            profiles:cliente_id ( full_name ),
            faturas_recebimento:fatura_id ( numero )
          )
        `)
        .order("data_recebimento", { ascending: false }),
      supabase
        .from("movimentacoes_bancarias" as any)
        .select("id, valor, data_movimentacao, descricao, created_by")
        .eq("tipo", "entrada")
        .eq("origem", "manual")
        .order("data_movimentacao", { ascending: false }),
    ]);

    if (payRes.error) { toast.error("Erro ao carregar recebimentos"); setLoading(false); return; }
    if (manualRes.error) { toast.error("Erro ao carregar entradas manuais"); setLoading(false); return; }

    const creatorIds = [...new Set([
      ...(payRes.data || []).map((p: any) => p.created_by),
      ...(manualRes.data || []).map((m: any) => m.created_by),
    ].filter(Boolean))];
    let creatorsMap: Record<string, string> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", creatorIds);
      (profiles || []).forEach((p: any) => { creatorsMap[p.user_id] = p.full_name; });
    }

    const mapped: ReceivedItem[] = (payRes.data || []).map((p: any) => ({
      id: p.id,
      conta_receber_id: p.conta_receber_id,
      valor: Number(p.valor || 0),
      data_recebimento: toDateOnly(p.data_recebimento) || "",
      forma_recebimento: p.forma_recebimento,
      observacoes: p.observacoes,
      created_by_name: creatorsMap[p.created_by] || null,
      cliente_nome: p.conta?.profiles?.full_name || null,
      data_vencimento: toDateOnly(p.conta?.data_vencimento),
      fatura_numero: p.conta?.faturas_recebimento?.numero || null,
      valor_total_titulo: Number(p.conta?.valor || 0),
    }));

    const mappedManual: ManualEntry[] = (manualRes.data || []).map((m: any) => ({
      id: m.id,
      valor: Number(m.valor || 0),
      data_movimentacao: toDateOnly(m.data_movimentacao) || "",
      descricao: m.descricao,
      created_by_name: creatorsMap[m.created_by] || null,
    }));

    setItems(mapped);
    setManualEntries(mappedManual);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        (i.cliente_nome || "").toLowerCase().includes(q) ||
        (i.fatura_numero || "").toLowerCase().includes(q) ||
        (i.observacoes || "").toLowerCase().includes(q);

      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        matchPeriodo = (!periodoInicio || i.data_recebimento >= periodoInicio) && (!periodoFim || i.data_recebimento <= periodoFim);
      }
      const matchForma = formaFilter === "todos" || i.forma_recebimento === formaFilter;
      return matchSearch && matchPeriodo && matchForma;
    });
  }, [items, search, periodoInicio, periodoFim, formaFilter]);

  const filteredManual = useMemo(() => {
    // Manual entries don't have forma_recebimento — only show them when "todas as formas" is selected
    if (formaFilter !== "todos") return [];
    return manualEntries.filter((m) => {
      const q = search.toLowerCase();
      const matchSearch = !search || (m.descricao || "").toLowerCase().includes(q);
      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        matchPeriodo = (!periodoInicio || m.data_movimentacao >= periodoInicio) && (!periodoFim || m.data_movimentacao <= periodoFim);
      }
      return matchSearch && matchPeriodo;
    });
  }, [manualEntries, search, periodoInicio, periodoFim, formaFilter]);

  const totalRecebimentos = filtered.reduce((s, i) => s + i.valor, 0);
  const totalManual = filteredManual.reduce((s, m) => s + m.valor, 0);
  const total = totalRecebimentos + totalManual;
  const totalRegistros = filtered.length + filteredManual.length;
  const hasFilters = !!search || !!periodoInicio || !!periodoFim || formaFilter !== "todos";

  const clearFilters = () => { setSearch(""); setPeriodoInicio(""); setPeriodoFim(""); setFormaFilter("todos"); };

  const handleReverse = async (item: ReceivedItem) => {
    if (!await confirm({
      title: "Estornar recebimento",
      description: `Deseja estornar o recebimento de ${formatCurrency(item.valor)} de "${item.cliente_nome || "—"}"? O título voltará a ficar em aberto.`,
      variant: "destructive",
      confirmLabel: "Estornar",
    })) return;
    const { error } = await supabase.from("receivable_payments" as any).delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Recebimento estornado");
    fetchData();
  };

  const handleDeleteManual = async (m: ManualEntry) => {
    if (!await confirm({
      title: "Excluir entrada manual",
      description: `Deseja excluir a entrada de ${formatCurrency(m.valor)} (${m.descricao || "sem descrição"})? Esta movimentação será removida do fluxo de caixa.`,
      variant: "destructive",
      confirmLabel: "Excluir",
    })) return;
    const { error } = await supabase.from("movimentacoes_bancarias" as any).delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Entrada excluída");
    fetchData();
  };

  const openDetail = (item: ReceivedItem) => {
    setSelectedConta({ id: item.conta_receber_id, valor: item.valor_total_titulo });
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Contas Recebidas</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard icon={CheckCircle2} label="Total geral" value={formatCurrency(total)} valueColor="green" />
        <SummaryCard icon={CheckCircle2} label="Recebimentos" value={formatCurrency(totalRecebimentos)} valueColor="green" />
        <SummaryCard icon={Wallet} label="Entradas manuais" value={formatCurrency(totalManual)} valueColor="green" />
        <SummaryCard icon={TrendingUp} label="Registros" value={String(totalRegistros)} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, fatura, descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 w-[260px] text-xs"
          />
        </div>
        <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="h-8 w-[150px] text-xs" />
        <span className="text-xs text-muted-foreground">até</span>
        <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="h-8 w-[150px] text-xs" />
        <Select value={formaFilter} onValueChange={setFormaFilter}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as formas</SelectItem>
            {Object.entries(FORMA_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={clearFilters}>
            <X className="h-3 w-3" /> Limpar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 && filteredManual.length === 0 ? (
        <Card><CardContent className="p-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum recebimento encontrado.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* SECTION 1: Recebimentos de Contas a Receber */}
          {filtered.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Recebimentos de Contas a Receber</h2>
                <Badge variant="outline" className="text-[10px]">{filtered.length}</Badge>
              </div>
              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {filtered.map((i) => (
                    <Card key={i.id} onClick={() => openDetail(i)} className="cursor-pointer">
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate flex-1">{i.cliente_nome || "—"}</p>
                          <Badge variant="default" className="text-[10px] shrink-0">{FORMA_MAP[i.forma_recebimento] || i.forma_recebimento}</Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Receb: {formatDateBR(i.data_recebimento)}{i.data_vencimento ? ` · Venc: ${formatDateBR(i.data_vencimento)}` : ""}</span>
                          <span className="font-mono font-bold text-green-600">{formatCurrency(i.valor)}</span>
                        </div>
                        <div className="flex items-center justify-end gap-0.5 pt-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(i)} title="Ver">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleReverse(i)} title="Estornar">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Cliente</th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">Vencimento</th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">Recebimento</th>
                          <th className="px-2 py-2 font-medium">Forma</th>
                          <th className="px-2 py-2 font-medium">Fatura</th>
                          <th className="px-2 py-2 font-medium text-right w-[120px]">Valor</th>
                          <th className="px-2 py-2 font-medium">Lançado por</th>
                          <th className="px-2 py-2 font-medium text-right w-[90px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((i) => (
                          <tr key={i.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => openDetail(i)}>
                            <td className="px-3 py-2 font-medium truncate max-w-[320px]">{i.cliente_nome || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(i.data_vencimento)}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(i.data_recebimento)}</td>
                            <td className="px-2 py-2"><Badge variant="outline" className="text-[10px]">{FORMA_MAP[i.forma_recebimento] || i.forma_recebimento}</Badge></td>
                            <td className="px-2 py-2 text-muted-foreground">{i.fatura_numero || "—"}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-mono font-semibold text-green-600">{formatCurrency(i.valor)}</td>
                            <td className="px-2 py-2 text-muted-foreground truncate max-w-[160px]">{i.created_by_name || "—"}</td>
                            <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openDetail(i)} title="Ver">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleReverse(i)} title="Estornar">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t border-border">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-right">Subtotal</td>
                          <td className="px-2 py-2 text-right tabular-nums font-mono font-bold text-green-600">{formatCurrency(totalRecebimentos)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: Entradas Manuais */}
          {filteredManual.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">Entradas Manuais (Fluxo de Caixa)</h2>
                <Badge variant="outline" className="text-[10px]">{filteredManual.length}</Badge>
              </div>
              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {filteredManual.map((m) => (
                    <Card key={m.id}>
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate flex-1">{m.descricao || "Entrada manual"}</p>
                          <Badge variant="secondary" className="text-[10px] shrink-0">Manual</Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatDateBR(m.data_movimentacao)}</span>
                          <span className="font-mono font-bold text-green-600">{formatCurrency(m.valor)}</span>
                        </div>
                        <div className="flex items-center justify-end pt-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteManual(m)} title="Excluir">
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium">Descrição</th>
                          <th className="px-3 py-2 font-medium whitespace-nowrap">Data</th>
                          <th className="px-2 py-2 font-medium">Tipo</th>
                          <th className="px-2 py-2 font-medium text-right w-[120px]">Valor</th>
                          <th className="px-2 py-2 font-medium">Lançado por</th>
                          <th className="px-2 py-2 font-medium text-right w-[60px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredManual.map((m) => (
                          <tr key={m.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium truncate max-w-[420px]">{m.descricao || "Entrada manual"}</td>
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(m.data_movimentacao)}</td>
                            <td className="px-2 py-2"><Badge variant="secondary" className="text-[10px]">Manual</Badge></td>
                            <td className="px-2 py-2 text-right tabular-nums font-mono font-semibold text-green-600">{formatCurrency(m.valor)}</td>
                            <td className="px-2 py-2 text-muted-foreground truncate max-w-[160px]">{m.created_by_name || "—"}</td>
                            <td className="px-2 py-2 text-right">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteManual(m)} title="Excluir">
                                <Undo2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t border-border">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-right">Subtotal</td>
                          <td className="px-2 py-2 text-right tabular-nums font-mono font-bold text-green-600">{formatCurrency(totalManual)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selectedConta && (
        <ReceivablePaymentDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          contaReceberId={selectedConta.id}
          valorTotal={selectedConta.valor}
          onSaved={fetchData}
        />
      )}

      {ConfirmDialog}
    </div>
  );
}
