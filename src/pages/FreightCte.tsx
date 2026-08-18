import { useEffect, useState } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, FileText, FileCheck2, FileCog, ScrollText, Trash2, Loader2, X, Pencil, Calendar, AlertTriangle, Eye, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR, normalizeDateInput } from "@/lib/date";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { cancelarCte } from "@/services/fiscal";
import { CteFormDialog } from "@/components/freight/CteFormDialog";
import { CteServicoFormDialog } from "@/components/freight/CteServicoFormDialog";
import { CteDetailDialog } from "@/components/freight/CteDetailDialog";
import { CteBatchImportDialog } from "@/components/freight/CteBatchImportDialog";
import { CteInconsistencyDialog } from "@/components/freight/CteInconsistencyDialog";
import { useSortableTable } from "@/hooks/useSortableTable";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { openPrintWindow } from "@/components/freight/freightContractPrint";
import { buildCteHtml, combineCtesHtml } from "@/components/freight/ctePrint";
import { PeriodFilter } from "@/components/PeriodFilter";


export interface Cte {
  id: string;
  numero: number | null;
  serie: number;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  status: string;
  tomador_id: string | null;
  remetente_nome: string;
  destinatario_nome: string;
  valor_frete: number;
  cfop: string;
  natureza_operacao: string;
  municipio_origem_nome: string | null;
  uf_origem: string | null;
  municipio_destino_nome: string | null;
  uf_destino: string | null;
  placa_veiculo: string | null;
  motorista_id: string | null;
  data_emissao: string | null;
  data_autorizacao: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  tipo_talao?: string;
  numero_interno?: number | null;
  data_carregamento?: string | null;
  valor_tonelada?: number | null;
  [key: string]: any;
}

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  autorizado: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  rejeitado: "bg-amber-500/10 text-amber-600",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  autorizado: "Autorizado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
};

export default function FreightCte() {
  const [ctes, setCtes] = useState<Cte[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "producao" | "servico">("todos");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [servicoOpen, setServicoOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [inconsistencyOpen, setInconsistencyOpen] = useState(false);
  
  
  const [editingCte, setEditingCte] = useState<Cte | null>(null);
  const [detailCte, setDetailCte] = useState<Cte | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePrintSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPrinting(true);
    try {
      const { data, error } = await supabase.from("ctes").select("*").in("id", ids);
      if (error) throw error;
      const byId = new Map((data || []).map((c: any) => [c.id, c]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];
      if (ordered.length === 0) {
        toast({ title: "Nenhum CT-e encontrado", variant: "destructive" });
        return;
      }
      const htmls: string[] = [];
      for (const c of ordered) htmls.push(await buildCteHtml(c));
      openPrintWindow(combineCtesHtml(htmls));
    } catch (err: any) {
      toast({ title: "Erro ao imprimir", description: err.message, variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    fetchCtes();
  }, []);

  const fetchCtes = async () => {
    try {
      const { data, error } = await supabase
        .from("ctes")
        .select("*")
        .order("data_emissao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCtes((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getEmissaoDate = (c: Cte) => c.data_emissao || c.created_at;

  const getClienteTomador = (c: Cte) => {
    if (c.tomador_nome) return c.tomador_nome;

    switch (Number(c.tomador_tipo)) {
      case 0:
        return c.remetente_nome || "";
      case 1:
        return c.expedidor_nome || "";
      case 2:
        return c.recebedor_nome || "";
      case 3:
        return c.destinatario_nome || "";
      default:
        return c.remetente_nome || c.destinatario_nome || "";
    }
  };

  const filtered = ctes.filter((c) => {
    const isServico = c.tipo_talao === "servico";
    if (tipoFilter === "producao" && isServico) return false;
    if (tipoFilter === "servico" && !isServico) return false;

    const emissao = normalizeDateInput(getEmissaoDate(c));
    if (dateFrom && (!emissao || emissao < dateFrom)) return false;
    if (dateTo && (!emissao || emissao > dateTo)) return false;

    const q = search.toLowerCase();
    return (
      !q ||
      c.tomador_nome?.toLowerCase().includes(q) ||
      c.remetente_nome?.toLowerCase().includes(q) ||
      c.expedidor_nome?.toLowerCase().includes(q) ||
      c.recebedor_nome?.toLowerCase().includes(q) ||
      c.destinatario_nome?.toLowerCase().includes(q) ||
      String(c.numero).includes(q) ||
      String(c.numero_interno).includes(q) ||
      c.chave_acesso?.includes(q) ||
      c.placa_veiculo?.toLowerCase().includes(q)
    );
  });

  type CteSortKey = "numero" | "talao" | "data" | "cliente" | "placa" | "valor" | "status";
  const { sort, toggle, sorted } = useSortableTable<Cte, CteSortKey>(
    filtered,
    { key: "data", direction: "desc" },
    {
      numero: (c) => (c.tipo_talao === "servico" ? c.numero_interno ?? 0 : c.numero ?? 0),
      talao: (c) => (c.tipo_talao === "servico" ? "Serviço" : "Produção"),
      data: (c) => getEmissaoDate(c) || "",
      cliente: getClienteTomador,
      placa: (c) => c.placa_veiculo || "",
      valor: (c) => Number(c.valor_frete) || 0,
      status: (c) => (c.tipo_talao === "servico" ? "interno" : c.status),
    },
  );

  const handleNew = () => {
    setEditingCte(null);
    setChooserOpen(true);
  };

  const handlePickProducao = () => {
    setChooserOpen(false);
    setFormOpen(true);
  };

  const handlePickServico = () => {
    setChooserOpen(false);
    setServicoOpen(true);
  };

  const handleEdit = (cte: Cte) => {
    setEditingCte(cte);
    if (cte.tipo_talao === "servico") {
      setServicoOpen(true);
    } else {
      setFormOpen(true);
    }
  };

  // Remove contrato de frete vinculado + despesa pendente antes de excluir o CT-e.
  // O FK em freight_contracts.cte_id é ON DELETE CASCADE, mas a expense (FK SET NULL)
  // ficaria órfã. Aqui garantimos limpeza completa.
  const removeLinkedFreightContract = async (cteId: string) => {
    const { data: contracts } = await supabase
      .from("freight_contracts")
      .select("id, expense_id")
      .eq("cte_id", cteId);
    const expenseIds = (contracts || []).map((c: any) => c.expense_id).filter(Boolean);
    const contractIds = (contracts || []).map((c: any) => c.id);
    if (contractIds.length) {
      await supabase.from("freight_contracts").delete().in("id", contractIds);
    }
    if (expenseIds.length) {
      await supabase.from("expenses").delete().in("id", expenseIds).in("status", ["pendente", "atrasado"]);
    }
    return contractIds.length;
  };

  const handleDelete = async (cte: Cte) => {
    const isServico = cte.tipo_talao === "servico";
    const isAutorizado = cte.status === "autorizado" && !!cte.chave_acesso && !!cte.protocolo_autorizacao;

    // Bloqueia exclusão se a previsão deste CT-e já foi vinculada a uma fatura
    const { data: prevs } = await supabase
      .from("previsoes_recebimento")
      .select("id, status, fatura_previsoes(fatura_id, faturas_recebimento(numero, status))")
      .eq("origem_tipo", "cte")
      .eq("origem_id", cte.id);
    const invoiced = (prevs || []).find((p: any) => (p.fatura_previsoes?.length ?? 0) > 0);
    if (invoiced) {
      const f = (invoiced as any).fatura_previsoes[0]?.faturas_recebimento;
      toast({
        title: "Exclusão bloqueada",
        description: `Este CT-e está vinculado à Fatura nº ${f?.numero ?? "?"} (status: ${f?.status ?? "?"}). Estorne os recebimentos e desvincule/exclua a fatura antes de excluir o CT-e.`,
        variant: "destructive",
      });
      return;
    }


    // Verifica contrato vinculado para informar no diálogo
    const { count: linkedContracts } = await supabase
      .from("freight_contracts")
      .select("id", { count: "exact", head: true })
      .eq("cte_id", cte.id);
    const contractWarning = linkedContracts && linkedContracts > 0
      ? `\n\n⚠️ Há ${linkedContracts} contrato(s) de frete vinculado(s) que também será(ão) excluído(s) (e sua(s) conta(s) a pagar pendente(s)).`
      : "";


    // CT-e de Produção AUTORIZADO → precisa cancelar na SEFAZ antes
    if (!isServico && isAutorizado) {
      const ok = await confirm({
        title: "Cancelar CT-e na SEFAZ e excluir",
        description:
          `Este CT-e (Nº ${cte.numero}) está autorizado pela SEFAZ.\n\n` +
          `Será solicitado o CANCELAMENTO oficial na SEFAZ e, em seguida, o registro será excluído do sistema.\n\n` +
          `Esta operação é IRREVERSÍVEL. Deseja continuar?` + contractWarning,

        confirmLabel: "Cancelar na SEFAZ e excluir",
        variant: "destructive",
      });
      if (!ok) return;

      const justificativa = window.prompt(
        "Justificativa para cancelamento na SEFAZ (mínimo 15 caracteres):",
        "Cancelamento solicitado pelo emitente"
      );
      if (!justificativa) return;
      if (justificativa.trim().length < 15) {
        toast({
          title: "Justificativa inválida",
          description: "A SEFAZ exige no mínimo 15 caracteres.",
          variant: "destructive",
        });
        return;
      }

      setDeletingId(cte.id);
      try {
        const resp = await cancelarCte(
          cte.id,
          cte.chave_acesso!,
          cte.protocolo_autorizacao!,
          justificativa.trim(),
          user?.id || "",
          cte.establishment_id
        );
        if (!resp.success) {
          toast({
            title: "Falha no cancelamento SEFAZ",
            description: resp.motivo_rejeicao || "Não foi possível cancelar o CT-e na SEFAZ. Exclusão abortada.",
            variant: "destructive",
          });
          return;
        }
        // Cancelado com sucesso → excluir contrato vinculado + CT-e
        const removed = await removeLinkedFreightContract(cte.id);
        const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
        if (error) throw error;
        toast({ title: "CT-e cancelado e excluído", description: `Nº ${cte.numero} removido${removed ? ` (e ${removed} contrato de frete vinculado).` : "."}` });

        fetchCtes();
      } catch (err: any) {
        toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
      return;
    }

    // Serviço, rascunho, rejeitado, erro ou cancelado → exclusão direta
    const ok = await confirm({
      title: "Excluir CT-e",
      description: (isServico
        ? `Excluir definitivamente este talão de serviço?\n\nEsta ação não pode ser desfeita.`
        : `Este CT-e não foi autorizado pela SEFAZ (status: ${cte.status}). Excluir definitivamente?\n\nEsta ação não pode ser desfeita.`) + contractWarning,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingId(cte.id);
    try {
      const removed = await removeLinkedFreightContract(cte.id);
      const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
      if (error) throw error;
      toast({ title: "CT-e excluído", description: removed ? `Registro removido (e ${removed} contrato de frete vinculado).` : "Registro removido com sucesso." });
      fetchCtes();

    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Seleção em lote ──────────────────────────────────────
  const isBulkDeletable = (c: Cte) =>
    c.tipo_talao === "servico" || c.status !== "autorizado";

  const selectableIds = sorted.filter(isBulkDeletable).map((c) => c.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds).filter((id) =>
      sorted.some((c) => c.id === id && isBulkDeletable(c)),
    );
    if (!ids.length) return;

    // Bloqueia CT-es já vinculados a faturas
    const { data: prevs } = await supabase
      .from("previsoes_recebimento")
      .select("origem_id, fatura_previsoes(fatura_id)")
      .eq("origem_tipo", "cte")
      .in("origem_id", ids);
    const blocked = new Set(
      (prevs || [])
        .filter((p: any) => (p.fatura_previsoes?.length ?? 0) > 0)
        .map((p: any) => p.origem_id as string),
    );
    const deletable = ids.filter((id) => !blocked.has(id));

    if (!deletable.length) {
      toast({
        title: "Exclusão bloqueada",
        description: "Todos os CT-es selecionados estão vinculados a faturas. Desvincule-os antes de excluir.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirm({
      title: "Excluir CT-es selecionados",
      description:
        `Confirma excluir ${deletable.length} CT-e(s) e seus contratos de frete vinculados (e contas a pagar pendentes)?` +
        (blocked.size ? `\n\n⚠️ ${blocked.size} CT-e(s) serão ignorados por estarem vinculados a faturas.` : "") +
        "\n\nEsta ação é irreversível.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setBulkDeleting(true);
    let okCount = 0;
    const errors: string[] = [];
    try {
      for (const id of deletable) {
        try {
          await removeLinkedFreightContract(id);
          const { error } = await supabase.from("ctes").delete().eq("id", id);
          if (error) throw error;
          okCount++;
        } catch (err: any) {
          errors.push(`${id.slice(0, 8)}: ${err.message}`);
        }
      }
      toast({
        title: errors.length ? "Concluído com erros" : "CT-es excluídos",
        description: `${okCount} CT-e(s) excluído(s).${errors.length ? "\n" + errors.slice(0, 3).join("\n") : ""}`,
        variant: errors.length ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      fetchCtes();
    } finally {
      setBulkDeleting(false);
    }
  };

  const singleCte = (() => {
    const arr = sorted.filter((c) => selectedIds.has(c.id));
    return arr.length === 1 ? arr[0] : null;
  })();

  const cteColumns: DataGridColumn<Cte>[] = [
    {
      key: "numero", header: "N.º", width: "90px",
      sortValue: (c) => (c.tipo_talao === "servico" ? c.numero_interno ?? 0 : c.numero ?? 0),
      cell: (c) => (
        <span className="font-medium tabular-nums">
          {c.tipo_talao === "servico" ? c.numero_interno ?? "—" : c.numero ?? "—"}
        </span>
      ),
    },
    {
      key: "talao", header: "Talão", width: "100px",
      sortValue: (c) => c.tipo_talao || "",
      cell: (c) => <span className="text-muted-foreground">{c.tipo_talao === "servico" ? "Serviço" : "Produção"}</span>,
    },
    {
      key: "data", header: "Data Emissão", width: "120px",
      sortValue: (c) => getEmissaoDate(c),
      cell: (c) => <span className="tabular-nums whitespace-nowrap">{formatDateBR(getEmissaoDate(c))}</span>,
    },
    {
      key: "cliente", header: "Cliente",
      sortValue: (c) => getClienteTomador(c) || "",
      cell: (c) => <span className="truncate block max-w-[380px]">{getClienteTomador(c)}</span>,
    },
    {
      key: "placa", header: "Placa", width: "90px",
      sortValue: (c) => c.placa_veiculo || "",
      cell: (c) => <span className="tabular-nums">{c.placa_veiculo || "—"}</span>,
    },
    {
      key: "valor", header: "Valor", width: "120px", align: "right",
      sortValue: (c) => Number(c.valor_frete),
      cell: (c) => (
        <span className="tabular-nums font-medium">
          {Number(c.valor_frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      ),
    },
    {
      key: "status", header: "Status", width: "100px", align: "center",
      sortValue: (c) => (c.tipo_talao === "servico" ? "interno" : c.status),
      cell: (c) =>
        c.tipo_talao === "servico" ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700">Interno</Badge>
        ) : (
          <Badge className={statusColors[c.status] || ""}>{statusLabels[c.status] || c.status}</Badge>
        ),
    },
  ];

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold font-display">CT-e</h1>
        </div>


        <div className="flex flex-col gap-2 mb-6">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar nº, remetente, destinatário, placa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                title="Emissão de"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[44px] pl-7 pr-1 text-xs [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-datetime-edit]:hidden"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="date"
                title="Emissão até"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[44px] pl-7 pr-1 text-xs [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-datetime-edit]:hidden"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="h-9 w-9 p-0 text-muted-foreground"
                title="Limpar datas"
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
            <div className="inline-flex rounded-md border border-border bg-card p-0.5 ml-auto">
              {([
                { v: "todos", label: "Todos" },
                { v: "producao", label: "Produção" },
                { v: "servico", label: "Serviço" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTipoFilter(opt.v)}
                  className={`px-2.5 h-8 text-xs rounded-sm transition-colors ${
                    tipoFilter === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>


        <GlobalToolbar
          actions={[
            { key: "new", label: "Novo CT-e", icon: Plus, mode: "create", variant: "default", onClick: handleNew },
            {
              key: "inconsist", label: "Inconsistências", icon: AlertTriangle, mode: "always", variant: "outline",
              onClick: () => setInconsistencyOpen(true),
            },
            {
              key: "batch", label: "Importar lote", icon: FileText, mode: "always", variant: "outline",
              onClick: () => setBatchOpen(true),
            },
            {
              key: "detail", label: "Detalhes", icon: Eye, mode: "single",
              disabled: !singleCte,
              onClick: () => singleCte && setDetailCte(singleCte),
            },
            {
              key: "edit", label: "Editar", icon: Pencil, mode: "single",
              disabled: !singleCte || !(singleCte.tipo_talao === "servico" || singleCte.status === "rascunho" || singleCte.status === "rejeitado"),
              onClick: () => singleCte && handleEdit(singleCte),
            },
            {
              key: "print", label: printing ? "Gerando..." : "Imprimir", icon: Printer, mode: "single+batch", variant: "outline",
              disabled: printing || selectedIds.size === 0,
              onClick: handlePrintSelected,
            },
            {
              key: "delete", label: bulkDeleting ? "Excluindo..." : "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive",
              disabled: bulkDeleting || selectedIds.size === 0,
              onClick: () => {
                if (singleCte && !isBulkDeletable(singleCte)) return handleDelete(singleCte);
                handleBulkDelete();
              },
            },
          ]}
          selectedCount={selectedIds.size}
        />

        <div className="mt-3">
          <DataGrid
            rows={sorted}
            columns={cteColumns}
            rowId={(c) => c.id}
            selected={selectedIds}
            rowClassName={(c) => rowToneClass(c.status === "autorizado" ? "resolved" : ["cancelado", "rejeitado", "denegado"].includes(c.status) ? "overdue" : "pending")}
            onSelectedChange={setSelectedIds}
            loading={loading}
            minWidth={860}
            emptyMessage='Nenhum CT-e encontrado. Clique em "Novo CT-e" para criar o primeiro.'
          />

          <StatusLegend className="px-1 pt-2" items={[{ tone: "pending", label: "Rascunho / processando" }, { tone: "resolved", label: "Autorizado" }, { tone: "overdue", label: "Cancelado / rejeitado" }]} />
        </div>

      </div>

      {/* Chooser modal */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo CT-e</DialogTitle>
            <DialogDescription>Selecione o talão ao qual este CT-e pertence.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-2">
            <button
              type="button"
              onClick={handlePickProducao}
              className="text-left border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Produção</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CT-e fiscal completo, transmitido à SEFAZ.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handlePickServico}
              className="text-left border rounded-lg p-4 hover:border-amber-500 hover:bg-amber-500/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <FileCog className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Serviço</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registro interno simplificado, sem envio à SEFAZ.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CteFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      <CteServicoFormDialog
        open={servicoOpen}
        onOpenChange={(o) => { setServicoOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      {detailCte && (
        <CteDetailDialog
          open={!!detailCte}
          onOpenChange={(open) => !open && setDetailCte(null)}
          cte={detailCte}
          onUpdated={fetchCtes}
          onEdit={(cte) => {
            setDetailCte(null);
            handleEdit(cte);
          }}
        />
      )}
      <CteBatchImportDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        onImported={fetchCtes}
      />
      <CteInconsistencyDialog
        open={inconsistencyOpen}
        onOpenChange={setInconsistencyOpen}
        onDeleted={fetchCtes}
      />
      {ConfirmDialog}
    </AdminLayout>
  );
}
