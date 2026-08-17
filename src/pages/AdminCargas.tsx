import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CargaFormDialog } from "@/components/freight/CargaFormDialog";
import { GlobalToolbar, ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      setSelected(new Set());
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => cargas.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.produto_predominante?.toLowerCase().includes(q) ||
      c.tipo?.toLowerCase().includes(q) ||
      c.sinonimos?.toLowerCase().includes(q) ||
      c.ncm?.includes(q)
    );
  }), [cargas, search]);

  const selectedRows = useMemo(() => filtered.filter((c) => selected.has(c.id)), [filtered, selected]);

  const handleEdit = () => {
    const c = selectedRows[0];
    if (!c) return;
    setEditingCarga(c);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (selectedRows.length === 0) return;
    const ok = await confirm({
      title: selectedRows.length > 1 ? `Excluir ${selectedRows.length} naturezas?` : "Excluir natureza de carga",
      description: "Esta ação não pode ser desfeita.",
      variant: "destructive",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const { error } = await supabase.from("cargas").delete().in("id", selectedRows.map((c) => c.id));
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Natureza excluída" });
      fetchCargas();
    }
  };

  const actions: ToolbarAction[] = [
    { key: "new", label: "Nova Natureza", icon: Plus, mode: "create", variant: "default", onClick: () => { setEditingCarga(null); setFormOpen(true); } },
    { key: "edit", label: "Editar", icon: Pencil, mode: "single", onClick: handleEdit },
    { key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", onClick: handleDelete },
  ];

  const columns: DataGridColumn<Carga>[] = [
    {
      key: "produto",
      header: "Produto",
      sortValue: (c) => c.produto_predominante || "",
      cell: (c) => (
        <div>
          <div className="font-medium text-foreground">{c.produto_predominante}</div>
          {c.sinonimos && <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{c.sinonimos}</div>}
        </div>
      ),
    },
    { key: "tipo", header: "Tipo", width: "140px", sortValue: (c) => c.tipo || "", cell: (c) => <span className="text-muted-foreground">{c.tipo || "—"}</span> },
    { key: "ncm", header: "NCM", width: "110px", sortValue: (c) => c.ncm || "", cell: (c) => <span className="tabular-nums text-muted-foreground">{c.ncm || "—"}</span> },
    {
      key: "status",
      header: "Status",
      width: "90px",
      align: "center",
      sortValue: (c) => (c.ativo ? "1" : "0"),
      cell: (c) => c.ativo
        ? <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">Ativo</Badge>
        : <Badge variant="secondary" className="text-[10px]">Inativo</Badge>,
    },
  ];

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-3">
        <BackButton to="/admin" label="Dashboard" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Natureza de Cargas</h1>
          <p className="text-xs text-muted-foreground">Cadastro de produtos e naturezas utilizadas na emissão de documentos.</p>
        </div>

        <GlobalToolbar actions={actions} selectedCount={selected.size}>
          <div className="relative w-full md:w-64 basis-full md:basis-auto shrink-0 order-last">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição, tipo, NCM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </GlobalToolbar>

        <DataGrid
          rows={filtered}
          columns={columns}
          rowId={(c) => c.id}
          selected={selected}
          onSelectedChange={setSelected}
          loading={loading}
          minWidth={720}
          rowClassName={(c) => rowToneClass(c.ativo ? "resolved" : "pending")}
          emptyMessage='Nenhuma natureza cadastrada. Clique em "Nova Natureza" para começar.'
          footer={<div className="text-[11px] text-muted-foreground">{filtered.length} registro(s)</div>}
        />

        <StatusLegend className="px-1" items={[{ tone: "resolved", label: "Ativo" }, { tone: "pending", label: "Inativo" }]} />
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
