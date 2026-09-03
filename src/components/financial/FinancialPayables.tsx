import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { useLocation, useNavigate } from "react-router-dom";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, addDays, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Check, Search, Trash2, FileText, CalendarClock, AlertTriangle, CheckCircle2, Clock, Wrench, Car, DollarSign, Eye, Loader2, X, Undo2, Download, List, CalendarIcon, Banknote, HandCoins, Printer } from "lucide-react";
import { toast } from "sonner";
import { getLocalDateISO, normalizeDateInput, formatDateBR } from "@/lib/date";

import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog, type InstallmentContext } from "./PaymentDischargeDialog";
import { BatchPaymentDialog, type BatchItem } from "./BatchPaymentDialog";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { limitDisplayText } from "@/lib/displayText";
import { PlanoContasCombobox } from "./PlanoContasCombobox";
import { ReportInfoTooltip } from "./ReportInfoTooltip";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { PeriodFilter } from "@/components/PeriodFilter";
import { EmpresaFilter, EmpresaBadge } from "./EmpresaControls";


/**
 * Flexible value matching: digits-only comparison + numeric equality.
 * Allows queries like "2580,01", "2.580,01", "2580.01", "258001" to match 2580.01.
 */
function matchValueQuery(query: string, valor: number): boolean {
  if (!query) return false;
  if (!/[0-9]/.test(query)) return false;
  // Only consider as a value query if it's "numeric-like" (digits + , . space)
  if (!/^[\d.,\s]+$/.test(query)) {
    // Still allow substring digit match as fallback
    const qDigits = query.replace(/\D/g, "");
    if (qDigits.length === 0) return false;
    const vDigits = Math.round(valor * 100).toString();
    return vDigits.includes(qDigits);
  }
  const qDigits = query.replace(/\D/g, "");
  if (qDigits.length === 0) return false;
  const vDigits = Math.round(valor * 100).toString();
  if (vDigits === qDigits) return true;
  // Allow integer-only queries to match the integer part (e.g. "2580" matches 2580.01)
  if (!/[.,]/.test(query)) {
    const intPart = Math.trunc(valor).toString();
    if (intPart === qDigits || intPart.includes(qDigits)) return true;
  }
  // Substring match on cents-formatted digits as last resort
  return vDigits.includes(qDigits);
}


interface Installment {
  id: string;
  expense_id: string;
  numero_parcela: number;
  total_parcelas: number | null;
  valor: number;
  data_vencimento: string;
  status: string;
  boleto_url: string | null;
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
  
  numero_multa: string | null;
  origem: string;
  created_at: string;
  created_by?: string;
  data_pagamento: string | null;
  documento_fiscal_importado?: boolean;
  xml_original?: string | null;
  fornecedor_cnpj?: string | null;
  empresa_id?: string;
  unidade_id?: string | null;
  conta_bancaria_id?: string | null;
  tipo_manutencao?: string | null;
  km_atual?: number | null;
  fornecedor_mecanica?: string | null;
  tempo_parado?: string | null;
  proxima_manutencao_km?: number | null;
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

type QuickFilter = "semana" | "atrasadas" | "a_vencer";

export function FinancialPayables() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const STORAGE_KEY = "payables_filters";
  const location = useLocation();
  const navigate = useNavigate();
  // Capture initial nav state once (persists even after we clear location.state)
  const initialNavStateRef = useRef<any>((location.state as any) || {});
  const locState = initialNavStateRef.current;
  const fromNav = !!locState.fromNav;
  const initialQuickFilter: QuickFilter | undefined = locState.quickFilter;
  const initialOpenExpenseId: string | undefined = locState.openExpenseId;

  const getStoredFilters = () => {
    if (fromNav || initialQuickFilter) return null; // Reset filters on sidebar navigation or dashboard link
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const stored = getStoredFilters();
  const defaultStart = "";
  const defaultEnd = "";

  // Clear the state flag so refreshes / CRUD don't reset filters
  const clearedNav = useRef(false);
  useEffect(() => {
    if ((fromNav || initialQuickFilter || initialOpenExpenseId) && !clearedNav.current) {
      clearedNav.current = true;
      sessionStorage.removeItem(STORAGE_KEY);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [fromNav, initialQuickFilter, initialOpenExpenseId]);

  const [items, setItems] = useState<Expense[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(stored?.search ?? "");
  const [quickFilter, setQuickFilter] = useState<QuickFilter | "all">(initialQuickFilter ?? stored?.quickFilter ?? "a_vencer");
  const [filterPlanoContas, setFilterPlanoContas] = useState(stored?.filterPlanoContas ?? "all");
  const [filterEmpresa, setFilterEmpresa] = useState<string>(stored?.filterEmpresa ?? "");
  const [filterNivel, setFilterNivel] = useState(stored?.filterNivel ?? "all");
  const [filterVeiculo, setFilterVeiculo] = useState(stored?.filterVeiculo ?? "all");
  const [filterCentroCusto, setFilterCentroCusto] = useState(stored?.filterCentroCusto ?? "all");
  const [filterPeriodoInicio, setFilterPeriodoInicio] = useState(stored?.filterPeriodoInicio ?? defaultStart);
  const [filterPeriodoFim, setFilterPeriodoFim] = useState(stored?.filterPeriodoFim ?? defaultEnd);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);
  const [paymentInstallment, setPaymentInstallment] = useState<InstallmentContext | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [batchPayOpen, setBatchPayOpen] = useState(false);
  const [batchPayItems, setBatchPayItems] = useState<BatchItem[]>([]);
  const [batchConsolidated, setBatchConsolidated] = useState(false);
  const [installmentsMap, setInstallmentsMap] = useState<Record<string, Installment[]>>({});
  const [editInstallment, setEditInstallment] = useState<Installment | null>(null);
  const [editInstOpen, setEditInstOpen] = useState(false);
  const [editInstValor, setEditInstValor] = useState("");
  const [editInstVenc, setEditInstVenc] = useState("");
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [favorecidoMap, setFavorecidoMap] = useState<Record<string, { razao: string; fantasia: string }>>({});

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      search, quickFilter, filterPlanoContas, filterEmpresa, filterNivel,
      filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim,
    }));
  }, [search, quickFilter, filterPlanoContas, filterEmpresa, filterNivel, filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim]);

  // Maintenance detail modal state
  const [maintDetailOpen, setMaintDetailOpen] = useState(false);
  const [maintDetailLoading, setMaintDetailLoading] = useState(false);
  const [maintData, setMaintData] = useState<any>(null);
  const [maintVehicle, setMaintVehicle] = useState<any>(null);
  const [maintNfeExpense, setMaintNfeExpense] = useState<any>(null);
  const [maintNfseExpense, setMaintNfseExpense] = useState<any>(null);
  const [maintItems, setMaintItems] = useState<any[]>([]);
  const [maintNfeInst, setMaintNfeInst] = useState<any[]>([]);
  const [maintNfseInst, setMaintNfseInst] = useState<any[]>([]);

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
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").eq("type", "matriz").limit(1).maybeSingle();
    setEmpresaId(estab?.id || "");

    const [{ data: expData }, { data: vehData }, { data: chartData }, { data: instData }, { data: harvestPayments }] = await Promise.all([
      supabase.from("expenses").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("vehicles").select("id, plate").eq("is_active", true).eq("fleet_type", "propria"),
      supabase.from("chart_of_accounts").select("id, codigo, nome, conta_pai_id, nivel, tipo, tipo_operacional").eq("ativo", true).order("codigo"),
      supabase.from("expense_installments").select("*").order("numero_parcela"),
      supabase.from("harvest_payments").select("id, harvest_job_id, period_start, period_end, total_amount, filter_context, created_at").order("created_at", { ascending: false }),
    ]);

    const today = format(new Date(), "yyyy-MM-dd");
    const expenses = ((expData as any) || []) as Expense[];
    const overdueIds: string[] = [];
    const reopenedPendingIds: string[] = [];
    const reopenedPartialIds: string[] = [];

    const processed = expenses.map(e => {
      const dueDate = e.data_vencimento;
      if (!dueDate || e.status === "pago") return e;

      // Só converte 'pendente' → 'atrasado'. Títulos 'parcial' mantêm o status
      // e exibem badge extra "Vencido" quando vencidos (preserva a informação de quitação parcial).
      if (dueDate < today && e.status === "pendente") {
        overdueIds.push(e.id);
        return { ...e, status: "atrasado" };
      }

      if (dueDate >= today && e.status === "atrasado") {
        if (Number(e.valor_pago) > 0) {
          reopenedPartialIds.push(e.id);
          return { ...e, status: "parcial" };
        }
        reopenedPendingIds.push(e.id);
        return { ...e, status: "pendente" };
      }

      return e;
    });

    if (overdueIds.length > 0) {
      supabase.from("expenses").update({ status: "atrasado" } as any).in("id", overdueIds).then(() => {});
    }
    if (reopenedPendingIds.length > 0) {
      supabase.from("expenses").update({ status: "pendente" } as any).in("id", reopenedPendingIds).then(() => {});
    }
    if (reopenedPartialIds.length > 0) {
      supabase.from("expenses").update({ status: "parcial" } as any).in("id", reopenedPartialIds).then(() => {});
    }

    // Build harvest paid items as virtual expenses
    const harvestItems: Expense[] = [];
    if (harvestPayments && harvestPayments.length > 0) {
      const jobIds = [...new Set(harvestPayments.map(p => p.harvest_job_id))];
      const allUserIds = [...new Set(harvestPayments.flatMap(p => (p.filter_context || "").split(",").filter(Boolean)))];

      const [{ data: jobs }, { data: hvVehicles }] = await Promise.all([
        supabase.from("harvest_jobs").select("id, farm_name").in("id", jobIds),
        allUserIds.length > 0 ? supabase.from("vehicles").select("driver_id, owner_id").in("driver_id", allUserIds) : Promise.resolve({ data: [] }),
      ]);
      const jobMap = new Map((jobs || []).map((j: any) => [j.id, j.farm_name]));
      const ownerIds = [...new Set((hvVehicles || []).map((v: any) => v.owner_id).filter(Boolean))];
      const { data: ownerProfiles } = ownerIds.length > 0
        ? await supabase.from("profiles").select("user_id, full_name, nome_fantasia").in("user_id", ownerIds)
        : { data: [] };
      const ownerMap = new Map((ownerProfiles || []).map((p: any) => [p.user_id, p.nome_fantasia || p.full_name]));
      const driverOwnerMap = new Map((hvVehicles || []).map((v: any) => [v.driver_id, v.owner_id]));

      for (const payment of harvestPayments) {
        const farmName = jobMap.get(payment.harvest_job_id) || "Colheita";
        const periodLabel = `${formatDateBR(payment.period_start, "dd/MM/yy")} - ${formatDateBR(payment.period_end, "dd/MM/yy")}`;

        let ownerName = "Proprietário";
        if (payment.filter_context) {
          const userIds = payment.filter_context.split(",").filter(Boolean);
          for (const uid of userIds) {
            const oid = driverOwnerMap.get(uid);
            if (oid && ownerMap.has(oid)) { ownerName = ownerMap.get(oid)!; break; }
          }
        }

        harvestItems.push({
          id: `harvest-${payment.id}`,
          descricao: `🌱 Colheita — ${farmName} — ${periodLabel}`,
          plano_contas_id: null,
          centro_custo: "operacional",
          valor_total: Number(payment.total_amount),
          valor_pago: Number(payment.total_amount),
          data_emissao: getLocalDateISO(payment.created_at),
          data_vencimento: getLocalDateISO(payment.created_at),
          status: "pago",
          forma_pagamento: null,
          favorecido_nome: ownerName,
          favorecido_id: null,
          documento_fiscal_numero: null,
          chave_nfe: null,
          observacoes: null,
          veiculo_placa: null,
          veiculo_id: null,
          litros: null,
          
          numero_multa: null,
          origem: "colheita",
          created_at: payment.created_at,
          data_pagamento: payment.created_at,
        });
      }
    }

    // Build installments map
    const iMap: Record<string, Installment[]> = {};
    ((instData as any) || []).forEach((inst: Installment) => {
      if (!iMap[inst.expense_id]) iMap[inst.expense_id] = [];
      iMap[inst.expense_id].push(inst);
    });
    setInstallmentsMap(iMap);

    const allItems = [...processed, ...harvestItems];
    setItems(allItems);
    setChartAccounts((chartData as any) || []);
    setVehicles((vehData as any) || []);

    // Fetch profile names for created_by
    const creatorIds = [...new Set(allItems.map(e => e.created_by).filter(Boolean))] as string[];
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", creatorIds);
      const pMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
      setProfilesMap(pMap);
    }

    // Fetch razão social / nome fantasia dos favorecidos (para busca)
    const favIds = [...new Set(allItems.map(e => e.favorecido_id).filter(Boolean))] as string[];
    if (favIds.length > 0) {
      const { data: favProfiles } = await supabase
        .from("profiles")
        .select("id, razao_social, nome_fantasia")
        .in("id", favIds);
      const fMap: Record<string, { razao: string; fantasia: string }> = {};
      (favProfiles || []).forEach((p: any) => {
        fMap[p.id] = { razao: p.razao_social || "", fantasia: p.nome_fantasia || "" };
      });
      setFavorecidoMap(fMap);
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (item: Expense) => { setEditingExpense(item); setFormOpen(true); };
  const handleNew = () => { setEditingExpense(null); setFormOpen(true); };

  const restoreGroupedOriginals = async (groupExpenseId: string): Promise<number> => {
    const { data: groupItems } = await supabase
      .from("expense_group_items" as any)
      .select("original_expense_id")
      .eq("grupo_expense_id", groupExpenseId);
    const originals = (groupItems as any[] || []).map(r => r.original_expense_id).filter(Boolean);
    if (originals.length === 0) return 0;
    await supabase.from("expenses").update({ deleted_at: null } as any).in("id", originals);
    await supabase.from("expense_group_items" as any).delete().eq("grupo_expense_id", groupExpenseId);
    return originals.length;
  };

  const handleDelete = async (item: Expense) => {
    if (item.status === "pago") return toast.error("Contas pagas não podem ser excluídas. Use cancelamento.");
    const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
    const isMaintenance = chart?.tipo_operacional === "manutencao";

    const { data: groupCheck } = await supabase
      .from("expense_group_items" as any)
      .select("original_expense_id")
      .eq("grupo_expense_id", item.id);
    const isGrouped = (groupCheck as any[] || []).length > 0;

    if (isGrouped) {
      const count = (groupCheck as any[]).length;
      const ok = await confirm({
        title: "Excluir conta agrupada",
        description: `Esta conta foi criada agrupando ${count} conta(s). Ao excluí-la, as contas originais serão restauradas no Contas a Pagar. Deseja continuar?`,
        variant: "destructive",
        confirmLabel: "Excluir e restaurar",
      });
      if (!ok) return;
    } else if (isMaintenance) {
      const { data: linkedMaint } = await supabase
        .from("maintenances" as any)
        .select("id")
        .eq("expense_id", item.id)
        .maybeSingle();

      if (linkedMaint) {
        const ok = await confirm({ title: "Excluir despesa com manutenção", description: "Esta despesa possui um registro de manutenção vinculado.\nAo excluir, o registro de manutenção também será removido.\n\nDeseja continuar?", variant: "destructive", confirmLabel: "Excluir" });
        if (!ok) return;
        await supabase.from("maintenances" as any).delete().eq("id", (linkedMaint as any).id);
        await supabase.from("expense_maintenance_items" as any).delete().eq("expense_id", item.id);
      } else {
        if (!await confirm({ title: "Excluir despesa", description: "Deseja excluir esta despesa?", variant: "destructive", confirmLabel: "Excluir" })) return;
      }
    } else {
      if (!await confirm({ title: "Excluir despesa", description: "Deseja excluir esta despesa?", variant: "destructive", confirmLabel: "Excluir" })) return;
    }

    let restored = 0;
    if (isGrouped) restored = await restoreGroupedOriginals(item.id);

    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(restored > 0 ? `Conta agrupada excluída · ${restored} conta(s) restaurada(s)` : "Despesa excluída");
    fetchData();
  };

  const handlePayment = (item: Expense) => { setPaymentExpense(item); setPaymentInstallment(null); setPaymentOpen(true); };

  const showExpenseDetail = (expenseId: string) => {
    const exp = items.find(i => i.id === expenseId);
    if (exp) { setDetailExpense(exp); setDetailOpen(true); }
  };

  // Auto-open detail dialog when navigating from dashboard
  const openedFromNavRef = useRef(false);
  useEffect(() => {
    if (!initialOpenExpenseId || openedFromNavRef.current || items.length === 0) return;
    const exp = items.find(i => i.id === initialOpenExpenseId);
    if (exp) {
      openedFromNavRef.current = true;
      setDetailExpense(exp);
      setDetailOpen(true);
    }
  }, [initialOpenExpenseId, items]);

  const openMaintenanceDetail = async (expenseId: string) => {
    setMaintDetailOpen(true);
    setMaintDetailLoading(true);
    setMaintData(null); setMaintVehicle(null); setMaintNfeExpense(null); setMaintNfseExpense(null);
    setMaintItems([]); setMaintNfeInst([]); setMaintNfseInst([]);

    // Find maintenance by expense_id or nfse_expense_id
    const { data: maint } = await supabase
      .from("maintenances" as any)
      .select("*")
      .or(`expense_id.eq.${expenseId},nfse_expense_id.eq.${expenseId}`)
      .maybeSingle();

    if (!maint) { setMaintDetailLoading(false); return; }
    setMaintData(maint);

    // Fetch vehicle
    const { data: veh } = await supabase.from("vehicles").select("id, plate, brand, model").eq("id", (maint as any).veiculo_id).maybeSingle();
    setMaintVehicle(veh);

    const promises: Promise<any>[] = [];

    if ((maint as any).expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", (maint as any).expense_id).maybeSingle(),
          supabase.from("expense_maintenance_items" as any).select("*").eq("expense_id", (maint as any).expense_id),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", (maint as any).expense_id).order("numero_parcela"),
        ]).then(([{ data: nfe }, { data: items }, { data: inst }]) => {
          setMaintNfeExpense(nfe); setMaintItems((items as any) || []); setMaintNfeInst((inst as any) || []);
        })
      );
    }

    if ((maint as any).nfse_expense_id) {
      promises.push(
        Promise.all([
          supabase.from("expenses").select("id, descricao, valor_total, data_emissao, documento_fiscal_numero, chave_nfe, favorecido_nome, status, forma_pagamento, fornecedor_cnpj").eq("id", (maint as any).nfse_expense_id).maybeSingle(),
          supabase.from("expense_installments").select("id, numero_parcela, valor, data_vencimento, status").eq("expense_id", (maint as any).nfse_expense_id).order("numero_parcela"),
        ]).then(([{ data: nfse }, { data: inst }]) => {
          setMaintNfseExpense(nfse); setMaintNfseInst((inst as any) || []);
        })
      );
    }

    await Promise.all(promises);
    setMaintDetailLoading(false);
  };

  const handlePayInstallment = (inst: Installment) => {
    const expense = items.find(i => i.id === inst.expense_id);
    if (!expense) return;
    const allInst = installmentsMap[inst.expense_id] || [];
    setPaymentExpense(expense);
    setPaymentInstallment({
      installmentId: inst.id,
      numeroParcela: inst.numero_parcela,
      totalParcelas: inst.total_parcelas ?? allInst.length,
      valorParcela: Number(inst.valor),
      dataVencimentoParcela: inst.data_vencimento,
    });
    setPaymentOpen(true);
  };

  const handleDeleteInstallment = async (inst: Installment) => {
    if (!await confirm({ title: "Excluir parcela", description: `Excluir parcela ${inst.numero_parcela}?`, variant: "destructive", confirmLabel: "Excluir" })) return;
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

  const handleBatchPay = (consolidated = false) => {
    if (selectedIds.size === 0) return;
    const batchItems: BatchItem[] = [];

    for (const id of selectedIds) {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const [expId, installs] of Object.entries(installmentsMap)) {
          const foundInst = installs.find(i => i.id === instId);
          if (foundInst && foundInst.status !== "pago") {
            const expense = items.find(i => i.id === expId);
            batchItems.push({
              id: `inst-${instId}`,
              descricao: expense?.favorecido_nome || expense?.descricao || "Parcela",
              valor: Number(foundInst.valor),
              tipo: "installment",
              expenseId: expId,
              installmentId: instId,
              numeroParcela: foundInst.numero_parcela,
              totalParcelas: foundInst.total_parcelas ?? installs.length,
              dataVencimento: foundInst.data_vencimento,
            });
            break;
          }
        }
      } else {
        const item = items.find(i => i.id === id);
        if (!item || item.status === "pago") continue;
        batchItems.push({
          id: item.id,
          descricao: item.favorecido_nome || item.descricao,
          valor: Number(item.valor_total) - Number(item.valor_pago),
          tipo: "expense",
          expenseId: item.id,
          dataVencimento: item.data_vencimento,
        });
      }
    }

    if (batchItems.length === 0) return;
    setBatchPayItems(batchItems);
    setBatchConsolidated(consolidated);
    setBatchPayOpen(true);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({ title: "Excluir selecionados", description: `Excluir ${selectedIds.size} conta(s) selecionada(s)?`, variant: "destructive", confirmLabel: "Excluir" })) return;
    setBatchPaying(true);

    for (const id of selectedIds) {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        await supabase.from("expense_installments").delete().eq("id", instId);
      } else {
        await restoreGroupedOriginals(id);
        await supabase.from("expenses").update({ deleted_at: getLocalDateISO() } as any).eq("id", id);
      }
    }
    toast.success(`${selectedIds.size} registro(s) excluído(s)`);
    setSelectedIds(new Set());
    setBatchPaying(false);
    fetchData();
  };

  const handleReversePayment = async (item: Expense) => {
    if (!await confirm({ title: "Estornar pagamento", description: `Deseja estornar o pagamento de "${item.favorecido_nome || item.descricao}"? A conta voltará para pendente e movimentações inversas serão criadas.` })) return;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      // Reversal logic removed (banking module removed)

      // Delete all payment records for this expense
      await supabase.from("expense_payments" as any).delete().eq("expense_id", item.id);
      // Reset installments if any
      const installs = installmentsMap[item.id];
      if (installs && installs.length > 0) {
        for (const inst of installs) {
          if (inst.status === "pago") {
            await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
          }
        }
      }
      // Reset the expense
      await supabase.from("expenses").update({
        valor_pago: 0,
        status: "pendente",
        data_pagamento: null,
      } as any).eq("id", item.id);
      toast.success("Pagamento estornado com sucesso");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar pagamento");
    }
  };

  const createReversalTransactions = async (expenseId: string, _userId: string) => {
    // Remove bank movement for this expense
    await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "despesas").eq("origem_id", expenseId);
  };

  const handleBatchReverse = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({ title: "Estornar selecionados", description: `Deseja estornar ${selectedIds.size} conta(s) selecionada(s)? Elas voltarão para pendente.` })) return;
    setBatchPaying(true);
    const { data: { user: currentUser } } = await supabase.auth.getUser();

    for (const id of selectedIds) {
      if (id.startsWith("harvest-")) {
        // Estorno de colheita: remove harvest_payment + movimentação bancária + despesas vinculadas
        const harvestPaymentId = id.replace("harvest-", "");
        await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "colheitas").eq("origem_id", harvestPaymentId);
        // Remove linked expenses (frota_terceiros generated from harvest)
        const { data: linkedExpenses } = await supabase.from("expenses").select("id").eq("contrato_id", harvestPaymentId);
        if (linkedExpenses && linkedExpenses.length > 0) {
          for (const exp of linkedExpenses) {
            await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "despesas").eq("origem_id", exp.id);
            await supabase.from("expense_payments" as any).delete().eq("expense_id", exp.id);
          }
          await supabase.from("expenses").delete().in("id", linkedExpenses.map(e => e.id));
        }
        await supabase.from("harvest_payments").delete().eq("id", harvestPaymentId);
      } else if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        let foundInst: Installment | undefined;
        let expenseId = "";
        for (const [eid, installs] of Object.entries(installmentsMap)) {
          foundInst = installs.find(i => i.id === instId);
          if (foundInst) { expenseId = eid; break; }
        }
        if (!foundInst || foundInst.status !== "pago") continue;
        if (currentUser) await createReversalTransactions(expenseId, currentUser.id);
        await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", instId);
        const expense = items.find(i => i.id === expenseId);
        if (expense) {
          const newPago = Math.max(0, Number(expense.valor_pago) - Number(foundInst.valor));
          const newStatus = newPago <= 0 ? "pendente" : "parcial";
          await supabase.from("expenses").update({
            valor_pago: newPago,
            status: newStatus,
            ...(newPago <= 0 ? { data_pagamento: null } : {}),
          } as any).eq("id", expenseId);
        }
      } else {
        const item = items.find(i => i.id === id);
        if (!item || item.status !== "pago") continue;
        if (currentUser) await createReversalTransactions(id, currentUser.id);
        await supabase.from("expense_payments" as any).delete().eq("expense_id", id);
        const installs = installmentsMap[id];
        if (installs && installs.length > 0) {
          for (const inst of installs) {
            if (inst.status === "pago") {
              await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
            }
          }
        }
        await supabase.from("expenses").update({
          valor_pago: 0,
          status: "pendente",
          data_pagamento: null,
        } as any).eq("id", id);
      }
    }
    toast.success(`${selectedIds.size} conta(s) estornada(s)`);
    setSelectedIds(new Set());
    setBatchPaying(false);
    fetchData();
  };

  const handleReverseInstallment = async (inst: Installment) => {
    if (!await confirm({ title: "Estornar parcela", description: `Deseja estornar o pagamento da parcela ${inst.numero_parcela}?` })) return;
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) await createReversalTransactions(inst.expense_id, currentUser.id);

      await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
      // Recalculate expense totals
      const expense = items.find(i => i.id === inst.expense_id);
      if (expense) {
        const newPago = Math.max(0, Number(expense.valor_pago) - Number(inst.valor));
        const newStatus = newPago <= 0 ? "pendente" : "parcial";
        await supabase.from("expenses").update({
          valor_pago: newPago,
          status: newStatus,
          ...(newPago <= 0 ? { data_pagamento: null } : {}),
        } as any).eq("id", expense.id);
      }
      toast.success("Parcela estornada com sucesso");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar parcela");
    }
  };

  const handleDownloadBoleto = async (inst: Installment) => {
    if (!inst.boleto_url) return;
    try {
      const { data, error } = await supabase.storage.from("payment-receipts").download(inst.boleto_url);
      if (error || !data) { toast.error("Erro ao baixar boleto"); return; }
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `boleto_parcela_${inst.numero_parcela}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Erro ao baixar boleto"); }
  };

  const matchesPeriod = useCallback((date?: string | null) => {
    if (!filterPeriodoInicio && !filterPeriodoFim) return true;
    if (!date) return false;
    return (!filterPeriodoInicio || date >= filterPeriodoInicio) &&
      (!filterPeriodoFim || date <= filterPeriodoFim);
  }, [filterPeriodoInicio, filterPeriodoFim]);

  const getExpenseDateRef = useCallback((item: Expense) => {
    return item.status === "pago"
      ? (normalizeDateInput(item.data_pagamento) || item.data_vencimento || item.data_emissao)
      : (item.data_vencimento || item.data_emissao);
  }, []);

  const matchesQuickFilter = useCallback((date?: string | null, status?: string) => {
    if (!date || status === "pago") return false;

    const today = format(new Date(), "yyyy-MM-dd");
    const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");

    if (quickFilter === "all") return true;
    if (quickFilter === "a_vencer") return date >= today;
    if (quickFilter === "semana") return date >= today && date <= in7days;
    if (quickFilter === "atrasadas") return date < today;

    return true;
  }, [quickFilter]);

  const counts = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const in7days = format(addDays(new Date(), 7), "yyyy-MM-dd");
    let all = 0, hoje = 0, semana = 0, atrasadas = 0, pagas = 0, aVencer = 0;

    // REGRA: período é SEMPRE aplicado primeiro em tudo
    const baseForCounts = items.filter(i => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(q) ||
        (i.favorecido_nome || "").toLowerCase().includes(q) ||
        (i.favorecido_id && favorecidoMap[i.favorecido_id]?.razao || "").toLowerCase().includes(q) ||
        (i.favorecido_id && favorecidoMap[i.favorecido_id]?.fantasia || "").toLowerCase().includes(q) ||
        (i.veiculo_placa || "").toLowerCase().includes(q) ||
        (i.documento_fiscal_numero || "").toLowerCase().includes(q) ||
        (i.chave_nfe || "").toLowerCase().includes(q) ||
        (i.numero_multa || "").toLowerCase().includes(q) ||
        (i.observacoes || "").toLowerCase().includes(q) ||
        (i.fornecedor_cnpj || "").toLowerCase().includes(q) ||
        (i.forma_pagamento || "").toLowerCase().includes(q) ||
        matchValueQuery(q, i.valor_total) ||
        matchValueQuery(q, Number(i.valor_pago || 0)) ||
        (installmentsMap[i.id] || []).some(inst => matchValueQuery(q, Number(inst.valor)));
      const matchPlanoContas = filterPlanoContas === "all" || (i.plano_contas_id && getAncestorIds(i.plano_contas_id).includes(filterPlanoContas));
      const matchNivel = filterNivel === "all" || (i.plano_contas_id && chartIdMap[i.plano_contas_id]?.nivel === Number(filterNivel));
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchCentro = filterCentroCusto === "all" || i.centro_custo === filterCentroCusto;
      // Para despesas COM parcelas, checar se alguma parcela cai no período
      const installs = installmentsMap[i.id];
      const hasInst = installs && installs.length > 0;
      const matchPeriodo = hasInst
        ? installs.some(inst => matchesPeriod(inst.data_vencimento))
        : matchesPeriod(getExpenseDateRef(i));
      const matchEmpresa = !filterEmpresa || (i as any).empresa_id === filterEmpresa;
      return matchSearch && matchPlanoContas && matchNivel && matchVeiculo && matchCentro && matchPeriodo && matchEmpresa;
    });

    baseForCounts.forEach(i => {
      const installs = installmentsMap[i.id];
      if (installs && installs.length > 0) {
        // Contar apenas parcelas que caem no período
        installs.forEach(inst => {
          const inPeriod = (!filterPeriodoInicio || inst.data_vencimento >= filterPeriodoInicio) &&
            (!filterPeriodoFim || inst.data_vencimento <= filterPeriodoFim);
          if (!inPeriod) return;
          if (inst.status !== "pago") all++;
          if (inst.data_vencimento === today && inst.status !== "pago") hoje++;
          if (inst.data_vencimento >= today && inst.data_vencimento <= in7days && inst.status !== "pago") semana++;
          if (inst.data_vencimento >= today && inst.status !== "pago") aVencer++;
          if (inst.status === "atrasado" || (inst.data_vencimento < today && inst.status !== "pago")) atrasadas++;
          if (inst.status === "pago") pagas++;
        });
      } else {
        const expenseDate = getExpenseDateRef(i);
        const isOverdue = !!expenseDate && expenseDate < today && i.status !== "pago";
        if (i.status !== "pago") all++;
        if (expenseDate === today && i.status !== "pago") hoje++;
        if (expenseDate && expenseDate >= today && expenseDate <= in7days && i.status !== "pago") semana++;
        if (expenseDate && expenseDate >= today && i.status !== "pago") aVencer++;
        if (isOverdue) atrasadas++;
        if (i.status === "pago") pagas++;
      }
    });

    return { all, hoje, semana, atrasadas, pagas, aVencer };
  }, [items, installmentsMap, search, filterPlanoContas, filterEmpresa, filterNivel, filterVeiculo, filterCentroCusto, chartIdMap, matchesPeriod, getExpenseDateRef, favorecidoMap]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      const installs = installmentsMap[i.id];
      const hasInst = installs && installs.length > 0;
      const visibleInstallments = hasInst
        ? installs.filter(inst => matchesPeriod(inst.data_vencimento) && matchesQuickFilter(inst.data_vencimento, inst.status))
        : [];

      if (hasInst) {
        if (visibleInstallments.length === 0) return false;
      } else {
        const expenseDate = getExpenseDateRef(i);
        if (!matchesPeriod(expenseDate) || !matchesQuickFilter(expenseDate, i.status)) return false;
      }

      const q = search.toLowerCase();
      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(q) ||
        (i.favorecido_nome || "").toLowerCase().includes(q) ||
        (i.favorecido_id && favorecidoMap[i.favorecido_id]?.razao || "").toLowerCase().includes(q) ||
        (i.favorecido_id && favorecidoMap[i.favorecido_id]?.fantasia || "").toLowerCase().includes(q) ||
        (i.veiculo_placa || "").toLowerCase().includes(q) ||
        (i.documento_fiscal_numero || "").toLowerCase().includes(q) ||
        (i.chave_nfe || "").toLowerCase().includes(q) ||
        (i.numero_multa || "").toLowerCase().includes(q) ||
        (i.observacoes || "").toLowerCase().includes(q) ||
        (i.fornecedor_cnpj || "").toLowerCase().includes(q) ||
        (i.forma_pagamento || "").toLowerCase().includes(q) ||
        matchValueQuery(q, i.valor_total) ||
        matchValueQuery(q, Number(i.valor_pago || 0)) ||
        (installmentsMap[i.id] || []).some(inst => matchValueQuery(q, Number(inst.valor)));
      const matchPlanoContas = filterPlanoContas === "all" || (i.plano_contas_id && getAncestorIds(i.plano_contas_id).includes(filterPlanoContas));
      const matchNivel = filterNivel === "all" || (i.plano_contas_id && chartIdMap[i.plano_contas_id]?.nivel === Number(filterNivel));
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchCentro = filterCentroCusto === "all" || i.centro_custo === filterCentroCusto;

      const matchEmpresa = !filterEmpresa || (i as any).empresa_id === filterEmpresa;

      return matchSearch && matchPlanoContas && matchNivel && matchVeiculo && matchCentro && matchEmpresa;
    }).sort((a, b) => {
      const getDate = (item: typeof a) => {
        const inst = installmentsMap[item.id];
        if (inst && inst.length > 0) {
          const visibleDates = inst
            .filter(installment => matchesPeriod(installment.data_vencimento) && matchesQuickFilter(installment.data_vencimento, installment.status))
            .map(installment => installment.data_vencimento)
            .sort();

          if (visibleDates.length > 0) {
            return quickFilter === "atrasadas" || quickFilter === "all"
              ? visibleDates[visibleDates.length - 1]
              : visibleDates[0];
          }
        }
        return getExpenseDateRef(item);
      };

      const dateA = getDate(a);
      const dateB = getDate(b);

      if (quickFilter === "atrasadas" || quickFilter === "all") {
        return dateB.localeCompare(dateA);
      }
      return dateA.localeCompare(dateB);
    });
  }, [items, installmentsMap, search, quickFilter, filterPlanoContas, filterEmpresa, filterNivel, filterVeiculo, filterCentroCusto, chartIdMap, matchesPeriod, matchesQuickFilter, getExpenseDateRef, favorecidoMap]);

  // Build a flat list of selectable card IDs (installment or expense)
  const selectableCardIds = useMemo(() => {
    const ids: string[] = [];
    filtered.forEach(item => {
      const installs = installmentsMap[item.id];
      if (installs && installs.length > 0) {
        installs
          .filter(inst => matchesPeriod(inst.data_vencimento) && matchesQuickFilter(inst.data_vencimento, inst.status))
          .forEach(inst => ids.push(`inst-${inst.id}`));
      } else {
        ids.push(item.id);
      }
    });
    return ids;
  }, [filtered, installmentsMap, matchesPeriod, matchesQuickFilter]);

  // Flat rows for the data grid (installment OR expense)
  const flatRows = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const rows: {
      id: string;
      item: Expense;
      inst: Installment | null;
      favorecido: string;
      descricao: string;
      parcela: string | null;
      chartLabel: string;
      vencimento: string;
      valor: number;
      status: string;
      isPago: boolean;
      isOverdue: boolean;
      isDueToday: boolean;
      isHarvest: boolean;
      isMaintenance: boolean;
    }[] = [];

    filtered.forEach(item => {
      const installs = installmentsMap[item.id];
      const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
      const chartLabel = chart ? `${chart.codigo} ${chart.nome}` : "—";
      const isMaintenance = !!(item.veiculo_id && item.tipo_manutencao);
      const descDisplay = item.documento_fiscal_numero
        ? `${item.chave_nfe ? "NF-e" : "NFSe"} ${item.documento_fiscal_numero}`
        : item.descricao || "Serviço";

      if (installs && installs.length > 0) {
        installs
          .filter(inst => matchesPeriod(inst.data_vencimento) && matchesQuickFilter(inst.data_vencimento, inst.status))
          .forEach(inst => {
            const isPago = inst.status === "pago";
            const isOverdue = !isPago && inst.data_vencimento < today;
            rows.push({
              id: `inst-${inst.id}`,
              item,
              inst,
              favorecido: item.favorecido_nome || "Sem favorecido",
              descricao: descDisplay,
              parcela: `${inst.numero_parcela}/${inst.total_parcelas ?? installs.length}`,
              chartLabel,
              vencimento: inst.data_vencimento,
              valor: Number(inst.valor),
              status: isOverdue ? "atrasado" : inst.status,
              isPago,
              isOverdue,
              isDueToday: !isPago && inst.data_vencimento === today,
              isHarvest: false,
              isMaintenance,
            });
          });
        return;
      }

      const isPago = item.status === "pago";
      const dueRef = item.data_vencimento || item.data_emissao || "";
      const isOverdue = !isPago && !!dueRef && dueRef < today;
      rows.push({
        id: item.id,
        item,
        inst: null,
        favorecido: item.favorecido_nome || "Sem favorecido",
        descricao: descDisplay,
        parcela: null,
        chartLabel,
        vencimento: isPago && item.data_pagamento ? item.data_pagamento : (item.data_vencimento || item.data_emissao || ""),
        valor: isPago ? (Number(item.valor_pago) || Number(item.valor_total)) : Number(item.valor_total),
        status: isOverdue ? "atrasado" : item.status,
        isPago,
        isOverdue,
        isDueToday: !isPago && item.data_vencimento === today,
        isHarvest: item.id.startsWith("harvest-"),
        isMaintenance,
      });
    });

    return rows.sort((a, b) =>
      quickFilter === "atrasadas"
        ? b.vencimento.localeCompare(a.vencimento)
        : a.vencimento.localeCompare(b.vencimento)
    );
  }, [filtered, installmentsMap, chartIdMap, matchesPeriod, matchesQuickFilter, quickFilter]);

  type PayableRow = (typeof flatRows)[number];

  const selectedRows = useMemo(
    () => flatRows.filter(r => selectedIds.has(r.id)),
    [flatRows, selectedIds]
  );

  const payableColumns: DataGridColumn<PayableRow>[] = useMemo(() => [
    {
      key: "empresa",
      header: "Emp.",
      width: "52px",
      align: "center",
      sortValue: (r) => (r.item as any).empresa_id || "",
      cell: (r) => <EmpresaBadge empresaId={(r.item as any).empresa_id} />,
    },
    {
      key: "favorecido",
      header: "Favorecido",
      width: "220px",
      sortValue: (r) => r.favorecido,
      cell: (r) => {
        const creator = r.item.created_by ? profilesMap[r.item.created_by] : null;
        return (
          <span className="block min-w-0">
            <span className="font-medium text-foreground block" title={r.favorecido}>{limitDisplayText(r.favorecido)}</span>
            {creator && (
              <span className="text-[10px] text-muted-foreground truncate block">por {creator}</span>
            )}
          </span>
        );
      },

    },
    {
      key: "descricao",
      header: "Descrição",
      sortValue: (r) => r.descricao,
      cell: (r) => (
        <span className="flex items-center gap-1 min-w-0">
          {r.item.documento_fiscal_importado && <FileText className="h-3 w-3 text-primary shrink-0" />}
          <span className="truncate block">{r.descricao}</span>
          {r.isHarvest && <Badge variant="secondary" className="text-[10px] shrink-0">Colheita</Badge>}
        </span>
      ),
    },
    {
      key: "parcela",
      header: "Parcela",
      width: "80px",
      align: "center",
      sortValue: (r) => r.parcela || "",
      cell: (r) => (r.parcela ? <Badge variant="secondary" className="text-[10px]">{r.parcela}</Badge> : "—"),
    },
    {
      key: "chart",
      header: "Conta Contábil",
      width: "200px",
      sortValue: (r) => r.chartLabel,
      cell: (r) => <span className="truncate block text-[11px]">{r.chartLabel}</span>,
    },
    {
      key: "vencimento",
      header: "Vencimento",
      width: "110px",
      sortValue: (r) => r.vencimento,
      cell: (r) => (
        <span className={r.isOverdue ? "text-destructive font-medium" : ""}>
          {r.vencimento ? formatDateBR(r.vencimento) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      align: "center",
      sortValue: (r) => r.status,
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          <Badge variant={STATUS_MAP[r.status]?.variant || "outline"} className="text-[10px]">
            {STATUS_MAP[r.status]?.label || r.status}
          </Badge>
        </span>
      ),
    },
    {
      key: "valor",
      header: "Valor",
      width: "120px",
      align: "right",
      sortValue: (r) => r.valor,
      cell: (r) => <span className="font-mono font-semibold">{formatCurrency(r.valor)}</span>,
    },
    {
      key: "parcial",
      header: "Pagto. Parcial",
      width: "150px",
      align: "right",
      sortValue: (r) => {
        if (r.inst) return 0;
        const paid = Number(r.item.valor_pago) || 0;
        const total = Number(r.item.valor_total) || 0;
        return paid > 0 && paid < total ? total - paid : 0;
      },
      cell: (r) => {
        // Parcelas individuais são binárias (paga/aberta) — sem quitação parcial.
        if (r.inst) return <span className="text-muted-foreground">—</span>;
        const paid = Number(r.item.valor_pago) || 0;
        const total = Number(r.item.valor_total) || 0;
        const remaining = total - paid;
        if (paid > 0 && remaining > 0 && paid < total) {
          return (
            <span className="inline-flex flex-col items-end leading-tight">
              <span className="text-[10px] text-muted-foreground font-mono">Pago {formatCurrency(paid)}</span>
              <span className="text-[11px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                Saldo {formatCurrency(remaining)}
              </span>
            </span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
    },
  ], [profilesMap]);


  const hasSelectedPaid = useMemo(() => {
    for (const id of selectedIds) {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const installs of Object.values(installmentsMap)) {
          const found = installs.find(i => i.id === instId);
          if (found?.status === "pago") return true;
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item?.status === "pago") return true;
      }
    }
    return false;
  }, [selectedIds, items, installmentsMap]);

  const hasSelectedUnpaid = useMemo(() => {
    for (const id of selectedIds) {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const installs of Object.values(installmentsMap)) {
          const found = installs.find(i => i.id === instId);
          if (found && found.status !== "pago") return true;
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item && item.status !== "pago") return true;
      }
    }
    return false;
  }, [selectedIds, items, installmentsMap]);

  const selectedUnpaidCount = useMemo(() => {
    let count = 0;
    for (const id of selectedIds) {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const installs of Object.values(installmentsMap)) {
          const found = installs.find(i => i.id === instId);
          if (found && found.status !== "pago") count++;
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item && item.status !== "pago") count++;
      }
    }
    return count;
  }, [selectedIds, items, installmentsMap]);

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableCardIds.length && selectableCardIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableCardIds));
    }
  };

  const { totalPendente, totalAtrasado, totalRegistros } = useMemo(() => {
    let pendente = 0;
    let atrasado = 0;
    let registros = 0;
    const today = format(new Date(), "yyyy-MM-dd");

    // Cards exibem totais GERAIS de itens NÃO pagos
    items.forEach(item => {
      if (item.status === "pago") return;

      const installs = installmentsMap[item.id];
      if (installs && installs.length > 0) {
        installs.forEach(inst => {
          if (inst.status === "pago") return;
          registros++;
          if (inst.data_vencimento < today) {
            atrasado += Number(inst.valor);
          } else {
            pendente += Number(inst.valor);
          }
        });
      } else {
        registros++;
        const remaining = Number(item.valor_total) - Number(item.valor_pago);
        const dueDate = item.data_vencimento || item.data_emissao;
        if (dueDate < today) {
          atrasado += remaining;
        } else {
          pendente += remaining;
        }
      }
    });

    return { totalPendente: pendente, totalAtrasado: atrasado, totalRegistros: registros };
  }, [items, installmentsMap]);

  // Calculate selected total considering both installments and regular expenses
  const selectedTotal = useMemo(() => {
    let total = 0;
    selectedIds.forEach(id => {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const installs of Object.values(installmentsMap)) {
          const inst = installs.find(i => i.id === instId);
          if (inst) { total += Number(inst.valor); break; }
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item) {
          // For paid items, show the full amount (valor_pago or valor_total)
          if (item.status === "pago") {
            total += Number(item.valor_pago) || Number(item.valor_total);
          } else {
            total += Number(item.valor_total) - Number(item.valor_pago);
          }
        }
      }
    });
    return total;
  }, [selectedIds, items, installmentsMap]);

  // Check if any selected item is a harvest payment
  const hasSelectedHarvest = useMemo(() => {
    for (const id of selectedIds) {
      if (id.startsWith("harvest-")) return true;
    }
    return false;
  }, [selectedIds]);

  const handlePrintSelected = async () => {
    if (selectedIds.size === 0) return;
    const rows: { favorecido: string; descricao: string; vencimento: string; valor: number; status: string; planoContas: string }[] = [];
    selectedIds.forEach(id => {
      if (id.startsWith("inst-")) {
        const instId = id.replace("inst-", "");
        for (const [expId, installs] of Object.entries(installmentsMap)) {
          const inst = installs.find(i => i.id === instId);
          if (inst) {
            const item = items.find(i => i.id === expId);
            const today = format(new Date(), "yyyy-MM-dd");
            const isOverdue = inst.data_vencimento < today && inst.status !== "pago";
            const chart = item?.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
            rows.push({
              favorecido: item?.favorecido_nome || "Sem favorecido",
              descricao: `${item?.documento_fiscal_numero ? `NF ${item.documento_fiscal_numero} — ` : ""}${item?.descricao || "Serviço"} (P${inst.numero_parcela}/${inst.total_parcelas ?? installs.length})`,
              vencimento: inst.data_vencimento,
              valor: Number(inst.valor),
              status: isOverdue ? "atrasado" : inst.status,
              planoContas: chart ? `${chart.codigo} ${chart.nome}` : "",
            });
            break;
          }
        }
      } else {
        const item = items.find(i => i.id === id);
        if (item) {
          const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
          rows.push({
            favorecido: item.favorecido_nome || "Sem favorecido",
            descricao: item.documento_fiscal_numero ? `NF ${item.documento_fiscal_numero} — ${item.descricao}` : item.descricao,
            vencimento: item.data_vencimento || item.data_emissao,
            valor: item.status === "pago" ? (Number(item.valor_pago) || Number(item.valor_total)) : Number(item.valor_total) - Number(item.valor_pago),
            status: item.status,
            planoContas: chart ? `${chart.codigo} ${chart.nome}` : "",
          });
        }
      }
    });
    rows.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const today = format(new Date(), "yyyy-MM-dd");
    const isOverdue = (r: typeof rows[0]) => r.status !== "pago" && r.vencimento < today;
    const total = rows.reduce((s, r) => s + r.valor, 0);
    const totalAtrasado = rows.filter(r => r.status === "atrasado" || isOverdue(r)).reduce((s, r) => s + r.valor, 0);
    const totalAberto = rows.filter(r => r.status !== "pago" && !(r.status === "atrasado" || isOverdue(r))).reduce((s, r) => s + r.valor, 0);
    const totalPago = rows.filter(r => r.status === "pago").reduce((s, r) => s + r.valor, 0);
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    const periodo = filterPeriodoInicio || filterPeriodoFim
      ? `${filterPeriodoInicio ? formatDateBR(filterPeriodoInicio) : "início"} a ${filterPeriodoFim ? formatDateBR(filterPeriodoFim) : "atual"}`
      : "Todos os períodos";

    const rowsHtml = rows.map((r) => {
      const overdue = r.status === "atrasado" || isOverdue(r);
      const statusTxt = overdue && r.status !== "pago" ? (r.status === "parcial" ? "Parcial • Vencido" : "Atrasado") : (STATUS_MAP[r.status]?.label || r.status);
      return `<tr>
        <td>${esc(statusTxt)}</td>
        <td class="nowrap">${esc(formatDateBR(r.vencimento))}</td>
        <td>${esc(r.favorecido)}</td>
        <td>${esc(r.descricao)}</td>
        <td>${esc(r.planoContas)}</td>
        <td class="r ${overdue ? "neg" : ""}">${esc(formatCurrency(r.valor))}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relação de Contas a Pagar</title>
<style>
*{box-sizing:border-box}
@page { margin: 10mm 8mm; size: A4 portrait; }
html,body{margin:0;padding:0;background:#fff;font-family:Arial,'Segoe UI',system-ui,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 12px;display:flex;gap:8px;justify-content:flex-end;position:sticky;top:0;z-index:10}
.toolbar button{font-family:inherit;font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid #d1d5db;background:#2B4C7E;color:#fff;cursor:pointer}
.wrap{padding:4px;background:#fff;width:100%;max-width:100%}
.head{display:flex;align-items:center;gap:10px;padding:2px 2px 4px;border-bottom:1.5px solid #2B4C7E;margin-bottom:4px}
.head h1{margin:0;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:8px;color:#666;text-align:right;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:7pt;background:#fff;border:1px solid #d0d7de;table-layout:fixed}
thead th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:6.5pt;letter-spacing:.2px;padding:3px;border:1px solid #d0d7de;text-align:left;word-wrap:break-word;overflow-wrap:anywhere}
tbody td{padding:2px 3px;border:1px solid #e5e7eb;font-size:7pt;line-height:1.15;word-wrap:break-word;overflow-wrap:anywhere;vertical-align:top}
tbody tr:nth-child(even) td{background:#fafbfc}
.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}
.nowrap{white-space:nowrap;overflow-wrap:normal;font-size:6.5pt}
.neg{color:#b91c1c;font-weight:700}
tfoot td{background:#eef2f6;border-top:1.5px solid #2B4C7E}
tr{page-break-inside:avoid}
thead{display:table-header-group}
tfoot{display:table-row-group}
.foot{margin-top:4px;display:flex;justify-content:space-between;font-size:7pt;color:#6b7280}
.totals-labels{padding:4px 6px}
.totals-row{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-wrap:wrap}
.total-item{font-size:7.5pt;color:#4b5563}
.total-item b{font-size:8pt;color:#1f2937;font-weight:800}
.grand-total{font-size:9pt;font-weight:800;color:#2B4C7E;background:#e5ebf2;padding:4px 5px;text-align:right;white-space:nowrap}
@media print { .no-print{display:none!important} .toolbar{display:none!important} }
</style></head>
<body>
<div class="toolbar no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<div class="wrap">
  <div class="head">
    <div style="flex:1"><h1>Relação de Contas a Pagar</h1><div class="per">Período: ${esc(periodo)} • ${rows.length} registro(s)</div></div>
  </div>
  <table>
    <colgroup>
      <col style="width:11%" />
      <col style="width:9%" />
      <col style="width:22%" />
      <col style="width:28%" />
      <col style="width:18%" />
      <col style="width:12%" />
    </colgroup>
    <thead><tr>
      <th>Status</th><th>Venc.</th><th>Favorecido</th><th>Descrição</th><th>Plano de Contas</th><th class="r">Valor</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="totals-labels">
          <div class="totals-row">
            <span class="total-item">Atrasado: <b>${esc(formatCurrency(totalAtrasado))}</b></span>
            <span class="total-item">Em aberto: <b>${esc(formatCurrency(totalAberto))}</b></span>
            <span class="total-item">Pago: <b>${esc(formatCurrency(totalPago))}</b></span>
            <span class="total-item"><b>TOTAL</b></span>
          </div>
        </td>
        <td class="grand-total">${esc(formatCurrency(total))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="foot"><div>SIME TRANSPORTES</div><div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div></div>
</div>
<script>
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(function () { window.focus(); window.print(); }, 400);
      });
    });
  });
</script>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "width=900,height=1000,menubar=no,toolbar=no,location=no,status=no");
    if (!w) {
      URL.revokeObjectURL(url);
      toast.error("Libere pop-ups para gerar a impressão");
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 180000);
  };

  const quickFilterButtons: { key: QuickFilter | "all"; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "all", label: "Todas", icon: <List className="h-3 w-3" />, count: counts.all },
    { key: "a_vencer", label: "A vencer", icon: <Clock className="h-3 w-3" />, count: counts.aVencer },
    { key: "semana", label: "Semana", icon: <CalendarClock className="h-3 w-3" />, count: counts.semana },
    { key: "atrasadas", label: "Atrasadas", icon: <AlertTriangle className="h-3 w-3" />, count: counts.atrasadas },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-foreground">Contas a Pagar</h1>
          <ReportInfoTooltip text="Visão de obrigações: filtrado e ordenado pela Data de Vencimento. Cada linha representa uma parcela/documento a vencer. Use as abas de status (Em Aberto, Pago, Atrasado) para gestão de boletos e faturas pendentes." />
        </div>
      </div>
      {/* Summary Cards - compact modern */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <SummaryCard icon={Clock} label="A Pagar" value={formatCurrency(totalPendente)} />
        <SummaryCard icon={AlertTriangle} label="Atrasado" value={formatCurrency(totalAtrasado)} valueColor="red" />
        <SummaryCard icon={FileText} label="Registros" value={totalRegistros} />
      </div>

      {/* Filter Card */}
      <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border border-border">
        {/* Row 1: Period label + date pickers */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">Período:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <PeriodFilter
              size="sm"
              allowClear
              inicio={filterPeriodoInicio}
              fim={filterPeriodoFim}
              onChange={(i, f) => { setFilterPeriodoInicio(i); setFilterPeriodoFim(f); }}
            />
          </div>
          <EmpresaFilter value={filterEmpresa} onChange={setFilterEmpresa} />
        </div>

        {/* Row 2: Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar descrição, favorecido, placa, valor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>

        {/* Row 3: Quick filters + Plano de Contas (visible on small screens inside card) */}
        <div className="flex items-center gap-2 flex-wrap">
          {quickFilterButtons.map(f => {
            const isActive = quickFilter === f.key;
            return (
              <Button
                key={f.key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                className={cn("h-7 px-2.5 text-[11px] gap-1 rounded-full font-medium transition-all", isActive && "shadow-sm")}
                onClick={() => {
                  if (f.key === "all") {
                    setFilterPeriodoInicio("");
                    setFilterPeriodoFim("");
                  } else if (f.key === "a_vencer") {
                    setFilterPeriodoInicio(format(new Date(), "yyyy-MM-dd"));
                    setFilterPeriodoFim("");
                  } else if (f.key === "semana") {
                    const todayDate = new Date();
                    setFilterPeriodoInicio(format(todayDate, "yyyy-MM-dd"));
                    setFilterPeriodoFim(format(addDays(todayDate, 7), "yyyy-MM-dd"));
                  } else if (f.key === "atrasadas") {
                    setFilterPeriodoInicio("");
                    setFilterPeriodoFim(format(addDays(new Date(), -1), "yyyy-MM-dd"));
                  }
                  setQuickFilter(f.key);
                  setSelectedIds(new Set());
                }}
              >
                {f.icon}
                {f.label}
                {f.count > 0 && (
                  <span className={cn("ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold",
                    isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {f.count}
                  </span>
                )}
              </Button>
            );
          })}

          <div className="min-w-[200px] max-w-[260px]">
            <PlanoContasCombobox
              value={filterPlanoContas}
              onChange={setFilterPlanoContas}
              options={chartAccounts.filter((a: any) => a.tipo === "despesa")}
              size="sm"
              includeAll
              allValue="all"
              placeholder="Plano de Contas"
              className="rounded-full"
            />
          </div>

          {(quickFilter !== "all" || filterPlanoContas !== "all" || filterEmpresa !== "" || search !== "" || filterPeriodoFim !== "" || filterPeriodoInicio !== format(new Date(), "yyyy-MM-dd")) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive rounded-full"
              onClick={() => {
                setQuickFilter("all");
                setFilterPlanoContas("all");
                setFilterEmpresa("");
                setFilterNivel("all");
                setFilterCentroCusto("all");
                setFilterVeiculo("all");
                setSearch("");
                setFilterPeriodoInicio(format(new Date(), "yyyy-MM-dd"));
                setFilterPeriodoFim("");
                setSelectedIds(new Set());
              }}
            >
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>
      {/* Global Toolbar */}
      <GlobalToolbar
        actions={[
          {
            key: "pay",
            label: batchPaying ? "Processando..." : "Pagar conta",
            icon: Banknote,
            mode: "single+batch",
            priority: true,
            className: "bg-success text-success-foreground hover:bg-success/90 border-transparent",
            hidden: selectedUnpaidCount >= 2,
            disabled: batchPaying || !hasSelectedUnpaid,
            onClick: () => handleBatchPay(false),
          },
          {
            key: "pay-grouped",
            label: batchPaying ? "Processando..." : "Pagar em grupo (1 movimentação)",
            icon: HandCoins,
            mode: "batch",
            priority: true,
            className: "bg-success text-success-foreground hover:bg-success/90 border-transparent",
            hidden: selectedUnpaidCount < 2,
            disabled: batchPaying,
            onClick: () => handleBatchPay(true),
          },
          {
            key: "pay-individual",
            label: batchPaying ? "Processando..." : "Pagar separadamente",
            icon: Banknote,
            mode: "batch",
            priority: true,
            className: "border-success/60 text-success hover:bg-success/10",
            hidden: selectedUnpaidCount < 2,
            disabled: batchPaying,
            onClick: () => handleBatchPay(false),
          },
          { key: "new", label: "Nova Despesa", icon: Plus, mode: "create", variant: "default", onClick: handleNew },
          {
            key: "edit", label: "Editar", icon: Pencil, mode: "single",
            className: "border-primary/50 text-primary hover:bg-primary/10",
            disabled: !selectedRows[0] || selectedRows[0].isHarvest,
            onClick: () => { const r = selectedRows[0]; if (r) handleEdit(r.item); },
          },
          {
            key: "detail", label: "Detalhes", icon: Eye, mode: "single",
            className: "border-border text-muted-foreground hover:bg-muted",
            disabled: !selectedRows[0],
            onClick: () => { const r = selectedRows[0]; if (r) showExpenseDetail(r.item.id); },
          },
          {
            key: "maintenance", label: "Manutenção", icon: Wrench, mode: "single",
            className: "border-primary/40 text-primary hover:bg-primary/10",
            disabled: !selectedRows[0]?.isMaintenance,
            onClick: () => { const r = selectedRows[0]; if (r) openMaintenanceDetail(r.item.id); },
          },
          {
            key: "boleto", label: "Boleto", icon: Download, mode: "single",
            className: "border-accent/60 text-accent-foreground hover:bg-accent/20",
            disabled: !selectedRows[0]?.inst?.boleto_url,
            onClick: () => { const r = selectedRows[0]; if (r?.inst) handleDownloadBoleto(r.inst); },
          },
          {
            key: "reverse", label: "Estornar", icon: Undo2, mode: "single+batch",
            className: "border-warning/60 text-warning hover:bg-warning/10",
            disabled: batchPaying || !hasSelectedPaid,
            onClick: handleBatchReverse,
          },
          {
            key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive",
            disabled: batchPaying || !hasSelectedUnpaid,
            onClick: handleBatchDelete,
          },
          {
            key: "print", label: "Imprimir", icon: Printer, mode: "single+batch",
            className: "border-border text-muted-foreground hover:bg-muted",
            onClick: handlePrintSelected,
          },
        ]}

        selectedCount={selectedIds.size}
      >
        {selectedIds.size > 0 && (
          <span className="text-[11px] font-mono text-primary">{formatCurrency(selectedTotal)}</span>
        )}
      </GlobalToolbar>

      {/* Data Grid */}
      <DataGrid
        rows={flatRows}
        columns={payableColumns}
        rowId={(r) => r.id}
        selected={selectedIds}
        onSelectedChange={setSelectedIds}
        loading={loading}
        minWidth={1270}
        emptyMessage="Nenhuma despesa encontrada"
        rowClassName={(r) =>
          rowToneClass(
            r.status === "pago"
              ? "resolved"
              : r.status === "parcial"
              ? "pending"
              : r.isOverdue || r.status === "atrasado"
              ? "overdue"
              : "pending"
          )
        }
        footer={
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{flatRows.length} registro(s)</span>
            <span className="font-mono">
              Total exibido: {formatCurrency(flatRows.reduce((s, r) => s + r.valor, 0))}
            </span>
          </div>
        }
      />

      <StatusLegend
        className="px-1"
        items={[
          { tone: "pending", label: "A vencer / pendente" },
          { tone: "resolved", label: "Pago / quitado" },
          { tone: "overdue", label: "Vencido / atrasado" },
        ]}
      />
      <p className="px-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-400" />
          Linhas com pagamento parcial exibem o valor já pago e o saldo a pagar na coluna "Pagto. Parcial".
        </span>
      </p>

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
          onOpenChange={(v) => { setPaymentOpen(v); if (!v) setPaymentInstallment(null); }}
          expenseId={paymentExpense.id}
          valorTotal={paymentExpense.valor_total}
          valorPago={paymentExpense.valor_pago}
          planoContasId={paymentExpense.plano_contas_id}
          empresaId={paymentExpense.empresa_id || empresaId}
          unidadeId={paymentExpense.unidade_id || paymentExpense.empresa_id || empresaId}
          descricao={paymentExpense.descricao}
          favorecidoNome={paymentExpense.favorecido_nome}
          dataVencimento={paymentExpense.data_vencimento}
          contaBancariaIdPreset={paymentExpense.conta_bancaria_id}
          installment={paymentInstallment}
          onSaved={fetchData}
        />
      )}

      <BatchPaymentDialog
        open={batchPayOpen}
        onOpenChange={(v) => { setBatchPayOpen(v); if (!v) { setSelectedIds(new Set()); setBatchConsolidated(false); } }}
        items={batchPayItems}
        consolidated={batchConsolidated}
        onSaved={() => { setSelectedIds(new Set()); fetchData(); }}
      />

      {/* Edit Installment Dialog */}
      <Dialog open={editInstOpen} onOpenChange={setEditInstOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Parcela {editInstallment?.numero_parcela}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={editInstValor ? maskCurrency(String(Math.round(parseFloat(editInstValor) * 100))) : ""} onChange={e => setEditInstValor(unmaskCurrency(e.target.value))} />
            </div>
            <div>
              <Label>Vencimento</Label>
              <Input type="date" value={editInstVenc} onChange={e => setEditInstVenc(e.target.value)} />
            </div>
            <Button onClick={handleSaveInstallment} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Detail Dialog (from installment card) */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Detalhes da Despesa</DialogTitle>
          </DialogHeader>
          {detailExpense && (() => {
            const dChart = detailExpense.plano_contas_id ? chartIdMap[detailExpense.plano_contas_id] : null;
            const dInstalls = installmentsMap[detailExpense.id] || [];
            const totalParcelas = dInstalls.reduce((s, i) => s + Number(i.valor), 0);
            const pagas = dInstalls.filter(i => i.status === "pago");
            const totalQuitado = pagas.reduce((s, i) => s + Number(i.valor), 0);
            return (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Favorecido</span>
                    <p className="font-semibold text-foreground truncate">{detailExpense.favorecido_nome || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Emissão</span>
                    <p className="text-foreground">{formatDateBR(detailExpense.data_emissao)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Valor Total</span>
                    <p className="font-mono font-bold text-foreground">
                      {formatCurrency(Number(detailExpense.valor_total))}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Status</span>
                    <Badge variant={STATUS_MAP[detailExpense.status]?.variant || "outline"} className="text-[10px]">
                      {STATUS_MAP[detailExpense.status]?.label || detailExpense.status}
                    </Badge>
                  </div>
                  {dChart && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">Conta Contábil</span>
                      <p className="text-xs text-foreground truncate">
                        <span className="font-mono mr-1">{dChart.codigo}</span>{dChart.nome}
                      </p>
                    </div>
                  )}
                  {detailExpense.documento_fiscal_numero && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">Documento Fiscal</span>
                      <p className="text-foreground">{detailExpense.documento_fiscal_numero}</p>
                    </div>
                  )}
                  {detailExpense.veiculo_placa && (
                    <div>
                      <span className="text-xs text-muted-foreground">Veículo</span>
                      <p className="text-foreground">{detailExpense.veiculo_placa}</p>
                    </div>
                  )}
                  {detailExpense.observacoes && (
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">Observações</span>
                      <p className="text-foreground text-xs break-words">{detailExpense.observacoes}</p>
                    </div>
                  )}
                </div>

                {dInstalls.length > 0 && (
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Parcelas ({pagas.length}/{dInstalls.length} pagas) — Quitado: {formatCurrency(totalQuitado)}
                    </p>
                    <div className="space-y-1.5">
                      {dInstalls.map(inst => (
                        <div key={inst.id} className={`flex items-center gap-2 text-xs p-1.5 rounded ${inst.status === "pago" ? "bg-success/10" : "bg-muted/50"}`}>
                          <span className="font-medium shrink-0">P{inst.numero_parcela}</span>
                          <span className="text-muted-foreground shrink-0">{formatDateBR(inst.data_vencimento, "dd/MM/yy")}</span>
                          <span className="font-mono shrink-0">{formatCurrency(Number(inst.valor))}</span>
                          <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">
                            {inst.status === "pago" ? "Pago" : "Pend."}
                          </Badge>
                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            {inst.boleto_url && (
                              <Button variant="ghost" size="icon" className="h-5 w-5" title="Baixar boleto" onClick={() => handleDownloadBoleto(inst)}>
                                <Download className="h-3 w-3 text-primary" />
                              </Button>
                            )}
                            {inst.status !== "pago" && (
                              <Button
                                variant="default"
                                size="sm"
                                className="h-6 px-2 text-[10px] gap-1"
                                onClick={() => { setDetailOpen(false); handlePayInstallment(inst); }}
                              >
                                <DollarSign className="h-3 w-3" /> Pagar
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Maintenance Detail Modal */}
      <Dialog open={maintDetailOpen} onOpenChange={setMaintDetailOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 shrink-0" /> Detalhes da Manutenção
            </DialogTitle>
          </DialogHeader>

          {maintDetailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !maintData ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro de manutenção encontrado para esta despesa.</p>
          ) : (
            <div className="space-y-4 min-w-0">
              {/* Vehicle + General Info */}
              <Card>
                <CardContent className="p-3 space-y-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-foreground truncate">
                      {maintVehicle?.plate || "—"} — {maintVehicle?.brand} {maintVehicle?.model}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium text-foreground">{maintData.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}</span></div>
                    <div><span className="text-muted-foreground">Data:</span> <span className="font-medium text-foreground">{formatDateBR(maintData.data_manutencao)}</span></div>
                    <div><span className="text-muted-foreground">KM:</span> <span className="font-mono font-medium text-foreground">{Number(maintData.odometro).toLocaleString("pt-BR")}</span></div>
                    <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-semibold text-foreground">{formatCurrency(Number(maintData.custo_total))}</span></div>
                    {maintData.fornecedor && <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{maintData.fornecedor}</span></div>}
                    {maintData.proxima_manutencao_km && <div><span className="text-muted-foreground">Próx. KM:</span> <span className="font-mono text-foreground">{Number(maintData.proxima_manutencao_km).toLocaleString("pt-BR")}</span></div>}
                  </div>
                  <p className="text-xs text-foreground mt-1 break-words">{maintData.descricao}</p>
                </CardContent>
              </Card>

              {/* NFe (Peças) */}
              {maintNfeExpense && (
                <Card>
                  <CardContent className="p-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold text-xs text-foreground truncate">NFe — Peças / Materiais</span>
                      <Badge variant={maintNfeExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                        {maintNfeExpense.status === "pago" ? "Pago" : maintNfeExpense.status === "pendente" ? "Pendente" : maintNfeExpense.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <div className="truncate"><span className="text-muted-foreground">Nº Doc:</span> <span className="text-foreground">{maintNfeExpense.documento_fiscal_numero || "—"}</span></div>
                      <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{formatDateBR(maintNfeExpense.data_emissao)}</span></div>
                      <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{maintNfeExpense.favorecido_nome || "—"}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> {formatCurrency(Number(maintNfeExpense.valor_total))}</span></div>
                    </div>
                    {maintItems.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Itens ({maintItems.length})</p>
                        <div className="border rounded-md divide-y max-h-[150px] overflow-y-auto">
                          {maintItems.map((mi: any) => (
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
              {maintNfseExpense && (
                <Card>
                  <CardContent className="p-3 space-y-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-accent-foreground shrink-0" />
                      <span className="font-semibold text-xs text-foreground truncate">NFSe — Serviço / OS</span>
                      <Badge variant={maintNfseExpense.status === "pago" ? "default" : "outline"} className="text-[10px] ml-auto shrink-0">
                        {maintNfseExpense.status === "pago" ? "Pago" : maintNfseExpense.status === "pendente" ? "Pendente" : maintNfseExpense.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <div className="truncate"><span className="text-muted-foreground">Nº NFSe:</span> <span className="text-foreground">{maintNfseExpense.documento_fiscal_numero || "—"}</span></div>
                      <div><span className="text-muted-foreground">Emissão:</span> <span className="text-foreground">{formatDateBR(maintNfseExpense.data_emissao)}</span></div>
                      <div className="col-span-2 truncate"><span className="text-muted-foreground">Fornecedor:</span> <span className="text-foreground">{maintNfseExpense.favorecido_nome || "—"}</span></div>
                      <div className="col-span-2"><span className="text-muted-foreground">Valor:</span> <span className="font-mono font-semibold text-foreground"> {formatCurrency(Number(maintNfseExpense.valor_total))}</span></div>
                    </div>
                    <p className="text-xs text-muted-foreground break-words">{maintNfseExpense.descricao}</p>
                  </CardContent>
                </Card>
              )}

              {/* Resumo consolidado */}
              {maintNfeExpense && maintNfseExpense && (
                <div className="rounded-lg bg-muted/50 p-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Resumo Consolidado</p>
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">NFe (Peças):</span>
                    <span className="font-mono text-foreground">{formatCurrency(Number(maintNfeExpense.valor_total))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">NFSe (Serviço):</span>
                    <span className="font-mono text-foreground">{formatCurrency(Number(maintNfseExpense.valor_total))}</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
                    <span className="text-foreground">Total:</span>
                    <span className="font-mono text-foreground">{formatCurrency(Number(maintData.custo_total))}</span>
                  </div>
                </div>
              )}

              {/* Parcelas NFe */}
              {maintNfeExpense && (
                <Card className="border border-border">
                  <CardContent className="p-3 space-y-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFe</p>
                    {maintNfeInst.length > 0 ? (
                      <div className="divide-y max-h-[120px] overflow-y-auto">
                        {maintNfeInst.map((inst: any) => (
                          <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                            <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                            <span className="text-muted-foreground truncate">{formatDateBR(inst.data_vencimento, "dd/MM/yy")}</span>
                            <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                            <span className="font-mono text-foreground shrink-0">{formatCurrency(Number(inst.valor))}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Sem parcelas</p>}
                  </CardContent>
                </Card>
              )}

              {/* Parcelas NFSe */}
              {maintNfseExpense && (
                <Card className="border border-border">
                  <CardContent className="p-3 space-y-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><DollarSign className="h-3.5 w-3.5 shrink-0" /> Parcelas NFSe</p>
                    {maintNfseInst.length > 0 ? (
                      <div className="divide-y max-h-[120px] overflow-y-auto">
                        {maintNfseInst.map((inst: any) => (
                          <div key={inst.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center py-1.5 text-xs">
                            <span className="text-foreground shrink-0">P{inst.numero_parcela}</span>
                            <span className="text-muted-foreground truncate">{formatDateBR(inst.data_vencimento, "dd/MM/yy")}</span>
                            <Badge variant={inst.status === "pago" ? "default" : "outline"} className="text-[9px] shrink-0">{inst.status === "pago" ? "Pago" : "Pend."}</Badge>
                            <span className="font-mono text-foreground shrink-0">{formatCurrency(Number(inst.valor))}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">Sem parcelas</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
