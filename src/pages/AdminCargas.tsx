import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Package, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CargaFormDialog } from "@/components/freight/CargaFormDialog";

export interface Carga {
  id: string;
  produto_predominante: string;
  peso_bruto: number;
  valor_carga: number;
  valor_carga_averb: number | null;
  unidade: string;
  remetente_nome: string | null;
  remetente_cnpj: string | null;
  destinatario_nome: string | null;
  destinatario_cnpj: string | null;
  municipio_origem_nome: string | null;
  uf_origem: string | null;
  municipio_destino_nome: string | null;
  uf_destino: string | null;
  chaves_nfe_ref: string[] | null;
  observacoes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export default function AdminCargas() {
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCarga, setEditingCarga] = useState<Carga | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchCargas();
  }, []);

  const fetchCargas = async () => {
    try {
      const { data, error } = await supabase
        .from("cargas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCargas((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta carga?")) return;
    const { error } = await supabase.from("cargas").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Carga excluída" });
      fetchCargas();
    }
  };

  const filtered = cargas.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.produto_predominante?.toLowerCase().includes(q) ||
      c.remetente_nome?.toLowerCase().includes(q) ||
      c.destinatario_nome?.toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <h1 className="text-3xl font-bold font-display">Cargas</h1>
          <Button onClick={() => { setEditingCarga(null); setFormOpen(true); }} className="btn-transport-accent gap-2">
            <Plus className="w-4 h-4" />
            Nova Carga
          </Button>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por produto, remetente, destinatário..."
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
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma carga encontrada</h3>
            <p className="text-muted-foreground">Clique em "Nova Carga" para cadastrar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((carga) => (
              <Card
                key={carga.id}
                className="border-border bg-card hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => { setEditingCarga(carga); setFormOpen(true); }}
              >
                <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-semibold font-display">{carga.produto_predominante}</span>
                      <p className="text-sm text-muted-foreground truncate">
                        {carga.remetente_nome || "—"} → {carga.destinatario_nome || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm shrink-0">
                    <Badge variant="outline">{Number(carga.peso_bruto).toLocaleString("pt-BR")} {carga.unidade}</Badge>
                    <span className="text-muted-foreground">
                      {carga.uf_origem || "?"} → {carga.uf_destino || "?"}
                    </span>
                    <span className="font-semibold">
                      {Number(carga.valor_carga).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); handleDelete(carga.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CargaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        carga={editingCarga}
        onSaved={fetchCargas}
      />
    </AdminLayout>
  );
}
