import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Check, Search, Trash2, FileText, Filter, CalendarClock, AlertTriangle, CheckCircle2, Clock, Wrench, FolderTree } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog } from "./PaymentDischargeDialog";

interface Expense {
  id: string;
  descricao: string;
  tipo_despesa: string;
  categoria_financeira_id: string | null;
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

interface Category { id: string; name: string; tipo_operacional?: string | null; plano_contas_id?: string | null; }
interface ChartAccount { id: string; codigo: string; nome: string; }
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [filterCategoria, setFilterCategoria] = useState("all");
  const [filterPlanoContas, setFilterPlanoContas] = useState("all");
  const [filterVeiculo, setFilterVeiculo] = useState("all");
  const [filterCentroCusto, setFilterCentroCusto] = useState("all");
  const [filterPeriodoInicio, setFilterPeriodoInicio] = useState("");
  const [filterPeriodoFim, setFilterPeriodoFim] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);

  // Build maps for display
  const categoryMap = useMemo(() => {
    const m: Record<string, Category> = {};
    categories.forEach(c => { m[c.id] = c; });
    return m;
  }, [categories]);

  const chartMap = useMemo(() => {
    const m: Record<string, ChartAccount> = {};
    chartAccounts.forEach(a => { m[a.id] = a; });
    return m;
  }, [chartAccounts]);

  const fetchData = async () => {
    setLoading(true);
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").limit(1).maybeSingle();
    setEmpresaId(estab?.id || "");

    const [{ data: expData }, { data: catData }, { data: vehData }, { data: chartData }] = await Promise.all([
      supabase.from("expenses").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("financial_categories").select("id, name, tipo_operacional, plano_contas_id" as any).eq("type", "payable" as any).eq("active", true),
      supabase.from("vehicles").select("id, plate").eq("is_active", true),
      supabase.from("chart_of_accounts").select("id, codigo, nome").eq("ativo", true).order("codigo"),
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

    setItems(processed);
    setCategories((catData as any) || []);
    setChartAccounts((chartData as any) || []);
    setVehicles((vehData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (item: Expense) => { setEditingExpense(item); setFormOpen(true); };
  const handleNew = () => { setEditingExpense(null); setFormOpen(true); };

  const handleDelete = async (item: Expense) => {
    if (item.status === "pago") return toast.error("Contas pagas não podem ser excluídas. Use cancelamento.");

    // Check if maintenance record exists for this expense (via category or legacy tipo_despesa)
    const cat = item.categoria_financeira_id ? categoryMap[item.categoria_financeira_id] : null;
    const isMaintenance = cat?.tipo_operacional === "manutencao" || item.tipo_despesa === "manutencao";

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

  // Quick filter counts
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
      // Quick filter
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
      const matchCategoria = filterCategoria === "all" || i.categoria_financeira_id === filterCategoria;
      const matchPlanoContas = filterPlanoContas === "all" || i.plano_contas_id === filterPlanoContas;
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchCentro = filterCentroCusto === "all" || i.centro_custo === filterCentroCusto;
      const matchPeriodo = (!filterPeriodoInicio || i.data_emissao >= filterPeriodoInicio) &&
        (!filterPeriodoFim || i.data_emissao <= filterPeriodoFim);
      return matchSearch && matchCategoria && matchPlanoContas && matchVeiculo && matchCentro && matchPeriodo;
    });
  }, [items, search, quickFilter, filterCategoria, filterPlanoContas, filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim]);

  const totalPendente = filtered.filter(i => i.status !== "pago").reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);
  const totalPago = filtered.reduce((s, i) => s + Number(i.valor_pago), 0);
  const totalAtrasado = filtered.filter(i => i.status === "atrasado").reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);

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
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="text-xl font-bold text-foreground">R$ {totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
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

      {/* Main Table Card */}
      <Card>
        <CardContent className="p-4">
          {/* Search + filters */}
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por descrição, favorecido ou placa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
            </div>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs gap-1"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Filter className="h-3.5 w-3.5" />
              {showAdvanced ? "Menos filtros" : "Mais filtros"}
            </Button>
          </div>

          {/* Advanced filters */}
          {showAdvanced && (
            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
              <Select value={filterPlanoContas} onValueChange={setFilterPlanoContas}>
                <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Conta Contábil" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Contas</SelectItem>
                  {chartAccounts.map(a => <SelectItem key={a.id} value={a.id}><span className="font-mono text-xs mr-1">{a.codigo}</span> {a.nome}</SelectItem>)}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Conta Contábil</TableHead>
                    <TableHead>Favorecido</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => {
                    const isOverdue = item.status === "atrasado";
                    const cat = item.categoria_financeira_id ? categoryMap[item.categoria_financeira_id] : null;
                    const chart = item.plano_contas_id ? chartMap[item.plano_contas_id] : null;
                    const isMaintenance = cat?.tipo_operacional === "manutencao" || item.tipo_despesa === "manutencao";
                    return (
                      <TableRow key={item.id} className={isOverdue ? "bg-destructive/5" : undefined}>
                        <TableCell className="font-medium max-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            {item.documento_fiscal_importado && <FileText className="h-3.5 w-3.5 text-primary shrink-0" />}
                            <span className="truncate">{item.descricao}</span>
                          </div>
                          {item.veiculo_placa && (
                            <span className="text-[10px] text-muted-foreground">{item.veiculo_placa}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {cat?.name || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {chart ? (
                            <span className="text-[10px]">
                              <span className="font-mono text-muted-foreground">{chart.codigo}</span>{" "}
                              <span className="text-foreground">{chart.nome}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{item.favorecido_nome || "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm font-medium">
                            R$ {Number(item.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                          {item.valor_pago > 0 && item.status !== "pago" && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              Pago: R$ {Number(item.valor_pago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.data_vencimento ? (
                            <span className={isOverdue ? "text-destructive font-medium" : ""}>
                              {format(new Date(item.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_MAP[item.status]?.variant || "outline"} className="text-[10px]">
                            {STATUS_MAP[item.status]?.label || item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-0.5 justify-end">
                            {isMaintenance && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver manutenção" onClick={() => navigate("/admin/maintenances")}>
                                <Wrench className="h-3.5 w-3.5 text-primary" />
                              </Button>
                            )}
                            {item.status !== "pago" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Baixa" onClick={() => handlePayment(item)}>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editingExpense}
        empresaId={empresaId}
        categories={categories}
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
    </div>
  );
}
