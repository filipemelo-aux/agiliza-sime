import { PageTitle } from "@/components/PageTitle";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Search, FileDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { formatDateBR } from "@/lib/date";
import { MdfeFormDialog } from "@/components/freight/MdfeFormDialog";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { buildMdfeHtml } from "@/components/freight/mdfePrint";
import { downloadHtmlAsPdf } from "@/lib/htmlToPdf";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", autorizado: "Autorizado", encerrado: "Encerrado", cancelado: "Cancelado", rejeitado: "Rejeitado", processando: "Processando",
};

export default function FreightMdfe() {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [initialCteIds, setInitialCteIds] = useState<string[] | undefined>();
  const [printing, setPrinting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("mdfe").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Abertura vinda do CT-e (?ctes=id1,id2)
  useEffect(() => {
    const ids = params.get("ctes");
    if (ids) {
      setEditing(null);
      setInitialCteIds(ids.split(",").filter(Boolean));
      setFormOpen(true);
      params.delete("ctes");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!s) return rows;
    return rows.filter((r) => [r.numero, r.placa_veiculo, r.motorista_nome, r.municipio_carregamento_nome, r.municipio_descarregamento_nome]
      .some((v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(s)));
  }, [rows, search]);

  const single = selected.size === 1 ? rows.find((r) => selected.has(r.id)) : null;
  const editable = single && ["rascunho", "rejeitado"].includes(single.status);

  const handleDelete = async () => {
    const ids = [...selected].filter((id) => ["rascunho", "rejeitado"].includes(rows.find((r) => r.id === id)?.status));
    if (!ids.length) return toast({ title: "Só é possível excluir rascunhos ou rejeitados", variant: "destructive" });
    const ok = await confirm({ title: "Excluir manifesto(s)?", description: `${ids.length} manifesto(s) serão excluídos.` });
    if (!ok) return;
    const { error } = await supabase.from("mdfe").delete().in("id", ids);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    setSelected(new Set());
    load();
  };

  const handlePrint = async () => {
    if (!single) return;
    setPrinting(true);
    try {
      const html = await buildMdfeHtml(single);
      await downloadHtmlAsPdf(html, `DAMDFE-${single.numero || single.id.slice(0, 8)}.pdf`);
    } catch (error) {
      toast({ title: "Erro ao gerar DAMDFE", description: error instanceof Error ? error.message : "Não foi possível gerar o PDF.", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const columns: DataGridColumn<any>[] = [
    { key: "numero", header: "Nº", width: "60px", sortValue: (r) => r.numero ?? 0, cell: (r) => r.numero ?? "—" },
    { key: "emissao", header: "Emissão", width: "90px", sortValue: (r) => r.data_emissao || "", cell: (r) => formatDateBR(r.data_emissao) },
    { key: "rota", header: "Percurso", cell: (r) => `${r.municipio_carregamento_nome || ""}/${r.uf_carregamento || ""} → ${r.municipio_descarregamento_nome || ""}/${r.uf_descarregamento || ""}` },
    { key: "placa", header: "Placa", width: "90px", cell: (r) => r.placa_veiculo },
    { key: "motorista", header: "Motorista", cell: (r) => r.motorista_nome || "—" },
    { key: "ctes", header: "CT-es", width: "60px", cell: (r) => (r.lista_ctes || []).length },
    { key: "peso", header: "Peso (kg)", width: "100px", sortValue: (r) => Number(r.peso_total || 0), cell: (r) => Number(r.peso_total || 0).toLocaleString("pt-BR") },
    { key: "status", header: "Situação", width: "100px", sortValue: (r) => r.status, cell: (r) => STATUS_LABEL[r.status] || r.status },
  ] as any;

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-3 space-y-3">
        <PageTitle>MDF-e — Manifestos de Carga</PageTitle>
        <SearchFilterCard>
          <FilterField label="Busca" className="min-w-[260px] flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="h-8 pl-8 text-xs" placeholder="Buscar por número, placa, motorista ou cidade..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </FilterField>
        </SearchFilterCard>
        <GlobalToolbar
          actions={[
            { key: "new", label: "Novo MDF-e", icon: Plus, mode: "create", variant: "default", onClick: () => { setEditing(null); setInitialCteIds(undefined); setFormOpen(true); } },
            { key: "edit", label: "Editar", icon: Pencil, mode: "single", disabled: !editable, onClick: () => { setEditing(single); setFormOpen(true); } },
            { key: "print", label: printing ? "Gerando PDF" : "Baixar DAMDFE", icon: printing ? Loader2 : FileDown, mode: "single", disabled: !single || printing, onClick: handlePrint },
            { key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", disabled: selected.size === 0, onClick: handleDelete },
          ] as any}
          selectedCount={selected.size}
        />
        <div>
          <DataGrid
            rows={filtered}
            columns={columns}
            rowId={(r) => r.id}
            selected={selected}
            onSelectedChange={setSelected}
            loading={loading}
            minWidth={860}
            rowClassName={(r) => rowToneClass(["autorizado", "encerrado"].includes(r.status) ? "resolved" : ["cancelado", "rejeitado"].includes(r.status) ? "overdue" : "pending")}
            emptyMessage='Nenhum manifesto. Clique em "Novo MDF-e" ou gere a partir da tela de CT-e.'
          />
        </div>
        <StatusLegend />
      </div>
      <MdfeFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} initialCteIds={initialCteIds} onSaved={load} />
      {ConfirmDialog}
    </AdminLayout>
  );
}
