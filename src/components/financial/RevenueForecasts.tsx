import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, CheckCircle2, Clock, Truck, Sprout, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/masks";

interface Previsao {
  id: string;
  origem_tipo: string;
  origem_id: string;
  cliente_id: string;
  valor: number;
  data_prevista: string;
  status: string;
  created_at: string;
  cliente_nome?: string;
}

const ORIGEM_ICON: Record<string, typeof Truck> = {
  cte: Truck,
  colheita: Sprout,
};

export function RevenueForecasts() {
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [numParcelas, setNumParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [saving, setSaving] = useState(false);

  const fetchPrevisoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("previsoes_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .order("data_prevista", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar previsões");
      setLoading(false);
      return;
    }

    setPrevisoes(
      (data || []).map((p: any) => ({
        ...p,
        cliente_nome: p.profiles?.full_name || "—",
      }))
    );
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => {
    fetchPrevisoes();
  }, []);

  const pendentes = previsoes.filter((p) => p.status === "pendente");
  const faturadas = previsoes.filter((p) => p.status === "faturado");

  const selectedItems = pendentes.filter((p) => selected.has(p.id));
  const selectedTotal = selectedItems.reduce((s, p) => s + Number(p.valor), 0);

  // Check if all selected have the same client
  const selectedClientIds = [...new Set(selectedItems.map((p) => p.cliente_id))];
  const sameClient = selectedClientIds.length <= 1;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === pendentes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendentes.map((p) => p.id)));
    }
  };

  const openInvoiceDialog = () => {
    if (selectedItems.length === 0) return toast.error("Selecione ao menos uma previsão");
    if (!sameClient) return toast.error("Todas as previsões devem ser do mesmo cliente");
    setNumParcelas(1);
    setIntervaloDias(30);
    setInvoiceDialogOpen(true);
  };

  const handleCreateInvoice = async () => {
    if (selectedItems.length === 0 || !sameClient) return;
    setSaving(true);

    try {
      // 1. Create the fatura
      const { data: fatura, error: faturaErr } = await supabase
        .from("faturas_recebimento")
        .insert({
          cliente_id: selectedClientIds[0],
          valor_total: selectedTotal,
          num_parcelas: numParcelas,
          intervalo_dias: intervaloDias,
          status: "faturada" as any,
        })
        .select()
        .single();

      if (faturaErr) throw faturaErr;

      // 2. Link previsões to fatura (triggers auto-set status to 'faturado')
      const links = selectedItems.map((p) => ({
        fatura_id: fatura.id,
        previsao_id: p.id,
      }));

      const { error: linkErr } = await supabase.from("fatura_previsoes").insert(links);
      if (linkErr) throw linkErr;

      toast.success(`Fatura criada com ${numParcelas} parcela(s)! Contas a receber geradas automaticamente.`);
      setInvoiceDialogOpen(false);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar fatura");
    } finally {
      setSaving(false);
    }
  };

  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor), 0);
  const totalFaturado = faturadas.reduce((s, p) => s + Number(p.valor), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Previsões de Recebimento</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Pendentes</p>
              <p className="text-lg font-bold">{formatCurrency(totalPendente)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Faturadas</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(totalFaturado)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action bar */}
      {pendentes.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={openInvoiceDialog} disabled={selected.size === 0 || !sameClient} className="gap-1">
            <Receipt className="h-4 w-4" />
            Gerar Fatura ({selected.size})
          </Button>
          {selected.size > 0 && (
            <span className="text-sm text-muted-foreground">
              Total selecionado: <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong>
              {!sameClient && <span className="text-destructive ml-2">⚠ Clientes diferentes</span>}
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : previsoes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma previsão de recebimento encontrada.</p>
            <p className="text-muted-foreground text-xs mt-1">Previsões são geradas automaticamente ao autorizar CT-e ou registrar pagamentos de colheita.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={pendentes.length > 0 && selected.size === pendentes.length}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data Prevista</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {previsoes.map((p) => {
                const Icon = ORIGEM_ICON[p.origem_tipo] || FileText;
                const isPendente = p.status === "pendente";
                return (
                  <TableRow key={p.id} className={selected.has(p.id) ? "bg-accent/30" : ""}>
                    <TableCell>
                      {isPendente && (
                        <Checkbox
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggleSelect(p.id)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs uppercase">{p.origem_tipo}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{p.cliente_nome}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(p.data_prevista + "T12:00:00"), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                    <TableCell>
                      <Badge variant={isPendente ? "outline" : "default"} className="gap-1">
                        {isPendente ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {isPendente ? "Pendente" : "Faturado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Invoice creation dialog */}
      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Fatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Cliente: <strong className="text-foreground">{selectedItems[0]?.cliente_nome}</strong></p>
              <p>Previsões selecionadas: <strong className="text-foreground">{selectedItems.length}</strong></p>
              <p>Valor total: <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong></p>
            </div>

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
                <p>{numParcelas}x de {formatCurrency(selectedTotal / numParcelas)} a cada {intervaloDias} dias</p>
              )}
            </div>

            <Button onClick={handleCreateInvoice} className="w-full" disabled={saving}>
              {saving ? "Criando..." : "Confirmar Fatura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
