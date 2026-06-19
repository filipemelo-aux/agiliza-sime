import { useEffect, useState } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
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
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTh } from "@/components/ui/sortable-th";

export interface Carga {
  id: string;
  produto_predominante: string;
  tipo: string | null;
  ativo: boolean;
  cod_buonny: string | null;
  cod_opentech: string | null;
  tolerancia_quebra: number | null;
  ncm: string | null;
  sinonimos: string | null;
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
  const { confirm, ConfirmDialog } = useConfirmDialog();
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
        .order("produto_predominante", { ascending: true });
      if (error) throw error;
      setCargas((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm({ title: "Excluir natureza de carga", description: "Excluir esta natureza de carga?", variant: "destructive", confirmLabel: "Excluir" })) return;
    const { error } = await supabase.from("cargas").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Natureza excluída" });
      fetchCargas();
    }
  };

  const filtered = cargas.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.produto_predominante?.toLowerCase().includes(q) ||
      c.tipo?.toLowerCase().includes(q) ||
      c.sinonimos?.toLowerCase().includes(q) ||
      c.ncm?.includes(q)
    );
  });

  type CargaSortKey = "produto" | "tipo" | "ncm" | "status";
  const { sort, toggle, sorted } = useSortableTable<Carga, CargaSortKey>(
    filtered,
    { key: "produto", direction: "asc" },
    {
      produto: (c) => c.produto_predominante || "",
      tipo: (c) => c.tipo || "",
      ncm: (c) => c.ncm || "",
      status: (c) => (c.ativo ? "1" : "0"),
    },
  );

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h1 className="text-3xl font-bold font-display">Natureza de Cargas</h1>
          <Button onClick={() => { setEditingCarga(null); setFormOpen(true); }} className=" gap-2">
            <Plus className="w-4 h-4" />
            Nova Natureza
          </Button>
        </div>

        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição, tipo, NCM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma natureza cadastrada</h3>
            <p className="text-muted-foreground">Clique em "Nova Natureza" para cadastrar.</p>
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <SortableTh className="px-3 py-2 font-medium" active={sort.key === "produto"} direction={sort.direction} onSort={() => toggle("produto")}>Produto</SortableTh>
                    <SortableTh className="px-3 py-2 font-medium" active={sort.key === "tipo"} direction={sort.direction} onSort={() => toggle("tipo")}>Tipo</SortableTh>
                    <SortableTh className="px-3 py-2 font-medium w-[120px]" active={sort.key === "ncm"} direction={sort.direction} onSort={() => toggle("ncm")}>NCM</SortableTh>
                    <SortableTh className="px-3 py-2 font-medium text-center w-[90px]" align="center" active={sort.key === "status"} direction={sort.direction} onSort={() => toggle("status")}>Status</SortableTh>
                    <th className="px-2 py-2 font-medium text-right w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((carga) => (
                    <tr
                      key={carga.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => { setEditingCarga(carga); setFormOpen(true); }}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{carga.produto_predominante}</div>
                        {carga.sinonimos && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[320px]">{carga.sinonimos}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{carga.tipo || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{carga.ncm || "—"}</td>
                      <td className="px-3 py-2 text-center">
                        {carga.ativo ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Inativo</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); handleDelete(carga.id); }}
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CargaFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        carga={editingCarga}
        onSaved={fetchCargas}
      />
      {ConfirmDialog}
    </AdminLayout>
  );
}
