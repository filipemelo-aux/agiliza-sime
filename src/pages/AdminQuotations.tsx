import { useState, useEffect } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Sprout, Download, Trash2, Eye, CheckCircle, Clock, Send, Pencil, ArrowUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { QuotationFormDialog } from "@/components/quotation/QuotationFormDialog";
import { QuotationDetailDialog } from "@/components/quotation/QuotationDetailDialog";
import { exportQuotationPDF } from "@/components/quotation/exportQuotationPdf";
import { getLocalDateISO } from "@/lib/date";
import { limitDisplayText } from "@/lib/displayText";

interface Quotation {
  id: string;
  type: string;
  numero: number;
  status: string;
  created_at: string;
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  produto: string | null;
  peso_kg: number | null;
  valor_frete: number | null;
  previsao_inicio: string | null;
  previsao_termino: string | null;
  valor_mensal_por_caminhao: number | null;
  quantidade_caminhoes: number | null;
  alimentacao_por_conta: string | null;
  combustivel_por_conta: string | null;
  valor_alimentacao_dia: number | null;
  establishment_id: string | null;
  client_id: string | null;
  carga_id: string | null;
  observacoes: string | null;
  validade_dias: number | null;
  created_by: string;
  client?: { full_name: string; cnpj: string | null; razao_social: string | null } | null;
  establishment?: { razao_social: string; nome_fantasia: string | null; cnpj: string } | null;
  creator?: { full_name: string; signature_data?: string | null } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  rascunho: { label: "Rascunho", variant: "secondary", icon: Clock },
  em_aprovacao: { label: "Em Aprovação", variant: "default", icon: Send },
  aprovada: { label: "Aprovada", variant: "outline", icon: CheckCircle },
  recusada: { label: "Recusada", variant: "destructive", icon: Clock },
};

export default function AdminQuotations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"frete" | "colheita">("frete");
  const [detailQuotation, setDetailQuotation] = useState<Quotation | null>(null);
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null);
  const [sortBy, setSortBy] = useState<string>("data_desc");
  const { matrizId, unifiedLabel, unifiedCnpjs, establishments } = useUnifiedCompany();

  const fetchQuotations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quotations")
      .select("*, client:profiles!quotations_client_id_fkey(full_name, cnpj, razao_social), establishment:fiscal_establishments!quotations_establishment_id_fkey(razao_social, nome_fantasia, cnpj)")
      .order("created_at", { ascending: false });

    const items = (data as any[]) || [];
    const creatorIds = [...new Set(items.map((q) => q.created_by).filter(Boolean))];
    if (creatorIds.length > 0) {
      const { data: creators } = await supabase
        .from("profiles")
        .select("user_id, full_name, signature_data")
        .in("user_id", creatorIds);
      const creatorMap = new Map((creators || []).map((c: any) => [c.user_id, { full_name: c.full_name, signature_data: c.signature_data }]));
      items.forEach((q) => {
        const c = creatorMap.get(q.created_by);
        q.creator = c ? { full_name: c.full_name, signature_data: c.signature_data } : null;
      });
    }

    setQuotations(items);
    setLoading(false);
  };

  // establishments now come from useUnifiedCompany

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Excluir cotação", description: "Excluir esta cotação?", variant: "destructive", confirmLabel: "Excluir" })) return;
    await supabase.from("quotations").delete().eq("id", id);
    toast({ title: "Cotação excluída" });
    fetchQuotations();
  };

  const handleStatusChange = async (q: Quotation, newStatus: string) => {
    // If approving a colheita quotation, create harvest_jobs
    if (newStatus === "aprovada" && q.type === "colheita") {
      const diaria = q.valor_mensal_por_caminhao ? q.valor_mensal_por_caminhao / 30 : 0;
      const { error: harvestError } = await supabase.from("harvest_jobs").insert({
        farm_name: `Cotação #${q.numero} - ${q.client?.razao_social || q.client?.full_name || "Cliente"}`,
        location: q.observacoes || "A definir",
        harvest_period_start: q.previsao_inicio || getLocalDateISO(),
        harvest_period_end: q.previsao_termino || null,
        monthly_value: q.valor_mensal_por_caminhao || 0,
        payment_value: diaria,
        total_third_party_vehicles: q.quantidade_caminhoes || 1,
        client_id: q.client_id || null,
        created_by: q.created_by,
        status: "active",
        notes: `Criado automaticamente a partir da Cotação #${q.numero}. Alimentação: ${q.alimentacao_por_conta === "contratante" ? "Contratante" : "Contratada"}. Combustível: ${q.combustivel_por_conta === "contratante" ? "Contratante" : "Contratada"}.${q.valor_alimentacao_dia ? ` Alimentação/dia: R$${q.valor_alimentacao_dia}` : ""}`,
      });

      if (harvestError) {
        toast({ title: "Erro ao criar colheita", description: harvestError.message, variant: "destructive" });
        return;
      }
      toast({ title: "Colheita criada automaticamente nas Operações!" });
    }

    const { error } = await supabase.from("quotations").update({ status: newStatus }).eq("id", q.id);
    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
      return;
    }
    toast({ title: `Status alterado para "${STATUS_MAP[newStatus]?.label || newStatus}"` });
    fetchQuotations();
  };

  const formatCurrency = (v: number | null) =>
    v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

  const sortQuotations = (items: Quotation[]) => {
    const copy = [...items];
    const dir = sortBy.endsWith("_desc") ? -1 : 1;
    const field = sortBy.replace(/_(asc|desc)$/, "");
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (field === "data") { av = a.created_at; bv = b.created_at; }
      else if (field === "numero") { av = a.numero; bv = b.numero; }
      else if (field === "valor") {
        av = a.valor_frete ?? a.valor_mensal_por_caminhao ?? 0;
        bv = b.valor_frete ?? b.valor_mensal_por_caminhao ?? 0;
      } else if (field === "cliente") {
        av = a.client?.razao_social || a.client?.full_name || "";
        bv = b.client?.razao_social || b.client?.full_name || "";
      } else { av = a.created_at; bv = b.created_at; }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return copy;
  };

  const sortedAll = sortQuotations(quotations);
  const freteQuotations = sortQuotations(quotations.filter((q) => q.type === "frete"));
  const colheitaQuotations = sortQuotations(quotations.filter((q) => q.type === "colheita"));

  const openNewForm = (type: "frete" | "colheita") => {
    setFormType(type);
    setShowForm(true);
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedQuotations = quotations.filter((q) => selectedIds.has(q.id));
  const single = selectedQuotations.length === 1 ? selectedQuotations[0] : null;

  const baseColumns: DataGridColumn<Quotation>[] = [
    {
      key: "numero", header: "Nº", width: "80px",
      sortValue: (q) => q.numero,
      cell: (q) => <span className="font-semibold tabular-nums">#{q.numero}</span>,
    },
    {
      key: "data", header: "Emissão", width: "110px",
      sortValue: (q) => q.created_at,
      cell: (q) => <span className="tabular-nums">{format(new Date(q.created_at), "dd/MM/yyyy")}</span>,
    },
    {
      key: "tipo", header: "Tipo", width: "100px", align: "center",
      sortValue: (q) => q.type,
      cell: (q) => (
        <Badge variant="outline" className="text-[10px]">
          {q.type === "colheita" ? "Colheita" : "Frete"}
        </Badge>
      ),
    },
    {
      key: "cliente", header: "Cliente",
      sortValue: (q) => q.client?.razao_social || q.client?.full_name || "",
      cell: (q) => { const name = q.client?.razao_social || q.client?.full_name || "—"; return <span className="block" title={name}>{limitDisplayText(name)}</span>; },
    },
    {
      key: "detalhe", header: "Detalhe",
      sortValue: (q) => q.type === "colheita" ? (q.previsao_inicio || "") : `${q.origem_cidade || ""}`,
      cell: (q) => q.type === "colheita" ? (
        <span className="truncate block text-muted-foreground">
          {q.previsao_inicio ? format(new Date(q.previsao_inicio + "T12:00:00"), "dd/MM/yy") : "?"} — {q.previsao_termino ? format(new Date(q.previsao_termino + "T12:00:00"), "dd/MM/yy") : "?"} · {q.quantidade_caminhoes || 1} cam.
        </span>
      ) : (
        <span className="truncate block text-muted-foreground">
          {q.origem_cidade}/{q.origem_uf} → {q.destino_cidade}/{q.destino_uf}
        </span>
      ),
    },
    {
      key: "valor", header: "Valor", width: "130px", align: "right",
      sortValue: (q) => q.valor_frete ?? q.valor_mensal_por_caminhao ?? 0,
      cell: (q) => (
        <span className="font-mono font-semibold">
          {formatCurrency(q.type === "colheita" ? q.valor_mensal_por_caminhao : q.valor_frete)}
        </span>
      ),
    },
    {
      key: "responsavel", header: "Responsável", width: "160px",
      sortValue: (q) => q.creator?.full_name || "",
      cell: (q) => <span className="truncate block text-muted-foreground">{q.creator?.full_name || "—"}</span>,
    },
    {
      key: "status", header: "Status", width: "120px", align: "center",
      sortValue: (q) => q.status,
      cell: (q) => {
        const st = STATUS_MAP[q.status] || STATUS_MAP.rascunho;
        return <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>;
      },
    },
  ];

  const toolbarActions = [
    { key: "new-frete", label: "Nova Cotação de Frete", icon: FileText, mode: "create" as const, variant: "default" as const, onClick: () => openNewForm("frete") },
    { key: "new-colheita", label: "Nova Cotação de Colheita", icon: Sprout, mode: "create" as const, variant: "outline" as const, onClick: () => openNewForm("colheita") },
    { key: "detail", label: "Detalhes", icon: Eye, mode: "single" as const, disabled: !single, onClick: () => single && setDetailQuotation(single) },
    { key: "edit", label: "Editar", icon: Pencil, mode: "single" as const, disabled: !single, onClick: () => single && setEditQuotation(single) },
    { key: "pdf", label: "PDF", icon: Download, mode: "single" as const, disabled: !single, onClick: () => single && exportQuotationPDF(single, establishments) },
    { key: "rascunho", label: "Rascunho", icon: Clock, mode: "single" as const, disabled: !single || single.status === "rascunho", onClick: () => single && handleStatusChange(single, "rascunho") },
    { key: "aprovacao", label: "Em Aprovação", icon: Send, mode: "single" as const, disabled: !single || single.status === "em_aprovacao", onClick: () => single && handleStatusChange(single, "em_aprovacao") },
    { key: "aprovar", label: "Aprovar", icon: CheckCircle, mode: "single" as const, disabled: !single || single.status === "aprovada", onClick: () => single && handleStatusChange(single, "aprovada") },
    { key: "delete", label: "Excluir", icon: Trash2, mode: "single" as const, variant: "destructive" as const, disabled: !single, onClick: () => single && handleDelete(single.id) },
  ];

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Cotações</h1>
          <p className="text-sm text-muted-foreground">Gerencie propostas de frete e serviços de colheita</p>
        </div>

        <GlobalToolbar actions={toolbarActions} selectedCount={selectedIds.size} />

        <Tabs defaultValue="todos" className="space-y-4" onValueChange={() => setSelectedIds(new Set())}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <TabsList>
              <TabsTrigger value="todos" className="gap-2">
                Todos <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{quotations.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="frete" className="gap-2">
                <FileText className="h-4 w-4" /> Frete <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{freteQuotations.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="colheita" className="gap-2">
                <Sprout className="h-4 w-4" /> Colheita <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{colheitaQuotations.length}</Badge>
              </TabsTrigger>
            </TabsList>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9 w-[210px] text-xs gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data_desc">Data emissão (mais recente)</SelectItem>
                <SelectItem value="data_asc">Data emissão (mais antiga)</SelectItem>
                <SelectItem value="numero_desc">Nº (maior)</SelectItem>
                <SelectItem value="numero_asc">Nº (menor)</SelectItem>
                <SelectItem value="valor_desc">Valor (maior)</SelectItem>
                <SelectItem value="valor_asc">Valor (menor)</SelectItem>
                <SelectItem value="cliente_asc">Cliente (A→Z)</SelectItem>
                <SelectItem value="cliente_desc">Cliente (Z→A)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="todos">
            <DataGrid
              rows={sortedAll}
              columns={baseColumns}
              rowId={(q) => q.id}
              rowClassName={(q) => rowToneClass(q.status === "aprovada" ? "resolved" : q.status === "recusada" ? "overdue" : "pending")}
              selected={selectedIds}
              onSelectedChange={setSelectedIds}
              minWidth={1100}
              emptyMessage="Nenhuma cotação criada"
            />
          </TabsContent>

          <TabsContent value="frete">
            <DataGrid
              rows={freteQuotations}
              columns={baseColumns}
              rowId={(q) => q.id}
              rowClassName={(q) => rowToneClass(q.status === "aprovada" ? "resolved" : q.status === "recusada" ? "overdue" : "pending")}
              selected={selectedIds}
              onSelectedChange={setSelectedIds}
              minWidth={1100}
              emptyMessage="Nenhuma cotação de frete criada"
            />
          </TabsContent>

          <TabsContent value="colheita">
            <DataGrid
              rows={colheitaQuotations}
              columns={baseColumns}
              rowId={(q) => q.id}
              rowClassName={(q) => rowToneClass(q.status === "aprovada" ? "resolved" : q.status === "recusada" ? "overdue" : "pending")}
              selected={selectedIds}
              onSelectedChange={setSelectedIds}
              minWidth={1100}
              emptyMessage="Nenhuma cotação de colheita criada"
            />
          </TabsContent>
        </Tabs>

        <StatusLegend className="px-1 pt-2" items={[{ tone: "pending", label: "Rascunho / em aprovação" }, { tone: "resolved", label: "Aprovada" }, { tone: "overdue", label: "Recusada" }]} />
      </main>

      {showForm && user && (
        <QuotationFormDialog
          type={formType}
          open={showForm}
          onOpenChange={setShowForm}
          establishments={establishments}
          userId={user.id}
          onSaved={fetchQuotations}
        />
      )}

      {editQuotation && user && (
        <QuotationFormDialog
          type={editQuotation.type as "frete" | "colheita"}
          open={!!editQuotation}
          onOpenChange={(v) => { if (!v) setEditQuotation(null); }}
          establishments={establishments}
          userId={user.id}
          onSaved={fetchQuotations}
          editData={editQuotation}
        />
      )}

      {detailQuotation && (
        <QuotationDetailDialog
          quotation={detailQuotation}
          open={!!detailQuotation}
          onOpenChange={(v) => { if (!v) setDetailQuotation(null); }}
          establishments={establishments}
        />
      )}
      {ConfirmDialog}
    </AdminLayout>
  );
}

