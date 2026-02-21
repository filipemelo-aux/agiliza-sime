import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Sprout, ArrowLeft, Plus, Trash2, Users, Calendar, DollarSign, MapPin, User, Building2, FileText, TrendingUp, MinusCircle, Pencil, Check, X, Download, FileSpreadsheet, File } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

interface HarvestJob {
  id: string;
  farm_name: string;
  location: string;
  harvest_period_start: string;
  harvest_period_end: string | null;
  total_third_party_vehicles: number;
  monthly_value: number;
  payment_closing_day: number;
  payment_value: number;
  status: string;
  notes: string | null;
  client_id: string | null;
  client_name?: string;
}

interface Discount {
  id: string;
  type: string;
  description: string;
  value: number;
}

interface Assignment {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  start_date: string;
  end_date: string | null;
  daily_value: number | null;
  company_daily_value: number | null;
  status: string;
  discounts: Discount[];
  company_discounts: Discount[];
  driver_name?: string;
  vehicle_plate?: string;
  days_worked?: number;
}

interface DriverOption {
  user_id: string;
  full_name: string;
}

interface VehicleOption {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

const DISCOUNT_TYPES = [
  { value: "falta", label: "Falta" },
  { value: "diesel", label: "Abastecimento Diesel" },
  { value: "manutencao", label: "Manutenção" },
  { value: "adiantamento", label: "Adiantamento" },
  { value: "outros", label: "Outros" },
];

export default function HarvestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<HarvestJob | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [companyDiscountDialogOpen, setCompanyDiscountDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({
    user_id: "",
    vehicle_id: "",
    start_date: new Date().toISOString().split("T")[0],
    daily_value: "",
  });
  const [discountForm, setDiscountForm] = useState({
    type: "falta",
    description: "",
    value: "",
  });
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [editingDailyValue, setEditingDailyValue] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin && id) fetchAll();
  }, [isAdmin, id]);

  const fetchAll = async () => {
    if (!id) return;
    try {
      const { data: jobData, error: jobErr } = await supabase
        .from("harvest_jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (jobErr) throw jobErr;
      if (!jobData) { navigate("/admin/harvest"); return; }

      let enrichedJob = { ...jobData, client_name: undefined as string | undefined };
      if (jobData.client_id) {
        const { data: clientData } = await supabase
          .from("profiles")
          .select("full_name, nome_fantasia")
          .eq("id", jobData.client_id)
          .maybeSingle();
        enrichedJob.client_name = clientData?.nome_fantasia || clientData?.full_name || undefined;
      }
      setJob(enrichedJob);
      if (!filterStartDate) setFilterStartDate(jobData.harvest_period_start);

      const { data: assignData } = await supabase
        .from("harvest_assignments")
        .select("*")
        .eq("harvest_job_id", id)
        .order("start_date", { ascending: true });

      const enriched = await Promise.all(
        (assignData || []).map(async (a: any) => {
          const [profileRes, vehicleRes] = await Promise.all([
            supabase.from("profiles").select("full_name").eq("user_id", a.user_id).maybeSingle(),
            a.vehicle_id ? supabase.from("vehicles").select("plate").eq("id", a.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);

          const endDate = a.end_date ? new Date(a.end_date) : new Date();
          const startDate = new Date(a.start_date);
          const daysWorked = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          return {
            ...a,
            discounts: Array.isArray(a.discounts) ? a.discounts : [],
            company_discounts: Array.isArray(a.company_discounts) ? a.company_discounts : [],
            driver_name: profileRes.data?.full_name || "Desconhecido",
            vehicle_plate: vehicleRes.data?.plate || "—",
            days_worked: daysWorked,
          };
        })
      );
      setAssignments(enriched);

      // Fetch all drivers (category=motorista), excluding already assigned ones
      const assignedUserIds = (assignData || []).map((a: any) => a.user_id);
      const { data: allDrivers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("category", "motorista")
        .order("full_name");
      const driversData = (allDrivers || []).filter((d: any) => !assignedUserIds.includes(d.user_id));

      const { data: vehiclesData } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model")
        .order("plate");

      setDrivers(driversData);
      setVehicles(vehiclesData || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assignForm.user_id || !id || !job) {
      toast({ title: "Selecione um motorista", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const pv = job.payment_value || job.monthly_value;
      const dailyVal = assignForm.daily_value ? parseFloat(assignForm.daily_value) : (pv / 30);
      const companyDailyVal = job.monthly_value / 30;
      const { error } = await supabase.from("harvest_assignments").insert({
        harvest_job_id: id,
        user_id: assignForm.user_id,
        vehicle_id: assignForm.vehicle_id || null,
        start_date: assignForm.start_date,
        daily_value: dailyVal,
        company_daily_value: companyDailyVal,
      });
      if (error) throw error;

      // Auto-link driver_services if not already
      const { data: existing } = await supabase
        .from("driver_services")
        .select("id")
        .eq("user_id", assignForm.user_id)
        .eq("service_type", "colheita")
        .maybeSingle();
      if (!existing) {
        await supabase.from("driver_services").insert({
          user_id: assignForm.user_id,
          service_type: "colheita",
          assigned_by: user?.id,
        });
      }

      toast({ title: "Motorista vinculado com sucesso!" });
      setDialogOpen(false);
      setAssignForm({ user_id: "", vehicle_id: "", start_date: new Date().toISOString().split("T")[0], daily_value: "" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase.from("harvest_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Motorista removido" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveDailyValue = async (assignmentId: string) => {
    const parsed = parseFloat(editingDailyValue);
    if (isNaN(parsed) || parsed <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase
        .from("harvest_assignments")
        .update({ daily_value: parsed })
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Diária atualizada!" });
      setEditingDailyId(null);
      setEditingDailyValue("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const exportCSV = (type: "agregados" | "faturamento" | "ambos") => {
    const activeAssignments = assignments.filter(a => a.status === "active");
    if (activeAssignments.length === 0) {
      toast({ title: "Nenhum dado ativo para exportar", variant: "destructive" });
      return;
    }
    const lines: string[] = [];
    const sep = ";";

    if (type === "agregados" || type === "ambos") {
      lines.push(`RELATÓRIO AGREGADOS — ${job!.farm_name}`);
      if (filterStartDate || filterEndDate) lines.push(`Período: ${filterStartDate ? formatDate(filterStartDate) : "início"} até ${filterEndDate ? formatDate(filterEndDate) : "atual"}`);
      lines.push(["Motorista", "Placa", "Início", "Dias", "Diária", "Bruto", "Descontos", "Líquido"].join(sep));
      activeAssignments.forEach(a => {
        const d = getAgregadoData(a);
        lines.push([a.driver_name, a.vehicle_plate, formatDate(a.start_date), d.days, formatCurrency(d.dv), formatCurrency(d.totalBruto), formatCurrency(d.totalDescontos), formatCurrency(d.totalLiquido)].join(sep));
      });
      const totAgr = activeAssignments.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
      lines.push(["", "", "", "", "", "", "TOTAL", formatCurrency(totAgr)].join(sep));
      lines.push("");
    }

    if (type === "faturamento" || type === "ambos") {
      lines.push(`RELATÓRIO FATURAMENTO — ${job!.farm_name}`);
      if (filterStartDate || filterEndDate) lines.push(`Período: ${filterStartDate ? formatDate(filterStartDate) : "início"} até ${filterEndDate ? formatDate(filterEndDate) : "atual"}`);
      lines.push(["Motorista", "Placa", "Início", "Dias", "Diária Emp.", "Bruto", "Líq. Terc.", "Descontos Emp.", "Fat. Líquido"].join(sep));
      activeAssignments.forEach(a => {
        const f = getFaturamentoData(a);
        lines.push([a.driver_name, a.vehicle_plate, formatDate(a.start_date), f.days, formatCurrency(f.dvEmpresa), formatCurrency(f.totalBruto), formatCurrency(f.liquidoTerceiros), formatCurrency(f.descontosEmpresa), formatCurrency(f.faturamentoLiquido)].join(sep));
      });
      const totBruto = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0);
      const totTerc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0);
      const totDesc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0);
      const totFat = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0);
      lines.push(["", "", "", "", "TOTAIS", formatCurrency(totBruto), formatCurrency(totTerc), formatCurrency(totDesc), formatCurrency(totFat)].join(sep));
    }

    const bom = "\uFEFF";
    const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const suffix = type === "ambos" ? "completo" : type;
    link.download = `relatorio-${suffix}-${job!.farm_name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "Relatório exportado!" });
  };

  const exportPDF = (type: "agregados" | "faturamento" | "ambos") => {
    const activeAssignments = assignments.filter(a => a.status === "active");
    if (activeAssignments.length === 0) {
      toast({ title: "Nenhum dado ativo para exportar", variant: "destructive" });
      return;
    }
    const tableStyle = `table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.total-row{background:#f0f0f0;font-weight:700}.right{text-align:right}.center{text-align:center}h2{font-size:16px;margin:16px 0 4px}h3{font-size:13px;color:#666;margin:0 0 12px}body{font-family:Arial,sans-serif;padding:20px}`;
    let html = "";
    if (type === "agregados" || type === "ambos") {
      html += `<h2>Relatório Agregados — ${job!.farm_name}</h2>`;
      if (filterStartDate || filterEndDate) html += `<h3>Período: ${filterStartDate ? formatDate(filterStartDate) : "início"} até ${filterEndDate ? formatDate(filterEndDate) : "atual"}</h3>`;
      html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
      activeAssignments.forEach(a => {
        const d = getAgregadoData(a);
        html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
      });
      const totAgr = activeAssignments.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
      html += `<tr class="total-row"><td colspan="7" class="right">TOTAL</td><td class="right">${formatCurrency(totAgr)}</td></tr></tbody></table>`;
    }
    if (type === "faturamento" || type === "ambos") {
      html += `<h2>Relatório Faturamento — ${job!.farm_name}</h2>`;
      if (filterStartDate || filterEndDate) html += `<h3>Período: ${filterStartDate ? formatDate(filterStartDate) : "início"} até ${filterEndDate ? formatDate(filterEndDate) : "atual"}</h3>`;
      html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária Emp.</th><th>Bruto</th><th>Líq. Terc.</th><th>Desc. Emp.</th><th>Fat. Líquido</th></tr></thead><tbody>`;
      activeAssignments.forEach(a => {
        const f = getFaturamentoData(a);
        html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${f.days}</td><td class="right">${formatCurrency(f.dvEmpresa)}</td><td class="right">${formatCurrency(f.totalBruto)}</td><td class="right">${formatCurrency(f.liquidoTerceiros)}</td><td class="right">${formatCurrency(f.descontosEmpresa)}</td><td class="right">${formatCurrency(f.faturamentoLiquido)}</td></tr>`;
      });
      const totBruto = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0);
      const totTerc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0);
      const totDesc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0);
      const totFat = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0);
      html += `<tr class="total-row"><td colspan="5" class="right">TOTAIS</td><td class="right">${formatCurrency(totBruto)}</td><td class="right">${formatCurrency(totTerc)}</td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totFat)}</td></tr></tbody></table>`;
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório - ${job!.farm_name}</title><style>${tableStyle}@media print{@page{margin:15mm}}</style></head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  const handleToggleAssignmentStatus = async (assignment: Assignment) => {
    const newStatus = assignment.status === "active" ? "inactive" : "active";
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === "inactive" && !assignment.end_date) {
        updateData.end_date = new Date().toISOString().split("T")[0];
      }
      const { error } = await supabase.from("harvest_assignments").update(updateData).eq("id", assignment.id);
      if (error) throw error;
      toast({ title: newStatus === "active" ? "Motorista reativado" : "Motorista desativado" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleStatus = async () => {
    if (!job || !id) return;
    const newStatus = job.status === "active" ? "closed" : "active";
    try {
      const { error } = await supabase.from("harvest_jobs").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      toast({ title: newStatus === "active" ? "Serviço reativado" : "Serviço encerrado" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };


  // Discount handlers
  const openDiscountDialog = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setDiscountForm({ type: "falta", description: "", value: "" });
    setDiscountDialogOpen(true);
  };

  const openCompanyDiscountDialog = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setDiscountForm({ type: "falta", description: "", value: "" });
    setCompanyDiscountDialogOpen(true);
  };

  const handleAddDiscount = async (isCompany: boolean) => {
    if (!selectedAssignment || !discountForm.value) {
      toast({ title: "Informe o valor do desconto", variant: "destructive" });
      return;
    }
    const newDiscount: Discount = {
      id: crypto.randomUUID(),
      type: discountForm.type,
      description: discountForm.description || DISCOUNT_TYPES.find(d => d.value === discountForm.type)?.label || "",
      value: parseFloat(discountForm.value),
    };
    const field = isCompany ? "company_discounts" : "discounts";
    const currentDiscounts = isCompany ? selectedAssignment.company_discounts : selectedAssignment.discounts;
    const updated = [...currentDiscounts, newDiscount];

    try {
      const { error } = await supabase
        .from("harvest_assignments")
        .update({ [field]: updated } as any)
        .eq("id", selectedAssignment.id);
      if (error) throw error;
      toast({ title: "Desconto adicionado!" });
      setDiscountDialogOpen(false);
      setCompanyDiscountDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveDiscount = async (assignmentId: string, discountId: string, isCompany: boolean) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    const field = isCompany ? "company_discounts" : "discounts";
    const currentDiscounts = isCompany ? assignment.company_discounts : assignment.discounts;
    const updated = currentDiscounts.filter(d => d.id !== discountId);

    try {
      const { error } = await supabase
        .from("harvest_assignments")
        .update({ [field]: updated } as any)
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Desconto removido" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (date: string) =>
    new Date(date + "T00:00:00").toLocaleDateString("pt-BR");

  const getTotalDiscounts = (discounts: Discount[]) =>
    discounts.reduce((sum, d) => sum + d.value, 0);

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!job) return null;

  const paymentValue = job.payment_value || job.monthly_value;
  const dailyValue = paymentValue / 30;
  const companyDailyValue = job.monthly_value / 30;

  // Calculate totals for each assignment
  // Calculate days considering the filter end date
  const getFilteredDays = (a: Assignment) => {
    const assignStart = new Date(a.start_date + "T00:00:00");
    const effectiveStart = filterStartDate
      ? new Date(Math.max(assignStart.getTime(), new Date(filterStartDate + "T00:00:00").getTime()))
      : assignStart;
    const effectiveEnd = filterEndDate
      ? new Date(filterEndDate + "T00:00:00")
      : a.end_date
        ? new Date(a.end_date + "T00:00:00")
        : new Date();
    if (effectiveEnd < effectiveStart) return 0;
    return Math.max(1, Math.ceil((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  };

  const getAgregadoData = (a: Assignment) => {
    const dv = a.daily_value || dailyValue;
    const days = getFilteredDays(a);
    const totalBruto = days * dv;
    const totalDescontos = getTotalDiscounts(a.discounts);
    const totalLiquido = totalBruto - totalDescontos;
    return { dv, days, totalBruto, totalDescontos, totalLiquido };
  };

  const getFaturamentoData = (a: Assignment) => {
    const dvEmpresa = a.company_daily_value || companyDailyValue;
    const days = getFilteredDays(a);
    const totalBruto = days * dvEmpresa;
    const agregado = getAgregadoData(a);
    const liquidoTerceiros = agregado.totalLiquido;
    const descontosEmpresa = getTotalDiscounts(a.company_discounts);
    const faturamentoLiquido = totalBruto - liquidoTerceiros - descontosEmpresa;
    return { dvEmpresa, days, totalBruto, liquidoTerceiros, descontosEmpresa, faturamentoLiquido };
  };

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin/harvest">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-display">{job.farm_name}</h1>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <MapPin className="h-3.5 w-3.5" /> {job.location}
            </p>
            {job.client_name && (
              <p className="text-muted-foreground flex items-center gap-1 text-sm">
                <Building2 className="h-3.5 w-3.5" /> {job.client_name}
              </p>
            )}
          </div>
          <Badge variant={job.status === "active" ? "default" : "secondary"} className={job.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}>
            {job.status === "active" ? "Ativo" : "Encerrado"}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {job.status === "active" ? "Encerrar" : "Reativar"}
          </Button>
        </div>


        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Período</p>
              <p className="font-semibold text-sm">{formatDate(job.harvest_period_start)}</p>
              {job.harvest_period_end && <p className="text-xs text-muted-foreground">até {formatDate(job.harvest_period_end)}</p>}
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Valor Contrato</p>
              <p className="font-semibold text-sm">{formatCurrency(job.monthly_value)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(companyDailyValue)}/dia</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Valor a Pagar</p>
              <p className="font-semibold text-sm">{formatCurrency(paymentValue)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(dailyValue)}/dia</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Motoristas</p>
              <p className="font-semibold text-sm">{assignments.length}/{job.total_third_party_vehicles}</p>
              <p className="text-xs text-muted-foreground">vinculados</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Líquido a Pagar</p>
              <p className="font-semibold text-sm">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0))}</p>
              <p className="text-xs text-muted-foreground">terceiros</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Lucro Líquido</p>
              <p className="font-semibold text-sm text-green-500">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0))}</p>
              <p className="text-xs text-muted-foreground">faturamento</p>
            </CardContent>
          </Card>
        </div>

        {job.notes && (
          <Card className="border-border mb-6">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm">{job.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Vincular Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Motorista</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Motorista *</Label>
                <Select value={assignForm.user_id} onValueChange={(v) => setAssignForm({ ...assignForm, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {drivers.length === 0 ? (
                      <SelectItem value="_none" disabled>Nenhum motorista</SelectItem>
                    ) : drivers.map((d) => (
                      <SelectItem key={d.user_id} value={d.user_id}>{d.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Veículo</Label>
                <Select value={assignForm.vehicle_id} onValueChange={(v) => setAssignForm({ ...assignForm, vehicle_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o veículo..." /></SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input type="date" value={assignForm.start_date} onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor Diária (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={assignForm.daily_value ? maskCurrency(String(Math.round(parseFloat(assignForm.daily_value) * 100))) : ""} onChange={(e) => setAssignForm({ ...assignForm, daily_value: unmaskCurrency(e.target.value) })} placeholder={maskCurrency(String(Math.round(dailyValue * 100)))} />
                  </div>
                </div>
              </div>
              <Button onClick={handleAssign} disabled={saving || !assignForm.user_id} className="w-full btn-transport-accent">
                {saving ? "Salvando..." : "Vincular Motorista"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discount Dialog (Agregados) */}
        <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Desconto — {selectedAssignment?.driver_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Tipo de Desconto</Label>
                <Select value={discountForm.type} onValueChange={(v) => setDiscountForm({ ...discountForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })} placeholder="Detalhes do desconto..." />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              {selectedAssignment && selectedAssignment.discounts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Descontos existentes</Label>
                  {selectedAssignment.discounts.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <span>{d.description || d.type} — {formatCurrency(d.value)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveDiscount(selectedAssignment.id, d.id, false)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={() => handleAddDiscount(false)} disabled={!discountForm.value} className="w-full btn-transport-accent">
                Adicionar Desconto
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Discount Dialog (Faturamento) */}
        <Dialog open={companyDiscountDialogOpen} onOpenChange={setCompanyDiscountDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Desconto Empresa — {selectedAssignment?.driver_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })} placeholder="Detalhes do desconto..." />
              </div>
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                </div>
              </div>
              {selectedAssignment && selectedAssignment.company_discounts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Descontos existentes</Label>
                  {selectedAssignment.company_discounts.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                      <span>{d.description || "Desconto"} — {formatCurrency(d.value)}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveDiscount(selectedAssignment.id, d.id, true)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={() => handleAddDiscount(true)} disabled={!discountForm.value} className="w-full btn-transport-accent">
                Adicionar Desconto
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Period filter */}
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-muted/50 rounded-lg border border-border">
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <Label className="text-xs font-medium whitespace-nowrap">Período de Fechamento:</Label>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="h-8 text-xs w-40"
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="h-8 text-xs w-40"
            />
          </div>
          {(filterStartDate || filterEndDate) && (
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setFilterStartDate(job?.harvest_period_start || ""); setFilterEndDate(""); }}>
              Limpar
            </Button>
          )}
          {(filterStartDate && filterEndDate) && (
            <span className="text-xs text-muted-foreground">
              De {formatDate(filterStartDate)} até {formatDate(filterEndDate)}
            </span>
          )}
        </div>

        {/* ===== RELATÓRIO COLHEITA - AGREGADOS ===== */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold font-display flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-primary" />
            Relatório Colheita — Agregados
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs px-2">
                  <Download className="h-3 w-3 mr-1" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Excel (CSV)</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportCSV("agregados")}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Agregados
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV("faturamento")}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Faturamento
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCSV("ambos")}>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Ambos Relatórios
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">PDF</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportPDF("agregados")}>
                  <File className="h-3.5 w-3.5 mr-2" /> Agregados
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPDF("faturamento")}>
                  <File className="h-3.5 w-3.5 mr-2" /> Faturamento
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPDF("ambos")}>
                  <File className="h-3.5 w-3.5 mr-2" /> Ambos Relatórios
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="btn-transport-accent h-7 text-xs px-2" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Vincular Motorista
            </Button>
          </div>
        </div>

        {assignments.length === 0 ? (
          <Card className="mb-6">
            <CardContent className="py-8 text-center">
              <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum motorista vinculado a este serviço.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="[&>th]:h-8 [&>th]:px-2 [&>th]:text-xs">
                    <TableHead>Motorista</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead className="text-center">Dias</TableHead>
                    <TableHead>Diária</TableHead>
                    <TableHead>Descontos</TableHead>
                    <TableHead>Líquido</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const data = getAgregadoData(a);
                    return (
                      <TableRow key={a.id} className={`[&>td]:py-1.5 [&>td]:px-2 ${a.status !== "active" ? "opacity-50" : ""}`}>
                        <TableCell className="font-medium whitespace-nowrap">{a.driver_name}</TableCell>
                        <TableCell className="font-mono">{a.vehicle_plate}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(a.start_date)}</TableCell>
                        <TableCell className="text-center">{data.days}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {editingDailyId === a.id ? (
                            <div className="flex items-center gap-1">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">R$</span>
                                <Input
                                  className="h-6 text-xs w-24 pl-7"
                                  value={editingDailyValue ? maskCurrency(String(Math.round(parseFloat(editingDailyValue) * 100))) : ""}
                                  onChange={(e) => setEditingDailyValue(unmaskCurrency(e.target.value))}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveDailyValue(a.id);
                                    if (e.key === "Escape") { setEditingDailyId(null); setEditingDailyValue(""); }
                                  }}
                                />
                              </div>
                              <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => handleSaveDailyValue(a.id)}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingDailyId(null); setEditingDailyValue(""); }}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <span>{formatCurrency(data.dv)}</span>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingDailyId(a.id); setEditingDailyValue(String(data.dv)); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <span className={data.totalDescontos > 0 ? "text-destructive font-medium whitespace-nowrap" : "text-muted-foreground"}>
                              {data.totalDescontos > 0 ? `- ${formatCurrency(data.totalDescontos)}` : "—"}
                            </span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openDiscountDialog(a)}>
                              <MinusCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(data.totalLiquido)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Switch
                              checked={a.status === "active"}
                              onCheckedChange={() => handleToggleAssignmentStatus(a)}
                              className="scale-75"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleRemoveAssignment(a.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* ===== RELATÓRIO COLHEITA - FATURAMENTO ===== */}
        {assignments.length > 0 && (
          <>
            <h2 className="text-base font-bold font-display flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-4 w-4 text-primary" />
              Relatório Colheita — Faturamento
            </h2>
            <Card className="border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:h-8 [&>th]:px-2 [&>th]:text-xs">
                      <TableHead>Motorista</TableHead>
                      <TableHead>Placa</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead className="text-center">Dias</TableHead>
                      <TableHead>Diária Emp.</TableHead>
                      <TableHead>Bruto</TableHead>
                      <TableHead>Líq. Terc.</TableHead>
                      <TableHead>Descontos</TableHead>
                      <TableHead>Fat. Líq.</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => {
                      const fat = getFaturamentoData(a);
                      return (
                        <TableRow key={a.id} className={`[&>td]:py-1.5 [&>td]:px-2 ${a.status !== "active" ? "opacity-50" : ""}`}>
                          <TableCell className="font-medium whitespace-nowrap">{a.driver_name}</TableCell>
                          <TableCell className="font-mono">{a.vehicle_plate}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(a.start_date)}</TableCell>
                          <TableCell className="text-center">{fat.days}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(fat.dvEmpresa)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(fat.totalBruto)}</TableCell>
                          <TableCell className="text-orange-500 whitespace-nowrap">{formatCurrency(fat.liquidoTerceiros)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <span className={fat.descontosEmpresa > 0 ? "text-destructive font-medium whitespace-nowrap" : "text-muted-foreground"}>
                                {fat.descontosEmpresa > 0 ? `- ${formatCurrency(fat.descontosEmpresa)}` : "—"}
                              </span>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openCompanyDiscountDialog(a)}>
                                <MinusCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-green-600 whitespace-nowrap">{formatCurrency(fat.faturamentoLiquido)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Switch
                                checked={a.status === "active"}
                                onCheckedChange={() => handleToggleAssignmentStatus(a)}
                                className="scale-75"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                      <TableCell colSpan={5} className="text-right text-xs">TOTAIS</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0))}</TableCell>
                      <TableCell className="text-orange-500 whitespace-nowrap">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0))}</TableCell>
                      <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0))}</TableCell>
                      <TableCell className="text-green-600 whitespace-nowrap">{formatCurrency(assignments.filter(a => a.status === "active").reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0))}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </>
        )}
      </main>
    </AdminLayout>
  );
}
