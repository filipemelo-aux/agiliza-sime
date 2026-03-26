import { useState, useEffect } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Sprout, Download, Trash2, Eye, CheckCircle, Clock, Send, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { QuotationFormDialog } from "@/components/quotation/QuotationFormDialog";
import { QuotationDetailDialog } from "@/components/quotation/QuotationDetailDialog";
import { exportQuotationPDF } from "@/components/quotation/exportQuotationPdf";
import { getLocalDateISO } from "@/lib/date";

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
  creator?: { full_name: string } | null;
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
  const [establishments, setEstablishments] = useState<any[]>([]);

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
        .select("user_id, full_name")
        .in("user_id", creatorIds);
      const creatorMap = new Map((creators || []).map((c: any) => [c.user_id, c.full_name]));
      items.forEach((q) => {
        q.creator = { full_name: creatorMap.get(q.created_by) || null };
      });
    }

    setQuotations(items);
    setLoading(false);
  };

  const fetchEstablishments = async () => {
    const { data } = await supabase.from("fiscal_establishments").select("id, razao_social, nome_fantasia, cnpj, tipo:type").eq("active", true);
    setEstablishments(data || []);
  };

  useEffect(() => {
    fetchQuotations();
    fetchEstablishments();
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

  const freteQuotations = quotations.filter((q) => q.type === "frete");
  const colheitaQuotations = quotations.filter((q) => q.type === "colheita");

  const openNewForm = (type: "frete" | "colheita") => {
    setFormType(type);
    setShowForm(true);
  };

  const renderFreteCard = (q: Quotation) => {
    const st = STATUS_MAP[q.status] || STATUS_MAP.rascunho;
    return (
      <Card key={q.id} className="flex flex-col justify-between">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Cotação #{q.numero}</CardTitle>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{format(new Date(q.created_at), "dd/MM/yyyy HH:mm")}</p>
        </CardHeader>
        <CardContent className="space-y-3 flex-1">
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{q.client?.razao_social || q.client?.full_name || "—"}</span></p>
            <p><span className="text-muted-foreground">Rota:</span> <span className="font-medium">{q.origem_cidade}/{q.origem_uf} → {q.destino_cidade}/{q.destino_uf}</span></p>
            <p><span className="text-muted-foreground">Produto:</span> <span className="font-medium">{q.produto || "—"}</span></p>
            <div className="flex gap-4">
              <p><span className="text-muted-foreground">Peso:</span> <span className="font-medium">{q.peso_kg?.toLocaleString("pt-BR") || "—"} kg</span></p>
              <p><span className="text-muted-foreground">Valor:</span> <span className="font-semibold text-primary">{formatCurrency(q.valor_frete)}</span></p>
            </div>
            {q.creator?.full_name && <p><span className="text-muted-foreground">Responsável:</span> <span className="font-medium">{q.creator.full_name}</span></p>}
          </div>

          {/* Status buttons */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            {q.status !== "rascunho" && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(q, "rascunho")}>
                <Clock className="h-3 w-3 mr-1" /> Rascunho
              </Button>
            )}
            {q.status !== "em_aprovacao" && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(q, "em_aprovacao")}>
                <Send className="h-3 w-3 mr-1" /> Em Aprovação
              </Button>
            )}
            {q.status !== "aprovada" && (
              <Button size="sm" variant="outline" className="text-xs h-7 border-green-500/50 text-green-700 hover:bg-green-50" onClick={() => handleStatusChange(q, "aprovada")}>
                <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
              </Button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setDetailQuotation(q)} title="Ver"><Eye className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setEditQuotation(q)} title="Editar"><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => exportQuotationPDF(q, establishments)} title="PDF"><Download className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(q.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderColheitaCard = (q: Quotation) => {
    const st = STATUS_MAP[q.status] || STATUS_MAP.rascunho;
    const diaria = q.valor_mensal_por_caminhao ? q.valor_mensal_por_caminhao / 30 : null;
    const totalDiaria = diaria != null ? diaria + (q.alimentacao_por_conta === "contratante" && q.valor_alimentacao_dia ? q.valor_alimentacao_dia : 0) : null;

    return (
      <Card key={q.id} className="flex flex-col justify-between">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Cotação #{q.numero}</CardTitle>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{format(new Date(q.created_at), "dd/MM/yyyy HH:mm")}</p>
        </CardHeader>
        <CardContent className="space-y-3 flex-1">
          <div className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{q.client?.razao_social || q.client?.full_name || "—"}</span></p>
            <p><span className="text-muted-foreground">Período:</span> <span className="font-medium">
              {q.previsao_inicio ? format(new Date(q.previsao_inicio + "T12:00:00"), "dd/MM/yy") : "?"} — {q.previsao_termino ? format(new Date(q.previsao_termino + "T12:00:00"), "dd/MM/yy") : "?"}
            </span></p>
            <div className="flex gap-4">
              <p><span className="text-muted-foreground">Caminhões:</span> <span className="font-medium">{q.quantidade_caminhoes || 1}</span></p>
              <p><span className="text-muted-foreground">Mensal:</span> <span className="font-medium">{formatCurrency(q.valor_mensal_por_caminhao)}</span></p>
            </div>
            <div className="flex gap-4">
              <p><span className="text-muted-foreground">Diária:</span> <span className="font-medium">{diaria ? formatCurrency(diaria) : "—"}</span></p>
              {totalDiaria != null && (
                <p><span className="text-muted-foreground">Diária Total:</span> <span className="font-semibold text-primary">{formatCurrency(totalDiaria)}</span></p>
              )}
            </div>
            {q.creator?.full_name && <p><span className="text-muted-foreground">Responsável:</span> <span className="font-medium">{q.creator.full_name}</span></p>}
          </div>

          {/* Status buttons */}
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            {q.status !== "rascunho" && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(q, "rascunho")}>
                <Clock className="h-3 w-3 mr-1" /> Rascunho
              </Button>
            )}
            {q.status !== "em_aprovacao" && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => handleStatusChange(q, "em_aprovacao")}>
                <Send className="h-3 w-3 mr-1" /> Em Aprovação
              </Button>
            )}
            {q.status !== "aprovada" && (
              <Button size="sm" variant="outline" className="text-xs h-7 border-green-500/50 text-green-700 hover:bg-green-50" onClick={() => handleStatusChange(q, "aprovada")}>
                <CheckCircle className="h-3 w-3 mr-1" /> Aprovar
              </Button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setDetailQuotation(q)} title="Ver"><Eye className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setEditQuotation(q)} title="Editar"><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => exportQuotationPDF(q, establishments)} title="PDF"><Download className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(q.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-display">Cotações</h1>
            <p className="text-muted-foreground">Gerencie propostas de frete e serviços de colheita</p>
          </div>
        </div>

        <Tabs defaultValue="todos" className="space-y-4">
          <div className="flex items-center justify-between">
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
          </div>

          <TabsContent value="todos">
            {quotations.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">Nenhuma cotação criada</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {quotations.map((q) => q.type === "colheita" ? renderColheitaCard(q) : renderFreteCard(q))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="frete">
            <div className="flex justify-end mb-4">
              <Button onClick={() => openNewForm("frete")} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Cotação de Frete
              </Button>
            </div>
            {freteQuotations.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">Nenhuma cotação de frete criada</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {freteQuotations.map(renderFreteCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="colheita">
            <div className="flex justify-end mb-4">
              <Button onClick={() => openNewForm("colheita")} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Cotação de Colheita
              </Button>
            </div>
            {colheitaQuotations.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">Nenhuma cotação de colheita criada</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {colheitaQuotations.map(renderColheitaCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>
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
