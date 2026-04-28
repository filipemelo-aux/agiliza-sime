import { Fragment, useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, CheckCircle2, Clock, Truck, Sprout, Receipt, Trash2, Plus, PencilLine, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { ManualForecastDialog } from "./ManualForecastDialog";

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
  metadata?: Record<string, any>;
}

const ORIGEM_ICON: Record<string, typeof Truck> = {
  cte: Truck,
  colheita: Sprout,
  manual: PencilLine,
};

export function RevenueForecasts() {
  const isMobile = useIsMobile();
  const { ConfirmDialog, confirm } = useConfirmDialog();
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [condicaoPagamento, setCondicaoPagamento] = useState<"avista" | "unico" | "parcelado">("avista");
  const [numParcelas, setNumParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [appendToLote, setAppendToLote] = useState<{ loteId: string; clienteId: string } | null>(null);
  const [editForecast, setEditForecast] = useState<Previsao | null>(null);

  const openAppendDialog = (loteId: string, clienteId: string) => {
    setAppendToLote({ loteId, clienteId });
    setEditForecast(null);
    setManualDialogOpen(true);
  };

  const openEditDialog = (p: Previsao) => {
    setAppendToLote(null);
    setEditForecast(p);
    setManualDialogOpen(true);
  };

  const INTERVALO_PRESETS = [
    { value: "7", label: "7 dias" },
    { value: "14", label: "14 dias" },
    { value: "15", label: "15 dias" },
    { value: "21", label: "21 dias" },
    { value: "28", label: "28 dias" },
    { value: "30", label: "30 dias" },
    { value: "45", label: "45 dias" },
    { value: "60", label: "60 dias" },
    { value: "90", label: "90 dias" },
  ];

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

  // Group rows by lote_id (only items that share a lote_id are grouped). Singletons remain individual.
  type GroupRow =
    | { kind: "single"; id: string; previsao: Previsao }
    | { kind: "lote"; id: string; loteId: string; items: Previsao[] };

  const buildGroups = (rows: Previsao[]): GroupRow[] => {
    const buckets = new Map<string, Previsao[]>();
    const order: string[] = [];
    for (const p of rows) {
      const lid = p.metadata?.lote_id as string | undefined;
      const key = lid ? `lote:${lid}` : `single:${p.id}`;
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(p);
    }
    return order.map((key) => {
      const items = buckets.get(key)!;
      if (key.startsWith("lote:") && items.length > 1) {
        return { kind: "lote" as const, id: key, loteId: key.slice(5), items };
      }
      return { kind: "single" as const, id: items[0].id, previsao: items[0] };
    });
  };

  const pendentesGroups = useMemo(() => buildGroups(pendentes), [pendentes]);
  const faturadasGroups = useMemo(() => buildGroups(faturadas), [faturadas]);

  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedLotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
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
    setCondicaoPagamento("avista");
    setNumParcelas(1);
    setIntervaloDias(30);
    setInvoiceDialogOpen(true);
  };

  const effectiveParcelas = condicaoPagamento === "parcelado" ? numParcelas : 1;
  const effectiveIntervalo = condicaoPagamento === "parcelado" ? intervaloDias : 0;
  const effectiveDataEmissao = condicaoPagamento === "unico" ? dataVencimentoUnico : undefined;

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
          num_parcelas: effectiveParcelas,
          intervalo_dias: effectiveIntervalo,
          ...(effectiveDataEmissao ? { data_emissao: effectiveDataEmissao } : {}),
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

      toast.success(`Fatura criada com ${effectiveParcelas} parcela(s)! Contas a receber geradas automaticamente.`);
      setInvoiceDialogOpen(false);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar fatura");
    } finally {
      setSaving(false);
    }
  };

  const handleGroupSelected = async () => {
    if (selectedItems.length < 2) return toast.error("Selecione ao menos 2 previsões para agrupar");
    if (!sameClient) return toast.error("Todas as previsões devem ser do mesmo cliente");
    const confirmed = await confirm({
      description: `Agrupar ${selectedItems.length} previsão(ões) em um único lote?`,
      confirmLabel: "Agrupar",
    });
    if (!confirmed) return;
    try {
      const loteId = crypto.randomUUID();
      const total = selectedItems.length;
      const updates = selectedItems.map((p) =>
        supabase
          .from("previsoes_recebimento")
          .update({
            metadata: { ...(p.metadata || {}), lote_id: loteId, lote_total: total },
          })
          .eq("id", p.id)
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
      toast.success(`${total} previsões agrupadas em lote`);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao agrupar previsões");
    }
  };

  const handleUngroupSelected = async () => {
    // Find all selected items that have a lote_id
    const itemsWithLote = selectedItems.filter((p) => p.metadata?.lote_id);
    if (itemsWithLote.length === 0) return toast.error("Nenhuma previsão selecionada faz parte de um lote");
    const confirmed = await confirm({
      description: `Desagrupar ${itemsWithLote.length} previsão(ões)? Elas voltarão a aparecer individualmente.`,
      confirmLabel: "Desagrupar",
    });
    if (!confirmed) return;
    try {
      const updates = itemsWithLote.map((p) => {
        const { lote_id, lote_total, ...rest } = p.metadata || {};
        return supabase
          .from("previsoes_recebimento")
          .update({ metadata: rest })
          .eq("id", p.id);
      });
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
      toast.success(`${itemsWithLote.length} previsões desagrupadas`);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desagrupar previsões");
    }
  };

  const selectedHasLote = selectedItems.some((p) => p.metadata?.lote_id);

  const handleDeleteSelected = async () => {
    if (selectedItems.length === 0) return;
    const confirmed = await confirm({
      description: `Deseja excluir ${selectedItems.length} previsão(ões) pendente(s)? Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      const { error } = await supabase
        .from("previsoes_recebimento")
        .delete()
        .in("id", selectedItems.map((p) => p.id));
      if (error) throw error;
      toast.success(`${selectedItems.length} previsão(ões) excluída(s)`);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir previsões");
    }
  };

  const totalPendente = pendentes.reduce((s, p) => s + Number(p.valor), 0);
  const totalFaturado = faturadas.reduce((s, p) => s + Number(p.valor), 0);

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-lg font-bold text-foreground">Previsões de Recebimento</h1>
        <Button onClick={() => setManualDialogOpen(true)} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Nova Previsão Manual
        </Button>
      </div>

      <ManualForecastDialog
        open={manualDialogOpen}
        onOpenChange={(o) => {
          setManualDialogOpen(o);
          if (!o) {
            setAppendToLote(null);
            setEditForecast(null);
          }
        }}
        onSaved={fetchPrevisoes}
        appendToLote={appendToLote}
        editForecast={editForecast}
      />

      {/* Summary - compact */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={Clock} label="Pendentes" value={formatCurrency(totalPendente)} />
        <SummaryCard icon={CheckCircle2} label="Faturadas" value={formatCurrency(totalFaturado)} valueColor="green" />
      </div>

      {/* Action bar - fixed at top when items selected */}
      {pendentes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-2.5 bg-muted/50 rounded-lg border border-border">
          <Button onClick={openInvoiceDialog} disabled={selected.size === 0 || !sameClient} className="gap-1.5 shadow-sm">
            <Receipt className="h-4 w-4" />
            Gerar Fatura ({selected.size})
          </Button>
          <Button
            onClick={handleGroupSelected}
            disabled={selected.size < 2 || !sameClient}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            Agrupar em lote
          </Button>
          <Button
            onClick={handleUngroupSelected}
            disabled={!selectedHasLote}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            Desagrupar
          </Button>
          <Button onClick={handleDeleteSelected} disabled={selected.size === 0} variant="destructive" size="sm" className="gap-1.5">
            <Trash2 className="h-4 w-4" />
            Excluir ({selected.size})
          </Button>
          {selected.size > 0 && (
            <span className="text-xs text-muted-foreground">
              Total: <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong>
              {!sameClient && <span className="text-destructive ml-2">⚠ Clientes diferentes</span>}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : previsoes.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma previsão de recebimento encontrada.</p>
            <p className="text-muted-foreground text-xs mt-1">Previsões são geradas automaticamente ao autorizar CT-e ou registrar pagamentos de colheita. Você também pode criar uma previsão manual no botão acima.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {[...pendentesGroups, ...faturadasGroups].map((g) => {
            if (g.kind === "single") {
              const p = g.previsao;
              const Icon = ORIGEM_ICON[p.origem_tipo] || FileText;
              const isPendente = p.status === "pendente";
              return (
                <Card key={p.id}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isPendente && (
                          <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                        )}
                        <p className="text-sm font-semibold text-foreground truncate">{p.cliente_nome}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isPendente && p.origem_tipo === "manual" && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => openEditDialog(p)}
                            title="Editar previsão"
                          >
                            <PencilLine className="h-3 w-3" />
                          </Button>
                        )}
                        <Badge variant={isPendente ? "outline" : "default"} className="text-[10px] gap-0.5">
                          {isPendente ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                          {isPendente ? "Pendente" : "Faturado"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        <span className="uppercase">{p.origem_tipo}</span>
                        <span>· {formatDateBR(p.data_prevista)}</span>
                      </div>
                      <span className="font-mono font-bold text-foreground">{formatCurrency(Number(p.valor))}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            // Lote group (mobile)
            const ids = g.items.map((i) => i.id);
            const allPendente = g.items.every((i) => i.status === "pendente");
            const allSelected = allPendente && ids.every((id) => selected.has(id));
            const someSelected = allPendente && ids.some((id) => selected.has(id));
            const total = g.items.reduce((s, i) => s + Number(i.valor), 0);
            const cliente = g.items[0].cliente_nome;
            const isOpen = expandedLotes.has(g.id);
            const datas = g.items.map((i) => i.data_prevista).sort();
            const dateRange = datas[0] === datas[datas.length - 1]
              ? formatDateBR(datas[0])
              : `${formatDateBR(datas[0])} – ${formatDateBR(datas[datas.length - 1])}`;
            return (
              <Card key={g.id} className="border-primary/30">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {allPendente && (
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleSelectGroup(ids)}
                        />
                      )}
                      <button onClick={() => toggleExpanded(g.id)} className="flex items-center gap-1 min-w-0">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                        <p className="text-sm font-semibold text-foreground truncate">{cliente}</p>
                      </button>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0 border-primary/40 text-primary">
                      Lote · {g.items.length}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{dateRange}</span>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(total)}</span>
                  </div>
                  {allPendente && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px] gap-1 w-full"
                      onClick={() => openAppendDialog(g.loteId, g.items[0].cliente_id)}
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar serviço ao lote
                    </Button>
                  )}
                  {isOpen && (
                    <div className="mt-2 pt-2 border-t border-border space-y-1">
                      {g.items.map((p) => (
                        <div key={p.id} className="flex items-center justify-between text-[11px] pl-5">
                          <span className="text-muted-foreground">
                            {formatDateBR(p.data_prevista)}
                            {p.metadata?.placa ? ` · ${p.metadata.placa}` : ""}
                          </span>
                          <span className="font-mono">{formatCurrency(Number(p.valor))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={pendentes.length > 0 && selected.size === pendentes.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="w-6"></TableHead>
                    <TableHead className="text-xs">Origem</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Data Prevista</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...pendentesGroups, ...faturadasGroups].map((g) => {
                    if (g.kind === "single") {
                      const p = g.previsao;
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
                          <TableCell></TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs uppercase">{p.origem_tipo}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{p.cliente_nome}</TableCell>
                          <TableCell className="text-xs">{formatDateBR(p.data_prevista)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(Number(p.valor))}</TableCell>
                          <TableCell>
                            <Badge variant={isPendente ? "outline" : "default"} className="text-[10px] gap-0.5">
                              {isPendente ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                              {isPendente ? "Pendente" : "Faturado"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    // Lote group (desktop)
                    const ids = g.items.map((i) => i.id);
                    const allPendente = g.items.every((i) => i.status === "pendente");
                    const allSelected = allPendente && ids.every((id) => selected.has(id));
                    const someSelected = allPendente && ids.some((id) => selected.has(id));
                    const total = g.items.reduce((s, i) => s + Number(i.valor), 0);
                    const isOpen = expandedLotes.has(g.id);
                    const datas = g.items.map((i) => i.data_prevista).sort();
                    const dateRange = datas[0] === datas[datas.length - 1]
                      ? formatDateBR(datas[0])
                      : `${formatDateBR(datas[0])} – ${formatDateBR(datas[datas.length - 1])}`;
                    const Icon = ORIGEM_ICON[g.items[0].origem_tipo] || FileText;
                    return (
                      <Fragment key={g.id}>
                        <TableRow
                          key={g.id}
                          className={cn(
                            "border-l-2 border-l-primary/60",
                            allSelected ? "bg-accent/30" : "bg-primary/5"
                          )}
                        >
                          <TableCell>
                            {allPendente && (
                              <Checkbox
                                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                onCheckedChange={() => toggleSelectGroup(ids)}
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => toggleExpanded(g.id)}
                              className="text-muted-foreground hover:text-foreground"
                              title={isOpen ? "Recolher" : "Expandir"}
                            >
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs uppercase font-semibold text-primary">Lote · {g.items.length}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-medium">{g.items[0].cliente_nome}</TableCell>
                          <TableCell className="text-xs">{dateRange}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(total)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Badge variant={allPendente ? "outline" : "default"} className="text-[10px] gap-0.5">
                                {allPendente ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                                {allPendente ? "Pendente" : "Faturado"}
                              </Badge>
                              {allPendente && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => openAppendDialog(g.loteId, g.items[0].cliente_id)}
                                  title="Adicionar serviços ao lote"
                                >
                                  <Plus className="h-3 w-3" />
                                  Adicionar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isOpen && g.items.map((p) => (
                          <TableRow key={p.id} className={cn("bg-muted/20", selected.has(p.id) && "bg-accent/20")}>
                            <TableCell>
                              {p.status === "pendente" && (
                                <Checkbox
                                  checked={selected.has(p.id)}
                                  onCheckedChange={() => toggleSelect(p.id)}
                                />
                              )}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="pl-8">
                              <div className="flex items-center gap-1.5">
                                <Icon className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[10px] uppercase text-muted-foreground">{p.origem_tipo}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {p.metadata?.placa || "—"}
                              {p.metadata?.motorista ? ` · ${p.metadata.motorista}` : ""}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">{formatDateBR(p.data_prevista)}</TableCell>
                            <TableCell className="text-[11px] text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
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

            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição de Pagamento</Label>
              <RadioGroup
                value={condicaoPagamento}
                  onValueChange={(v) => {
                  const val = v as "avista" | "unico" | "parcelado";
                  setCondicaoPagamento(val);
                  if (val === "avista") {
                    setNumParcelas(1);
                    setIntervaloDias(0);
                  } else if (val === "unico") {
                    setNumParcelas(1);
                    setIntervaloDias(0);
                    setDataVencimentoUnico(getLocalDateISO());
                  } else {
                    setNumParcelas(2);
                    setIntervaloDias(30);
                  }
                }}
                className="flex gap-4 flex-wrap"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="avista" id="prev-avista" />
                  <Label htmlFor="prev-avista" className="cursor-pointer text-sm">À Vista</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="unico" id="prev-unico" />
                  <Label htmlFor="prev-unico" className="cursor-pointer text-sm">Pagamento Único</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="parcelado" id="prev-parcelado" />
                  <Label htmlFor="prev-parcelado" className="cursor-pointer text-sm">Parcelado</Label>
                </div>
              </RadioGroup>

              {condicaoPagamento === "unico" && (
                <div>
                  <Label className="text-xs">Data de Vencimento</Label>
                  <Input
                    type="date"
                    value={dataVencimentoUnico}
                    onChange={(e) => setDataVencimentoUnico(e.target.value)}
                  />
                </div>
              )}

              {condicaoPagamento === "parcelado" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Nº de Parcelas</Label>
                    <Input
                      type="number"
                      min={2}
                      max={48}
                      value={numParcelas}
                      onChange={(e) => setNumParcelas(Math.max(2, Number(e.target.value)))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Intervalo entre parcelas</Label>
                    <Select value={String(intervaloDias)} onValueChange={(v) => setIntervaloDias(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTERVALO_PRESETS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="text-xs border rounded p-3 bg-muted/30 space-y-1">
              {condicaoPagamento === "avista" ? (
                <p className="font-medium">À vista — vencimento na data de emissão</p>
              ) : condicaoPagamento === "unico" ? (
                <p className="font-medium">Pagamento único — vencimento em {formatDateBR(dataVencimentoUnico)}</p>
              ) : (
                <>
                  <p className="font-medium">{numParcelas}x de {formatCurrency(selectedTotal / numParcelas)}</p>
                  <p className="text-muted-foreground">Intervalo de {intervaloDias} dias entre parcelas</p>
                </>
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
