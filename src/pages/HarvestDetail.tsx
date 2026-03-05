import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Sprout, ArrowLeft, Plus, Trash2, Users, Calendar, DollarSign, MapPin, User, Building2, FileText, TrendingUp, MinusCircle, Pencil, Check, X, Download, FileSpreadsheet, File, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
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
  const { user, isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
    monthly_value: "",
  });
  const [discountForm, setDiscountForm] = useState({
    type: "falta",
    description: "",
    value: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [discountStartDate, setDiscountStartDate] = useState("");
  const [discountEndDate, setDiscountEndDate] = useState("");
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
  const [pdfDiscountStartDate, setPdfDiscountStartDate] = useState("");
  const [pdfDiscountEndDate, setPdfDiscountEndDate] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin && !isModerator) navigate("/");
  }, [isAdmin, isModerator, roleLoading, navigate]);

  useEffect(() => {
    if ((isAdmin || isModerator) && id) fetchAll();
  }, [isAdmin, isModerator, id]);

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
            const raw = ownerData?.nome_fantasia || ownerData?.full_name || "";
            if (raw) {
              const skip = new Set(["e", "do", "da", "das", "dos", "de", "&"]);
              const parts = raw.split(" ").filter(Boolean);
              const first = parts[0] || "";
              const second = parts.slice(1).find((p: string) => !skip.has(p.toLowerCase())) || "";
              ownerName = second ? `${first} ${second}` : first;
            } else {
              ownerName = "—";
            }
          }

          const today = new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
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
      setAssignForm({ user_id: "", vehicle_id: "", start_date: new Date().toISOString().split("T")[0], daily_value: "", monthly_value: "" });
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
      lines.push(["", "", "", "TOTAIS", formatCurrency(totFatDiariasCSV), formatCurrency(totBruto), formatCurrency(totTerc), formatCurrency(totDesc), formatCurrency(totFat)].join(sep));
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
    setPdfDiscountStartDate(discountStartDate);
    setPdfDiscountEndDate(discountEndDate);
    setPdfDialogOpen(true);
  };

  const exportPDF = (type: "agregados" | "faturamento" | "cliente" | "ambos", pdfDiscStart: string = "", pdfDiscEnd: string = "") => {
    // Local discount filter for PDF using provided dates
    const pdfFilterDiscounts = (discounts: Discount[]) => {
      const sd = pdfDiscStart || filterStartDate;
      const ed = pdfDiscEnd || filterEndDate;
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
    const hasDiscountPeriod = !!(pdfDiscStart || pdfDiscEnd);

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
      const dvEmpresa = a.company_daily_value || companyDailyValue;
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
    const activeAssignments = filterBySearch(assignments);
    if (activeAssignments.length === 0) {
      toast({ title: "Nenhum dado para exportar", variant: "destructive" });
      return;
    }
    const tableStyle = `table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:11px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f5f5f5;font-weight:600}.total-row{background:#f0f0f0;font-weight:700}.right{text-align:right}.center{text-align:center}h2{font-size:16px;margin:16px 0 4px}h3{font-size:13px;color:#666;margin:0 0 12px}body{font-family:Arial,sans-serif;padding:20px}`;
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

    const discPeriodLabel = hasDiscountPeriod
      ? ` | Descontos: ${pdfDiscStart ? formatDate(pdfDiscStart) : "início"} até ${pdfDiscEnd ? formatDate(pdfDiscEnd) : "atual"}`
      : '';

    if (type === "agregados" || type === "ambos") {
      html += `<h2>Relatório Agregados — ${job!.farm_name}</h2>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel}</h3>`;
      if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const d = pdfGetAgregadoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
        });
        const totAgrDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
        const totAgrDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
        const totAgrLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totAgrDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totAgrDesc)}</td><td class="right">${formatCurrency(totAgrLiq)}</td></tr></tbody></table>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const d = pdfGetAgregadoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${d.days}</td><td class="right">${formatCurrency(d.dv)}</td><td class="right">${formatCurrency(d.totalBruto)}</td><td class="right">${formatCurrency(d.totalDescontos)}</td><td class="right">${formatCurrency(d.totalLiquido)}</td></tr>`;
        });
        const totAgrDias = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).days, 0);
        const totAgrDesc = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalDescontos, 0);
        const totAgrLiq = activeAssignments.reduce((s, a) => s + pdfGetAgregadoData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="3" class="right">TOTAIS</td><td class="center">${totAgrDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totAgrDesc)}</td><td class="right">${formatCurrency(totAgrLiq)}</td></tr></tbody></table>`;
      }
    }
    if (type === "faturamento" || type === "ambos") {
      html += `<h2>Relatório Faturamento — ${job!.farm_name}</h2>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel}</h3>`;
      if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária Emp.</th><th>Bruto</th><th>Líq. Terc.</th><th>Desc. Emp.</th><th>Fat. Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const f = pdfGetFaturamentoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${f.days}</td><td class="right">${formatCurrency(f.dvEmpresa)}</td><td class="right">${formatCurrency(f.totalBruto)}</td><td class="right">${formatCurrency(f.liquidoTerceiros)}</td><td class="right">${formatCurrency(f.descontosEmpresa)}</td><td class="right">${formatCurrency(f.faturamentoLiquido)}</td></tr>`;
        });
        const totFatDias = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).days, 0);
        const totBruto = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).totalBruto, 0);
        const totTerc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).liquidoTerceiros, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).descontosEmpresa, 0);
        const totFat = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).faturamentoLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totFatDias}</td><td colspan="1"></td><td class="right">${formatCurrency(totBruto)}</td><td class="right">${formatCurrency(totTerc)}</td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totFat)}</td></tr></tbody></table>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária Emp.</th><th>Bruto</th><th>Líq. Terc.</th><th>Desc. Emp.</th><th>Fat. Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const f = pdfGetFaturamentoData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${f.days}</td><td class="right">${formatCurrency(f.dvEmpresa)}</td><td class="right">${formatCurrency(f.totalBruto)}</td><td class="right">${formatCurrency(f.liquidoTerceiros)}</td><td class="right">${formatCurrency(f.descontosEmpresa)}</td><td class="right">${formatCurrency(f.faturamentoLiquido)}</td></tr>`;
        });
        const totFatDias = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).days, 0);
        const totBruto = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).totalBruto, 0);
        const totTerc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).liquidoTerceiros, 0);
        const totDesc = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).descontosEmpresa, 0);
        const totFat = activeAssignments.reduce((s, a) => s + pdfGetFaturamentoData(a).faturamentoLiquido, 0);
        html += `<tr class="total-row"><td colspan="3" class="right">TOTAIS</td><td class="center">${totFatDias}</td><td colspan="1"></td><td class="right">${formatCurrency(totBruto)}</td><td class="right">${formatCurrency(totTerc)}</td><td class="right">${formatCurrency(totDesc)}</td><td class="right">${formatCurrency(totFat)}</td></tr></tbody></table>`;
      }
    }
    if (type === "cliente" || type === "ambos") {
      html += `<h2>Relatório Cliente — ${job!.farm_name}</h2>`;
      if (hasFilter) html += `<h3>Período: ${filterInicioLabel} até ${filterFimLabel}${discPeriodLabel}</h3>`;
      if (hasFilter) {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Período Início</th><th>Período Fim</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const c = pdfGetClienteData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${getEffectiveStart(a)}</td>${fimCell(a)}<td class="center">${c.days}</td><td class="right">${formatCurrency(c.dvCliente)}</td><td class="right">${formatCurrency(c.totalBruto)}</td><td class="right">${formatCurrency(c.totalDescontos)}</td><td class="right">${formatCurrency(c.totalLiquido)}</td></tr>`;
        });
        const totCliDias = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).days, 0);
        const totCliDesc = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalDescontos, 0);
        const totCliLiq = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="4" class="right">TOTAIS</td><td class="center">${totCliDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totCliDesc)}</td><td class="right">${formatCurrency(totCliLiq)}</td></tr></tbody></table>`;
      } else {
        html += `<table><thead><tr><th>Motorista</th><th>Placa</th><th>Início</th><th class="center">Dias</th><th>Diária</th><th>Bruto</th><th>Descontos</th><th>Líquido</th></tr></thead><tbody>`;
        activeAssignments.forEach(a => {
          const c = pdfGetClienteData(a);
          html += `<tr><td>${a.driver_name}</td><td>${a.vehicle_plate}</td><td>${formatDate(a.start_date)}</td><td class="center">${c.days}</td><td class="right">${formatCurrency(c.dvCliente)}</td><td class="right">${formatCurrency(c.totalBruto)}</td><td class="right">${formatCurrency(c.totalDescontos)}</td><td class="right">${formatCurrency(c.totalLiquido)}</td></tr>`;
        });
        const totCliDias = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).days, 0);
        const totCliDesc = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalDescontos, 0);
        const totCliLiq = activeAssignments.reduce((s, a) => s + pdfGetClienteData(a).totalLiquido, 0);
        html += `<tr class="total-row"><td colspan="3" class="right">TOTAIS</td><td class="center">${totCliDias}</td><td colspan="1"></td><td colspan="1"></td><td class="right">${formatCurrency(totCliDesc)}</td><td class="right">${formatCurrency(totCliLiq)}</td></tr></tbody></table>`;
      }
    }
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório - ${job!.farm_name}</title><style>${tableStyle}@media print{@page{size:landscape;margin:8mm}body{font-size:9px}table{font-size:9px}th,td{padding:3px 5px}}</style></head><body>${html}</body></html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 300);
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
    setDiscountForm({ type: "falta", description: "", value: "", date: new Date().toISOString().split("T")[0] });
    setDiscountDialogOpen(true);
  };

  const openCompanyDiscountDialog = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setDiscountForm({ type: "falta", description: "", value: "", date: new Date().toISOString().split("T")[0] });
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
      setDiscountForm({ type: "falta", description: "", value: "", date: new Date().toISOString().split("T")[0] });
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
    const startDate = discountStartDate || filterStartDate;
    const endDate = discountEndDate || filterEndDate;
    if (!startDate && !endDate) return discounts;
    return discounts.filter(d => {
      if (!d.date) return true; // descontos sem data sempre aparecem
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
    const today = new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
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
    const dvEmpresa = a.company_daily_value || companyDailyValue;
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

  const filterByDateRange = (list: Assignment[]) => {
    if (!filterStartDate && !filterEndDate) return list;
    return list.filter(a => {
      const assignEnd = a.end_date
        ? new Date(a.end_date + "T00:00:00")
        : new Date(new Date().toISOString().split("T")[0] + "T00:00:00");
      const assignStart = new Date(a.start_date + "T00:00:00");

      // If filter has a start date, the assignment must not have ended before it
      if (filterStartDate && assignEnd < new Date(filterStartDate + "T00:00:00")) return false;
      // If filter has an end date, the assignment must have started on or before it
      if (filterEndDate && assignStart > new Date(filterEndDate + "T00:00:00")) return false;
      return true;
    });
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

  const sortedAgregados = filterBySearch(sortAssignments(assignments, agregadoSort, getAgregadoData));
  const sortedFaturamento = filterBySearch(sortAssignments(assignments, faturamentoSort, getFaturamentoData));
  const sortedCliente = filterBySearch(sortAssignments(assignments, clienteSort, getClienteData));

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        {/* Back + Title */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex items-center gap-3">
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
              <p className="font-semibold text-sm">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0))}</p>
              <p className="text-xs text-muted-foreground">terceiros{(driverSearch || filterEndDate) ? " (filtrado)" : ""}</p>
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

        {/* Vincular Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Motorista</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input type="date" value={assignForm.start_date} onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
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
                <div className="space-y-2">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={discountForm.date} onChange={(e) => setDiscountForm({ ...discountForm, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
              </div>
              {selectedAssignment && selectedAssignment.discounts.length > 0 && (
                <div className="space-y-2">
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data *</Label>
                  <Input type="date" value={discountForm.date} onChange={(e) => setDiscountForm({ ...discountForm, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={discountForm.value ? maskCurrency(String(Math.round(parseFloat(discountForm.value) * 100))) : ""} onChange={(e) => setDiscountForm({ ...discountForm, value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
              </div>
              {selectedAssignment && getCompanyDialogDiscounts(selectedAssignment).length > 0 && (
                <div className="space-y-2">
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
              <Button onClick={() => handleAddDiscount(true)} disabled={!discountForm.value} className="w-full btn-transport-accent">
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
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Vincular
              </Button>
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
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 shrink-0" onClick={() => { setFilterStartDate(job?.harvest_period_start || ""); setFilterEndDate(""); setDiscountStartDate(""); setDiscountEndDate(""); }}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0 font-medium">Descontos:</span>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Input
                type="date"
                value={discountStartDate}
                onChange={(e) => setDiscountStartDate(e.target.value)}
                className="h-8 text-xs flex-1 min-w-0"
                placeholder="Início descontos"
              />
              <span className="text-xs text-muted-foreground shrink-0">até</span>
              <Input
                type="date"
                value={discountEndDate}
                onChange={(e) => setDiscountEndDate(e.target.value)}
                className="h-8 text-xs flex-1 min-w-0"
                placeholder="Fim descontos"
              />
              {(discountStartDate || discountEndDate) && (
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2 shrink-0" onClick={() => { setDiscountStartDate(""); setDiscountEndDate(""); }}>
                  ✕
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
            {isMobile ? (
              <div className="space-y-3">
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
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Dias</span>
                      <span className="font-semibold">{sortedAgregados.reduce((s, a) => s + getAgregadoData(a).days, 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Total Descontos</span>
                      <span className="text-destructive">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalDescontos, 0))}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-border">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Líquido</span>
                      <span className="text-lg font-bold text-primary">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0))}</span>
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
                    <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                      <TableCell colSpan={5} className="text-right text-xs">TOTAIS</TableCell>
                      <TableCell className="text-center">{sortedAgregados.reduce((s, a) => s + getAgregadoData(a).days, 0)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).dv, 0))}</TableCell>
                      <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalDescontos, 0))}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedAgregados.reduce((s, a) => s + getAgregadoData(a).totalLiquido, 0))}</TableCell>
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
              <div className="space-y-3">
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
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1">
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
                      <span className="text-orange-500">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0))}</span>
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
                    <TableRow className="bg-muted/50 font-semibold [&>td]:py-1.5 [&>td]:px-2">
                      <TableCell colSpan={5} className="text-right text-xs">TOTAIS</TableCell>
                      <TableCell className="text-center">{sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).days, 0)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).dvEmpresa, 0))}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).totalBruto, 0))}</TableCell>
                      <TableCell className="text-orange-500 whitespace-nowrap">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).liquidoTerceiros, 0))}</TableCell>
                      <TableCell className="text-destructive whitespace-nowrap">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).descontosEmpresa, 0))}</TableCell>
                      <TableCell className="text-green-600 whitespace-nowrap">{formatCurrency(sortedFaturamento.reduce((s, a) => s + getFaturamentoData(a).faturamentoLiquido, 0))}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
            )}
          </TabsContent>

          {/* ===== TAB CLIENTE ===== */}
          <TabsContent value="cliente">
            {isMobile ? (
              <div className="space-y-3">
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
                  <div className="bg-muted/50 rounded-xl p-3 border border-border space-y-1">
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
                      <TableCell className="whitespace-nowrap">{formatCurrency(sortedCliente.reduce((s, a) => s + getClienteData(a).dvCliente, 0))}</TableCell>
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
          <div className="space-y-3 py-4">
            <Label className="text-sm font-medium">Período dos Descontos</Label>
            <p className="text-xs text-muted-foreground">Defina o período dos descontos a incluir no relatório. Deixe vazio para usar o mesmo período do filtro principal.</p>
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
                Limpar período de descontos
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPdfDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => { setPdfDialogOpen(false); exportPDF(pendingPdfType, pdfDiscountStartDate, pdfDiscountEndDate); }}>
              Gerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
