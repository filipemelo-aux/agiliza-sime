import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FileText, Sprout, Download, Trash2, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { QuotationFormDialog } from "@/components/quotation/QuotationFormDialog";
import { QuotationDetailDialog } from "@/components/quotation/QuotationDetailDialog";
import { exportQuotationPDF } from "@/components/quotation/exportQuotationPdf";

interface Quotation {
  id: string;
  type: string;
  numero: number;
  status: string;
  created_at: string;
  // freight
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  produto: string | null;
  peso_kg: number | null;
  valor_frete: number | null;
  // harvest
  previsao_inicio: string | null;
  previsao_termino: string | null;
  valor_mensal_por_caminhao: number | null;
  quantidade_caminhoes: number | null;
  alimentacao_por_conta: string | null;
  combustivel_por_conta: string | null;
  valor_alimentacao_dia: number | null;
  // relations
  establishment_id: string | null;
  client_id: string | null;
  carga_id: string | null;
  observacoes: string | null;
  validade_dias: number | null;
  created_by: string;
  // joined
  client?: { full_name: string; cnpj: string | null; razao_social: string | null } | null;
  establishment?: { razao_social: string; nome_fantasia: string | null; cnpj: string } | null;
  creator?: { full_name: string } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "secondary" },
  enviada: { label: "Enviada", variant: "default" },
  aprovada: { label: "Aprovada", variant: "outline" },
  recusada: { label: "Recusada", variant: "destructive" },
};

export default function AdminQuotations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"frete" | "colheita">("frete");
  const [detailQuotation, setDetailQuotation] = useState<Quotation | null>(null);
  const [establishments, setEstablishments] = useState<any[]>([]);

  const fetchQuotations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quotations")
      .select("*, client:profiles!quotations_client_id_fkey(full_name, cnpj, razao_social), establishment:fiscal_establishments!quotations_establishment_id_fkey(razao_social, nome_fantasia, cnpj)")
      .order("created_at", { ascending: false });
    
    const items = (data as any[]) || [];
    
    // Fetch creator names (created_by = auth user_id, profiles.user_id)
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
    if (!confirm("Excluir esta cotação?")) return;
    await supabase.from("quotations").delete().eq("id", id);
    toast({ title: "Cotação excluída" });
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

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold font-display">Cotações</h1>
            <p className="text-muted-foreground">Gerencie propostas de frete e serviços de colheita</p>
          </div>
        </div>

        <Tabs defaultValue="frete" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="frete" className="gap-2">
                <FileText className="h-4 w-4" /> Frete
              </TabsTrigger>
              <TabsTrigger value="colheita" className="gap-2">
                <Sprout className="h-4 w-4" /> Colheita
              </TabsTrigger>
            </TabsList>
          </div>

          {/* FRETE TAB */}
          <TabsContent value="frete">
            <div className="flex justify-end mb-4">
              <Button onClick={() => openNewForm("frete")} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Cotação de Frete
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Origem → Destino</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Peso (kg)</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {freteQuotations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Nenhuma cotação de frete criada
                        </TableCell>
                      </TableRow>
                    )}
                    {freteQuotations.map((q) => {
                      const st = STATUS_MAP[q.status] || STATUS_MAP.rascunho;
                      return (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono text-xs">{q.numero}</TableCell>
                          <TableCell className="text-sm">{q.client?.full_name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {q.origem_cidade}/{q.origem_uf} → {q.destino_cidade}/{q.destino_uf}
                          </TableCell>
                          <TableCell className="text-sm">{q.produto || "—"}</TableCell>
                          <TableCell className="text-sm">{q.peso_kg?.toLocaleString("pt-BR") || "—"}</TableCell>
                          <TableCell className="text-sm">{formatCurrency(q.valor_frete)}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(q.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setDetailQuotation(q)} title="Ver"><Eye className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => exportQuotationPDF(q, establishments)} title="PDF"><Download className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(q.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* COLHEITA TAB */}
          <TabsContent value="colheita">
            <div className="flex justify-end mb-4">
              <Button onClick={() => openNewForm("colheita")} className="gap-2">
                <Plus className="h-4 w-4" /> Nova Cotação de Colheita
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Caminhões</TableHead>
                      <TableHead>Valor Mensal/Caminhão</TableHead>
                      <TableHead>Diária</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {colheitaQuotations.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Nenhuma cotação de colheita criada
                        </TableCell>
                      </TableRow>
                    )}
                    {colheitaQuotations.map((q) => {
                      const st = STATUS_MAP[q.status] || STATUS_MAP.rascunho;
                      const diaria = q.valor_mensal_por_caminhao ? q.valor_mensal_por_caminhao / 30 : null;
                      return (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono text-xs">{q.numero}</TableCell>
                          <TableCell className="text-sm">{q.client?.full_name || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {q.previsao_inicio ? format(new Date(q.previsao_inicio + "T12:00:00"), "dd/MM/yy") : "?"} — {q.previsao_termino ? format(new Date(q.previsao_termino + "T12:00:00"), "dd/MM/yy") : "?"}
                          </TableCell>
                          <TableCell className="text-sm text-center">{q.quantidade_caminhoes || 1}</TableCell>
                          <TableCell className="text-sm">{formatCurrency(q.valor_mensal_por_caminhao)}</TableCell>
                          <TableCell className="text-sm">{diaria ? formatCurrency(diaria) : "—"}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{format(new Date(q.created_at), "dd/MM/yyyy")}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => setDetailQuotation(q)} title="Ver"><Eye className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => exportQuotationPDF(q, establishments)} title="PDF"><Download className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(q.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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

      {detailQuotation && (
        <QuotationDetailDialog
          quotation={detailQuotation}
          open={!!detailQuotation}
          onOpenChange={(v) => { if (!v) setDetailQuotation(null); }}
          establishments={establishments}
        />
      )}
    </AdminLayout>
  );
}
