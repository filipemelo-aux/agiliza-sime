import { useState, useEffect, useMemo } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Wrench, Car, DollarSign, Eye, FileText, Loader2, Trash2, CalendarIcon, X, Plus, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "@/lib/masks";
import { toast } from "sonner";
import { MaintenanceFormDialog } from "@/components/maintenance/MaintenanceFormDialog";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";



interface Maintenance {
  id: string;
  veiculo_id: string;
  expense_id: string | null;
  nfse_expense_id: string | null;
  data_manutencao: string;
  odometro: number;
  tipo_manutencao: string;
  descricao: string;
  custo_total: number;
  fornecedor: string | null;
  status: string;
  proxima_manutencao_km: number | null;
  data_proxima_manutencao: string | null;
  created_at: string;
}

interface Vehicle { id: string; plate: string; brand: string; model: string; }

interface ExpenseDetail {
  id: string;
  descricao: string;
  valor_total: number;
  data_emissao: string;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  favorecido_nome: string | null;
  status: string;
  forma_pagamento: string | null;
  fornecedor_cnpj: string | null;
}

interface MaintenanceItemDetail {
  id: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo: string;
}

interface InstallmentDetail {
  id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  realizada: { label: "Realizada", variant: "default" },
  pendente: { label: "Pendente", variant: "secondary" },
};

export default function AdminMaintenances() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVeiculo, setFilterVeiculo] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterPeriodoInicio, setFilterPeriodoInicio] = useState<Date | undefined>();
  const [filterPeriodoFim, setFilterPeriodoFim] = useState<Date | undefined>();

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMaint, setDetailMaint] = useState<Maintenance | null>(null);
  const [nfeExpense, setNfeExpense] = useState<ExpenseDetail | null>(null);
  const [nfseExpense, setNfseExpense] = useState<ExpenseDetail | null>(null);
  const [maintItems, setMaintItems] = useState<MaintenanceItemDetail[]>([]);
  const [nfeInstallments, setNfeInstallments] = useState<InstallmentDetail[]>([]);
  const [nfseInstallments, setNfseInstallments] = useState<InstallmentDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const handleDelete = async (withExpenses: boolean) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (withExpenses) {
        const expenseIds = [deleteTarget.expense_id, deleteTarget.nfse_expense_id].filter(Boolean) as string[];
        for (const eid of expenseIds) {
          // Delete related records first
          await supabase.from("expense_maintenance_items" as any).delete().eq("expense_id", eid);
          await supabase.from("expense_installments" as any).delete().eq("expense_id", eid);
          await supabase.from("expense_payments" as any).delete().eq("expense_id", eid);
          await supabase.from("expense_items").delete().eq("expense_id", eid);
          // Soft-delete the expense
          await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", eid);
        }
      }
      // Delete the maintenance record
      const { error } = await supabase.from("maintenances" as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;

      toast.success("Manutenção excluída com sucesso.");
      setDeleteTarget(null);
      setDetailOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const [{ data: mData }, { data: vData }] = await Promise.all([
      supabase.from("maintenances" as any).select("*").order("data_manutencao", { ascending: false }),
      supabase.from("vehicles").select("id, plate, brand, model, fleet_type").eq("is_active", true).eq("fleet_type", "propria"),
    ]);
    setItems((mData as any) || []);
    setVehicles((vData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const vehicleMap = useMemo(() => {
    const m: Record<string, Vehicle> = {};
    vehicles.forEach(v => { m[v.id] = v; });
    return m;
  }, [vehicles]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      const v = vehicleMap[i.veiculo_id];
      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (v?.plate || "").toLowerCase().includes(search.toLowerCase()) ||
        (i.fornecedor || "").toLowerCase().includes(search.toLowerCase());
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchTipo = filterTipo === "all" || i.tipo_manutencao === filterTipo;
      const dateRef = i.data_manutencao;
      const matchPeriodoInicio = !filterPeriodoInicio || dateRef >= format(filterPeriodoInicio, "yyyy-MM-dd");
      const matchPeriodoFim = !filterPeriodoFim || dateRef <= format(filterPeriodoFim, "yyyy-MM-dd");
      return matchSearch && matchVeiculo && matchTipo && matchPeriodoInicio && matchPeriodoFim;
    });
  }, [items, search, filterVeiculo, filterTipo, vehicleMap, filterPeriodoInicio, filterPeriodoFim]);

  const totalCusto = filtered.reduce((s, i) => s + Number(i.custo_total), 0);

  const openDetail = async (maint: Maintenance) => {
    setDetailMaint(maint);
    setDetailOpen(true);
    setDetailLoading(true);
    setNfeExpense(null);
    setNfseExpense(null);
    setMaintItems([]);
    setNfeInstallments([]);
    setNfseInstallments([]);

    const promises: Promise<any>[] = [];

    // Fetch NFe expense + items + installments
    if (maint.expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", maint.expense_id).maybeSingle(),
          supabase.from("expense_maintenance_items" as any).select("*").eq("expense_id", maint.expense_id),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", maint.expense_id).order("numero_parcela"),
        ]).then(([{ data: nfe }, { data: items }, { data: inst }]) => {
          setNfeExpense(nfe as any);
          setMaintItems((items as any) || []);
          setNfeInstallments((inst as any) || []);
        })
      );
    }

    // Fetch NFSe expense + installments
    if (maint.nfse_expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", maint.nfse_expense_id).maybeSingle(),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", maint.nfse_expense_id).order("numero_parcela"),
        ]).then(([{ data: nfse }, { data: inst }]) => {
          setNfseExpense(nfse as any);
          setNfseInstallments((inst as any) || []);
        })
      );
    }

    await Promise.all(promises);
    setDetailLoading(false);
  };

  // Find NFSe date for display on card
  const getNfseInfo = (maint: Maintenance) => {
    return maint.nfse_expense_id ? true : false;
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedMaints = filtered.filter(m => selectedIds.has(m.id));
  const singleMaint = selectedMaints.length === 1 ? selectedMaints[0] : null;

  const maintColumns: DataGridColumn<Maintenance>[] = [
    {
      key: "placa", header: "Veículo", width: "140px",
      sortValue: (m) => vehicleMap[m.veiculo_id]?.plate || "",
      cell: (m) => {
        const v = vehicleMap[m.veiculo_id];
        return (
          <div className="min-w-0">
            <p className="font-semibold">{v?.plate || "—"}</p>
            {v && <p className="text-[10px] text-muted-foreground truncate">{v.brand} {v.model}</p>}
          </div>
        );
      },
    },
    {
      key: "data", header: "Data", width: "100px",
      sortValue: (m) => m.data_manutencao,
      cell: (m) => <span className="tabular-nums">{format(new Date(m.data_manutencao + "T12:00:00"), "dd/MM/yyyy")}</span>,
    },
    {
      key: "tipo", header: "Tipo", width: "100px", align: "center",
      sortValue: (m) => m.tipo_manutencao,
      cell: (m) => (
        <Badge variant="outline" className="text-[10px]">
          {m.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}
        </Badge>
      ),
    },
    {
      key: "descricao", header: "Descrição",
      sortValue: (m) => m.descricao || "",
      cell: (m) => <span className="truncate block">{m.descricao}</span>,
    },
    {
      key: "fornecedor", header: "Fornecedor", width: "180px",
      sortValue: (m) => m.fornecedor || "",
      cell: (m) => <span className="truncate block text-muted-foreground">{m.fornecedor || "—"}</span>,
    },
    {
      key: "docs", header: "Docs", width: "100px", align: "center",
      sortValue: (m) => `${m.expense_id ? "1" : "0"}${m.nfse_expense_id ? "1" : "0"}`,
      cell: (m) => (
        <span className="inline-flex gap-1">
          {m.expense_id && <Badge variant="outline" className="text-[9px]">NFe</Badge>}
          {getNfseInfo(m) && <Badge variant="secondary" className="text-[9px]">NFSe</Badge>}
        </span>
      ),
    },
    {
      key: "km", header: "KM", width: "100px", align: "right",
      sortValue: (m) => Number(m.odometro),
      cell: (m) => <span className="font-mono">{Number(m.odometro).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "custo", header: "Custo", width: "120px", align: "right",
      sortValue: (m) => Number(m.custo_total),
      cell: (m) => <span className="font-mono font-semibold">{formatCurrency(Number(m.custo_total))}</span>,
    },
    {
      key: "status", header: "Status", width: "100px", align: "center",
      sortValue: (m) => m.status,
      cell: (m) => (
        <Badge variant={STATUS_MAP[m.status]?.variant || "outline"} className="text-[10px]">
          {STATUS_MAP[m.status]?.label || m.status}
        </Badge>
      ),
    },
  ];

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">Manutenções</h1>
        </div>


        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SummaryCard icon={Wrench} label="Total Registros" value={filtered.length} />
          <SummaryCard icon={DollarSign} label="Custo Total" value={formatCurrency(totalCusto)} valueColor="red" />
          <SummaryCard icon={Car} label="Veículos Atendidos" value={new Set(filtered.map(i => i.veiculo_id)).size} className="hidden md:flex" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar descrição, placa, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filterVeiculo} onValueChange={setFilterVeiculo}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="corretiva">Corretiva</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs font-normal", filterPeriodoInicio && "text-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {filterPeriodoInicio ? format(filterPeriodoInicio, "dd/MM/yy") : "De"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterPeriodoInicio} onSelect={setFilterPeriodoInicio} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-9 gap-1.5 text-xs font-normal", filterPeriodoFim && "text-foreground")}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {filterPeriodoFim ? format(filterPeriodoFim, "dd/MM/yy") : "Até"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={filterPeriodoFim} onSelect={setFilterPeriodoFim} locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          {(filterPeriodoInicio || filterPeriodoFim) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => { setFilterPeriodoInicio(undefined); setFilterPeriodoFim(undefined); }} title="Limpar período">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <GlobalToolbar
          actions={[
            { key: "new", label: "Nova Manutenção", icon: Plus, mode: "create", variant: "default", onClick: () => { setEditId(null); setFormOpen(true); } },
            { key: "payables", label: "Via Contas a Pagar", icon: FileText, mode: "always", variant: "outline", onClick: () => navigate("/admin/financial/payables") },
            {
              key: "detail", label: "Detalhes", icon: Eye, mode: "single",
              disabled: !singleMaint,
              onClick: () => singleMaint && openDetail(singleMaint),
            },
            {
              key: "edit", label: "Editar", icon: Pencil, mode: "single",
              disabled: !singleMaint,
              onClick: () => { if (singleMaint) { setEditId(singleMaint.id); setFormOpen(true); } },
            },
            {
              key: "delete", label: "Excluir", icon: Trash2, mode: "single", variant: "destructive",
              disabled: !singleMaint,
              onClick: () => singleMaint && setDeleteTarget(singleMaint),
            },
          ]}
          selectedCount={selectedIds.size}
        />

        <DataGrid
          rows={filtered}
          columns={maintColumns}
          rowId={(m) => m.id}
          selected={selectedIds}
          rowClassName={(m) => rowToneClass(m.status === "realizada" ? "resolved" : "pending")}
          onSelectedChange={setSelectedIds}
          loading={loading}
          minWidth={1040}
          emptyMessage="Nenhuma manutenção encontrada"
        />

        <StatusLegend className="px-1" items={[{ tone: "pending", label: "Pendente" }, { tone: "resolved", label: "Realizada" }]} />


        {/* Detail Dialog */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 shrink-0" /> Detalhes da Manutenção
              </DialogTitle>
            </DialogHeader>

            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : detailMaint && (
              <div className="space-y-4 min-w-0">
                {/* Vehicle + General Info */}
                <Card>
                  <CardContent className="p-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-semibold text-foreground truncate">
                        {vehicleMap[detailMaint.veiculo_id]?.plate || "—"} — {vehicleMap[detailMaint.veiculo_id]?.brand} {vehicleMap[detailMaint.veiculo_id]?.model}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium text-foreground">{detailMaint.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}</span></div>
                      <div><span className="text-muted-foreground">Data:</span> <span className="font-medium text-foreground">{format(new Date(detailMaint.data_manutencao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                      <div><span className="text-muted-foreground">KM:</span> <span className="font-mono font-medium text-foreground">{Number(detailMaint.odometro).toLocaleString("pt-BR")}</span></div>
                      <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(detailMaint.custo_total))}</span></div>
                      {nfseExpense?.favorecido_nome && <div className="col-span-2 truncate"><span className="text-muted-foreground">Oficina:</span> <span className="text-foreground">{nfseExpense.favorecido_nome}</span></div>}
                      {nfeExpense?.favorecido_nome && <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor Peças:</span> <span className="text-foreground">{nfeExpense.favorecido_nome}</span></div>}
                      {!nfseExpense && !nfeExpense && detailMaint.fornecedor && <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{detailMaint.fornecedor}</span></div>}
                      {detailMaint.proxima_manutencao_km && <div><span className="text-muted-foreground">Próx. KM:</span> <span className="font-mono text-foreground">{Number(detailMaint.proxima_manutencao_km).toLocaleString("pt-BR")}</span></div>}
                      {detailMaint.data_proxima_manutencao && <div><span className="text-muted-foreground">Próx. Data:</span> <span className="text-foreground">{format(new Date(detailMaint.data_proxima_manutencao + "T12:00:00"), "dd/MM/yyyy")}</span></div>}
                    </div>
                  </CardContent>
                </Card>

                {/* NFe (Peças) */}
                {nfeExpense && (
                  <Card>
                    <CardContent className="p-3 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-xs text-foreground truncate">NFe — Peças / Materiais</span>
                        <Badge variant={nfeExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                          {nfeExpense.status === "pago" ? "Pago" : nfeExpense.status === "pendente" ? "Pendente" : nfeExpense.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="truncate"><span className="text-muted-foreground">Nº Doc:</span> <span className="text-foreground">{nfeExpense.documento_fiscal_numero || "—"}</span></div>
                        <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{format(new Date(nfeExpense.data_emissao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                        <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{nfeExpense.favorecido_nome || "—"}</span></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> {formatCurrency(Number(nfeExpense.valor_total))}</span></div>
                      </div>

                      {/* Itens de peças */}
                      {maintItems.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Itens ({maintItems.length})</p>
                          <div className="border rounded-md divide-y max-h-[150px] overflow-y-auto">
                            {maintItems.map((mi) => (
                              <div key={mi.id} className="flex items-center gap-1 p-2 text-xs min-w-0">
                                <span className="text-foreground truncate flex-1 min-w-0">{mi.descricao}</span>
                                <span className="text-muted-foreground shrink-0">{mi.quantidade}x</span>
                                <span className="font-mono text-foreground shrink-0">{formatCurrency(Number(mi.valor_total))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* NFSe (Serviço) */}
                {nfseExpense && (
                  <Card>
                    <CardContent className="p-3 space-y-2 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-accent-foreground shrink-0" />
                        <span className="font-semibold text-xs text-foreground truncate">NFSe — Serviço / OS</span>
                        <Badge variant={nfseExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                          {nfseExpense.status === "pago" ? "Pago" : nfseExpense.status === "pendente" ? "Pendente" : nfseExpense.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="truncate"><span className="text-muted-foreground">Nº NFSe:</span> <span className="text-foreground">{nfseExpense.documento_fiscal_numero || "—"}</span></div>
                        <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{format(new Date(nfseExpense.data_emissao + "T12:00:00"), "dd/MM/yyyy")}</span></div>
                        <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{nfseExpense.favorecido_nome || "—"}</span></div>
                        <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> {formatCurrency(Number(nfseExpense.valor_total))}</span></div>
                      </div>
                      <p className="text-xs text-muted-foreground break-words">{nfseExpense.descricao}</p>
                    </CardContent>
                  </Card>
                )}

                {/* Custo consolidado */}
                {nfeExpense && nfseExpense && (
                  <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Resumo Consolidado</p>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">NFe (Peças):</span>
                      <span className="font-mono text-foreground">{formatCurrency(Number(nfeExpense.valor_total))}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">NFSe (Serviço):</span>
                      <span className="font-mono text-foreground">{formatCurrency(Number(nfseExpense.valor_total))}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
                      <span className="text-foreground">Total:</span>
                      <span className="font-mono text-foreground">{formatCurrency(Number(detailMaint.custo_total))}</span>
                    </div>
                  </div>
                )}

                {/* Installments */}
                {nfeExpense && (
                  <Card className="border border-border">
                    <CardContent className="p-3 space-y-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFe</p>
                      {nfeInstallments.length > 0 ? (
                        <div className="divide-y max-h-[120px] overflow-y-auto">
                          {nfeInstallments.map(inst => (
                            <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                              <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                              <span className="text-muted-foreground truncate">{format(new Date(inst.data_vencimento + "T12:00:00"), "dd/MM/yy")}</span>
                              <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                              <span className="font-mono text-foreground shrink-0">{formatCurrency(Number(inst.valor))}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem parcelas</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {nfseExpense && (
                  <Card className="border border-border">
                    <CardContent className="p-3 space-y-1 min-w-0">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFSe</p>
                      {nfseInstallments.length > 0 ? (
                        <div className="divide-y max-h-[120px] overflow-y-auto">
                          {nfseInstallments.map(inst => (
                            <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                              <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                              <span className="text-muted-foreground truncate">{format(new Date(inst.data_vencimento + "T12:00:00"), "dd/MM/yy")}</span>
                              <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                              <span className="font-mono text-foreground shrink-0">{formatCurrency(Number(inst.valor))}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem parcelas</p>
                      )}
                    </CardContent>
                  </Card>
                )}
                {/* Action buttons */}
                <div className="pt-2 border-t border-border flex justify-end gap-2">
                  {!detailMaint.expense_id && !detailMaint.nfse_expense_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setEditId(detailMaint.id);
                        setDetailOpen(false);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setDeleteTarget(detailMaint)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir Manutenção
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent className="max-w-[95vw] sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base">Excluir manutenção</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Deseja excluir este registro de manutenção?</p>
                  {deleteTarget && (deleteTarget.expense_id || deleteTarget.nfse_expense_id) && (
                    <p className="text-muted-foreground">
                      Esta manutenção possui {[deleteTarget.expense_id, deleteTarget.nfse_expense_id].filter(Boolean).length} despesa(s) vinculada(s).
                      Você pode removê-las junto ou manter as despesas no financeiro.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              {deleteTarget && (deleteTarget.expense_id || deleteTarget.nfse_expense_id) && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={() => handleDelete(true)}
                  className="w-full sm:w-auto text-xs"
                >
                  {deleting ? "Excluindo..." : "Excluir tudo"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={deleting}
                onClick={() => handleDelete(false)}
                className="w-full sm:w-auto border-destructive text-destructive hover:bg-destructive/10 text-xs"
              >
                {deleting ? "Excluindo..." : "Só a manutenção"}
              </Button>
              <AlertDialogCancel disabled={deleting} className="w-full sm:w-auto mt-0">Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <MaintenanceFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editId={editId}
          onSaved={() => { fetchData(); setEditId(null); }}
        />
      </div>
    </AdminLayout>
  );
}
