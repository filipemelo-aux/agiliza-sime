import { useState, useEffect } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, DollarSign, Search, Loader2, Fuel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { format } from "date-fns";
import { FuelingFormDialog } from "@/components/fueling/FuelingFormDialog";
import { GeneratePayablesDialog } from "@/components/fueling/GeneratePayablesDialog";
import { formatCurrency } from "@/lib/masks";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";


const FUEL_LABELS: Record<string, string> = {
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
  gasolina: "Gasolina",
  etanol: "Etanol",
  arla32: "Arla 32",
};

const STATUS_FAT: Record<string, { label: string; variant: "default" | "outline" }> = {
  nao_faturado: { label: "Não Faturado", variant: "outline" },
  faturado: { label: "Faturado", variant: "default" },
};

export default function AdminFuelings() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { user } = useUserRole();
  const [items, setItems] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").eq("type", "matriz").limit(1).maybeSingle();
    const eid = estab?.id || "";
    setEmpresaId(eid);

    const [{ data: fData }, { data: vData }] = await Promise.all([
      supabase.from("fuelings").select("*").is("deleted_at", null).order("data_abastecimento", { ascending: false }),
      supabase.from("vehicles").select("id, plate"),
    ]);

    setItems((fData as any) || []);
    const vMap = new Map<string, string>();
    (vData || []).forEach((v: any) => vMap.set(v.id, v.plate));
    setVehicles(vMap);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (item: any) => {
    if (!await confirm({ title: "Excluir abastecimento", description: "Excluir este abastecimento?", variant: "destructive", confirmLabel: "Excluir" })) return;
    const { error } = await supabase.from("fuelings").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    fetchData();
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const unfatured = filtered.filter(i => i.status_faturamento === "nao_faturado");
    if (selected.size === unfatured.length && unfatured.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unfatured.map(i => i.id)));
    }
  };

  const filtered = items.filter(i => {
    const matchSearch = !search ||
      (vehicles.get(i.veiculo_id) || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.posto_combustivel || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status_faturamento === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalValue = filtered.reduce((s, i) => s + Number(i.valor_total), 0);
  const totalLiters = filtered.reduce((s, i) => s + Number(i.quantidade_litros), 0);
  const selectableItems = filtered.filter(i => i.status_faturamento === "nao_faturado");

  const selectedFuelings = items.filter(i => selected.has(i.id)).map(i => ({
    ...i,
    vehicle_plate: vehicles.get(i.veiculo_id) || "",
  }));

  const selectedRows = filtered.filter(i => selected.has(i.id));
  const single = selectedRows.length === 1 ? selectedRows[0] : null;

  const columns: DataGridColumn<any>[] = [
    {
      key: "placa", header: "Placa", width: "100px",
      sortValue: (i) => vehicles.get(i.veiculo_id) || "",
      cell: (i) => <span className="font-semibold">{vehicles.get(i.veiculo_id) || "—"}</span>,
    },
    {
      key: "data", header: "Data", width: "110px",
      sortValue: (i) => i.data_abastecimento,
      cell: (i) => <span className="tabular-nums">{format(new Date(i.data_abastecimento + "T12:00:00"), "dd/MM/yyyy")}</span>,
    },
    {
      key: "combustivel", header: "Combustível", width: "120px",
      sortValue: (i) => FUEL_LABELS[i.tipo_combustivel] || i.tipo_combustivel,
      cell: (i) => FUEL_LABELS[i.tipo_combustivel] || i.tipo_combustivel,
    },
    {
      key: "posto", header: "Posto",
      sortValue: (i) => i.posto_combustivel || "",
      cell: (i) => <span className="truncate block max-w-[260px] text-muted-foreground">{i.posto_combustivel || "—"}</span>,
    },
    {
      key: "litros", header: "Litros", width: "100px", align: "right",
      sortValue: (i) => Number(i.quantidade_litros),
      cell: (i) => <span className="font-mono">{Number(i.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</span>,
    },
    {
      key: "rs_l", header: "R$/L", width: "90px", align: "right",
      sortValue: (i) => Number(i.valor_por_litro),
      cell: (i) => <span className="font-mono">{Number(i.valor_por_litro).toLocaleString("pt-BR", { minimumFractionDigits: 3 })}</span>,
    },
    {
      key: "total", header: "Valor", width: "120px", align: "right",
      sortValue: (i) => Number(i.valor_total),
      cell: (i) => <span className="font-mono font-semibold">{formatCurrency(Number(i.valor_total))}</span>,
    },
    {
      key: "status", header: "Status", width: "120px", align: "center",
      sortValue: (i) => i.status_faturamento,
      cell: (i) => (
        <Badge variant={STATUS_FAT[i.status_faturamento]?.variant || "outline"} className="text-[10px]">
          {STATUS_FAT[i.status_faturamento]?.label || i.status_faturamento}
        </Badge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Abastecimentos</h1>
          <p className="text-sm text-muted-foreground">Registre abastecimentos e gere contas a pagar</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={Fuel} label="Registros" value={filtered.length} />
          <SummaryCard icon={Fuel} label="Total Litros" value={`${totalLiters.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L`} />
          <SummaryCard icon={DollarSign} label="Valor Total" value={formatCurrency(totalValue)} valueColor="primary" />
          <SummaryCard icon={Fuel} label="Selecionados" value={selected.size} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar placa, posto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="nao_faturado">Não Faturado</SelectItem>
              <SelectItem value="faturado">Faturado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <GlobalToolbar
          actions={[
            { key: "new", label: "Novo", icon: Plus, mode: "always", variant: "default", onClick: () => { setEditing(null); setFormOpen(true); } },
            {
              key: "edit", label: "Editar", icon: Pencil, mode: "single",
              disabled: !single,
              onClick: () => { if (single) { setEditing(single); setFormOpen(true); } },
            },
            {
              key: "pay", label: "Gerar Conta(s) a Pagar", icon: DollarSign, mode: "single+batch",
              disabled: selectedFuelings.length === 0 || selectedFuelings.some(f => f.status_faturamento === "faturado"),
              onClick: () => setGenerateOpen(true),
            },
            {
              key: "delete", label: "Excluir", icon: Trash2, mode: "single", variant: "destructive",
              disabled: !single || single.status_faturamento === "faturado",
              onClick: () => single && handleDelete(single),
            },
          ]}
          selectedCount={selected.size}
        >
          {selected.size > 0 && (
            <span className="text-[11px] font-mono text-primary">
              {formatCurrency(selectedFuelings.reduce((s, f) => s + Number(f.valor_total), 0))}
            </span>
          )}
        </GlobalToolbar>

        <DataGrid
          rows={filtered}
          columns={columns}
          rowId={(i) => i.id}
          selected={selected}
          rowClassName={(i) => rowToneClass(i.status_faturamento === "faturado" ? "resolved" : "pending")}
          onSelectedChange={setSelected}
          loading={loading}
          minWidth={1020}
          emptyMessage="Nenhum abastecimento encontrado"
        />

        <StatusLegend className="px-1" items={[{ tone: "pending", label: "Não faturado" }, { tone: "resolved", label: "Faturado" }]} />


        <FuelingFormDialog open={formOpen} onOpenChange={setFormOpen} empresaId={empresaId} userId={user?.id || ""} fueling={editing} onSaved={fetchData} />
        {generateOpen && (
          <GeneratePayablesDialog open={generateOpen} onOpenChange={setGenerateOpen} selectedFuelings={selectedFuelings} empresaId={empresaId} userId={user?.id || ""} onGenerated={fetchData} />
        )}
      </div>
      {ConfirmDialog}
    </AdminLayout>
  );
}
