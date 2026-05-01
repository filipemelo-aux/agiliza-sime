import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Sprout, ArrowLeft, Plus, Trash2, Users, Calendar, DollarSign, MapPin, User, Building2, FileText, TrendingUp, MinusCircle, Pencil, Check, X, Download, FileSpreadsheet, File, ArrowUpDown, ArrowUp, ArrowDown, Search, CheckCircle2, Clock, Receipt, Undo2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AgregadoMobileCard, FaturamentoMobileCard, ClienteMobileCard } from "@/components/harvest/HarvestMobileCards";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";

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
  date?: string;
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
  owner_name?: string;
  days_worked?: number;
  fleet_type?: string;
}

interface HarvestPayment {
  id: string;
  harvest_job_id: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  total_expected: number;
  filter_context: string;
  notes: string | null;
  created_by: string;
  created_at: string;
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
  const { user, isAdmin, isModerator, isOperador, hasAdminAccess, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [job, setJob] = useState<HarvestJob | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [payments, setPayments] = useState<HarvestPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [partialPaymentValue, setPartialPaymentValue] = useState("");
  const [savingPrevisao, setSavingPrevisao] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closingDate, setClosingDate] = useState(getLocalDateISO());
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [companyDiscountDialogOpen, setCompanyDiscountDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({
    user_id: "",
    vehicle_id: "",
    start_date: getLocalDateISO(),
    daily_value: "",
    monthly_value: "",
  });
  const [discountForm, setDiscountForm] = useState({
    type: "falta",
    description: "",
    value: "",
    date: getLocalDateISO(),
  });
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [editingDailyId, setEditingDailyId] = useState<string | null>(null);
  const [editingDailyValue, setEditingDailyValue] = useState("");
  const [editingEndDateId, setEditingEndDateId] = useState<string | null>(null);
  const [editingEndDateValue, setEditingEndDateValue] = useState("");
  const [editingStartDateId, setEditingStartDateId] = useState<string | null>(null);
  const [editingStartDateValue, setEditingStartDateValue] = useState("");
  const [agregadoSort, setAgregadoSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [faturamentoSort, setFaturamentoSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [clienteSort, setClienteSort] = useState<{ col: string; dir: "asc" | "desc" } | null>(null);
  const [driverSearch, setDriverSearch] = useState("");
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [editingDiscountData, setEditingDiscountData] = useState<{ type: string; description: string; value: string; date: string }>({ type: "", description: "", value: "", date: "" });
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pendingPdfType, setPendingPdfType] = useState<"agregados" | "faturamento" | "cliente" | "ambos">("agregados");
  const [useCustomPdfDiscountPeriod, setUseCustomPdfDiscountPeriod] = useState(false);
  const [pdfDiscountStartDate, setPdfDiscountStartDate] = useState("");
  const [pdfDiscountEndDate, setPdfDiscountEndDate] = useState("");

  useEffect(() => {
    if (!roleLoading && !hasAdminAccess) navigate("/");
  }, [hasAdminAccess, roleLoading, navigate]);

  useEffect(() => {
    if (hasAdminAccess && id) fetchAll();
  }, [hasAdminAccess, id]);

  // Keep selectedAssignment in sync with assignments after fetchAll
  useEffect(() => {
    if (selectedAssignment) {
      const updated = assignments.find(a => a.id === selectedAssignment.id);
      if (updated) setSelectedAssignment(updated);
    }
  }, [assignments]);

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
            a.vehicle_id ? supabase.from("vehicles").select("plate, owner_id, fleet_type").eq("id", a.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);

          let ownerName = "—";
          if (vehicleRes.data?.owner_id) {
            const { data: ownerData } = await supabase
              .from("profiles")
              .select("full_name, nome_fantasia")
              .eq("user_id", vehicleRes.data.owner_id)
              .maybeSingle();
            ownerName = ownerData?.nome_fantasia || ownerData?.full_name || "—";
          }

          const today = new Date(getLocalDateISO() + "T00:00:00");
          const endDate = a.end_date ? new Date(a.end_date + "T00:00:00") : today;
          const startDate = new Date(a.start_date + "T00:00:00");
          const daysWorked = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          return {
            ...a,
            discounts: Array.isArray(a.discounts) ? a.discounts : [],
            company_discounts: Array.isArray(a.company_discounts) ? a.company_discounts : [],
            driver_name: profileRes.data?.full_name || "Desconhecido",
            vehicle_plate: vehicleRes.data?.plate || "—",
            owner_name: ownerName,
            days_worked: daysWorked,
            fleet_type: vehicleRes.data?.fleet_type || "terceiros",
          };
        })
      );
      setAssignments(enriched);

      // Fetch only drivers, excluding admins/moderators and already assigned
      const assignedUserIds = (assignData || []).map((a: any) => a.user_id);
      const { data: systemUserRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "moderator"]);
      const systemUserIds = (systemUserRoles || []).map((r: any) => r.user_id);
      const excludeIds = [...new Set([...assignedUserIds, ...systemUserIds])];
      const { data: allDrivers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("category", "motorista")
        .order("full_name");
      const driversData = (allDrivers || []).filter((d: any) => !excludeIds.includes(d.user_id));

      const { data: vehiclesData } = await supabase
        .from("vehicles")
        .select("id, plate, brand, model")
        .order("plate");

      setDrivers(driversData);
      setVehicles(vehiclesData || []);

      // Fetch payments for this harvest job
      const { data: paymentsData } = await supabase
        .from("harvest_payments")
        .select("*")
        .eq("harvest_job_id", id)
        .order("period_start", { ascending: false });
      setPayments(paymentsData || []);
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
      setAssignForm({ user_id: "", vehicle_id: "", start_date: getLocalDateISO(), daily_value: "", monthly_value: "" });
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

  const handleSaveEndDate = async (assignmentId: string) => {
    try {
      const updateData: any = { end_date: editingEndDateValue || null };
      const { error } = await supabase
        .from("harvest_assignments")
        .update(updateData)
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Data final atualizada!" });
      setEditingEndDateId(null);
      setEditingEndDateValue("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveStartDate = async (assignmentId: string) => {
    if (!editingStartDateValue) {
      toast({ title: "Data de início é obrigatória", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase
        .from("harvest_assignments")
        .update({ start_date: editingStartDateValue })
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Data de início atualizada!" });
      setEditingStartDateId(null);
      setEditingStartDateValue("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const exportCSV = (type: "agregados" | "faturamento" | "cliente" | "ambos") => {
    const activeAssignments = filterBySearch(assignments);
    if (activeAssignments.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
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
      const totAgrDiarias = activeAssignments.reduce((s, a) => s + getAgregadoData(a).dv, 0);
      const totAgrDesc = activeAssignments.reduce((s, a) => s + getAgregadoData(a).totalDescontos, 0);
      const totAgr = activeAssignments.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
      lines.push(["", "", "", "TOTAIS", formatCurrency(totAgrDiarias), "", formatCurrency(totAgrDesc), formatCurrency(totAgr)].join(sep));
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
      const totFatDiariasCSV = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).dvEmpresa, 0);
      const totBruto = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0);
      const totTerc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0);
      const totDesc = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0);
      const totFat = activeAssignments.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0);
      lines.push(["", "", "", "TOTAIS", "", formatCurrency(totBruto), formatCurrency(totTerc), formatCurrency(totDesc), formatCurrency(totFat)].join(sep));
    }

    if (type === "cliente" || type === "ambos") {
      lines.push(`RELATÓRIO CLIENTE — ${job!.farm_name}`);
      if (filterStartDate || filterEndDate) lines.push(`Período: ${filterStartDate ? formatDate(filterStartDate) : "início"} até ${filterEndDate ? formatDate(filterEndDate) : "atual"}`);
      lines.push(["Motorista", "Placa", "Início", "Dias", "Diária", "Bruto", "Descontos", "Líquido"].join(sep));
      activeAssignments.forEach(a => {
        const c = getClienteData(a);
        lines.push([a.driver_name, a.vehicle_plate, formatDate(a.start_date), c.days, formatCurrency(c.dvCliente), formatCurrency(c.totalBruto), formatCurrency(c.totalDescontos), formatCurrency(c.totalLiquido)].join(sep));
      });
      const totCliDiariasCSV = activeAssignments.reduce((s, a) => s + getClienteData(a).dvCliente, 0);
      const totCliDescCSV = activeAssignments.reduce((s, a) => s + getClienteData(a).totalDescontos, 0);
      const totCli = activeAssignments.reduce((s, a) => s + getClienteData(a).totalLiquido, 0);
      lines.push(["", "", "", "TOTAIS", formatCurrency(totCliDiariasCSV), "", formatCurrency(totCliDescCSV), formatCurrency(totCli)].join(sep));
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

  const requestPDF = (type: "agregados" | "faturamento" | "cliente" | "ambos") => {
    setPendingPdfType(type);
    setUseCustomPdfDiscountPeriod(false);
    setPdfDiscountStartDate("");
    setPdfDiscountEndDate("");
    setPdfDialogOpen(true);
  };

  const exportPDF = (type: "agregados" | "faturamento" | "cliente" | "ambos", useCustomDisc: boolean, pdfDiscStart: string = "", pdfDiscEnd: string = "") => {
    // Local discount filter for PDF using provided dates
    const pdfFilterDiscounts = (discounts: Discount[]) => {
      if (!useCustomDisc) {
        // No custom period: use main filter dates
        const sd = filterStartDate;
        const ed = filterEndDate;
        if (!sd && !ed) return discounts;
        return discounts.filter(d => {
          if (!d.date) return true;
          if (sd && d.date < sd) return false;
          if (ed && d.date > ed) return false;
          return true;
        });
      }
      const sd = pdfDiscStart;
      const ed = pdfDiscEnd;
      if (!sd && !ed) return discounts;
      return discounts.filter(d => {
        if (!d.date) return true;
        if (sd && d.date < sd) return false;
        if (ed && d.date > ed) return false;
        return true;
      });
    };
    const pdfGetTotalDiscounts = (discounts: Discount[]) =>
      pdfFilterDiscounts(discounts).reduce((sum, d) => sum + d.value, 0);
    const hasDiscountPeriod = useCustomDisc && !!(pdfDiscStart || pdfDiscEnd);

    // Local data functions for PDF
    const pdfGetAgregadoData = (a: Assignment) => {
      const dv = a.daily_value || dailyValue;
      const days = getFilteredDays(a);
      const totalBruto = days * dv;
      const isPropria = a.fleet_type === "propria";
      const totalDescontos = isPropria ? 0 : pdfGetTotalDiscounts(a.discounts);
      const totalLiquido = totalBruto - totalDescontos;
      return { dv, days, totalBruto, totalDescontos, totalLiquido };
    };
    const pdfGetFaturamentoData = (a: Assignment) => {
      // Mesma regra do relatório de Cliente: usa a diária configurada atual no serviço
      const dvEmpresa = companyDailyValue;
      const days = getFilteredDays(a);
      const totalBruto = days * dvEmpresa;
      const agregado = pdfGetAgregadoData(a);
      const liquidoTerceiros = agregado.totalLiquido;
      const isPropria = a.fleet_type === "propria";
      const dieselFromAgregado = isPropria
        ? pdfFilterDiscounts(a.discounts.filter(d => d.type === "diesel")).reduce((s, d) => s + d.value, 0)
        : 0;
      const descontosEmpresa = pdfGetTotalDiscounts(a.company_discounts) + dieselFromAgregado;
      const faturamentoLiquido = totalBruto - liquidoTerceiros - descontosEmpresa;
      return { dvEmpresa, days, totalBruto, liquidoTerceiros, descontosEmpresa, faturamentoLiquido };
    };
    const pdfGetClienteData = (a: Assignment) => {
      const dvCliente = job!.monthly_value / 30;
      const days = getFilteredDays(a);
      const totalBruto = days * dvCliente;
      const dieselDisc = pdfFilterDiscounts(a.discounts.filter(d => d.type === "diesel")).reduce((s, d) => s + d.value, 0);
      const companyDisc = pdfFilterDiscounts(a.company_discounts).reduce((s, d) => s + d.value, 0);
      const totalDescontos = dieselDisc + companyDisc;
      const totalLiquido = totalBruto - totalDescontos;
      return { dvCliente, days, totalBruto, totalDescontos, totalLiquido };
    };
    // When custom discount period is active, include assignments that have discounts
    // in the discount period even if their work period doesn't overlap with main filter
    let activeAssignments = filterBySearch(assignments);
    if (useCustomDisc && (pdfDiscStart || pdfDiscEnd)) {
      const filteredIds = new Set(activeAssignments.map(a => a.id));
      const extraAssignments = assignments.filter(a => {
        if (filteredIds.has(a.id)) return false;
        // Check if this assignment has any discounts in the custom discount period
        const allDiscounts = [...a.discounts, ...a.company_discounts];
        return pdfFilterDiscounts(allDiscounts).length > 0;
      });
      activeAssignments = [...activeAssignments, ...extraAssignments];
    }
    if (activeAssignments.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const useMobileLayout = isMobile;
    // Check payment status for this period in the PDF
    const pdfPayments = (filterStartDate && filterEndDate) ? getPaymentsForPeriod(filterStartDate, filterEndDate, currentFilterContext) : [];
    const pdfOverlapping = (filterStartDate && filterEndDate) ? getOverlappingPayments(filterStartDate, filterEndDate, currentFilterContext) : [];
    const pdfSubPeriod = pdfOverlapping.filter(p => !(p.period_start === filterStartDate && p.period_end === filterEndDate)).sort((a, b) => a.period_start.localeCompare(b.period_start) || a.created_at.localeCompare(b.created_at));
    const pdfTotalLiquidoCalc = activeAssignments.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
    const pdfTotalPaid = pdfPayments.reduce((s, p) => s + p.total_amount, 0);
    const pdfSubPeriodPaid = pdfSubPeriod.reduce((s, p) => s + p.total_amount, 0);
    let paymentStatusHtml = '';
    if (pdfPayments.length > 0) {
      const allPdfPayments = [...pdfPayments, ...pdfSubPeriod];
      const pdfExpectedSum = (() => {
        const pm = new Map<string, number>();
        for (const p of allPdfPayments) { const k = `${p.period_start}_${p.period_end}`; const c = pm.get(k) || 0; if (p.total_expected > c) pm.set(k, p.total_expected); }
        let t = 0; for (const v of pm.values()) t += v; return t;
      })();
      const pdfAllPaid = pdfTotalPaid + pdfSubPeriodPaid;
      const pdfTotalLiquido = pdfExpectedSum > 0 ? Math.min(pdfTotalLiquidoCalc, pdfExpectedSum) : pdfTotalLiquidoCalc;
      const saldo = pdfTotalLiquido - pdfAllPaid;
      const isPartial = saldo > 0.01;
      const isOverpaid = saldo < -0.01;
      const excesso = Math.abs(saldo);
      const detailLines = pdfPayments.map(p => {
        const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
        return `${dateLabel}: ${formatCurrency(p.total_amount)}`;
      }).join(" | ");
      paymentStatusHtml = isPartial
        ? `<span style="display:inline-block;background:#fff3cd;color:#856404;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">⚠ PARCIAL — ${detailLines} — Total Pago: ${formatCurrency(pdfAllPaid)} | Saldo: ${formatCurrency(saldo)}</span>`
        : isOverpaid
        ? `<span style="display:inline-block;background:#cce5ff;color:#004085;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">✅ PAGO COM EXCESSO — ${detailLines} — Total: ${formatCurrency(pdfAllPaid)} | Excesso: ${formatCurrency(excesso)}</span>`
        : `<span style="display:inline-block;background:#d4edda;color:#155724;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">✅ PAGO — ${detailLines} — Total: ${formatCurrency(pdfAllPaid)}</span>`;
    } else if (filterStartDate && filterEndDate) {
      if (pdfSubPeriod.length > 0) {
        const subExpSum = (() => {
          const pm = new Map<string, number>();
          for (const p of pdfSubPeriod) { const k = `${p.period_start}_${p.period_end}`; const c = pm.get(k) || 0; if (p.total_expected > c) pm.set(k, p.total_expected); }
          let t = 0; for (const v of pm.values()) t += v; return t;
        })();
        const subTotalRef = subExpSum > 0 ? Math.min(pdfTotalLiquidoCalc, subExpSum) : pdfTotalLiquidoCalc;
        const saldoSub = subTotalRef - pdfSubPeriodPaid;
        const isOverpaidSub = saldoSub < -0.01;
        const excessoSub = Math.abs(saldoSub);
        paymentStatusHtml = isOverpaidSub
          ? `<span style="display:inline-block;background:#cce5ff;color:#004085;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">✅ PAGO COM EXCESSO — Total: ${formatCurrency(pdfSubPeriodPaid)} | Excesso: ${formatCurrency(excessoSub)}</span>`
          : saldoSub <= 0.01
          ? `<span style="display:inline-block;background:#d4edda;color:#155724;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">✅ PAGO — Total: ${formatCurrency(pdfSubPeriodPaid)}</span>`
          : `<span style="display:inline-block;background:#fff3cd;color:#856404;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">⚠ PARCIAL — Pago: ${formatCurrency(pdfSubPeriodPaid)} | Saldo: ${formatCurrency(saldoSub)}</span>`;
      } else {
        paymentStatusHtml = `<span style="display:inline-block;background:#fff3cd;color:#856404;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px">⏳ NÃO PAGO</span>`;
      }
    }
    if (pdfSubPeriod.length > 0) {
      const subLines = pdfSubPeriod.map(p => {
        const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
        return `${formatDate(p.period_start)}-${formatDate(p.period_end)}: ${formatCurrency(p.total_amount)} (${dateLabel})`;
      }).join(" | ");
      paymentStatusHtml += `<br/><span style="display:inline-block;background:#d1ecf1;color:#0c5460;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:500;margin-left:8px;margin-top:4px">💰 Sub-períodos: ${subLines}</span>`;
    }
    if (accumulatedPastBalance > 0.01 && filterStartDate && filterEndDate) {
      paymentStatusHtml += `<br/><span style="display:inline-block;background:#f8d7da;color:#721c24;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px;margin-top:4px">📌 Saldo acumulado anterior: ${formatCurrency(accumulatedPastBalance)}</span>`;
    } else if (accumulatedPastBalance < -0.01 && filterStartDate && filterEndDate) {
      paymentStatusHtml += `<br/><span style="display:inline-block;background:#cce5ff;color:#004085;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600;margin-left:8px;margin-top:4px">💰 Crédito acumulado anterior: ${formatCurrency(Math.abs(accumulatedPastBalance))}</span>`;
    }
    const tableStyle = useMobileLayout
      ? `body{font-family:Arial,sans-serif;padding:8px;margin:0;background:#fff}h2{font-size:14px;margin:10px 0 4px}h3{font-size:11px;color:#666;margin:0 0 8px}.report-section{page-break-before:always}.report-section:first-child{page-break-before:avoid}.cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.card{border:1px solid #ddd;border-radius:8px;padding:8px;background:#fff;page-break-inside:avoid}.card-header{margin-bottom:4px}.card-name{font-weight:700;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.card-plate{font-size:9px;color:#666;font-family:monospace}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:9px;margin-bottom:4px;padding-top:4px;border-top:1px solid #eee}.card-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 6px;font-size:9px;margin-bottom:4px;padding-top:4px;border-top:1px solid #eee}.card-label{font-size:7px;text-transform:uppercase;letter-spacing:0.3px;color:#888;margin-bottom:0}.card-value{font-size:10px}.card-total{display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid #ddd;margin-top:2px}.card-total-label{font-size:8px;text-transform:uppercase;letter-spacing:0.3px;color:#888}.card-total-value{font-size:12px;font-weight:700;color:#2B4C7E}.text-red{color:#c0392b;font-weight:600}.text-orange{color:#e67e22}.text-green{color:#27ae60;font-weight:700}.summary-card{background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:10px;margin-top:8px;grid-column:1/-1}.summary-row{display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px}.summary-total{display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid #ddd;margin-top:4px}.summary-total-value{font-size:14px;font-weight:700;color:#2B4C7E}@media print{@page{size:portrait;margin:6mm}}`
      : `table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.total-row{background:#f0f0f0;font-weight:700}.right{text-align:right}.center{text-align:center}h2{font-size:16px;margin:16px 0 4px}h3{font-size:13px;color:#666;margin:0 0 12px}body{font-family:Arial,sans-serif;padding:20px}.report-section{page-break-before:always}.report-section:first-child{page-break-before:avoid}@media print{@page{size:landscape;margin:8mm}body{font-size:9px}table{font-size:9px}th,td{padding:3px 5px}}`;
    let html = "";
    const hasFilter = !!(filterStartDate || filterEndDate);
    const filterInicioLabel = filterStartDate ? formatDate(filterStartDate) : "início";
    const filterFimLabel = filterEndDate ? formatDate(filterEndDate) : "atual";

    const getEffectiveStart = (a: any) => {
      if (!filterStartDate) return formatDate(a.start_date);
      const aStart = new Date(a.start_date + "T00:00:00");
      const fStart = new Date(filterStartDate + "T00:00:00");
      return formatDate(aStart > fStart ? a.start_date : filterStartDate);
    };

    const getEffectiveFim = (a: any) => {
      const fEnd = filterEndDate ? new Date(filterEndDate + "T00:00:00") : null;
      if (a.end_date) {
        const aEnd = new Date(a.end_date + "T00:00:00");
        if (!fEnd || aEnd < fEnd) return { label: formatDate(a.end_date), early: true };
        return { label: formatDate(filterEndDate!), early: false };
      }
      return { label: fEnd ? formatDate(filterEndDate!) : "em atividade", early: false };
    };

    const fimCell = (a: any) => {
      const fim = getEffectiveFim(a);
      if (fim.early) return `<td style="color:#c0392b;font-weight:600" title="Motorista saiu em ${fim.label}">${fim.label} ⚠</td>`;
      return `<td>${fim.label}</td>`;
    };

    const fimCardValue = (a: any) => {
      const fim = getEffectiveFim(a);
      if (fim.early) return `<span class="text-red">${fim.label} ⚠</span>`;
      return `<span>${fim.label}</span>`;
    };

    const discPeriodLabel = hasDiscountPeriod
      ? ` | Descontos: ${pdfDiscStart ? formatDate(pdfDiscStart) : "início"} até ${pdfDiscEnd ? formatDate(pdfDiscEnd) : "atual"}`
      : '';

    // ── Helper: mobile card builders ──
    const mobileAgregadoCard = (a: Assignment) => {
      const d = pdfGetAgregadoData(a);
      return `<div class="card">
        <div class="card-header"><div><div class="card-name">${a.driver_name}</div><div class="card-plate">${a.vehicle_plate}${a.owner_name && a.owner_name !== "—" ? ` · ${a.owner_name}` : ""}</div></div></div>
        <div class="card-grid">
          <div><div class="card-label">Início</div><div class="card-value">${hasFilter ? getEffectiveStart(a) : formatDate(a.start_date)}</div></div>
          <div><div class="card-label">Fim</div><div class="card-value">${hasFilter ? fimCardValue(a) : (a.end_date ? formatDate(a.end_date) : "—")}</div></div>
        </div>
        <div class="card-grid3">
          <div><div class="card-label">Dias</div><div class="card-value">${d.days}</div></div>
          <div><div class="card-label">Diária</div><div class="card-value">${formatCurrency(d.dv)}</div></div>
          <div><div class="card-label">Descontos</div><div class="card-value${d.totalDescontos > 0 ? " text-red" : ""}">${d.totalDescontos > 0 ? `- ${formatCurrency(d.totalDescontos)}` : "—"}</div></div>
        </div>
        <div class="card-total"><span class="card-total-label">Total Líquido</span><span class="card-total-value">${formatCurrency(d.totalLiquido)}</span></div>
      </div>`;
    };

    const mobileFaturamentoCard = (a: Assignment) => {
      const f = pdfGetFaturamentoData(a);
      return `<div class="card">
        <div class="card-header"><div><div class="card-name">${a.driver_name}</div><div class="card-plate">${a.vehicle_plate}${a.owner_name && a.owner_name !== "—" ? ` · ${a.owner_name}` : ""}</div></div></div>
        <div class="card-grid">
          <div><div class="card-label">Início</div><div class="card-value">${hasFilter ? getEffectiveStart(a) : formatDate(a.start_date)}</div></div>
          <div><div class="card-label">Fim</div><div class="card-value">${hasFilter ? fimCardValue(a) : (a.end_date ? formatDate(a.end_date) : "—")}</div></div>
        </div>
        <div class="card-grid">
          <div><div class="card-label">Dias</div><div class="card-value">${f.days}</div></div>
          <div><div class="card-label">Diária Empresa</div><div class="card-value">${formatCurrency(f.dvEmpresa)}</div></div>
          <div><div class="card-label">Bruto</div><div class="card-value">${formatCurrency(f.totalBruto)}</div></div>
          <div><div class="card-label">Líq. Terceiros</div><div class="card-value text-orange">${formatCurrency(f.liquidoTerceiros)}</div></div>
          <div><div class="card-label">Desc. Empresa</div><div class="card-value${f.descontosEmpresa > 0 ? " text-red" : ""}">${f.descontosEmpresa > 0 ? `- ${formatCurrency(f.descontosEmpresa)}` : "—"}</div></div>
        </div>
        <div class="card-total"><span class="card-total-label">Fat. Líquido</span><span class="text-green" style="font-size:15px">${formatCurrency(f.faturamentoLiquido)}</span></div>
      </div>`;
    };

    const mobileClienteCard = (a: Assignment) => {
      const c = pdfGetClienteData(a);
      return `<div class="card">
        <div class="card-header"><div><div class="card-name">${a.driver_name}</div><div class="card-plate">${a.vehicle_plate}${a.owner_name && a.owner_name !== "—" ? ` · ${a.owner_name}` : ""}</div></div></div>
        <div class="card-grid">
          <div><div class="card-label">Início</div><div class="card-value">${hasFilter ? getEffectiveStart(a) : formatDate(a.start_date)}</div></div>
          <div><div class="card-label">Fim</div><div class="card-value">${hasFilter ? fimCardValue(a) : (a.end_date ? formatDate(a.end_date) : "—")}</div></div>
        </div>
        <div class="card-grid3">
          <div><div class="card-label">Dias</div><div class="card-value">${c.days}</div></div>
          <div><div class="card-label">Diária</div><div class="card-value">${formatCurrency(c.dvCliente)}</div></div>
          <div><div class="card-label">Descontos</div><div class="card-value${c.totalDescontos > 0 ? " text-red" : ""}">${c.totalDescontos > 0 ? `- ${formatCurrency(c.totalDescontos)}` : "—"}</div></div>
        </div>
        <div class="card-total"><span class="card-total-label">Total Cliente</span><span class="card-total-value">${formatCurrency(c.totalLiquido)}</span></div>
      </div>`;
    };

    const mobileSummary = (label: string, items: { label: string; value: string; className?: string }[], totalLabel: string, totalValue: string) => {
      return `<div class="summary-card">${items.map(i => `<div class="summary-row"><span>${i.label}</span><span${i.className ? ` class="${i.className}"` : ""}>${i.value}</span></div>`).join("")}<div class="summary-total"><span class="card-total-label">${totalLabel}</span><span class="summary-total-value">${totalValue}</span></div></div>`;
    };

    if (type === "agregados" || type === "ambos") {
      html += `<div class="report-section"><h2>Relatório Agregados — ${job!.farm_name}</h2>`;
      if (job!.client_name) html += `<h3>Cliente: ${job!.client_name}</h3>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel} ${paymentStatusHtml}</h3>`;

      if (useMobileLayout) {
        html += `<div class="cards-grid">`;
        activeAssignments.forEach(a => { html += mobileAgregadoCard(a); });
        const totDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
        const totLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
        const pdfSaldoAnterior = Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0;
        const summaryItems = [
          { label: "Total Dias", value: String(totDias) },
          { label: "Total Descontos", value: formatCurrency(totDesc), className: "text-red" },
        ];
        if (pdfSaldoAnterior > 0.01) summaryItems.push({ label: "📌 Saldo anterior (faltou)", value: `+${formatCurrency(pdfSaldoAnterior)}`, className: "text-red" });
        if (pdfSaldoAnterior < -0.01) summaryItems.push({ label: "💰 Crédito anterior (pago a mais)", value: `-${formatCurrency(Math.abs(pdfSaldoAnterior))}`, className: "text-green" });
        html += mobileSummary("Agregados", summaryItems, "Total Líquido", formatCurrency(totLiq + pdfSaldoAnterior));
        html += `</div></div>`;
      } else if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const d = pdfGetAgregadoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
        });
        const totAgrDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
        const totAgrDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
        const totAgrLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
        const pdfSaldoAnt = Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0;
        if (pdfSaldoAnt > 0.01) {
          html += `<tr style="background:#f8d7da"><td colspan="9" class="right" style="font-size:10px;color:#721c24">📌 Saldo acumulado anterior (faltou)</td><td class="right" style="color:#721c24;font-weight:600">+${formatCurrency(pdfSaldoAnt)}</td></tr>`;
        } else if (pdfSaldoAnt < -0.01) {
          html += `<tr style="background:#cce5ff"><td colspan="9" class="right" style="font-size:10px;color:#004085">💰 Crédito acumulado anterior (pago a mais)</td><td class="right" style="color:#004085;font-weight:600">-${formatCurrency(Math.abs(pdfSaldoAnt))}</td></tr>`;
        }
        html += `<tr class="total-row"><td colspan="5" class="right">TOTAIS</td><td class="center">${totAgrDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totAgrDesc)}</td><td class="right">${formatCurrency(totAgrLiq + pdfSaldoAnt)}</td></tr></tbody></table></div>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const d = pdfGetAgregadoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
        });
        const totAgrDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
        const totAgrDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
        const totAgrLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totAgrDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totAgrDesc)}</td><td class="right">${formatCurrency(totAgrLiq)}</td></tr></tbody></table></div>`;
      }
    }
    if (type === "faturamento" || type === "ambos") {
      html += `<div class="report-section"><h2>Relatório Faturamento — ${job!.farm_name}</h2>`;
      if (job!.client_name) html += `<h3>Cliente: ${job!.client_name}</h3>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel} ${paymentStatusHtml}</h3>`;

      if (useMobileLayout) {
        html += `<div class="cards-grid">`;
        activeAssignments.forEach(a => { html += mobileFaturamentoCard(a); });
        const totDias = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).days, 0);
        const totBruto = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).totalBruto, 0);
        const totTerc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).liquidoTerceiros, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).descontosEmpresa, 0);
        const totFat = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).faturamentoLiquido, 0);
        html += mobileSummary("Faturamento", [
          { label: "Total Dias", value: String(totDias) },
          { label: "Total Bruto", value: formatCurrency(totBruto) },
          { label: "Líq. Terceiros", value: formatCurrency(totTerc), className: "text-orange" },
          { label: "Desc. Empresa", value: formatCurrency(totDesc), className: "text-red" },
        ], "Fat. Líquido", formatCurrency(totFat));
        html += `</div></div>`;
      } else if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária Emp.</th><th>Bruto</th><th>Líq. Terc.</th><th>Desc. Emp.</th><th>Fat. Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const f = pdfGetFaturamentoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${f.days}</td><td class="right">${formatCurrency(f.dvEmpresa)}</td><td class="right">${formatCurrency(f.totalBruto)}</td><td class="right">${formatCurrency(f.liquidoTerceiros)}</td><td class="right">${formatCurrency(f.descontosEmpresa)}</td><td class="right">${formatCurrency(f.faturamentoLiquido)}</td></tr>`;
        });
        const totFatDias = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).days, 0);
        const totBruto = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).totalBruto, 0);
        const totTerc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).liquidoTerceiros, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).descontosEmpresa, 0);
        const totFat = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).faturamentoLiquido, 0);
        html += `<tr class="total-row"><td colspan="5" class="right">TOTAIS</td><td class="center">${totFatDias}</td><td></td><td class="right">${formatCurrency(totBruto)}</td><td class="right">${formatCurrency(totTerc)}</td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totFat)}</td></tr></tbody></table></div>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária Emp.</th><th>Bruto</th><th>Líq. Terc.</th><th>Desc. Emp.</th><th>Fat. Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const f = pdfGetFaturamentoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${f.days}</td><td class="right">${formatCurrency(f.dvEmpresa)}</td><td class="right">${formatCurrency(f.totalBruto)}</td><td class="right">${formatCurrency(f.liquidoTerceiros)}</td><td class="right">${formatCurrency(f.descontosEmpresa)}</td><td class="right">${formatCurrency(f.faturamentoLiquido)}</td></tr>`;
        });
        const totFatDias = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).days, 0);
        const totBruto = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).totalBruto, 0);
        const totTerc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).liquidoTerceiros, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).descontosEmpresa, 0);
        const totFat = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).faturamentoLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totFatDias}</td><td></td><td class="right">${formatCurrency(totBruto)}</td><td class="right">${formatCurrency(totTerc)}</td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totFat)}</td></tr></tbody></table></div>`;
      }
    }
    if (type === "cliente" || type === "ambos") {
      html += `<div class="report-section"><h2>Relatório Cliente — ${job!.farm_name}</h2>`;
      if (job!.client_name) html += `<h3>Cliente: ${job!.client_name}</h3>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel} ${paymentStatusHtml}</h3>`;

      if (useMobileLayout) {
        html += `<div class="cards-grid">`;
        activeAssignments.forEach(a => { html += mobileClienteCard(a); });
        const totDias = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).days, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalDescontos, 0);
        const totLiq = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalLiquido, 0);
        html += mobileSummary("Cliente", [
          { label: "Total Dias", value: String(totDias) },
          { label: "Total Descontos", value: formatCurrency(totDesc), className: "text-red" },
        ], "Total Cliente", formatCurrency(totLiq));
        html += `</div></div>`;
      } else if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const c = pdfGetClienteData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${c.days}</td><td class="right">${formatCurrency(c.dvCliente)}</td><td class="right">${formatCurrency(c.totalBruto)}</td><td class="right">${formatCurrency(c.totalDescontos)}</td><td class="right">${formatCurrency(c.totalLiquido)}</td></tr>`;
        });
        const totCliDias = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).days, 0);
        const totCliDesc = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalDescontos, 0);
        const totCliLiq = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="5" class="right">TOTAIS</td><td class="center">${totCliDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totCliDesc)}</td><td class="right">${formatCurrency(totCliLiq)}</td></tr></tbody></table></div>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Proprietário</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const c = pdfGetClienteData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.owner_name || "—"}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${c.days}</td><td class="right">${formatCurrency(c.dvCliente)}</td><td class="right">${formatCurrency(c.totalBruto)}</td><td class="right">${formatCurrency(c.totalDescontos)}</td><td class="right">${formatCurrency(c.totalLiquido)}</td></tr>`;
        });
        const totCliDias = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).days, 0);
        const totCliDesc = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalDescontos, 0);
        const totCliLiq = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totCliDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totCliDesc)}</td><td class="right">${formatCurrency(totCliLiq)}</td></tr></tbody></table></div>`;
      }
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório - ${job!.farm_name}</title><style>${tableStyle}</style></head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  const handleToggleStatus = async () => {
    if (!job || !id) return;
    if (job.status === "active") {
      // Open close dialog instead of toggling directly
      setCloseDialogOpen(true);
      return;
    }
    // Reactivate
    try {
      const { error } = await supabase.from("harvest_jobs").update({ status: "active" } as any).eq("id", id);
      if (error) throw error;
      toast({ title: "Serviço reativado" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleCloseHarvest = async () => {
    if (!job || !id || !closingDate) return;
    try {
      // 1. Update job status and end date
      const { error: jobErr } = await supabase.from("harvest_jobs").update({
        status: "closed",
        harvest_period_end: closingDate,
      } as any).eq("id", id);
      if (jobErr) throw jobErr;

      // 2. Set end_date on assignments that don't have one
      const assignmentsWithoutEnd = assignments.filter(a => !a.end_date);
      for (const a of assignmentsWithoutEnd) {
        await supabase.from("harvest_assignments").update({
          end_date: closingDate,
        } as any).eq("id", a.id);
      }

      toast({ title: "Serviço encerrado", description: `${assignmentsWithoutEnd.length} motorista(s) com data fim definida para ${new Date(closingDate + "T00:00:00").toLocaleDateString("pt-BR")}` });
      setCloseDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro ao encerrar", description: error.message, variant: "destructive" });
    }
  };

  const exportReceipt = () => {
    const activeAssignments = filterBySearch(assignments);
    if (activeAssignments.length === 0 || !receiptOwnerInfo || !job) {
      toast({ title: "Nenhum dado para gerar recibo", variant: "destructive" });
      return;
    }
    const ownerName = receiptOwnerInfo;
    const useMobileLayout = isMobile;

    // Reuse PDF discount logic (no custom period for receipt)
    const pdfFilterDiscounts = (discounts: Discount[]) => {
      const sd = filterStartDate;
      const ed = filterEndDate;
      if (!sd && !ed) return discounts;
      return discounts.filter(d => {
        if (!d.date) return true;
        if (sd && d.date < sd) return false;
        if (ed && d.date > ed) return false;
        return true;
      });
    };
    const pdfGetTotalDiscounts = (discounts: Discount[]) =>
      pdfFilterDiscounts(discounts).reduce((sum, d) => sum + d.value, 0);
    const pdfGetAgregadoData = (a: Assignment) => {
      const dv = a.daily_value || dailyValue;
      const days = getFilteredDays(a);
      const totalBruto = days * dv;
      const isPropria = a.fleet_type === "propria";
      const totalDescontos = isPropria ? 0 : pdfGetTotalDiscounts(a.discounts);
      const totalLiquido = totalBruto - totalDescontos;
      return { dv, days, totalBruto, totalDescontos, totalLiquido };
    };

    // Gather all overlapping payments for the full period
    const receiptPayments = (filterStartDate && filterEndDate)
      ? getOverlappingPayments(filterStartDate, filterEndDate, currentFilterContext)
      : [];
    const receiptSubPeriods = receiptPayments
      .sort((a, b) => a.period_start.localeCompare(b.period_start) || a.created_at.localeCompare(b.created_at));

    const totalLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
    const totalPaid = receiptPayments.reduce((s, p) => s + p.total_amount, 0);

    const filterInicioLabel = filterStartDate ? formatDate(filterStartDate) : "início";
    const filterFimLabel = filterEndDate ? formatDate(filterEndDate) : "atual";

    const getEffectiveStart = (a: any) => {
      if (!filterStartDate) return formatDate(a.start_date);
      const aStart = new Date(a.start_date + "T00:00:00");
      const fStart = new Date(filterStartDate + "T00:00:00");
      return formatDate(aStart > fStart ? a.start_date : filterStartDate);
    };
    const getEffectiveFim = (a: any) => {
      const fEnd = filterEndDate ? new Date(filterEndDate + "T00:00:00") : null;
      if (a.end_date) {
        const aEnd = new Date(a.end_date + "T00:00:00");
        if (!fEnd || aEnd < fEnd) return { label: formatDate(a.end_date), early: true };
        return { label: formatDate(filterEndDate!), early: false };
      }
      return { label: fEnd ? formatDate(filterEndDate!) : "em atividade", early: false };
    };
    const fimCell = (a: any) => {
      const fim = getEffectiveFim(a);
      if (fim.early) return `<td style="color:#c0392b;font-weight:600">${fim.label} ⚠</td>`;
      return `<td>${fim.label}</td>`;
    };

    const tableStyle = useMobileLayout
      ? `body{font-family:Arial,sans-serif;padding:8px;margin:0;background:#fff}h2{font-size:14px;margin:10px 0 4px}h3{font-size:11px;color:#666;margin:0 0 8px}.cards-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.card{border:1px solid #ddd;border-radius:8px;padding:8px;background:#fff;page-break-inside:avoid}.card-header{margin-bottom:4px}.card-name{font-weight:700;font-size:11px}.card-plate{font-size:9px;color:#666;font-family:monospace}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:9px;margin-bottom:4px;padding-top:4px;border-top:1px solid #eee}.card-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:2px 6px;font-size:9px;margin-bottom:4px;padding-top:4px;border-top:1px solid #eee}.card-label{font-size:7px;text-transform:uppercase;letter-spacing:0.3px;color:#888;margin-bottom:0}.card-value{font-size:10px}.card-total{display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid #ddd;margin-top:2px}.card-total-label{font-size:8px;text-transform:uppercase;letter-spacing:0.3px;color:#888}.card-total-value{font-size:12px;font-weight:700;color:#2B4C7E}.text-red{color:#c0392b;font-weight:600}.summary-card{background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:10px;margin-top:8px;grid-column:1/-1}.summary-row{display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px}.summary-total{display:flex;justify-content:space-between;padding-top:4px;border-top:1px solid #ddd;margin-top:4px}.summary-total-value{font-size:14px;font-weight:700;color:#2B4C7E}.receipt-footer{margin-top:40px;padding-top:20px;border-top:2px solid #333;font-size:10px;line-height:1.6;page-break-inside:avoid}.signature-line{margin-top:60px;border-top:1px solid #333;width:60%;text-align:center;padding-top:4px;font-size:10px}@media print{@page{size:portrait;margin:6mm}}`
      : `table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.total-row{background:#f0f0f0;font-weight:700}.right{text-align:right}.center{text-align:center}h2{font-size:16px;margin:16px 0 4px}h3{font-size:13px;color:#666;margin:0 0 12px}body{font-family:Arial,sans-serif;padding:20px}.receipt-footer{margin-top:40px;padding-top:20px;border-top:2px solid #333;font-size:11px;line-height:1.8;page-break-inside:avoid}.signature-line{margin-top:60px;border-top:1px solid #333;width:50%;text-align:center;padding-top:6px;font-size:11px}@media print{@page{size:landscape;margin:8mm}body{font-size:9px}table{font-size:9px}th,td{padding:3px 5px}}`;

    let html = `<h2>RECIBO DE PAGAMENTO — ${job.client_name || job.farm_name}</h2>`;
    if (job.client_name) html += `<h3>Fazenda: ${job.farm_name}</h3>`;
    html += `<h3>Proprietário: ${ownerName} | Período: ${filterInicioLabel} até ${filterFimLabel}</h3>`;

    // Sub-period payments summary at top
    if (receiptSubPeriods.length > 0) {
      html += `<div style="background:#d1ecf1;color:#0c5460;border-radius:6px;padding:8px 12px;font-size:11px;margin-bottom:12px">`;
      html += `<strong>Pagamentos registrados:</strong><br/>`;
      receiptSubPeriods.forEach(p => {
        const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
        html += `• ${formatDate(p.period_start)} a ${formatDate(p.period_end)} — ${dateLabel}: ${formatCurrency(p.total_amount)}<br/>`;
      });
      html += `<strong>Total Pago: ${formatCurrency(totalPaid)}</strong>`;
      html += `</div>`;
    }

    // Table with all assignments
    html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
    activeAssignments.forEach(a => {
      const d = pdfGetAgregadoData(a);
      html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
    });
    const totDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
    const totDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
    html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totDias}</td><td></td><td></td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totalLiq)}</td></tr></tbody></table>`;

    // Receipt footer with signature
    const today = new Date().toLocaleDateString("pt-BR");
    html += `<div class="receipt-footer">`;
    html += `<p>Eu, <strong>${ownerName}</strong>, proprietário(a) dos veículos acima relacionados, declaro ter recebido da <strong>SIME TRANSPORTE LTDA</strong> a importância total de <strong>${formatCurrency(totalPaid)}</strong> (${totalPaidToWords(totalPaid)}), referente aos serviços de colheita prestados no período de <strong>${filterInicioLabel}</strong> a <strong>${filterFimLabel}</strong>, na fazenda <strong>${job.farm_name}</strong>${job.client_name ? `, do cliente <strong>${job.client_name}</strong>` : ""}${job.location ? `, localizada em <strong>${job.location}</strong>` : ""}.</p>`;
    html += `<p>Declaro ainda que nada mais tenho a receber referente ao período acima mencionado, dando plena e irrevogável quitação dos valores devidos.</p>`;
    html += `<p style="margin-top:12px;font-size:10px;color:#666">${job.location}, ${today}</p>`;
    html += `<div class="signature-line"><strong>${ownerName}</strong><br/>Proprietário(a) dos Veículos</div>`;
    html += `</div>`;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Recibo - ${ownerName} - ${job.farm_name}</title><style>${tableStyle}</style></head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
    }
  };

  // Helper: convert value to words (simplified Brazilian Portuguese)
  const totalPaidToWords = (value: number): string => {
    if (value === 0) return "zero reais";
    const units = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
    const teens = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const tens = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const hundreds = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

    const convertGroup = (n: number): string => {
      if (n === 0) return "";
      if (n === 100) return "cem";
      let result = "";
      if (n >= 100) { result += hundreds[Math.floor(n / 100)]; n %= 100; if (n > 0) result += " e "; }
      if (n >= 20) { result += tens[Math.floor(n / 10)]; n %= 10; if (n > 0) result += " e "; }
      if (n >= 10) { result += teens[n - 10]; return result; }
      if (n > 0) result += units[n];
      return result;
    };

    const intPart = Math.floor(value);
    const centPart = Math.round((value - intPart) * 100);
    let result = "";

    if (intPart >= 1000000) {
      const millions = Math.floor(intPart / 1000000);
      result += millions === 1 ? "um milhão" : convertGroup(millions) + " milhões";
      const remainder = intPart % 1000000;
      if (remainder > 0) result += (remainder < 100 ? " e " : " ");
    }
    const afterMillions = intPart % 1000000;
    if (afterMillions >= 1000) {
      const thousands = Math.floor(afterMillions / 1000);
      result += (thousands === 1 ? "mil" : convertGroup(thousands) + " mil");
      const remainder = afterMillions % 1000;
      if (remainder > 0) result += (remainder < 100 ? " e " : " ");
    }
    const lastThree = afterMillions % 1000;
    if (lastThree > 0) result += convertGroup(lastThree);

    if (intPart === 0) result = "zero";
    result += intPart === 1 ? " real" : " reais";

    if (centPart > 0) {
      result += " e " + convertGroup(centPart) + (centPart === 1 ? " centavo" : " centavos");
    }
    return result;
  };

  const filterByDateRange = (list: Assignment[]) => {
    if (!filterStartDate && !filterEndDate) return list;
    return list.filter(a => {
      const assignEnd = a.end_date
        ? new Date(a.end_date + "T00:00:00")
        : new Date(getLocalDateISO() + "T00:00:00");
      const assignStart = new Date(a.start_date + "T00:00:00");
      if (filterStartDate && assignEnd < new Date(filterStartDate + "T00:00:00")) return false;
      if (filterEndDate && assignStart > new Date(filterEndDate + "T00:00:00")) return false;
      return true;
    });
  };

  // Payment helpers — use sorted assignment user_ids as context so any search yielding the same drivers matches
  const buildFilterContext = (filteredList: Assignment[]) => {
    const ids = filteredList.map(a => a.user_id).filter(Boolean);
    const unique = [...new Set(ids)].sort();
    return unique.join(",");
  };

  // We need sortedAgregados before this, but it depends on filterBySearch which is defined later.
  // So we compute it inline here too for payment context purposes.
  const getFilteredAssignmentsForPayment = () => {
    let list = filterByDateRange(assignments);
    if (driverSearch.trim()) {
      const q = driverSearch.toLowerCase();
      list = list.filter(a =>
        (a.driver_name || "").toLowerCase().includes(q) ||
        (a.vehicle_plate || "").toLowerCase().includes(q) ||
        (a.owner_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  };

  const currentFilterContext = buildFilterContext(getFilteredAssignmentsForPayment());

  // Receipt detection: all filtered assignments share the same owner and dates are set
  const receiptOwnerInfo = (() => {
    if (!filterStartDate || !filterEndDate) return null;
    const filtered = getFilteredAssignmentsForPayment();
    if (filtered.length === 0) return null;
    const owners = new Set(filtered.map(a => a.owner_name).filter(n => n && n !== "—"));
    if (owners.size !== 1) return null;
    const ownerName = [...owners][0];
    return ownerName;
  })();

  const getPaymentsForPeriod = (periodStart: string, periodEnd: string, filterCtx: string): HarvestPayment[] => {
    const matchesContext = (p: HarvestPayment) => {
      if ((p.filter_context || "") === filterCtx) return true;
      if (filterCtx) {
        const currentIds = new Set(filterCtx.split(","));
        const pCtx = p.filter_context || "";
        if (!pCtx) return false;
        const paymentIds = new Set(pCtx.split(","));
        for (const cid of currentIds) {
          if (!paymentIds.has(cid)) return false;
        }
        return true;
      }
      return false;
    };
    return payments.filter(p => p.period_start === periodStart && p.period_end === periodEnd && matchesContext(p));
  };

  // Find all payments that overlap with the current filter range (for broad filters spanning multiple periods)
  const getOverlappingPayments = (periodStart: string, periodEnd: string, filterCtx: string): HarvestPayment[] => {
    const matchesContext = (p: HarvestPayment) => {
      if ((p.filter_context || "") === filterCtx) return true;
      if (!filterCtx) return true;
      const currentIds = new Set(filterCtx.split(","));
      const pCtx = p.filter_context || "";
      if (!pCtx) return false;
      const paymentIds = new Set(pCtx.split(","));
      for (const cid of currentIds) {
        if (!paymentIds.has(cid)) return false;
      }
      return true;
    };
    return payments.filter(p => {
      // Payment period overlaps with filter range
      if (p.period_end < periodStart || p.period_start > periodEnd) return false;
      return matchesContext(p);
    });
  };

  const currentPeriodPayments = filterStartDate && filterEndDate
    ? getPaymentsForPeriod(filterStartDate, filterEndDate, currentFilterContext)
    : [];
  
  // All payments that overlap with filter range (includes exact + sub-period payments)
  const overlappingPayments = filterStartDate && filterEndDate
    ? getOverlappingPayments(filterStartDate, filterEndDate, currentFilterContext)
    : [];
  
  // Payments from sub-periods (registered with different start/end than current filter)
  const subPeriodPayments = overlappingPayments
    .filter(p => !(p.period_start === filterStartDate && p.period_end === filterEndDate))
    .sort((a, b) => a.period_start.localeCompare(b.period_start) || a.created_at.localeCompare(b.created_at));

  const totalPaidAmount = currentPeriodPayments.reduce((s, p) => s + p.total_amount, 0);
  const totalSubPeriodPaid = subPeriodPayments.reduce((s, p) => s + p.total_amount, 0);

  // Helper: sum total_expected per unique period (not max across all payments)
  const sumExpectedByPeriod = (pmts: HarvestPayment[]): number => {
    const periodMap = new Map<string, number>();
    for (const p of pmts) {
      const key = `${p.period_start}_${p.period_end}`;
      const current = periodMap.get(key) || 0;
      if (p.total_expected > current) periodMap.set(key, p.total_expected);
    }
    let total = 0;
    for (const v of periodMap.values()) total += v;
    return total;
  };

  // Calculate accumulated balance from ALL past periods (period_end < current filterStartDate)
  const accumulatedPastBalance = (() => {
    if (!filterStartDate || !id) return 0;
    // Only consider payments matching the current filter context (same drivers selected)
    const pastPayments = payments.filter(p => p.period_end < filterStartDate && p.filter_context === currentFilterContext);
    const periodMap = new Map<string, { totalPaid: number; totalExpected: number }>();
    for (const p of pastPayments) {
      const key = `${p.period_start}_${p.period_end}`;
      const entry = periodMap.get(key) || { totalPaid: 0, totalExpected: 0 };
      entry.totalPaid += p.total_amount;
      if (p.total_expected > entry.totalExpected) entry.totalExpected = p.total_expected;
      periodMap.set(key, entry);
    }
    let accumulated = 0;
    for (const entry of periodMap.values()) {
      if (entry.totalExpected > 0) {
        // Net balance: positive = deficit, negative = excess (overpaid)
        accumulated += (entry.totalExpected - entry.totalPaid);
      }
    }
    return accumulated;
  })();

  const handleRegisterPayment = async (totalAmount: number, expectedTotal: number) => {
    if (!filterStartDate || !filterEndDate || !id || !user) {
      toast({ title: "Defina o período (início e fim) no filtro para registrar o pagamento", variant: "destructive" });
      return;
    }
    if (!paymentDueDate) {
      toast({ title: "Informe a data de vencimento", variant: "destructive" });
      return;
    }
    setSavingPayment(true);
    try {
      const paymentNotes = paymentDate ? `Lançamento em ${paymentDate.split("-").reverse().join("/")}` : null;
      const { error } = await supabase.from("harvest_payments").insert({
        harvest_job_id: id,
        period_start: filterStartDate,
        period_end: filterEndDate,
        total_amount: totalAmount,
        total_expected: expectedTotal,
        filter_context: currentFilterContext,
        created_by: user.id,
        notes: paymentNotes,
      } as any);
      if (error) throw error;

      // Create expense in contas a pagar (pendente)
      const { data: estab } = await supabase
        .from("fiscal_establishments")
        .select("id")
        .eq("active", true)
        .eq("type", "matriz")
        .limit(1)
        .maybeSingle();

      if (estab) {
        const periodoLabel = `${filterStartDate.split("-").reverse().join("/")} a ${filterEndDate.split("-").reverse().join("/")}`;
        const ownerNameForExpense = receiptOwnerInfo || "Proprietário";
        const descricao = `Colheita - ${job?.farm_name || "Serviço"} - ${periodoLabel}`;
        await supabase.from("expenses").insert({
          empresa_id: estab.id,
          created_by: user.id,
          descricao,
          tipo_despesa: "outros" as any,
          centro_custo: "frota_terceiros" as any,
          origem: "manual" as any,
          valor_total: totalAmount,
          data_emissao: paymentDate || getLocalDateISO(),
          data_vencimento: paymentDueDate,
          favorecido_nome: ownerNameForExpense,
          status: "pendente" as any,
          observacoes: `Pagamento colheita ${job?.farm_name || ""} - Período: ${periodoLabel}`,
        } as any);
      }

      // Previsão de recebimento é gerada manualmente pela aba Cliente

      toast({ title: "Pagamento registrado e conta a pagar gerada!" });
      setPaymentDialogOpen(false);
      setPartialPaymentValue("");
      setPaymentDate("");
      setPaymentDueDate("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    try {
      // Remove bank movement first
      await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "colheitas").eq("origem_id", paymentId);
      // Remove linked expenses
      const { data: linkedExpenses } = await supabase.from("expenses").select("id").eq("contrato_id", paymentId);
      if (linkedExpenses && linkedExpenses.length > 0) {
        for (const exp of linkedExpenses) {
          await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "despesas").eq("origem_id", exp.id);
          await supabase.from("expense_payments" as any).delete().eq("expense_id", exp.id);
        }
        await supabase.from("expenses").delete().in("id", linkedExpenses.map(e => e.id));
      }
      // Finally delete the harvest payment
      const { error } = await supabase.from("harvest_payments").delete().eq("id", paymentId);
      if (error) throw error;
      toast({ title: "Pagamento estornado com sucesso" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro ao estornar", description: error.message, variant: "destructive" });
    }
  };

  // Discount handlers
  const openDiscountDialog = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setDiscountForm({ type: "falta", description: "", value: "", date: getLocalDateISO() });
    setDiscountDialogOpen(true);
  };

  const handleCreatePrevisao = async () => {
    if (!job?.client_id || !id) {
      toast({ title: "Este serviço não possui cliente vinculado", variant: "destructive" });
      return;
    }
    if (!filterStartDate || !filterEndDate) {
      toast({ title: "Defina o período (datas de início e fim) para gerar a previsão", variant: "destructive" });
      return;
    }
    const totalCliente = sortedCliente.reduce((s, a) => s + getClienteData(a).totalLiquido, 0);
    if (totalCliente <= 0) {
      toast({ title: "Valor total do cliente deve ser maior que zero", variant: "destructive" });
      return;
    }
    setSavingPrevisao(true);
    try {
      // Build detailed breakdown per driver for the invoice
      const detalhamento = sortedCliente.map((a) => {
        const c = getClienteData(a);
        return {
          motorista: a.driver_name || "—",
          placa: a.vehicle_plate || "—",
          proprietario: a.owner_name || "—",
          dias: c.days,
          diaria: c.dvCliente,
          bruto: c.totalBruto,
          descontos: c.totalDescontos,
          liquido: c.totalLiquido,
        };
      });

      const metadata = {
        periodo_inicio: filterStartDate,
        periodo_fim: filterEndDate,
        fazenda: job.farm_name,
        localizacao: job.location || "",
        diaria_cliente: job.monthly_value / 30,
        valor_mensal: job.monthly_value,
        detalhamento,
      };

      const { error } = await supabase.from("previsoes_recebimento").insert({
        origem_tipo: "colheita" as any,
        origem_id: id,
        cliente_id: job.client_id,
        valor: totalCliente,
        data_prevista: filterEndDate,
        status: "pendente" as any,
        metadata,
      } as any);
      if (error) throw error;
      toast({ title: "Previsão de recebimento gerada!", description: `Valor: ${formatCurrency(totalCliente)} — Período: ${formatDate(filterStartDate)} a ${formatDate(filterEndDate)}` });
    } catch (err: any) {
      toast({ title: "Erro ao gerar previsão", description: err.message, variant: "destructive" });
    } finally {
      setSavingPrevisao(false);
    }
  };

  const openCompanyDiscountDialog = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setDiscountForm({ type: "falta", description: "", value: "", date: getLocalDateISO() });
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
      date: discountForm.date || undefined,
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
      // Update selectedAssignment immediately so dialog shows new discount
      setSelectedAssignment({
        ...selectedAssignment,
        [field]: updated,
      });
      setDiscountForm({ type: "falta", description: "", value: "", date: getLocalDateISO() });
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
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment({ ...assignment, [field]: updated });
      }
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveEditDiscount = async (assignmentId: string, discountId: string, isCompany: boolean) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    const parsedValue = parseFloat(editingDiscountData.value);
    if (isNaN(parsedValue) || parsedValue <= 0) {
      toast({ title: "Valor inválido", variant: "destructive" });
      return;
    }
    const field = isCompany ? "company_discounts" : "discounts";
    const currentDiscounts = isCompany ? assignment.company_discounts : assignment.discounts;
    const updated = currentDiscounts.map(d =>
      d.id === discountId
        ? {
            ...d,
            type: editingDiscountData.type,
            description: editingDiscountData.description || DISCOUNT_TYPES.find(t => t.value === editingDiscountData.type)?.label || "",
            value: parsedValue,
            date: editingDiscountData.date || undefined,
          }
        : d
    );
    try {
      const { error } = await supabase
        .from("harvest_assignments")
        .update({ [field]: updated } as any)
        .eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Desconto atualizado!" });
      setEditingDiscountId(null);
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment({ ...assignment, [field]: updated });
      }
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (date: string) =>
    new Date(date + "T00:00:00").toLocaleDateString("pt-BR");

  const filterDiscountsByPeriod = (discounts: Discount[]) => {
    const startDate = filterStartDate;
    const endDate = filterEndDate;
    if (!startDate && !endDate) return discounts;
    return discounts.filter(d => {
      if (!d.date) return true;
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;
      return true;
    });
  };

  const getTotalDiscounts = (discounts: Discount[]) =>
    filterDiscountsByPeriod(discounts).reduce((sum, d) => sum + d.value, 0);

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

  const getCompanyDialogDiscounts = (a: Assignment) => {
    const company = a.company_discounts.map((d) => ({ ...d, isCompany: true }));
    const dieselFromAgregado = a.discounts
      .filter((d) => d.type === "diesel")
      .map((d) => ({ ...d, isCompany: false }));

    return [...company, ...dieselFromAgregado].sort((x, y) => {
      const dx = x.date || "";
      const dy = y.date || "";
      return dy.localeCompare(dx);
    });
  };

  // Calculate totals for each assignment
  // Calculate days considering the filter end date
  const getFilteredDays = (a: Assignment) => {
    const assignStart = new Date(a.start_date + "T00:00:00");
    const effectiveStart = filterStartDate
      ? new Date(Math.max(assignStart.getTime(), new Date(filterStartDate + "T00:00:00").getTime()))
      : assignStart;
    const today = new Date(getLocalDateISO() + "T00:00:00");
    const filterEnd = filterEndDate ? new Date(filterEndDate + "T00:00:00") : null;
    const assignEnd = a.end_date ? new Date(a.end_date + "T00:00:00") : null;
    let effectiveEnd: Date;
    if (filterEnd && assignEnd) {
      effectiveEnd = new Date(Math.min(filterEnd.getTime(), assignEnd.getTime()));
    } else if (filterEnd) {
      effectiveEnd = filterEnd;
    } else if (assignEnd) {
      effectiveEnd = assignEnd;
    } else {
      effectiveEnd = today;
    }
    if (effectiveEnd < effectiveStart) return 0;
    return Math.max(1, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  };

  const getAgregadoData = (a: Assignment) => {
    const dv = a.daily_value || dailyValue;
    const days = getFilteredDays(a);
    const totalBruto = days * dv;
    const isPropria = a.fleet_type === "propria";
    // Frota própria: sem descontos no relatório de agregados
    const totalDescontos = isPropria ? 0 : getTotalDiscounts(a.discounts);
    const totalLiquido = totalBruto - totalDescontos;
    return { dv, days, totalBruto, totalDescontos, totalLiquido };
  };

  const getFaturamentoData = (a: Assignment) => {
    // Sempre usa a diária configurada no serviço (job.monthly_value / 30),
    // igual ao relatório de Cliente. Snapshots antigos em a.company_daily_value
    // são ignorados para manter consistência com a configuração atual da colheita.
    const dvEmpresa = companyDailyValue;
    const days = getFilteredDays(a);
    const totalBruto = days * dvEmpresa;
    const agregado = getAgregadoData(a);
    const liquidoTerceiros = agregado.totalLiquido;
    const isPropria = a.fleet_type === "propria";
    // Frota própria: diesel dos descontos do agregado vira desconto no faturamento
    const dieselFromAgregado = isPropria
      ? filterDiscountsByPeriod(a.discounts.filter(d => d.type === "diesel")).reduce((s, d) => s + d.value, 0)
      : 0;
    const descontosEmpresa = getTotalDiscounts(a.company_discounts) + dieselFromAgregado;
    const faturamentoLiquido = totalBruto - liquidoTerceiros - descontosEmpresa;
    return { dvEmpresa, days, totalBruto, liquidoTerceiros, descontosEmpresa, faturamentoLiquido };
  };

  const getClienteData = (a: Assignment) => {
    const dvCliente = job!.monthly_value / 30;
    const days = getFilteredDays(a);
    const totalBruto = days * dvCliente;
    // Diesel from agregados + company_discounts, all filtered by period
    const dieselDisc = filterDiscountsByPeriod(a.discounts.filter(d => d.type === "diesel")).reduce((s, d) => s + d.value, 0);
    const companyDisc = filterDiscountsByPeriod(a.company_discounts).reduce((s, d) => s + d.value, 0);
    const totalDescontos = dieselDisc + companyDisc;
    const totalLiquido = totalBruto - totalDescontos;
    return { dvCliente, days, totalBruto, totalDescontos, totalLiquido };
  };

  const toggleSort = (current: { col: string; dir: "asc" | "desc" } | null, col: string): { col: string; dir: "asc" | "desc" } | null => {
    if (!current || current.col !== col) return { col, dir: "asc" };
    if (current.dir === "asc") return { col, dir: "desc" };
    return null;
  };

  const SortIcon = ({ col, sort }: { col: string; sort: { col: string; dir: "asc" | "desc" } | null }) => {
    if (!sort || sort.col !== col) return <ArrowUpDown className="h-3 w-3 ml-0.5 opacity-40" />;
    return sort.dir === "asc" ? <ArrowUp className="h-3 w-3 ml-0.5" /> : <ArrowDown className="h-3 w-3 ml-0.5" />;
  };

  const sortAssignments = (list: Assignment[], sort: { col: string; dir: "asc" | "desc" } | null, getData: (a: Assignment) => any) => {
    if (!sort) return list;
    const sorted = [...list].sort((a, b) => {
      const da = getData(a);
      const db = getData(b);
      let va: any, vb: any;
      switch (sort.col) {
        case "motorista": va = a.driver_name || ""; vb = b.driver_name || ""; break;
        case "placa": va = a.vehicle_plate || ""; vb = b.vehicle_plate || ""; break;
        case "proprietario": va = a.owner_name || ""; vb = b.owner_name || ""; break;
        case "inicio": va = a.start_date; vb = b.start_date; break;
        case "fim": va = a.end_date || "9999"; vb = b.end_date || "9999"; break;
        case "dias": va = da.days ?? da.days; vb = db.days ?? db.days; break;
        case "diaria": va = da.dv ?? da.dvEmpresa; vb = db.dv ?? db.dvEmpresa; break;
        case "descontos": va = da.totalDescontos ?? da.descontosEmpresa; vb = db.totalDescontos ?? db.descontosEmpresa; break;
        case "liquido": va = da.totalLiquido ?? 0; vb = db.totalLiquido ?? 0; break;
        case "diaria_emp": va = da.dvEmpresa; vb = db.dvEmpresa; break;
        case "bruto": va = da.totalBruto; vb = db.totalBruto; break;
        case "liq_terc": va = da.liquidoTerceiros; vb = db.liquidoTerceiros; break;
        case "desc_emp": va = da.descontosEmpresa; vb = db.descontosEmpresa; break;
        case "fat_liq": va = da.faturamentoLiquido; vb = db.faturamentoLiquido; break;
        case "diaria_cli": va = da.dvCliente; vb = db.dvCliente; break;
        case "desc_cli": va = da.totalDescontos; vb = db.totalDescontos; break;
        case "liq_cli": va = da.totalLiquido; vb = db.totalLiquido; break;
        default: return 0;
      }
      if (typeof va === "string") return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === "asc" ? va - vb : vb - va;
    });
    return sorted;
  };




  const filterBySearch = (list: Assignment[]) => {
    const dateFiltered = filterByDateRange(list);
    if (!driverSearch.trim()) return dateFiltered;
    const q = driverSearch.toLowerCase();
    return dateFiltered.filter(a =>
      (a.driver_name || "").toLowerCase().includes(q) ||
      (a.vehicle_plate || "").toLowerCase().includes(q) ||
      (a.owner_name || "").toLowerCase().includes(q)
    );
  };

  // Relatório de Agregados exibe apenas motoristas com caminhões de frota terceiros
  const sortedAgregados = filterBySearch(sortAssignments(assignments, agregadoSort, getAgregadoData))
    .filter((a) => a.fleet_type !== "propria");
  const sortedFaturamento = filterBySearch(sortAssignments(assignments, faturamentoSort, getFaturamentoData));
  const sortedCliente = filterBySearch(sortAssignments(assignments, clienteSort, getClienteData));

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        {/* Back + Title */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin/harvest">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold font-display truncate">{job.farm_name}</h1>
              <p className="text-muted-foreground flex items-center gap-1 text-sm">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {job.location}
              </p>
              {job.client_name && (
                <p className="text-muted-foreground flex items-center gap-1 text-sm">
                  <Building2 className="h-3.5 w-3.5 shrink-0" /> {job.client_name}
                </p>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <Badge variant={job.status === "active" ? "default" : "secondary"} className={job.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}>
                {job.status === "active" ? "Ativo" : "Encerrado"}
              </Badge>
              <Button variant="outline" size="sm" onClick={handleToggleStatus}>
                {job.status === "active" ? "Encerrar" : "Reativar"}
              </Button>
            </div>
          </div>
          <div className="flex sm:hidden items-center gap-2 pl-12">
            <Badge variant={job.status === "active" ? "default" : "secondary"} className={`text-[11px] px-2 py-0.5 ${job.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}`}>
              {job.status === "active" ? "Ativo" : "Encerrado"}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={handleToggleStatus}>
              {job.status === "active" ? "Encerrar" : "Reativar"}
            </Button>
          </div>
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
              <p className="font-semibold text-sm">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0) + (Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0))}</p>
              <p className="text-xs text-muted-foreground">terceiros{(driverSearch || filterEndDate) ? " (filtrado)" : ""}{accumulatedPastBalance > 0.01 ? " (c/ saldo anterior)" : accumulatedPastBalance < -0.01 ? " (c/ crédito anterior)" : ""}</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Lucro Líquido</p>
              <p className="font-semibold text-sm text-green-500">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0))}</p>
              <p className="text-xs text-muted-foreground">faturamento{(driverSearch || filterEndDate) ? " (filtrado)" : ""}</p>
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

        {/* Close Harvest Dialog */}
        <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Encerrar Serviço de Colheita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <p className="text-sm text-muted-foreground">
                Defina a data de encerramento. Motoristas sem data fim terão essa data definida automaticamente. O serviço será bloqueado para novos lançamentos.
              </p>
              <div className="space-y-1.5">
                <Label>Data de Encerramento *</Label>
                <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">
                {assignments.filter(a => !a.end_date).length} motorista(s) sem data fim definida serão atualizados.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setCloseDialogOpen(false)}>Cancelar</Button>
                <Button className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCloseHarvest} disabled={!closingDate}>
                  Encerrar Serviço
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Vincular Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Motorista</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Motorista *</Label>
                <Select value={assignForm.user_id} onValueChange={async (v) => {
                  setAssignForm(prev => ({ ...prev, user_id: v }));
                  // Auto-lookup vehicle linked to this driver
                  try {
                    const { data: driverVehicle } = await supabase
                      .from("vehicles")
                      .select("id")
                      .eq("driver_id", v)
                      .eq("is_active", true)
                      .maybeSingle();
                    if (driverVehicle) {
                      setAssignForm(prev => ({ ...prev, user_id: v, vehicle_id: driverVehicle.id }));
                    }
                  } catch {}
                }}>
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
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label>Data Início</Label>
                <Input type="date" value={assignForm.start_date} onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Valor Mensal (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={assignForm.monthly_value ? maskCurrency(String(Math.round(parseFloat(assignForm.monthly_value) * 100))) : ""} onChange={(e) => {
                      const monthly = unmaskCurrency(e.target.value);
                      const monthlyNum = parseFloat(monthly);
                      const daily = !isNaN(monthlyNum) && monthlyNum > 0 ? String(monthlyNum / 30) : "";
                      setAssignForm(prev => ({ ...prev, monthly_value: monthly, daily_value: daily }));
                    }} placeholder={maskCurrency(String(Math.round(dailyValue * 30 * 100)))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor Diária (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={assignForm.daily_value ? maskCurrency(String(Math.round(parseFloat(assignForm.daily_value) * 100))) : ""} onChange={(e) => {
                      const daily = unmaskCurrency(e.target.value);
                      const dailyNum = parseFloat(daily);
                      const monthly = !isNaN(dailyNum) && dailyNum > 0 ? String(dailyNum * 30) : "";
                      setAssignForm(prev => ({ ...prev, daily_value: daily, monthly_value: monthly }));
                    }} placeholder={maskCurrency(String(Math.round(dailyValue * 100)))} />
                  </div>
                </div>
              </div>
              <Button onClick={handleAssign} disabled={saving || !assignForm.user_id} className="w-full">
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
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })} placeholder="Detalhes do desconto..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={discountForm.date} onChange={(e) => setDiscountForm({ ...discountForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
              </div>
              {selectedAssignment && selectedAssignment.discounts.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Descontos existentes</Label>
                  {selectedAssignment.discounts.map((d) => (
                    editingDiscountId === d.id ? (
                      <div key={d.id} className="space-y-2 bg-muted/50 rounded p-3 border border-border">
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={editingDiscountData.type} onValueChange={(v) => setEditingDiscountData(prev => ({ ...prev, type: v }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {DISCOUNT_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input className="h-8 text-xs" value={editingDiscountData.description} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, description: e.target.value }))} placeholder="Descrição" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="date" className="h-8 text-xs" value={editingDiscountData.date} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, date: e.target.value }))} />
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">R$</span>
                            <Input className="h-8 text-xs pl-7" value={editingDiscountData.value ? maskCurrency(String(Math.round(parseFloat(editingDiscountData.value) * 100))) : ""} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, value: unmaskCurrency(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleSaveEditDiscount(selectedAssignment.id, d.id, false)}>Salvar</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingDiscountId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div key={d.id} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                        <span className="cursor-pointer flex-1" onClick={() => { setEditingDiscountId(d.id); setEditingDiscountData({ type: d.type, description: d.description, value: String(d.value), date: d.date || "" }); }}>
                          {d.date ? formatDate(d.date) + " — " : ""}{d.description || d.type} — {formatCurrency(d.value)}
                          <Pencil className="h-3 w-3 text-muted-foreground inline ml-1.5" />
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveDiscount(selectedAssignment.id, d.id, false)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  ))}
                </div>
              )}
              <Button onClick={() => handleAddDiscount(false)} disabled={!discountForm.value} className="w-full">
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
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Input value={discountForm.description} onChange={(e) => setDiscountForm({ ...discountForm, description: e.target.value })} placeholder="Detalhes do desconto..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={discountForm.date} onChange={(e) => setDiscountForm({ ...discountForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
              </div>
              {selectedAssignment && getCompanyDialogDiscounts(selectedAssignment).length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Descontos existentes (Empresa + Diesel dos Agregados)</Label>
                  {getCompanyDialogDiscounts(selectedAssignment).map((d) => (
                    editingDiscountId === d.id ? (
                      <div key={`${d.isCompany ? "company" : "agregado"}-${d.id}`} className="space-y-2 bg-muted/50 rounded p-3 border border-border">
                        <Input className="h-8 text-xs" value={editingDiscountData.description} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, description: e.target.value }))} placeholder="Descrição" />
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="date" className="h-8 text-xs" value={editingDiscountData.date} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, date: e.target.value }))} />
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">R$</span>
                            <Input className="h-8 text-xs pl-7" value={editingDiscountData.value ? maskCurrency(String(Math.round(parseFloat(editingDiscountData.value) * 100))) : ""} onChange={(e) => setEditingDiscountData(prev => ({ ...prev, value: unmaskCurrency(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs flex-1" onClick={() => handleSaveEditDiscount(selectedAssignment.id, d.id, d.isCompany)}>Salvar</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingDiscountId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <div key={`${d.isCompany ? "company" : "agregado"}-${d.id}`} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                        <span className="cursor-pointer flex-1" onClick={() => { setEditingDiscountId(d.id); setEditingDiscountData({ type: d.type || "outros", description: d.description, value: String(d.value), date: d.date || "" }); }}>
                          {d.date ? formatDate(d.date) + " — " : ""}{d.description || "Desconto"} — {formatCurrency(d.value)}
                          <Pencil className="h-3 w-3 text-muted-foreground inline ml-1.5" />
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveDiscount(selectedAssignment.id, d.id, d.isCompany)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )
                  ))}
                </div>
              )}
              <Button onClick={() => handleAddDiscount(true)} disabled={!discountForm.value} className="w-full">
                Adicionar Desconto
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Period filter + actions */}
        <div className="flex flex-col gap-2 mb-4 p-3 bg-muted/50 rounded-lg border border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <Label className="text-xs font-medium whitespace-nowrap">Período de Fechamento:</Label>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2">
                    <Download className="h-3.5 w-3.5" />
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
                  <DropdownMenuItem onClick={() => exportCSV("cliente")}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Cliente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCSV("ambos")}>
                    <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Todos Relatórios
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">PDF</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => requestPDF("agregados")}>
                    <File className="h-3.5 w-3.5 mr-2" /> Agregados
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => requestPDF("faturamento")}>
                    <File className="h-3.5 w-3.5 mr-2" /> Faturamento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => requestPDF("cliente")}>
                    <File className="h-3.5 w-3.5 mr-2" /> Cliente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => requestPDF("ambos")}>
                    <File className="h-3.5 w-3.5 mr-2" /> Todos Relatórios
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {receiptOwnerInfo && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 gap-1" onClick={exportReceipt} title={`Gerar recibo para ${receiptOwnerInfo}`}>
                  <Receipt className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Recibo</span>
                </Button>
              )}
              {job.status === "active" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Vincular
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="h-8 text-xs flex-1 min-w-0"
              />
              <span className="text-xs text-muted-foreground shrink-0">até</span>
              <Input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="h-8 text-xs flex-1 min-w-0"
              />
              {(filterStartDate || filterEndDate) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 shrink-0" onClick={() => { setFilterStartDate(job?.harvest_period_start || ""); setFilterEndDate(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar motorista ou placa..."
              value={driverSearch}
              onChange={(e) => setDriverSearch(e.target.value)}
              className="h-8 text-xs pl-8"
            />
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
        <Tabs defaultValue="agregados" className="w-full">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="agregados" className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Agregados
            </TabsTrigger>
            <TabsTrigger value="faturamento" className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Faturamento
            </TabsTrigger>
            <TabsTrigger value="cliente" className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Cliente
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB AGREGADOS ===== */}
          <TabsContent value="agregados">
            {/* Payment status + register button (Contas a Pagar) */}
            <div className="flex flex-col gap-2 mb-4">
              {filterStartDate && filterEndDate ? (
                currentPeriodPayments.length > 0 ? (() => {
                  const totalLiqCalc = sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
                  const allPaymentsInRange = [...currentPeriodPayments, ...subPeriodPayments];
                  const totalExpectedSum = sumExpectedByPeriod(allPaymentsInRange);
                  const totalLiq = totalExpectedSum > 0 ? Math.min(totalLiqCalc, totalExpectedSum) : totalLiqCalc;
                  const allPaidInRange = totalPaidAmount + totalSubPeriodPaid;
                  const saldo = totalLiq - allPaidInRange;
                  const isPartial = saldo > 0.01;
                  const isOverpaid = saldo < -0.01;
                  const excesso = Math.abs(saldo);
                  return (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={isPartial ? "bg-orange-500/20 text-orange-600 border-0 gap-1" : isOverpaid ? "bg-blue-500/20 text-blue-600 border-0 gap-1" : "bg-green-500/20 text-green-600 border-0 gap-1"}>
                        <CheckCircle2 className="h-3 w-3" />
                        {isPartial ? "Parcial" : isOverpaid ? "Pago com Excesso" : "Período Pago"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Total Pago: {formatCurrency(allPaidInRange)}
                        {isPartial && <span className="text-destructive font-semibold ml-1">| Saldo: {formatCurrency(saldo)}</span>}
                        {isOverpaid && <span className="text-blue-600 font-semibold ml-1">| Excesso: {formatCurrency(excesso)}</span>}
                      </span>
                      {isPartial && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => setPaymentDialogOpen(true)}>
                          <DollarSign className="h-3.5 w-3.5 mr-1" /> Novo Pagamento
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {currentPeriodPayments.map((p) => {
                        const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
                        return (
                          <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>• {dateLabel}: {formatCurrency(p.total_amount)}</span>
                            <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px] gap-0.5 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10" onClick={() => handleDeletePayment(p.id)}>
                              <Undo2 className="h-2.5 w-2.5" /> Estornar
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    {subPeriodPayments.length > 0 && (
                      <div className="bg-muted/50 border border-border rounded p-2 space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">💰 Outros pagamentos em sub-períodos:</p>
                        {subPeriodPayments.map((p) => {
                          const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
                          return (
                            <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>• {formatDate(p.period_start)} a {formatDate(p.period_end)} — {dateLabel}: {formatCurrency(p.total_amount)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })() : subPeriodPayments.length > 0 ? (() => {
                  const totalLiqCalcSub = sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
                  const subExpectedSum = sumExpectedByPeriod(subPeriodPayments);
                  const totalLiqSub = subExpectedSum > 0 ? Math.min(totalLiqCalcSub, subExpectedSum) : totalLiqCalcSub;
                  const saldoSub = totalLiqSub - totalSubPeriodPaid;
                  const isFullyPaid = saldoSub <= 0.01;
                  const isOverpaidSub = saldoSub < -0.01;
                  const excessoSub = Math.abs(saldoSub);
                  return (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={isOverpaidSub ? "bg-blue-500/20 text-blue-600 border-0 gap-1" : isFullyPaid ? "bg-green-500/20 text-green-600 border-0 gap-1" : "bg-orange-500/20 text-orange-600 border-0 gap-1"}>
                        <CheckCircle2 className="h-3 w-3" />
                        {isOverpaidSub ? "Pago com Excesso" : isFullyPaid ? "Período Pago" : "Parcial"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Total Pago: {formatCurrency(totalSubPeriodPaid)}
                        {!isFullyPaid && !isOverpaidSub && <span className="text-destructive font-semibold ml-1">| Saldo: {formatCurrency(saldoSub)}</span>}
                        {isOverpaidSub && <span className="text-blue-600 font-semibold ml-1">| Excesso: {formatCurrency(excessoSub)}</span>}
                      </span>
                      {!isFullyPaid && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => setPaymentDialogOpen(true)}>
                          <DollarSign className="h-3.5 w-3.5 mr-1" /> Novo Pagamento
                        </Button>
                      )}
                    </div>
                    <div className="bg-muted/50 border border-border rounded p-2 space-y-1.5">
                      <p className="text-xs font-semibold text-foreground">💰 Pagamentos em sub-períodos:</p>
                      {subPeriodPayments.map((p) => {
                        const dateLabel = p.notes?.match(/Lançamento em (.+)/)?.[1] || new Date(p.created_at).toLocaleDateString("pt-BR");
                        return (
                          <div key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>• {formatDate(p.period_start)} a {formatDate(p.period_end)} — {dateLabel}: {formatCurrency(p.total_amount)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                })() : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-orange-500 border-orange-300">
                      <Clock className="h-3 w-3" />
                      Não Pago
                    </Badge>
                    <Button size="sm" className="h-7 text-xs" onClick={() => setPaymentDialogOpen(true)}>
                      <DollarSign className="h-3.5 w-3.5 mr-1" /> Registrar Pagamento
                    </Button>
                  </div>
                )
              ) : (
                <span className="text-xs text-muted-foreground italic">Defina início e fim do período para registrar pagamento</span>
              )}
              {accumulatedPastBalance > 0.01 && filterStartDate && filterEndDate && (
                <div className="flex items-center gap-2 px-2 py-1 rounded bg-destructive/10 border border-destructive/20">
                  <span className="text-xs font-semibold text-destructive">📌 Saldo acumulado de períodos anteriores: {formatCurrency(accumulatedPastBalance)}</span>
                </div>
              )}
              {accumulatedPastBalance < -0.01 && filterStartDate && filterEndDate && (
                <div className="flex items-center gap-2 px-2 py-1 rounded bg-blue-500/10 border border-blue-300/30">
                  <span className="text-xs font-semibold text-blue-600">💰 Crédito acumulado de períodos anteriores: {formatCurrency(Math.abs(accumulatedPastBalance))}</span>
                </div>
              )}
            </div>
            {isMobile ? (
              <div className="space-y-4">
                {sortedAgregados.map((a) => {
                  const data = getAgregadoData(a);
                  return (
                    <AgregadoMobileCard
                      key={a.id}
                      assignment={a}
                      data={data}
                      editingStartDateId={editingStartDateId}
                      editingStartDateValue={editingStartDateValue}
                      editingEndDateId={editingEndDateId}
                      editingEndDateValue={editingEndDateValue}
                      editingDailyId={editingDailyId}
                      editingDailyValue={editingDailyValue}
                      onStartEditStartDate={(id, val) => { setEditingStartDateId(id); setEditingStartDateValue(val); }}
                      onSaveStartDate={handleSaveStartDate}
                      onCancelStartDate={() => { setEditingStartDateId(null); setEditingStartDateValue(""); }}
                      onChangeStartDate={setEditingStartDateValue}
                      onStartEditEndDate={(id, val) => { setEditingEndDateId(id); setEditingEndDateValue(val); }}
                      onSaveEndDate={handleSaveEndDate}
                      onCancelEndDate={() => { setEditingEndDateId(null); setEditingEndDateValue(""); }}
                      onChangeEndDate={setEditingEndDateValue}
                      onStartEditDaily={(id, val) => { setEditingDailyId(id); setEditingDailyValue(val); }}
                      onSaveDaily={handleSaveDailyValue}
                      onCancelDaily={() => { setEditingDailyId(null); setEditingDailyValue(""); }}
                      onChangeDaily={setEditingDailyValue}
                      onOpenDiscount={openDiscountDialog}
                      onRemove={handleRemoveAssignment}
                    />
                  );
                })}
                {sortedAgregados.length > 0 && (
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Dias</span>
                      <span className="font-semibold">{sortedAgregados.reduce((s, a) => s + getAgregadoData(a).days, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Descontos</span>
                      <span className="text-destructive">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalDescontos, 0))}</span>
                    </div>
                    {accumulatedPastBalance > 0.01 && filterStartDate && filterEndDate && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-destructive">📌 Saldo anterior (faltou)</span>
                        <span className="text-destructive font-semibold">+{formatCurrency(accumulatedPastBalance)}</span>
                      </div>
                    )}
                    {accumulatedPastBalance < -0.01 && filterStartDate && filterEndDate && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-blue-600">💰 Crédito anterior (pago a mais)</span>
                        <span className="text-blue-600 font-semibold">-{formatCurrency(Math.abs(accumulatedPastBalance))}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Líquido</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0) + (Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <Card className="border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:h-8 [&>th]:px-2 [&>th]:text-xs">
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "motorista"))}><div className="flex items-center">Motorista<SortIcon col="motorista" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "placa"))}><div className="flex items-center">Placa<SortIcon col="placa" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "proprietario"))}><div className="flex items-center">Proprietário<SortIcon col="proprietario" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "inicio"))}><div className="flex items-center">Início<SortIcon col="inicio" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "fim"))}><div className="flex items-center">Fim<SortIcon col="fim" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="text-center cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "dias"))}><div className="flex items-center justify-center">Dias<SortIcon col="dias" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "diaria"))}><div className="flex items-center">Diária<SortIcon col="diaria" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "descontos"))}><div className="flex items-center">Descontos<SortIcon col="descontos" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="cursor-pointer select-none" onClick={() => setAgregadoSort(toggleSort(agregadoSort, "liquido"))}><div className="flex items-center">Líquido<SortIcon col="liquido" sort={agregadoSort} /></div></TableHead>
                       <TableHead className="w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedAgregados.map((a) => {
                      const data = getAgregadoData(a);
                      return (
                        <TableRow key={a.id} className="[&>td]:py-1.5 [&>td]:px-2">
                          <TableCell className="font-medium whitespace-nowrap">{a.driver_name}</TableCell>
                          <TableCell className="font-mono">{a.vehicle_plate}</TableCell>
                          <TableCell className="whitespace-nowrap">{a.owner_name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {editingStartDateId === a.id ? (
                              <div className="flex items-center gap-1">
                                <Input type="date" className="h-6 text-xs w-28" value={editingStartDateValue} onChange={(e) => setEditingStartDateValue(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveStartDate(a.id); if (e.key === "Escape") { setEditingStartDateId(null); setEditingStartDateValue(""); } }} />
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => handleSaveStartDate(a.id)}><Check className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingStartDateId(null); setEditingStartDateValue(""); }}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 cursor-pointer" onClick={() => { setEditingStartDateId(a.id); setEditingStartDateValue(a.start_date); }}>
                                <span>{formatDate(a.start_date)}</span>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {editingEndDateId === a.id ? (
                              <div className="flex items-center gap-1">
                                <Input type="date" className="h-6 text-xs w-28" value={editingEndDateValue} onChange={(e) => setEditingEndDateValue(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveEndDate(a.id); if (e.key === "Escape") { setEditingEndDateId(null); setEditingEndDateValue(""); } }} />
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => handleSaveEndDate(a.id)}><Check className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingEndDateId(null); setEditingEndDateValue(""); }}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 cursor-pointer" onClick={() => { setEditingEndDateId(a.id); setEditingEndDateValue(a.end_date || ""); }}>
                                <span className={a.end_date ? "" : "text-muted-foreground"}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{data.days}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {editingDailyId === a.id ? (
                              <div className="flex items-center gap-1">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[10px]">R$</span>
                                  <Input className="h-6 text-xs w-24 pl-7" value={editingDailyValue ? maskCurrency(String(Math.round(parseFloat(editingDailyValue) * 100))) : ""} onChange={(e) => setEditingDailyValue(unmaskCurrency(e.target.value))} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleSaveDailyValue(a.id); if (e.key === "Escape") { setEditingDailyId(null); setEditingDailyValue(""); } }} />
                                </div>
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => handleSaveDailyValue(a.id)}><Check className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingDailyId(null); setEditingDailyValue(""); }}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5">
                                <span>{formatCurrency(data.dv)}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingDailyId(a.id); setEditingDailyValue(String(data.dv)); }}><Pencil className="h-3 w-3" /></Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <span className={data.totalDescontos > 0 ? "text-destructive font-medium whitespace-nowrap" : "text-muted-foreground"}>
                                {data.totalDescontos > 0 ? `- ${formatCurrency(data.totalDescontos)}` : "—"}
                              </span>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => openDiscountDialog(a)}><MinusCircle className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold whitespace-nowrap">{formatCurrency(data.totalLiquido)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => handleRemoveAssignment(a.id)}><Trash2 className="h-3 w-3" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {accumulatedPastBalance > 0.01 && filterStartDate && filterEndDate && (
                      <TableRow className="bg-destructive/5 [&>td]:py-1 [&>td]:px-2">
                        <TableCell colSpan={8} className="text-right text-xs text-destructive">📌 Saldo acumulado anterior (faltou)</TableCell>
                        <TableCell className="text-destructive whitespace-nowrap font-semibold">{formatCurrency(accumulatedPastBalance)}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                    {accumulatedPastBalance < -0.01 && filterStartDate && filterEndDate && (
                      <TableRow className="bg-blue-500/5 [&>td]:py-1 [&>td]:px-2">
                        <TableCell colSpan={8} className="text-right text-xs text-blue-600">💰 Crédito acumulado anterior (pago a mais)</TableCell>
                        <TableCell className="text-blue-600 whitespace-nowrap font-semibold">- {formatCurrency(Math.abs(accumulatedPastBalance))}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                      <TableCell colSpan={5} className="text-right text-xs">TOTAIS</TableCell>
                      <TableCell className="text-center">{sortedAgregados.reduce((s, a) => s + getAgregadoData(a).days, 0)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalDescontos, 0))}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0) + (Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0))}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
            )}
          </TabsContent>

          {/* ===== TAB FATURAMENTO ===== */}
          <TabsContent value="faturamento">
            {isMobile ? (
              <div className="space-y-4">
                {sortedFaturamento.map((a) => {
                  const fat = getFaturamentoData(a);
                  return (
                    <FaturamentoMobileCard
                      key={a.id}
                      assignment={a}
                      data={fat}
                      onOpenCompanyDiscount={openCompanyDiscountDialog}
                    />
                  );
                })}
                {sortedFaturamento.length > 0 && (
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Dias</span>
                      <span className="font-semibold">{sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).days, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Bruto</span>
                      <span>{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Líq. Terceiros</span>
                      <span className="text-orange-500">{formatCurrency(sortedFaturamento.filter(a => a.fleet_type !== "propria").reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Líq. Frota Própria</span>
                      <span className="text-blue-600">{formatCurrency(sortedFaturamento.filter(a => a.fleet_type === "propria").reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Descontos</span>
                      <span className="text-destructive">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fat. Líquido</span>
                      <span className="text-lg font-bold text-green-600">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <Card className="border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:h-8 [&>th]:px-2 [&>th]:text-xs">
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "motorista"))}><div className="flex items-center">Motorista<SortIcon col="motorista" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "placa"))}><div className="flex items-center">Placa<SortIcon col="placa" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "proprietario"))}><div className="flex items-center">Proprietário<SortIcon col="proprietario" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "inicio"))}><div className="flex items-center">Início<SortIcon col="inicio" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "fim"))}><div className="flex items-center">Fim<SortIcon col="fim" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "dias"))}><div className="flex items-center justify-center">Dias<SortIcon col="dias" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "diaria_emp"))}><div className="flex items-center">Diária Emp.<SortIcon col="diaria_emp" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "bruto"))}><div className="flex items-center">Bruto<SortIcon col="bruto" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "liq_terc"))}><div className="flex items-center">Líq. Terc.<SortIcon col="liq_terc" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "desc_emp"))}><div className="flex items-center">Descontos<SortIcon col="desc_emp" sort={faturamentoSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setFaturamentoSort(toggleSort(faturamentoSort, "fat_liq"))}><div className="flex items-center">Fat. Líq.<SortIcon col="fat_liq" sort={faturamentoSort} /></div></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedFaturamento.map((a) => {
                      const fat = getFaturamentoData(a);
                      return (
                        <TableRow key={a.id} className="[&>td]:py-1.5 [&>td]:px-2">
                          <TableCell className="font-medium whitespace-nowrap">{a.driver_name}</TableCell>
                          <TableCell className="font-mono">{a.vehicle_plate}</TableCell>
                          <TableCell className="whitespace-nowrap">{a.owner_name}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {editingStartDateId === a.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="date"
                                  className="h-6 text-xs w-28"
                                  value={editingStartDateValue}
                                  onChange={(e) => setEditingStartDateValue(e.target.value)}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveStartDate(a.id);
                                    if (e.key === "Escape") { setEditingStartDateId(null); setEditingStartDateValue(""); }
                                  }}
                                />
                                <Button variant="ghost" size="icon" className="h-5 w-5 text-green-600" onClick={() => handleSaveStartDate(a.id)}>
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setEditingStartDateId(null); setEditingStartDateValue(""); }}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-0.5 cursor-pointer" onClick={() => { setEditingStartDateId(a.id); setEditingStartDateValue(a.start_date); }}>
                                <span>{formatDate(a.start_date)}</span>
                                <Pencil className="h-3 w-3 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className={a.end_date ? "" : "text-muted-foreground"}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
                          </TableCell>
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
                        </TableRow>
                      );
                    })}
                    {(() => {
                      const totDias = sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).days, 0);
                      const totBruto = sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0);
                      const totLiqPropria = sortedFaturamento.filter(a => a.fleet_type === "propria").reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0);
                      const totLiqTerceiros = sortedFaturamento.filter(a => a.fleet_type !== "propria").reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0);
                      const totDesc = sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0);
                      const totFat = sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0);
                      return (
                        <>
                          <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                            <TableCell colSpan={5} className="text-right text-xs">TOTAIS</TableCell>
                            <TableCell className="text-center">{totDias}</TableCell>
                            <TableCell></TableCell>
                            <TableCell className="whitespace-nowrap">{formatCurrency(totBruto)}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex flex-col leading-tight">
                                <span className="text-orange-500">{formatCurrency(totLiqTerceiros)}<span className="text-[10px] text-muted-foreground ml-1">terc.</span></span>
                                <span className="text-blue-600">{formatCurrency(totLiqPropria)}<span className="text-[10px] text-muted-foreground ml-1">própria</span></span>
                              </div>
                            </TableCell>
                            <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(totDesc)}</TableCell>
                            <TableCell className="text-green-600 whitespace-nowrap">{formatCurrency(totFat)}</TableCell>
                          </TableRow>
                        </>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
            </Card>
            )}
          </TabsContent>

          {/* ===== TAB CLIENTE ===== */}
          <TabsContent value="cliente">
            {/* Gerar Previsão de Recebimento (Contas a Receber) */}
            <div className="flex items-center gap-2 mb-4">
              {sortedCliente.length > 0 && job?.client_id ? (
                <>
                  <Button
                    onClick={handleCreatePrevisao}
                    disabled={savingPrevisao || !filterStartDate || !filterEndDate}
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    variant="outline"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    {savingPrevisao ? "Gerando..." : "Gerar Previsão de Recebimento"}
                  </Button>
                  {(!filterStartDate || !filterEndDate) && (
                    <span className="text-xs text-muted-foreground italic">Defina início e fim do período</span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">Vincule um cliente ao serviço para gerar previsões</span>
              )}
            </div>
            {isMobile ? (
              <div className="space-y-4">
                {sortedCliente.map((a) => {
                  const c = getClienteData(a);
                  return (
                    <ClienteMobileCard
                      key={a.id}
                      assignment={a}
                      data={c}
                    />
                  );
                })}
                {sortedCliente.length > 0 && (
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Dias</span>
                      <span className="font-semibold">{sortedCliente.reduce((s, a) => s + getClienteData(a).days, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Descontos</span>
                      <span className="text-destructive">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).totalDescontos, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Cliente</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).totalLiquido, 0))}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
            <Card className="border-border overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="[&>th]:h-8 [&>th]:px-2 [&>th]:text-xs">
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "motorista"))}><div className="flex items-center">Motorista<SortIcon col="motorista" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "placa"))}><div className="flex items-center">Placa<SortIcon col="placa" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "inicio"))}><div className="flex items-center">Início<SortIcon col="inicio" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "fim"))}><div className="flex items-center">Fim<SortIcon col="fim" sort={clienteSort} /></div></TableHead>
                      <TableHead className="text-center cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "dias"))}><div className="flex items-center justify-center">Dias<SortIcon col="dias" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "diaria_cli"))}><div className="flex items-center">Diária<SortIcon col="diaria_cli" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "bruto"))}><div className="flex items-center">Bruto<SortIcon col="bruto" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "desc_cli"))}><div className="flex items-center">Descontos<SortIcon col="desc_cli" sort={clienteSort} /></div></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => setClienteSort(toggleSort(clienteSort, "liq_cli"))}><div className="flex items-center">Líquido<SortIcon col="liq_cli" sort={clienteSort} /></div></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCliente.map((a) => {
                      const c = getClienteData(a);
                      return (
                        <TableRow key={a.id} className="[&>td]:py-1.5 [&>td]:px-2">
                          <TableCell className="font-medium whitespace-nowrap">{a.driver_name}</TableCell>
                          <TableCell className="font-mono">{a.vehicle_plate}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(a.start_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className={a.end_date ? "" : "text-muted-foreground"}>{a.end_date ? formatDate(a.end_date) : "—"}</span>
                          </TableCell>
                          <TableCell className="text-center">{c.days}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(c.dvCliente)}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(c.totalBruto)}</TableCell>
                          <TableCell>
                            <span className={c.totalDescontos > 0 ? "text-destructive font-medium whitespace-nowrap" : "text-muted-foreground"}>
                              {c.totalDescontos > 0 ? `- ${formatCurrency(c.totalDescontos)}` : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="font-bold text-primary whitespace-nowrap">{formatCurrency(c.totalLiquido)}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                      <TableCell colSpan={4} className="text-right text-xs">TOTAIS</TableCell>
                      <TableCell className="text-center">{sortedCliente.reduce((s, a) => s + getClienteData(a).days, 0)}</TableCell>
                      <TableCell></TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).totalBruto, 0))}</TableCell>
                      <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).totalDescontos, 0))}</TableCell>
                      <TableCell className="text-primary whitespace-nowrap">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).totalLiquido, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
            )}
          </TabsContent>
        </Tabs>
        )}
      </main>
      {/* PDF Options Dialog */}
      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Opções do Relatório PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="useCustomPdfDiscountPeriod"
                checked={useCustomPdfDiscountPeriod}
                onCheckedChange={(checked) => {
                  setUseCustomPdfDiscountPeriod(!!checked);
                  if (!checked) { setPdfDiscountStartDate(""); setPdfDiscountEndDate(""); }
                }}
              />
              <label htmlFor="useCustomPdfDiscountPeriod" className="text-sm font-medium cursor-pointer">Período de descontos personalizado</label>
            </div>
            {useCustomPdfDiscountPeriod && (
              <>
                <p className="text-xs text-muted-foreground">Defina o período dos descontos a incluir no relatório.</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={pdfDiscountStartDate}
                    onChange={(e) => setPdfDiscountStartDate(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <span className="text-xs text-muted-foreground shrink-0">até</span>
                  <Input
                    type="date"
                    value={pdfDiscountEndDate}
                    onChange={(e) => setPdfDiscountEndDate(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                </div>
                {(pdfDiscountStartDate || pdfDiscountEndDate) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setPdfDiscountStartDate(""); setPdfDiscountEndDate(""); }}>
                    Limpar datas
                  </Button>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPdfDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => { setPdfDialogOpen(false); exportPDF(pendingPdfType, useCustomPdfDiscountPeriod, pdfDiscountStartDate, pdfDiscountEndDate); }}>
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Registration Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={(open) => { setPaymentDialogOpen(open); if (!open) { setPartialPaymentValue(""); setPaymentDate(""); setPaymentDueDate(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm">
              <p className="text-muted-foreground">Período:</p>
              <p className="font-semibold">{filterStartDate ? formatDate(filterStartDate) : "—"} até {filterEndDate ? formatDate(filterEndDate) : "—"}</p>
            </div>
            {driverSearch.trim() && (
              <div className="text-sm">
                <p className="text-muted-foreground">Filtro aplicado:</p>
                <p className="font-semibold text-primary">{driverSearch}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ({getFilteredAssignmentsForPayment().length} motorista(s) no resultado)
                </p>
              </div>
            )}
            {(() => {
              const totalLiquidoBase = sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0);
              const saldoAnterior = Math.abs(accumulatedPastBalance) > 0.01 ? accumulatedPastBalance : 0;
              const totalLiquido = totalLiquidoBase + saldoAnterior;
              const remainingBalance = totalLiquido - totalPaidAmount;
              const hasCustomPayment = partialPaymentValue !== "";
              const paymentAmount = hasCustomPayment ? Number(partialPaymentValue) / 100 : remainingBalance;
              const isPartial = hasCustomPayment && (totalPaidAmount + paymentAmount) < totalLiquido;
              return (
                <>
                  <div className="text-sm">
                    <p className="text-muted-foreground">Total Líquido Agregados:</p>
                    <p className="font-bold text-lg text-primary">
                      {formatCurrency(totalLiquido)}
                    </p>
                    {saldoAnterior > 0.01 && (
                      <p className="text-xs text-destructive">inclui saldo anterior (faltou): +{formatCurrency(saldoAnterior)}</p>
                    )}
                    {saldoAnterior < -0.01 && (
                      <p className="text-xs text-blue-600">inclui crédito anterior (pago a mais): -{formatCurrency(Math.abs(saldoAnterior))}</p>
                    )}
                  </div>
                  {totalPaidAmount > 0 && (
                    <div className="text-sm">
                      <p className="text-muted-foreground">Já pago ({currentPeriodPayments.length} lançamento{currentPeriodPayments.length > 1 ? "s" : ""}):</p>
                      <p className="font-semibold text-green-600">{formatCurrency(totalPaidAmount)}</p>
                      <p className="text-xs text-muted-foreground">Saldo restante: <span className="font-semibold text-destructive">{formatCurrency(remainingBalance)}</span></p>
                    </div>
                  )}
                  <div className="text-sm space-y-1.5">
                    <p className="text-muted-foreground">Valor do pagamento:</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">R$</span>
                        <Input
                          className="pl-7 h-9"
                          placeholder={maskCurrency(String(Math.round(remainingBalance * 100)))}
                          value={hasCustomPayment ? maskCurrency(partialPaymentValue) : ""}
                          onChange={(e) => setPartialPaymentValue(e.target.value.replace(/\D/g, ""))}
                        />
                      </div>
                      {hasCustomPayment && (
                        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setPartialPaymentValue("")}>
                          Total
                        </Button>
                      )}
                    </div>
                    {isPartial && (
                      <p className="text-xs text-orange-500 font-medium">⚠ Pagamento parcial ({formatCurrency(paymentAmount)} de {formatCurrency(totalLiquido)})</p>
                    )}
                  </div>
                  <div className="text-sm space-y-1.5">
                    <Label htmlFor="payment-due-date" className="text-muted-foreground text-xs">Data de vencimento *</Label>
                    <Input
                      id="payment-due-date"
                      type="date"
                      className="h-9"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                    />
                  </div>
                  <div className="text-sm space-y-1.5">
                    <Label htmlFor="payment-date" className="text-muted-foreground text-xs">Data do lançamento (opcional):</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      className="h-9"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Ao confirmar, será gerada uma conta a pagar com o vencimento informado.</p>
                  <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => setPaymentDialogOpen(false)}>Cancelar</Button>
                    <Button size="sm" onClick={() => handleRegisterPayment(paymentAmount, totalLiquido)} disabled={savingPayment || paymentAmount < 0 || !paymentDueDate}>
                      {savingPayment ? "Salvando..." : isPartial ? "Confirmar Parcial" : "Confirmar Pagamento"}
                    </Button>
                  </DialogFooter>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
