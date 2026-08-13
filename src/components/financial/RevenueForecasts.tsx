import { Fragment, useState, useEffect, useMemo, useCallback } from "react";
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
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTh } from "@/components/ui/sortable-th";
import { ManualForecastDialog } from "./ManualForecastDialog";
import { GlobalToolbar, ToolbarAction } from "@/components/ui/global-toolbar";


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
  const [cteMap, setCteMap] = useState<Record<string, number>>({});
  // Individual invoice dialog: per-previsao due dates
  const [individualDialogOpen, setIndividualDialogOpen] = useState(false);
  const [individualVencimentos, setIndividualVencimentos] = useState<Record<string, string>>({});

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
      .neq("status", "faturado")
      .order("data_prevista", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar previsões");
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((p: any) => ({
      ...p,
      cliente_nome: p.profiles?.full_name || "—",
    }));

    setPrevisoes(mapped);
    setSelected(new Set());

    const cteIds = mapped
      .filter((p: any) => p.origem_tipo === "cte" && p.origem_id)
      .map((p: any) => p.origem_id);

    if (cteIds.length > 0) {
      const { data: ctes } = await supabase
        .from("ctes")
        .select("id, numero, numero_interno")
        .in("id", cteIds);
      const map: Record<string, number> = {};
      (ctes || []).forEach((c: any) => {
        map[c.id] = c.numero ?? c.numero_interno;
      });
      setCteMap(map);
    } else {
      setCteMap({});
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchPrevisoes();
  }, []);

  const getOrigemTipoLabel = (p: Previsao) => {
    if (p.origem_tipo === "cte") return "CT-e";
    if (p.origem_tipo === "colheita") return "Colheita";
    if (p.origem_tipo === "manual") return "Manual";
    return p.origem_tipo.toUpperCase();
  };

  const getDocumentoLabel = (p: Previsao) => {
    if (p.origem_tipo === "cte" && p.origem_id && cteMap[p.origem_id]) {
      return String(cteMap[p.origem_id]);
    }
    const docMeta = p.metadata?.documento || p.metadata?.numero_documento || p.metadata?.numero;
    if (docMeta) return String(docMeta);
    return "—";
  };

  const getDocumentoSortValue = (p: Previsao): number | string => {
    if (p.origem_tipo === "cte" && p.origem_id && cteMap[p.origem_id]) {
      return Number(cteMap[p.origem_id]) || 0;
    }
    const docMeta = p.metadata?.documento || p.metadata?.numero_documento || p.metadata?.numero;
    if (docMeta != null) {
      const n = Number(docMeta);
      return Number.isFinite(n) ? n : String(docMeta);
    }
    return "";
  };

  // Backward-compat: combined label used in mobile cards
  const getOrigemLabel = (p: Previsao) => {
    const doc = getDocumentoLabel(p);
    return doc && doc !== "—" ? `${getOrigemTipoLabel(p)} ${doc}` : getOrigemTipoLabel(p);
  };

  const { sort, toggle, sorted } = useSortableTable<Previsao, "cliente" | "data" | "valor" | "origem" | "documento" | "status">(
    previsoes,
    { key: "data", direction: "asc" },
    {
      cliente: (row) => row.cliente_nome || "",
      data: (row) => row.data_prevista,
      valor: (row) => Number(row.valor),
      origem: (row) => row.origem_tipo,
      documento: (row) => getDocumentoSortValue(row),
      status: (row) => row.status,
    }
  );

  const pendentes = sorted.filter((p) => p.status === "pendente");
  const faturadas = sorted.filter((p) => p.status === "faturado");

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
        const sorted = [...items].sort((a, b) => {
          const dateCmp = (a.data_prevista || "").localeCompare(b.data_prevista || "");
          if (dateCmp !== 0) return dateCmp;
          return (a.created_at || "").localeCompare(b.created_at || "");
        });
        return { kind: "lote" as const, id: key, loteId: key.slice(5), items: sorted };
      }
      return { kind: "single" as const, id: items[0].id, previsao: items[0] };
    });
  };

  const pendentesGroups = useMemo(() => buildGroups(pendentes), [pendentes]);
  const faturadasGroups = useMemo(() => buildGroups(faturadas), [faturadas]);
  // When sorting by status, render rows in the global sorted order so the column actually reorders the table.
  const combinedGroups = useMemo(
    () => (sort.key === "status" ? buildGroups(sorted) : [...pendentesGroups, ...faturadasGroups]),
    [sort.key, sorted, pendentesGroups, faturadasGroups]
  );

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
    if (selectedItems.length < 2) return toast.error("Selecione ao menos 2 previsões para gerar fatura única");
    if (!sameClient) return toast.error("Todas as previsões devem ser do mesmo cliente");
    setCondicaoPagamento("avista");
    setNumParcelas(1);
    setIntervaloDias(30);
    setInvoiceDialogOpen(true);
  };

  const openIndividualDialog = () => {
    if (selectedItems.length === 0) return toast.error("Selecione ao menos uma previsão");
    const initial: Record<string, string> = {};
    selectedItems.forEach((p) => {
      initial[p.id] = p.data_prevista;
    });
    setIndividualVencimentos(initial);
    setIndividualDialogOpen(true);
  };

  const handleCreateIndividualInvoices = async () => {
    if (selectedItems.length === 0) return;
    // Validate all dates set
    for (const p of selectedItems) {
      if (!individualVencimentos[p.id]) {
        return toast.error("Defina o vencimento de todas as previsões");
      }
    }
    setSaving(true);
    try {
      let created = 0;
      for (const p of selectedItems) {
        const venc = individualVencimentos[p.id];
        const { data: fatura, error: faturaErr } = await supabase
          .from("faturas_recebimento")
          .insert({
            cliente_id: p.cliente_id,
            valor_total: Number(p.valor),
            num_parcelas: 1,
            intervalo_dias: 0,
            data_emissao: venc,
            status: "faturada" as any,
          })
          .select()
          .single();
        if (faturaErr) throw faturaErr;
        const { error: linkErr } = await supabase
          .from("fatura_previsoes")
          .insert({ fatura_id: fatura.id, previsao_id: p.id });
        if (linkErr) throw linkErr;
        created++;
      }
      toast.success(`${created} fatura(s) individual(is) criada(s)!`);
      setIndividualDialogOpen(false);
      fetchPrevisoes();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar faturas");
    } finally {
      setSaving(false);
    }
  };

  const effectiveParcelas = condicaoPagamento === "parcelado" ? numParcelas : 1;
  const effectiveIntervalo = condicaoPagamento === "parcelado" ? intervaloDias : 0;
  // À vista: usa a data de emissão da previsão (a menor entre as selecionadas)
  // Único (data específica): usa a data escolhida pelo usuário
  const avistaDataEmissao =
    condicaoPagamento === "avista" && selectedItems.length > 0
      ? selectedItems.map((p) => p.data_prevista).sort()[0]
      : undefined;
  const effectiveDataEmissao =
    condicaoPagamento === "unico" ? dataVencimentoUnico : avistaDataEmissao;

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

  const selectedList = previsoes.filter((p) => selected.has(p.id));
  const singleSelected = selectedList.length === 1 ? selectedList[0] : null;
  const loteGroups = combinedGroups.filter((g: any) => g.kind !== "single") as any[];
  const loteForSelection =
    selected.size > 0
      ? loteGroups.find((g) => g.items.every((i: any) => selected.has(i.id)) && g.items.length === selected.size)
      : undefined;

  const toolbarActions: ToolbarAction[] = [
    { key: "new", label: "Nova Previsão Manual", icon: Plus, mode: "always", variant: "default", onClick: () => setManualDialogOpen(true) },
    { key: "invoice", label: "Gerar Faturas", icon: Receipt, mode: "single+batch", onClick: openIndividualDialog },
    {
      key: "invoice-single",
      label: "Gerar Fatura Única",
      icon: Layers,
      mode: "batch",
      disabled: selected.size < 2 || !sameClient,
      onClick: openInvoiceDialog,
    },
    {
      key: "append",
      label: "Adicionar ao Lote",
      icon: Plus,
      mode: "single+batch",
      variant: "outline",
      disabled: !loteForSelection,
      onClick: () => loteForSelection && openAppendDialog(loteForSelection.loteId, loteForSelection.items[0].cliente_id),
    },
    {
      key: "edit",
      label: "Editar",
      icon: PencilLine,
      mode: "single",
      disabled: !singleSelected || singleSelected.origem_tipo !== "manual" || singleSelected.status !== "pendente",
      onClick: () => singleSelected && openEditDialog(singleSelected),
    },
    { key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", onClick: handleDeleteSelected },
  ];

  const cellCls = "px-2 py-1 align-middle";

  return (
    <div className="space-y-3">
      {ConfirmDialog}
      <div>
        <h1 className="text-lg font-bold text-foreground">Previsões de Recebimento</h1>
        <p className="text-xs text-muted-foreground">Previsões geradas por CT-e, colheita ou lançamento manual.</p>
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

      <GlobalToolbar actions={toolbarActions} selectedCount={selected.size} />

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" style={{ minWidth: 900 }}>
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr className="border-b border-border">
                <th className="w-8 px-2 py-1.5">
                  <Checkbox
                    checked={pendentes.length > 0 && selected.size === pendentes.length}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="w-6 px-1 py-1.5"></th>
                <SortableTh active={sort.key === "origem"} direction={sort.direction} onSort={() => toggle("origem")} className="text-[11px] uppercase tracking-wide px-2 py-1.5">
                  Origem
                </SortableTh>
                <SortableTh active={sort.key === "documento"} direction={sort.direction} onSort={() => toggle("documento")} className="text-[11px] uppercase tracking-wide px-2 py-1.5">
                  Documento
                </SortableTh>
                <SortableTh active={sort.key === "cliente"} direction={sort.direction} onSort={() => toggle("cliente")} className="text-[11px] uppercase tracking-wide px-2 py-1.5">
                  Cliente
                </SortableTh>
                <SortableTh active={sort.key === "data"} direction={sort.direction} onSort={() => toggle("data")} className="text-[11px] uppercase tracking-wide px-2 py-1.5">
                  Data Prevista
                </SortableTh>
                <SortableTh active={sort.key === "valor"} direction={sort.direction} onSort={() => toggle("valor")} className="text-[11px] uppercase tracking-wide px-2 py-1.5" align="right">
                  Valor
                </SortableTh>
                <SortableTh active={sort.key === "status"} direction={sort.direction} onSort={() => toggle("status")} className="text-[11px] uppercase tracking-wide px-2 py-1.5">
                  Status
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Carregando...</td></tr>
              ) : previsoes.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Nenhuma previsão de recebimento encontrada.</td></tr>
              ) : combinedGroups.map((g) => {
                if (g.kind === "single") {
                  const p = g.previsao;
                  const Icon = ORIGEM_ICON[p.origem_tipo] || FileText;
                  const isPendente = p.status === "pendente";
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b border-border/60 transition-colors",
                        isPendente ? "cursor-pointer hover:bg-muted/40" : "opacity-70",
                        selected.has(p.id) && "bg-primary/10 hover:bg-primary/15"
                      )}
                      onClick={isPendente ? () => toggleSelect(p.id) : undefined}
                    >
                      <td className={cellCls} onClick={(e) => e.stopPropagation()}>
                        {isPendente && (
                          <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                        )}
                      </td>
                      <td className={cellCls}></td>
                      <td className={cellCls}>
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="uppercase">{getOrigemTipoLabel(p)}</span>
                        </div>
                      </td>
                      <td className={cn(cellCls, "tabular-nums")}>{getDocumentoLabel(p)}</td>
                      <td className={cn(cellCls, "truncate max-w-[240px]")}>{p.cliente_nome}</td>
                      <td className={cellCls}>{formatDateBR(p.data_prevista)}</td>
                      <td className={cn(cellCls, "text-right font-mono font-semibold")}>{formatCurrency(Number(p.valor))}</td>
                      <td className={cellCls}>
                        <Badge variant={isPendente ? "outline" : "default"} className="text-[10px] gap-0.5">
                          {isPendente ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                          {isPendente ? "Pendente" : "Faturado"}
                        </Badge>
                      </td>
                    </tr>
                  );
                }
                // Lote group
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
                    <tr
                      className={cn(
                        "border-b border-border/60 border-l-2 border-l-primary/60",
                        allSelected ? "bg-primary/10" : "bg-primary/5"
                      )}
                    >
                      <td className={cellCls} onClick={(e) => e.stopPropagation()}>
                        {allPendente && (
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            onCheckedChange={() => toggleSelectGroup(ids)}
                          />
                        )}
                      </td>
                      <td className={cellCls}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(g.id)}
                          className="text-muted-foreground hover:text-foreground"
                          title={isOpen ? "Recolher" : "Expandir"}
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                      <td className={cellCls}>
                        <div className="flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-primary" />
                          <span className="uppercase font-semibold text-primary">Lote · {g.items.length}</span>
                        </div>
                      </td>
                      <td className={cn(cellCls, "text-muted-foreground")}>—</td>
                      <td className={cn(cellCls, "font-medium truncate max-w-[240px]")}>{g.items[0].cliente_nome}</td>
                      <td className={cellCls}>{dateRange}</td>
                      <td className={cn(cellCls, "text-right font-mono font-semibold")}>{formatCurrency(total)}</td>
                      <td className={cellCls}>
                        <Badge variant={allPendente ? "outline" : "default"} className="text-[10px] gap-0.5">
                          {allPendente ? <Clock className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                          {allPendente ? "Pendente" : "Faturado"}
                        </Badge>
                      </td>
                    </tr>
                    {isOpen && g.items.map((p) => (
                      <tr
                        key={p.id}
                        className={cn(
                          "border-b border-border/60 bg-muted/20 transition-colors",
                          p.status === "pendente" ? "cursor-pointer hover:bg-muted/40" : "opacity-70",
                          selected.has(p.id) && "bg-primary/10 hover:bg-primary/15"
                        )}
                        onClick={p.status === "pendente" ? () => toggleSelect(p.id) : undefined}
                      >
                        <td className={cellCls} onClick={(e) => e.stopPropagation()}>
                          {p.status === "pendente" && (
                            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                          )}
                        </td>
                        <td className={cellCls}></td>
                        <td className={cn(cellCls, "pl-8")}>
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] uppercase text-muted-foreground">{getOrigemTipoLabel(p)}</span>
                          </div>
                        </td>
                        <td className={cn(cellCls, "text-[11px] text-muted-foreground tabular-nums")}>{getDocumentoLabel(p)}</td>
                        <td className={cn(cellCls, "text-[11px] text-muted-foreground truncate max-w-[240px]")}>
                          {p.metadata?.placa || "—"}
                          {p.metadata?.motorista ? ` · ${p.metadata.motorista}` : ""}
                        </td>
                        <td className={cn(cellCls, "text-[11px] text-muted-foreground")}>{formatDateBR(p.data_prevista)}</td>
                        <td className={cn(cellCls, "text-[11px] text-right font-mono")}>{formatCurrency(Number(p.valor))}</td>
                        <td className={cellCls}></td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/60">
              <tr>
                <td colSpan={8} className="px-2 py-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{previsoes.length} previsão(ões)</span>
                    <span className="font-mono">
                      {selected.size > 0 && (
                        <span className={cn("mr-4", sameClient ? "text-primary" : "text-destructive")}>
                          Selecionado: {formatCurrency(selectedTotal)}{!sameClient && " · clientes diferentes"}
                        </span>
                      )}
                      Pendente: {formatCurrency(totalPendente)}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>


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

      {/* Individual invoices dialog: one fatura per previsao with editable due date */}
      <Dialog open={individualDialogOpen} onOpenChange={setIndividualDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Gerar Faturas Individuais</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Será gerada uma fatura para cada previsão. Defina o vencimento de cada uma.
            </p>
            <div className="max-h-[50vh] overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Origem</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs">Vencimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.cliente_nome}</TableCell>
                      <TableCell className="text-xs">{getOrigemLabel(p)}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="h-8 text-xs"
                          value={individualVencimentos[p.id] || ""}
                          onChange={(e) =>
                            setIndividualVencimentos((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-xs px-1">
              <span className="text-muted-foreground">{selectedItems.length} fatura(s) — total {formatCurrency(selectedTotal)}</span>
            </div>
            <Button onClick={handleCreateIndividualInvoices} className="w-full" disabled={saving}>
              {saving ? "Criando..." : `Confirmar ${selectedItems.length} Fatura(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
