import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { FileText, CheckCircle2, Clock, Eye, DollarSign, Plus, HandCoins, CalendarIcon } from "lucide-react";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useIsMobile } from "@/hooks/use-mobile";

interface Fatura {
  id: string;
  cliente_id: string;
  valor_total: number;
  num_parcelas: number;
  intervalo_dias: number;
  status: string;
  data_emissao: string;
  created_at: string;
  cliente_nome?: string;
}

interface Previsao {
  id: string;
  origem_tipo: string;
  origem_id: string;
  valor: number;
  data_prevista: string;
  status: string;
  cliente_id: string;
  cliente_nome?: string;
}

interface ContaReceber {
  id: string;
  valor: number;
  data_vencimento: string;
  status: string;
  data_recebimento: string | null;
  valor_recebido: number | null;
  forma_recebimento: string | null;
}

interface Cliente {
  id: string;
  full_name: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  faturada: { label: "Faturada", variant: "default" },
  paga: { label: "Paga", variant: "secondary" },
};

const FORMA_RECEBIMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
];

export function FinancialInvoicing() {
  const isMobile = useIsMobile();
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [detailPrevisoes, setDetailPrevisoes] = useState<Previsao[]>([]);
  const [detailContas, setDetailContas] = useState<ContaReceber[]>([]);

  // New invoice dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [step, setStep] = useState<"client" | "preview">("client");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPrevisoes, setClientPrevisoes] = useState<Previsao[]>([]);
  const [selectedPrevIds, setSelectedPrevIds] = useState<Set<string>>(new Set());
  const [numParcelas, setNumParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [saving, setSaving] = useState(false);

  // Receive dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receiveFatura, setReceiveFatura] = useState<Fatura | null>(null);
  const [receiveContas, setReceiveContas] = useState<ContaReceber[]>([]);
  const [receiveDate, setReceiveDate] = useState<Date>(new Date());
  const [receiveForma, setReceiveForma] = useState("pix");
  const [receiveSaving, setReceiveSaving] = useState(false);

  useEffect(() => {
    fetchFaturas();
  }, []);

  const fetchFaturas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faturas_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar faturas");
      setLoading(false);
      return;
    }

    setFaturas(
      (data || []).map((f: any) => ({
        ...f,
        cliente_nome: f.profiles?.full_name || "—",
      }))
    );
    setLoading(false);
  };

  // --- Detail ---
  const openDetail = async (fatura: Fatura) => {
    setSelectedFatura(fatura);
    setDetailOpen(true);

    const { data: links } = await supabase
      .from("fatura_previsoes")
      .select("previsao_id")
      .eq("fatura_id", fatura.id);

    if (links && links.length > 0) {
      const ids = links.map((l: any) => l.previsao_id);
      const { data: prevData } = await supabase
        .from("previsoes_recebimento")
        .select("*")
        .in("id", ids);
      setDetailPrevisoes((prevData as Previsao[]) || []);
    } else {
      setDetailPrevisoes([]);
    }

    const { data: contasData } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .order("data_vencimento", { ascending: true });
    setDetailContas((contasData as ContaReceber[]) || []);
  };

  // --- Nova Fatura ---
  const openNewInvoice = async () => {
    setStep("client");
    setSelectedClientId("");
    setClientPrevisoes([]);
    setSelectedPrevIds(new Set());
    setNumParcelas(1);
    setIntervaloDias(30);
    setNewDialogOpen(true);

    // Load clients that have pending previsões
    const { data } = await supabase
      .from("previsoes_recebimento")
      .select("cliente_id, profiles:cliente_id(full_name)")
      .eq("status", "pendente");

    if (data) {
      const unique = new Map<string, string>();
      data.forEach((d: any) => {
        if (d.cliente_id && d.profiles?.full_name) {
          unique.set(d.cliente_id, d.profiles.full_name);
        }
      });
      setClientes(Array.from(unique.entries()).map(([id, full_name]) => ({ id, full_name })));
    }
  };

  const handleClientSelect = async (clientId: string) => {
    setSelectedClientId(clientId);
    const { data } = await supabase
      .from("previsoes_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .eq("cliente_id", clientId)
      .eq("status", "pendente")
      .order("data_prevista", { ascending: true });

    const mapped = (data || []).map((p: any) => ({
      ...p,
      cliente_nome: p.profiles?.full_name || "—",
    }));
    setClientPrevisoes(mapped);
    setSelectedPrevIds(new Set(mapped.map((p: any) => p.id)));
    setStep("preview");
  };

  const togglePrev = (id: string) => {
    setSelectedPrevIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPrevTotal = clientPrevisoes
    .filter((p) => selectedPrevIds.has(p.id))
    .reduce((s, p) => s + Number(p.valor), 0);

  const handleCreateInvoice = async () => {
    const selectedItems = clientPrevisoes.filter((p) => selectedPrevIds.has(p.id));
    if (selectedItems.length === 0) return toast.error("Selecione ao menos uma previsão");
    setSaving(true);

    try {
      const { data: fatura, error: faturaErr } = await supabase
        .from("faturas_recebimento")
        .insert({
          cliente_id: selectedClientId,
          valor_total: selectedPrevTotal,
          num_parcelas: numParcelas,
          intervalo_dias: intervaloDias,
          status: "faturada" as any,
        })
        .select()
        .single();

      if (faturaErr) throw faturaErr;

      const links = selectedItems.map((p) => ({
        fatura_id: fatura.id,
        previsao_id: p.id,
      }));

      const { error: linkErr } = await supabase.from("fatura_previsoes").insert(links);
      if (linkErr) throw linkErr;

      toast.success(`Fatura criada com ${numParcelas} parcela(s)!`);
      setNewDialogOpen(false);
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar fatura");
    } finally {
      setSaving(false);
    }
  };

  // --- Receber ---
  const openReceive = async (fatura: Fatura) => {
    setReceiveFatura(fatura);
    setReceiveDate(new Date());
    setReceiveForma("pix");

    const { data } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .in("status", ["aberto", "atrasado"])
      .order("data_vencimento", { ascending: true });

    setReceiveContas((data as ContaReceber[]) || []);
    setReceiveDialogOpen(true);
  };

  const handleReceiveAll = async () => {
    if (!receiveFatura || receiveContas.length === 0) return;
    setReceiveSaving(true);

    try {
      for (const conta of receiveContas) {
        const { error } = await supabase
          .from("contas_receber")
          .update({
            status: "recebido" as any,
            data_recebimento: format(receiveDate, "yyyy-MM-dd"),
            valor_recebido: Number(conta.valor),
            forma_recebimento: receiveForma,
          })
          .eq("id", conta.id);

        if (error) throw error;
      }

      toast.success("Todos os títulos foram recebidos!");
      setReceiveDialogOpen(false);
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar recebimento");
    } finally {
      setReceiveSaving(false);
    }
  };

  const totalFaturado = faturas.reduce((s, f) => s + Number(f.valor_total), 0);

  const hasPendingContas = (f: Fatura) => f.status === "faturada";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Faturamento</h1>
        <Button onClick={openNewInvoice} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Nova Fatura
        </Button>
      </div>

      {/* Summary - compact */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total de Faturas</p>
              <p className="text-sm font-bold text-foreground">{faturas.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor Faturado</p>
              <p className="text-sm font-bold text-green-600 truncate">{formatCurrency(totalFaturado)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Faturas list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : faturas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma fatura encontrada.</p>
            <p className="text-muted-foreground text-xs mt-1">Clique em "Nova Fatura" para criar.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {faturas.map((f) => {
            const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
            return (
              <Card key={f.id} className={cn(
                "border-l-4",
                f.status === "paga" && "border-l-green-500",
                f.status === "faturada" && "border-l-primary",
                f.status === "rascunho" && "border-l-muted-foreground/30",
              )}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{f.cliente_nome}</p>
                    <Badge variant={st.variant} className="text-[10px] shrink-0">{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{format(new Date(f.data_emissao), "dd/MM/yyyy")} · {f.num_parcelas}x</span>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(Number(f.valor_total))}</span>
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(f)} className="gap-1 h-7 text-xs flex-1">
                      <Eye className="h-3 w-3" /> Detalhes
                    </Button>
                    {hasPendingContas(f) && (
                      <Button variant="outline" size="sm" onClick={() => openReceive(f)} className="gap-1 h-7 text-xs flex-1">
                        <HandCoins className="h-3 w-3" /> Receber
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Emissão</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Cliente</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Valor</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Parcelas</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faturas.map((f) => {
                    const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
                    return (
                      <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs">{format(new Date(f.data_emissao), "dd/MM/yyyy")}</td>
                        <td className="px-4 py-2.5 text-xs font-medium">{f.cliente_nome}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">{formatCurrency(Number(f.valor_total))}</td>
                        <td className="px-4 py-2.5 text-center text-xs">{f.num_parcelas}x</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(f)} title="Detalhes">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {hasPendingContas(f) && (
                              <Button variant="outline" size="sm" onClick={() => openReceive(f)} className="gap-1 h-7 text-xs">
                                <HandCoins className="h-3 w-3" /> Receber
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Fatura</DialogTitle>
          </DialogHeader>
          {selectedFatura && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{selectedFatura.cliente_nome}</strong></div>
                <div><span className="text-muted-foreground">Emissão:</span> <strong>{format(new Date(selectedFatura.data_emissao), "dd/MM/yyyy")}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong>{formatCurrency(Number(selectedFatura.valor_total))}</strong></div>
                <div><span className="text-muted-foreground">Parcelas:</span> <strong>{selectedFatura.num_parcelas}x (a cada {selectedFatura.intervalo_dias} dias)</strong></div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Previsões Vinculadas ({detailPrevisoes.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead>Data Prevista</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPrevisoes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">
                            <Badge variant="outline">{p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(p.data_prevista + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Contas a Receber ({detailContas.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Recebimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailContas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{format(new Date(c.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant={c.status === "recebido" ? "default" : c.status === "atrasado" ? "destructive" : "outline"}>
                              {c.status === "recebido" ? "Recebido" : c.status === "atrasado" ? "Atrasado" : "Aberto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{c.data_recebimento ? format(new Date(c.data_recebimento + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Invoice Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{step === "client" ? "Nova Fatura — Selecionar Cliente" : "Nova Fatura — Previsões"}</DialogTitle>
          </DialogHeader>

          {step === "client" && (
            <div className="space-y-3">
              {clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente com previsões pendentes.</p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {clientes.map((c) => (
                    <Button
                      key={c.id}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleClientSelect(c.id)}
                    >
                      {c.full_name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cliente: <strong className="text-foreground">{clientes.find((c) => c.id === selectedClientId)?.full_name}</strong>
              </p>

              {/* Previsões list */}
              <div className="border rounded max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedPrevIds.size === clientPrevisoes.length && clientPrevisoes.length > 0}
                          onCheckedChange={() => {
                            if (selectedPrevIds.size === clientPrevisoes.length) {
                              setSelectedPrevIds(new Set());
                            } else {
                              setSelectedPrevIds(new Set(clientPrevisoes.map((p) => p.id)));
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPrevisoes.map((p) => (
                      <TableRow key={p.id} className={selectedPrevIds.has(p.id) ? "bg-accent/30" : ""}>
                        <TableCell>
                          <Checkbox checked={selectedPrevIds.has(p.id)} onCheckedChange={() => togglePrev(p.id)} />
                        </TableCell>
                        <TableCell className="text-xs">{p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</TableCell>
                        <TableCell className="text-xs">{format(new Date(p.data_prevista + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-sm text-muted-foreground">
                Selecionadas: <strong className="text-foreground">{selectedPrevIds.size}</strong> |
                Total: <strong className="text-foreground">{formatCurrency(selectedPrevTotal)}</strong>
              </div>

              {/* Payment terms */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nº de Parcelas</Label>
                  <Input
                    type="number"
                    min={1}
                    max={48}
                    value={numParcelas}
                    onChange={(e) => setNumParcelas(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <div>
                  <Label>Intervalo (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={intervaloDias}
                    onChange={(e) => setIntervaloDias(Math.max(1, Number(e.target.value)))}
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/30">
                {numParcelas === 1 ? (
                  <p>À vista — vencimento na data de emissão</p>
                ) : (
                  <p>{numParcelas}x de {formatCurrency(selectedPrevTotal / numParcelas)} a cada {intervaloDias} dias</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("client")} className="flex-1">Voltar</Button>
                <Button onClick={handleCreateInvoice} className="flex-1" disabled={saving || selectedPrevIds.size === 0}>
                  {saving ? "Criando..." : "Confirmar Fatura"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
          </DialogHeader>
          {receiveFatura && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Cliente: <strong className="text-foreground">{receiveFatura.cliente_nome}</strong></p>
                <p>Valor da fatura: <strong className="text-foreground">{formatCurrency(Number(receiveFatura.valor_total))}</strong></p>
              </div>

              {/* Pending accounts */}
              <div>
                <p className="text-sm font-semibold mb-1">Títulos pendentes ({receiveContas.length})</p>
                <div className="border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiveContas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{format(new Date(c.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={c.status === "atrasado" ? "destructive" : "outline"}>
                              {c.status === "atrasado" ? "Atrasado" : "Aberto"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Data do Recebimento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(receiveDate, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={receiveDate}
                        onSelect={(d) => d && setReceiveDate(d)}
                        locale={ptBR}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Forma de Recebimento</Label>
                  <Select value={receiveForma} onValueChange={setReceiveForma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMA_RECEBIMENTO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleReceiveAll} className="w-full" disabled={receiveSaving || receiveContas.length === 0}>
                {receiveSaving ? "Processando..." : `Receber ${receiveContas.length} título(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
