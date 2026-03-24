import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Check, Search, Trash2, FileText, Filter, CalendarClock, AlertTriangle, CheckCircle2, Clock, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog } from "./PaymentDischargeDialog";

interface Installment {
  id: string;
  expense_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
  created_at: string;
}

interface Expense {
  id: string;
  descricao: string;
  plano_contas_id: string | null;
  centro_custo: string;
  valor_total: number;
  valor_pago: number;
  data_emissao: string;
  data_vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  observacoes: string | null;
  veiculo_placa: string | null;
  veiculo_id: string | null;
  litros: number | null;
  km_odometro: number | null;
  numero_multa: string | null;
  origem: string;
  created_at: string;
  documento_fiscal_importado?: boolean;
  xml_original?: string | null;
  fornecedor_cnpj?: string | null;
}

interface ChartAccount { id: string; codigo: string; nome: string; tipo: string; conta_pai_id: string | null; nivel: number; tipo_operacional?: string | null; }
interface Vehicle { id: string; plate: string; }

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  parcial: { label: "Parcial", variant: "secondary" },
};

const CENTRO_CUSTO_MAP: Record<string, string> = {
  frota_propria: "Frota Própria",
  frota_terceiros: "Frota Terceiros",
  administrativo: "Administrativo",
  operacional: "Operacional",
};

type QuickFilter = "all" | "hoje" | "vencendo" | "atrasadas" | "pagas";

export function FinancialPayables() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Expense[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [filterPlanoContas, setFilterPlanoContas] = useState("all");
  const [filterNivel, setFilterNivel] = useState("all");
  const [filterVeiculo, setFilterVeiculo] = useState("all");
  const [filterCentroCusto, setFilterCentroCusto] = useState("all");
  const [filterPeriodoInicio, setFilterPeriodoInicio] = useState("");
  const [filterPeriodoFim, setFilterPeriodoFim] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [installmentsMap, setInstallmentsMap] = useState<Record<string, Installment[]>>({});
  const [editInstallment, setEditInstallment] = useState<Installment | null>(null);
  const [editInstOpen, setEditInstOpen] = useState(false);
  const [editInstValor, setEditInstValor] = useState("");
  const [editInstVenc, setEditInstVenc] = useState("");
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const chartIdMap = useMemo(() => {
    const m: Record<string, ChartAccount> = {};
    chartAccounts.forEach(a => { m[a.id] = a; });
    return m;
  }, [chartAccounts]);

  const getChartPath = (chartId: string | null | undefined): string => {
    if (!chartId) return "";
    const parts: string[] = [];
    let current = chartIdMap[chartId];
    while (current) {
      parts.unshift(current.nome);
      current = current.conta_pai_id ? chartIdMap[current.conta_pai_id] : undefined;
    }
    return parts.join(" › ");
  };

  const getAncestorIds = (chartId: string): string[] => {
    const ids: string[] = [chartId];
    let current = chartIdMap[chartId];
    while (current?.conta_pai_id && chartIdMap[current.conta_pai_id]) {
      ids.push(current.conta_pai_id);
      current = chartIdMap[current.conta_pai_id];
    }
    return ids;
  };

  const uniqueLevels = useMemo(() => {
    const levels = [...new Set(chartAccounts.map(a => a.nivel))].sort();
    return levels;
  }, [chartAccounts]);

  const fetchData = async () => {
    setLoading(true);
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").limit(1).maybeSingle();
    setEmpresaId(estab?.id || "");

    const [{ data: expData }, { data: vehData }, { data: chartData }, { data: instData }] = await Promise.all([
      supabase.from("expenses").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id, plate").eq("is_active", true).eq("fleet_type", "propria"),
      supabase.from("chart_of_accounts").select("id, codigo, nome, conta_pai_id, nivel, tipo, tipo_operacional").eq("ativo", true).order("codigo"),
      supabase.from("expense_installments").select("*").order("numero_parcela"),
    ]);

    const today = new Date().toISOString().split("T")[0];
    const expenses = ((expData as any) || []) as Expense[];
    const overdueIds: string[] = [];
    const processed = expenses.map(e => {
      if (e.data_vencimento && e.data_vencimento < today && e.status === "pendente") {
        overdueIds.push(e.id);
        return { ...e, status: "atrasado" };
      }
      return e;
    });

    if (overdueIds.length > 0) {
      supabase.from("expenses").update({ status: "atrasado" } as any).in("id", overdueIds).then(() => {});
    }

    // Build installments map
    const iMap: Record<string, Installment[]> = {};
    ((instData as any) || []).forEach((inst: Installment) => {
      if (!iMap[inst.expense_id]) iMap[inst.expense_id] = [];
      iMap[inst.expense_id].push(inst);
    });
    setInstallmentsMap(iMap);

    setItems(processed);
    setChartAccounts((chartData as any) || []);
    setVehicles((vehData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (item: Expense) => { setEditingExpense(item); setFormOpen(true); };
  const handleNew = () => { setEditingExpense(null); setFormOpen(true); };

  const handleDelete = async (item: Expense) => {
    if (item.status === "pago") return toast.error("Contas pagas não podem ser excluídas. Use cancelamento.");
    const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
    const isMaintenance = chart?.tipo_operacional === "manutencao";

    if (isMaintenance) {
      const { data: linkedMaint } = await supabase
        .from("maintenances" as any)
        .select("id")
        .eq("expense_id", item.id)
        .maybeSingle();

      if (linkedMaint) {
        if (!confirm("Esta despesa possui um registro de manutenção vinculado.\nAo excluir, o registro de manutenção também será removido.\n\nDeseja continuar?")) return;
        await supabase.from("maintenances" as any).delete().eq("id", (linkedMaint as any).id);
        await supabase.from("expense_maintenance_items" as any).delete().eq("expense_id", item.id);
      } else {
        if (!confirm("Deseja excluir esta despesa?")) return;
      }
    } else {
      if (!confirm("Deseja excluir esta despesa?")) return;
    }

    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Despesa excluída");
    fetchData();
  };

  const handlePayment = (item: Expense) => { setPaymentExpense(item); setPaymentOpen(true); };

  const showExpenseDetail = (expenseId: string) => {
    const exp = items.find(i => i.id === expenseId);
    if (exp) { setDetailExpense(exp); setDetailOpen(true); }
  };

  const handlePayInstallment = async (inst: Installment) => {
    if (!confirm(`Confirma o pagamento da parcela ${inst.numero_parcela} — R$ ${Number(inst.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}?`)) return;
    const { error } = await supabase.from("expense_installments").update({ status: "pago" } as any).eq("id", inst.id);
    if (error) return toast.error(error.message);
    // Update expense valor_pago
    const expense = items.find(i => i.id === inst.expense_id);
    if (expense) {
      const newPago = Number(expense.valor_pago) + Number(inst.valor);
      const newStatus = newPago >= Number(expense.valor_total) ? "pago" : "parcial";
      await supabase.from("expenses").update({ valor_pago: newPago, status: newStatus, data_pagamento: new Date().toISOString() } as any).eq("id", inst.expense_id);
    }
    toast.success("Parcela quitada");
    fetchData();
  };

  const handleDeleteInstallment = async (inst: Installment) => {
    if (!confirm(`Excluir parcela ${inst.numero_parcela}?`)) return;
    const { error } = await supabase.from("expense_installments").delete().eq("id", inst.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela excluída");
    fetchData();
  };

  const openEditInstallment = (inst: Installment) => {
    setEditInstallment(inst);
    setEditInstValor(String(inst.valor));
    setEditInstVenc(inst.data_vencimento);
    setEditInstOpen(true);
  };

  const handleSaveInstallment = async () => {
    if (!editInstallment) return;
    const { error } = await supabase.from("expense_installments").update({
      valor: Number(editInstValor),
      data_vencimento: editInstVenc,
    } as any).eq("id", editInstallment.id);
    if (error) return toast.error(error.message);
    toast.success("Parcela atualizada");
    setEditInstOpen(false);
    fetchData();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBatchPay = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Confirma o pagamento de ${selectedIds.size} conta(s)?`)) return;
    setBatchPaying(true);
    const today = new Date().toISOString();
    for (const id of selectedIds) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      await supabase.from("expense_payments" as any).insert({
        expense_id: id,
        valor: Number(item.valor_total) - Number(item.valor_pago),
        forma_pagamento: "pix",
        created_by: (await supabase.auth.getUser()).data.user?.id,
      } as any);
      await supabase.from("expenses").update({
        valor_pago: item.valor_total,
        status: "pago",
        data_pagamento: today,
      } as any).eq("id", id);
    }
    toast.success(`${selectedIds.size} conta(s) quitada(s)`);
    setSelectedIds(new Set());
    setBatchPaying(false);
    fetchData();
  };

  const counts = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");
    return {
      all: items.length,
      hoje: items.filter(i => i.data_vencimento === today && i.status !== "pago").length,
      vencendo: items.filter(i => i.data_vencimento && i.data_vencimento >= today && i.data_vencimento <= in7days && i.status !== "pago").length,
      atrasadas: items.filter(i => i.status === "atrasado").length,
      pagas: items.filter(i => i.status === "pago").length,
    };
  }, [items]);

  const filtered = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    return items.filter(i => {
      if (quickFilter === "hoje") {
        if (!(i.data_vencimento === today && i.status !== "pago")) return false;
      } else if (quickFilter === "vencendo") {
        if (!(i.data_vencimento && i.data_vencimento >= today && i.data_vencimento <= in7days && i.status !== "pago")) return false;
      } else if (quickFilter === "atrasadas") {
        if (i.status !== "atrasado") return false;
      } else if (quickFilter === "pagas") {
        if (i.status !== "pago") return false;
      }

      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (i.favorecido_nome || "").toLowerCase().includes(search.toLowerCase()) ||
        (i.veiculo_placa || "").toLowerCase().includes(search.toLowerCase());
      const matchPlanoContas = filterPlanoContas === "all" || (i.plano_contas_id && getAncestorIds(i.plano_contas_id).includes(filterPlanoContas));
      const matchNivel = filterNivel === "all" || (i.plano_contas_id && chartIdMap[i.plano_contas_id]?.nivel === Number(filterNivel));
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchCentro = filterCentroCusto === "all" || i.centro_custo === filterCentroCusto;
      const matchPeriodo = (!filterPeriodoInicio || i.data_emissao >= filterPeriodoInicio) &&
        (!filterPeriodoFim || i.data_emissao <= filterPeriodoFim);
      return matchSearch && matchPlanoContas && matchNivel && matchVeiculo && matchCentro && matchPeriodo;
    });
  }, [items, search, quickFilter, filterPlanoContas, filterNivel, filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim, chartIdMap]);

  const selectableItems = useMemo(() => filtered.filter(i => i.status !== "pago"), [filtered]);

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableItems.length && selectableItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map(i => i.id)));
    }
  };

  const totalPendente = filtered.filter(i => i.status !== "pago").reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);
  const totalPago = filtered.reduce((s, i) => s + Number(i.valor_pago), 0);
  const totalAtrasado = filtered.filter(i => i.status === "atrasado").reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);
  const selectedTotal = filtered.filter(i => selectedIds.has(i.id)).reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);

  const quickFilterButtons: { key: QuickFilter; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "all", label: "Todas", icon: <Filter className="h-3.5 w-3.5" />, count: counts.all },
    { key: "hoje", label: "Hoje", icon: <Clock className="h-3.5 w-3.5" />, count: counts.hoje },
    { key: "vencendo", label: "Vencendo", icon: <CalendarClock className="h-3.5 w-3.5" />, count: counts.vencendo },
    { key: "atrasadas", label: "Atrasadas", icon: <AlertTriangle className="h-3.5 w-3.5" />, count: counts.atrasadas },
    { key: "pagas", label: "Pagas", icon: <CheckCircle2 className="h-3.5 w-3.5" />, count: counts.pagas },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-warning">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-xl font-bold text-foreground">R$ {totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pago</p>
            <p className="text-xl font-bold text-foreground">R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Atrasado</p>
            <p className="text-xl font-bold text-destructive">R$ {totalAtrasado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-xl font-bold text-foreground">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Filters + Actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {quickFilterButtons.map(f => (
            <Button
              key={f.key}
              variant={quickFilter === f.key ? "default" : "outline"}
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => setQuickFilter(f.key)}
            >
              {f.icon}
              {f.label}
              {f.count > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  quickFilter === f.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {f.count}
                </span>
              )}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={handleNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Despesa
        </Button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por descrição, favorecido ou placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={filterPlanoContas} onValueChange={setFilterPlanoContas}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Contas</SelectItem>
            {chartAccounts.map(a => (
              <SelectItem key={a.id} value={a.id}>
                <span className="font-mono text-[10px] mr-1">{a.codigo}</span> {a.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-9 text-xs gap-1" onClick={() => setShowAdvanced(!showAdvanced)}>
          <Filter className="h-3.5 w-3.5" />
          {showAdvanced ? "Menos filtros" : "Mais filtros"}
        </Button>
      </div>

      {showAdvanced && (
        <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
          <Select value={filterNivel} onValueChange={setFilterNivel}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Nível" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Níveis</SelectItem>
              {uniqueLevels.map(n => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterVeiculo} onValueChange={setFilterVeiculo}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCentroCusto} onValueChange={setFilterCentroCusto}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Centro Custo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Centros</SelectItem>
              {Object.entries(CENTRO_CUSTO_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Período:</span>
            <Input type="date" value={filterPeriodoInicio} onChange={e => setFilterPeriodoInicio(e.target.value)} className="w-[130px] h-9" />
            <span className="text-xs text-muted-foreground">a</span>
            <Input type="date" value={filterPeriodoFim} onChange={e => setFilterPeriodoFim(e.target.value)} className="w-[130px] h-9" />
          </div>
        </div>
      )}

      {/* Batch actions bar */}
      {selectableItems.length > 0 && (
        <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 border">
          <Checkbox
            checked={selectedIds.size === selectableItems.length && selectableItems.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selecionada(s) — R$ ${selectedTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              : "Selecionar todas"}
          </span>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              className="ml-auto gap-1.5 h-8 bg-success text-success-foreground hover:bg-success/90"
              onClick={handleBatchPay}
              disabled={batchPaying}
            >
              <Check className="h-3.5 w-3.5" />
              {batchPaying ? "Processando..." : `Pagar ${selectedIds.size} conta(s)`}
            </Button>
          )}
        </div>
      )}

      {/* Cards List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground text-sm">Nenhuma despesa encontrada</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={handleNew}>Criar primeira despesa</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.flatMap(item => {
            const installs = installmentsMap[item.id];
            const hasInstallments = installs && installs.length > 0;
            const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
            const isMaintenance = chart?.tipo_operacional === "manutencao";
            const descDisplay = item.documento_fiscal_numero
              ? `NFSe ${item.documento_fiscal_numero}`
              : item.descricao || "Serviço";

            // If expense has installments, render each installment as its own card
            if (hasInstallments) {
              return installs.map(inst => {
                const today = new Date().toISOString().split("T")[0];
                const isInstOverdue = inst.data_vencimento < today && inst.status !== "pago";
                const isInstPago = inst.status === "pago";
                const instStatus = isInstOverdue ? "atrasado" : inst.status;

                return (
                  <Card
                    key={`inst-${inst.id}`}
                    className={`relative transition-all ${isInstOverdue ? "border-destructive/40" : ""}`}
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {item.favorecido_nome || "Sem favorecido"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.documento_fiscal_importado && <FileText className="h-3 w-3 text-primary shrink-0" />}
                            <span className="text-xs text-muted-foreground truncate">{descDisplay}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="secondary" className="text-[10px]">
                            P{inst.numero_parcela}/{installs.length}
                          </Badge>
                          <Badge variant={STATUS_MAP[instStatus]?.variant || "outline"} className="text-[10px]">
                            {STATUS_MAP[instStatus]?.label || inst.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-muted-foreground">Valor Parcela</span>
                          <p className="font-mono font-semibold text-foreground">
                            R$ {Number(inst.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vencimento</span>
                          <p className={`font-medium ${isInstOverdue ? "text-destructive" : "text-foreground"}`}>
                            {format(new Date(inst.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}
                          </p>
                        </div>
                        {chart && (
                          <div className="col-span-2 mt-1">
                            <span className="text-muted-foreground">Conta Contábil</span>
                            <p className="text-[11px] text-foreground truncate">
                              <span className="font-mono mr-1">{chart.codigo}</span>
                              {chart.nome}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 pt-1 border-t border-border">
                        {isMaintenance && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver manutenção" onClick={() => navigate("/admin/maintenances")}>
                            <Wrench className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        )}
                        {!isInstPago && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
                            onClick={() => handlePayInstallment(inst)}
                          >
                            <Check className="h-3.5 w-3.5" /> Pagar
                          </Button>
                        )}
                        <div className="ml-auto flex gap-0.5">
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => showExpenseDetail(item.id)}>
                            <FileText className="h-3.5 w-3.5" /> Detalhes
                          </Button>
                          {!isInstPago && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditInstallment(inst)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteInstallment(inst)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              });
            }

            // No installments — render as regular expense card
            const isOverdue = item.status === "atrasado";
            const isPago = item.status === "pago";
            const isSelected = selectedIds.has(item.id);

            return [(
              <Card
                key={item.id}
                className={`relative transition-all ${
                  isSelected ? "ring-2 ring-primary bg-primary/5" : ""
                } ${isOverdue ? "border-destructive/40" : ""}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {!isPago && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                          className="mt-0.5"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.favorecido_nome || "Sem favorecido"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {item.documento_fiscal_importado && <FileText className="h-3 w-3 text-primary shrink-0" />}
                          <span className="text-xs text-muted-foreground truncate">{descDisplay}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={STATUS_MAP[item.status]?.variant || "outline"} className="text-[10px] shrink-0">
                      {STATUS_MAP[item.status]?.label || item.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Valor</span>
                      <p className="font-mono font-semibold text-foreground">
                        R$ {Number(item.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                      {item.valor_pago > 0 && !isPago && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          Pago: R$ {Number(item.valor_pago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vencimento</span>
                      <p className={`font-medium ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                        {item.data_vencimento
                          ? format(new Date(item.data_vencimento + "T12:00:00"), "dd/MM/yyyy")
                          : "—"}
                      </p>
                    </div>
                    {chart && (
                      <div className="col-span-2 mt-1">
                        <span className="text-muted-foreground">Conta Contábil</span>
                        <p className="text-[11px] text-foreground truncate" title={getChartPath(item.plano_contas_id)}>
                          <span className="font-mono mr-1">{chart.codigo}</span>
                          {chart.nome}
                        </p>
                      </div>
                    )}
                    {item.veiculo_placa && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Veículo</span>
                        <p className="text-foreground">{item.veiculo_placa}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 pt-1 border-t border-border">
                    {isMaintenance && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver manutenção" onClick={() => navigate("/admin/maintenances")}>
                        <Wrench className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    )}
                    {!isPago && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-success border-success/30 hover:bg-success/10"
                        onClick={() => handlePayment(item)}
                      >
                        <Check className="h-3.5 w-3.5" /> Pagar
                      </Button>
                    )}
                    <div className="ml-auto flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )];
          })}
        </div>
      )}

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editingExpense}
        empresaId={empresaId}
        chartAccounts={chartAccounts}
        onSaved={fetchData}
      />

      {paymentExpense && (
        <PaymentDischargeDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          expenseId={paymentExpense.id}
          valorTotal={paymentExpense.valor_total}
          valorPago={paymentExpense.valor_pago}
          onSaved={fetchData}
        />
      )}

      {/* Edit Installment Dialog */}
      <Dialog open={editInstOpen} onOpenChange={setEditInstOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Parcela {editInstallment?.numero_parcela}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={editInstValor} onChange={e => setEditInstValor(e.target.value)} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={editInstVenc} onChange={e => setEditInstVenc(e.target.value)} />
            </div>
            <Button onClick={handleSaveInstallment} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
