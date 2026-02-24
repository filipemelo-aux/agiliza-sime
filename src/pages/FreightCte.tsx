import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, FileText, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CteFormDialog } from "@/components/freight/CteFormDialog";
import { CteDetailDialog } from "@/components/freight/CteDetailDialog";

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
  const [formOpen, setFormOpen] = useState(false);
  const [editingCte, setEditingCte] = useState<Cte | null>(null);
  const [detailCte, setDetailCte] = useState<Cte | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCtes();
  }, []);

  const fetchCtes = async () => {
    try {
      const { data, error } = await supabase
        .from("ctes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCtes((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = ctes.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.remetente_nome?.toLowerCase().includes(q) ||
      c.destinatario_nome?.toLowerCase().includes(q) ||
      String(c.numero).includes(q) ||
      c.chave_acesso?.includes(q)
    );
  });

  const handleNew = () => {
    setEditingCte(null);
    setFormOpen(true);
  };

  const handleEdit = (cte: Cte) => {
    setEditingCte(cte);
    setFormOpen(true);
  };

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold font-display">CT-e</h1>
          <Button onClick={handleNew} className="btn-transport-accent gap-2">
            <Plus className="w-4 h-4" />
            Novo CT-e
          </Button>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, remetente, destinatário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum CT-e encontrado</h3>
            <p className="text-muted-foreground">Clique em "Novo CT-e" para criar o primeiro.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((cte) => (
              <Card
                key={cte.id}
                className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => setDetailCte(cte)}
              >
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold font-display">
                          {cte.numero ? `Nº ${cte.numero}` : "Sem número"}
                        </span>
                        <Badge className={statusColors[cte.status] || ""}>
                          {statusLabels[cte.status] || cte.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {cte.remetente_nome} → {cte.destinatario_nome}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <span className="text-muted-foreground">
                      {cte.uf_origem} → {cte.uf_destino}
                    </span>
                    <span className="font-semibold">
                      {Number(cte.valor_frete).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    {cte.status === "rascunho" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(cte);
                        }}
                      >
                        Editar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CteFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      {detailCte && (
        <CteDetailDialog
          open={!!detailCte}
          onOpenChange={(open) => !open && setDetailCte(null)}
          cte={detailCte}
          onUpdated={fetchCtes}
        />
      )}
    </AdminLayout>
  );
}
