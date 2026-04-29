import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { Plus, Pencil, Check, Search, Trash2, FileText, CalendarClock, AlertTriangle, CheckCircle2, Clock, Wrench, Car, DollarSign, Eye, Loader2, X, Undo2, Download, List, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { getLocalDateISO, normalizeDateInput, formatDateBR } from "@/lib/date";

import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog, type InstallmentContext } from "./PaymentDischargeDialog";
import { BatchPaymentDialog, type BatchItem } from "./BatchPaymentDialog";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";

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
  km_odometro: number | null;
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
  const locState = (location.state as any) || {};
  const fromNav = !!locState.fromNav;
  const initialQuickFilter: QuickFilter | undefined = locState.quickFilter;

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
    if ((fromNav || initialQuickFilter) && !clearedNav.current) {
      clearedNav.current = true;
      sessionStorage.removeItem(STORAGE_KEY);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [fromNav, initialQuickFilter]);

  const [items, setItems] = useState<Expense[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(stored?.search ?? "");
  const [quickFilter, setQuickFilter] = useState<QuickFilter | "all">(initialQuickFilter ?? stored?.quickFilter ?? "a_vencer");
  const [filterPlanoContas, setFilterPlanoContas] = useState(stored?.filterPlanoContas ?? "all");
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
  const [installmentsMap, setInstallmentsMap] = useState<Record<string, Installment[]>>({});
  const [editInstallment, setEditInstallment] = useState<Installment | null>(null);
  const [editInstOpen, setEditInstOpen] = useState(false);
  const [editInstValor, setEditInstValor] = useState("");
  const [editInstVenc, setEditInstVenc] = useState("");
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});

  // Persist filters to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      search, quickFilter, filterPlanoContas, filterNivel,
      filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim,
    }));
  }, [search, quickFilter, filterPlanoContas, filterNivel, filterVeiculo, filterCentroCusto, filterPeriodoInicio, filterPeriodoFim]);

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

      if (dueDate < today && (e.status === "pendente" || e.status === "parcial")) {
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
          km_odometro: null,
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

    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Despesa excluída");
    fetchData();
  };

  const handlePayment = (item: Expense) => { setPaymentExpense(item); setPaymentInstallment(null); setPaymentOpen(true); };

  const showExpenseDetail = (expenseId: string) => {
    const exp = items.find(i => i.id === expenseId);
    if (exp) { setDetailExpense(exp); setDetailOpen(true); }
  };

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
      totalParcelas: allInst.length,
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

  const handleBatchPay = () => {
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
              totalParcelas: installs.length,
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
        });
      }
    }

    if (batchItems.length === 0) return;
    setBatchPayItems(batchItems);
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
      return matchSearch && matchPlanoContas && matchNivel && matchVeiculo && matchCentro && matchPeriodo;
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
  }, [items, installmentsMap, search, filterPlanoContas, filterNivel, filterVeiculo, filterCentroCusto, chartIdMap, matchesPeriod, getExpenseDateRef]);

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

      return matchSearch && matchPlanoContas && matchNivel && matchVeiculo && matchCentro;
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
  }, [items, installmentsMap, search, quickFilter, filterPlanoContas, filterNivel, filterVeiculo, filterCentroCusto, chartIdMap, matchesPeriod, matchesQuickFilter, getExpenseDateRef]);

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
              descricao: `${item?.documento_fiscal_numero ? `NF ${item.documento_fiscal_numero} — ` : ""}${item?.descricao || "Serviço"} (P${inst.numero_parcela}/${installs.length})`,
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
    const total = rows.reduce((s, r) => s + r.valor, 0);
    const totalPendente = rows.filter(r => r.status !== "pago").reduce((s, r) => s + r.valor, 0);
    const totalPago = rows.filter(r => r.status === "pago").reduce((s, r) => s + r.valor, 0);
    const fmtDate = (d: string) => { return formatDateBR(d); };
    const statusLabel = (s: string) => STATUS_MAP[s]?.label || s;
    const statusBadge = (s: string) => {
      const colors: Record<string, { bg: string; fg: string }> = {
        pago: { bg: "#d4edda", fg: "#155724" },
        atrasado: { bg: "#f8d7da", fg: "#721c24" },
        pendente: { bg: "#fff3cd", fg: "#856404" },
        parcial: { bg: "#cce5ff", fg: "#004085" },
      };
      const c = colors[s] || colors.pendente;
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${c.bg};color:${c.fg}">${statusLabel(s)}</span>`;
    };

    // Fetch establishment info (unified company - show both CNPJs)
    let estName = ""; let estCnpj = "";
    try {
      const { data } = await supabase.from("fiscal_establishments").select("razao_social,cnpj,type").eq("active", true).order("type");
      if (data && data.length > 0) {
        const matriz = data.find((e: any) => e.type === "matriz") || data[0];
        estName = matriz?.razao_social || "";
        estCnpj = data.map((e: any) => {
          const c = e.cnpj;
          return c ? `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}` : "";
        }).filter(Boolean).join(" / ");
      }
    } catch {}

    const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
    const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
    const periodoLabel = filterPeriodoInicio || filterPeriodoFim
      ? `${filterPeriodoInicio ? fmtDate(filterPeriodoInicio) : "início"} a ${filterPeriodoFim ? fmtDate(filterPeriodoFim) : "atual"}`
      : "Todos os períodos";

    const infoBox = (label: string, value: string, color = "#2B4C7E") =>
      `<td width="30%" style="background:#f0f4f8;border:1px solid #e8ecf0;border-radius:10px;padding:12px 14px;vertical-align:top">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;font-weight:600">${label}</div>
        <div style="font-family:${FONT};font-size:15px;font-weight:700;color:${color};margin:0">${value}</div>
      </td>`;

    const tableRow = (r: typeof rows[0], i: number) =>
      `<tr style="border-bottom:1px solid #f0f2f5">
        <td style="padding:10px 12px;font-size:12px;color:#888;width:28px;text-align:center">${i + 1}</td>
        <td style="padding:10px 8px">
          <div style="font-family:${FONT};font-size:12px;font-weight:600;color:#333">${r.favorecido}</div>
          <div style="font-size:10px;color:#888;margin-top:2px">${r.descricao}</div>
          ${r.planoContas ? `<div style="font-size:9px;color:#aaa;margin-top:1px;font-family:monospace">${r.planoContas}</div>` : ""}
        </td>
        <td style="padding:10px 8px;text-align:center;font-size:11px;color:#555;white-space:nowrap">${fmtDate(r.vencimento)}</td>
        <td style="padding:10px 8px;text-align:center">${statusBadge(r.status)}</td>
        <td style="padding:10px 12px;text-align:right;font-family:${FONT};font-size:13px;font-weight:700;color:#2B4C7E;white-space:nowrap">${formatCurrency(r.valor)}</td>
      </tr>`;

    const mesesAbrev = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    const fmtShort = (d: string) => { const dt = new Date(d + "T12:00:00"); return `${dt.getDate()}-${mesesAbrev[dt.getMonth()]}`; };
    const periodoFile = filterPeriodoInicio || filterPeriodoFim
      ? `${filterPeriodoInicio ? fmtShort(filterPeriodoInicio) : "inicio"}_a_${filterPeriodoFim ? fmtShort(filterPeriodoFim) : fmtShort(format(new Date(), "yyyy-MM-dd"))}`
      : fmtShort(format(new Date(), "yyyy-MM-dd"));
    const docTitle = `Relatorio-contas-a-pagar-${periodoFile}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTitle}</title>
<style type="text/css">
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  @page { margin: 8mm 6mm; size: A4; }
}
</style></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:${FONT};-webkit-text-size-adjust:100%">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f8">
<tr><td align="center" style="padding:10px 8px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:700px;font-family:${FONT}">

<!-- HEADER -->
<tr><td style="background:#ffffff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E">
  <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="width:48px;vertical-align:middle;padding-right:16px">
      <img src="${logoUrl}" alt="SIME" width="42" height="42" style="display:block;height:42px;width:42px;border-radius:6px" />
    </td>
    <td style="vertical-align:middle">
      <div style="font-family:${FONT};font-weight:800;font-size:18px;color:#2B4C7E;line-height:1.2;letter-spacing:0.3px">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
      <div style="font-size:11px;color:#666;line-height:1.4;margin-top:2px">${estName}</div>
      ${estCnpj ? estCnpj.split(" / ").map((c: string) => `<div style="font-size:11px;color:#666;line-height:1.4">CNPJ: ${c}</div>`).join("\n      ") : ""}
    </td>
  </tr></table>
</td></tr>

<tr><td style="height:6px;font-size:0">&nbsp;</td></tr>
<tr><td style="border-bottom:3px solid #2B4C7E;font-size:0;height:1px">&nbsp;</td></tr>
<tr><td style="height:8px;font-size:0">&nbsp;</td></tr>

<!-- TITLE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-family:${FONT};font-size:17px;font-weight:700;color:#2B4C7E">RELAÇÃO DE CONTAS A PAGAR</div>
  <div style="font-size:11px;color:#888;margin-top:4px">Período: ${periodoLabel}</div>
</td></tr>

<tr><td style="height:8px;font-size:0">&nbsp;</td></tr>

<!-- SUMMARY BOXES -->
<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${infoBox("Registros", String(rows.length))}
    <td width="5%" style="font-size:0">&nbsp;</td>
    ${infoBox("A Pagar", formatCurrency(totalPendente), "#856404")}
    <td width="5%" style="font-size:0">&nbsp;</td>
    ${infoBox("Total Geral", formatCurrency(total), "#2B4C7E")}
  </tr></table>
</td></tr>

<tr><td style="height:8px;font-size:0">&nbsp;</td></tr>

<!-- TABLE -->
<tr><td style="background:#ffffff;border-radius:10px;padding:4px 0;overflow:hidden">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr style="background:#f5f7fa">
      <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:center;width:28px">#</td>
      <td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px">Favorecido / Descrição</td>
      <td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:center">Vencimento</td>
      <td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:center">Status</td>
      <td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Valor</td>
    </tr>
    ${rows.map((r, i) => tableRow(r, i)).join("")}
    <tr style="background:#f0f4f8">
      <td colspan="4" style="padding:12px;font-family:${FONT};font-size:12px;font-weight:700;color:#2B4C7E;text-align:right;text-transform:uppercase;letter-spacing:0.3px">Total</td>
      <td style="padding:12px;font-family:${FONT};font-size:15px;font-weight:800;color:#2B4C7E;text-align:right;white-space:nowrap">${formatCurrency(total)}</td>
    </tr>
  </table>
</td></tr>

<tr><td style="height:10px;font-size:0">&nbsp;</td></tr>

<!-- FOOTER -->
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">SIME TRANSPORTES${estName ? ` — ${estName}` : ""}</div>
  ${estCnpj ? estCnpj.split(" / ").map((c: string) => `<div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">CNPJ: ${c}</div>`).join("\n  ") : ""}
  <div style="font-size:10px;color:rgba(255,255,255,0.85);margin:2px 0">Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
</td></tr>

</table>
</td></tr></table>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { win.focus(); win.print(); };
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
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
        <h1 className="text-lg font-bold text-foreground">Contas a Pagar</h1>
        <Button size="sm" onClick={handleNew} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova Despesa
        </Button>
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
            <Input
              type="date"
              value={filterPeriodoInicio}
              onChange={(e) => { setFilterPeriodoInicio(e.target.value); }}
              className="h-8 text-xs flex-1 min-w-0"
            />
            <span className="text-xs text-muted-foreground shrink-0">até</span>
            <Input
              type="date"
              value={filterPeriodoFim}
              onChange={(e) => { setFilterPeriodoFim(e.target.value); }}
              className="h-8 text-xs flex-1 min-w-0"
            />
            {(filterPeriodoInicio || filterPeriodoFim) && (
              <button type="button" onClick={() => { setFilterPeriodoInicio(""); setFilterPeriodoFim(""); }} className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Limpar período">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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

          <Select value={filterPlanoContas} onValueChange={setFilterPlanoContas}>
            <SelectTrigger className="h-7 text-[11px] w-auto min-w-[140px] max-w-[200px] rounded-full">
              <SelectValue placeholder="Plano de Contas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {chartAccounts.filter(a => a.tipo === "despesa").map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono text-[10px] mr-1">{a.codigo}</span> {a.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(quickFilter !== "all" || filterPlanoContas !== "all" || search !== "" || filterPeriodoFim !== "" || filterPeriodoInicio !== format(new Date(), "yyyy-MM-dd")) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive rounded-full"
              onClick={() => {
                setQuickFilter("all");
                setFilterPlanoContas("all");
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
      {selectableCardIds.length > 0 && (
        <div className="flex items-center gap-4 p-2 rounded-lg bg-muted/50 border flex-wrap">
          <Checkbox
            checked={selectedIds.size === selectableCardIds.length && selectableCardIds.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selecionada(s) — ${formatCurrency(selectedTotal)}`
              : "Selecionar todas"}
          </span>
          {selectedIds.size > 0 && (
            <div className="ml-auto flex gap-1.5">
              {hasSelectedUnpaid && (
                <Button
                  size="sm"
                  className="gap-1.5 h-8 bg-success text-success-foreground hover:bg-success/90"
                  onClick={handleBatchPay}
                  disabled={batchPaying}
                >
                  <Check className="h-3.5 w-3.5" />
                  {batchPaying ? "Processando..." : "Pagar"}
                </Button>
              )}
              {hasSelectedPaid && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                  onClick={handleBatchReverse}
                  disabled={batchPaying}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {batchPaying ? "Processando..." : "Estornar"}
                </Button>
              )}
              {hasSelectedUnpaid && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="gap-1.5 h-8"
                  onClick={handleBatchDelete}
                  disabled={batchPaying}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8"
                onClick={handlePrintSelected}
              >
                <FileText className="h-3.5 w-3.5" />
                Imprimir
              </Button>
            </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered
            .flatMap(item => {
              const installs = installmentsMap[item.id];
              const hasInstallments = installs && installs.length > 0;
              const chart = item.plano_contas_id ? chartIdMap[item.plano_contas_id] : null;
              const isMaintenance = !!(item.veiculo_id && item.tipo_manutencao);
              const descDisplay = item.documento_fiscal_numero
                ? `${item.chave_nfe ? "NF-e" : "NFSe"} ${item.documento_fiscal_numero}`
                : item.descricao || "Serviço";

              if (hasInstallments) {
                const today2 = format(new Date(), "yyyy-MM-dd");
                const visibleInstalls = installs
                  .filter(inst => matchesPeriod(inst.data_vencimento) && matchesQuickFilter(inst.data_vencimento, inst.status))
                  .sort((a, b) => {
                    if (quickFilter === "atrasadas" || quickFilter === "all") {
                      return b.data_vencimento.localeCompare(a.data_vencimento);
                    }
                    return a.data_vencimento.localeCompare(b.data_vencimento);
                  });

                return visibleInstalls.map(inst => {
                  const today = format(new Date(), "yyyy-MM-dd");
                  const isInstOverdue = inst.data_vencimento < today && inst.status !== "pago";
                  const isInstToday = inst.data_vencimento === today && inst.status !== "pago";
                  const isInstPago = inst.status === "pago";
                  const instStatus = isInstOverdue ? "atrasado" : inst.status;

                  const instCardId = `inst-${inst.id}`;
                  const isInstSelected = selectedIds.has(instCardId);

                  return {
                    vencimento: inst.data_vencimento,
                    node: (
                      <Card
                        key={instCardId}
                        className={`relative transition-all h-full cursor-pointer ${isInstSelected ? "ring-2 ring-primary bg-primary/5" : ""} ${isInstOverdue ? "border-destructive/40" : ""} ${isInstToday ? "border-amber-400 ring-1 ring-amber-300/50" : ""}`}
                        onClick={(e) => { if ((e.target as HTMLElement).closest("button, a, [role='checkbox']")) return; toggleSelect(instCardId); }}
                      >
                        <CardContent className="p-3 flex flex-col h-full">
                          {/* Row 1: Checkbox + Nome */}
                          <div className="flex items-center gap-2 min-w-0 mb-1">
                            <Checkbox
                              checked={isInstSelected}
                              onCheckedChange={() => toggleSelect(instCardId)}
                            />
                            <p className="text-sm font-semibold text-foreground truncate">
                              {item.favorecido_nome || "Sem favorecido"}
                            </p>
                          </div>
                          {/* Row 2: Badges */}
                          <div className="flex items-center gap-1 flex-wrap mb-1.5">
                            {item.documento_fiscal_importado && <FileText className="h-3 w-3 text-primary shrink-0" />}
                            {descDisplay && <span className="text-xs text-muted-foreground truncate">{descDisplay}</span>}
                            <Badge variant="secondary" className="text-[10px]">
                              P{inst.numero_parcela}/{installs.length}
                            </Badge>
                            <Badge variant={STATUS_MAP[instStatus]?.variant || "outline"} className="text-[10px]">
                              {STATUS_MAP[instStatus]?.label || inst.status}
                            </Badge>
                            {isInstToday && (
                              <Badge className="text-[10px] bg-amber-500 text-white border-amber-500 animate-pulse hover:bg-amber-500 pointer-events-none">
                                <Clock className="h-2.5 w-2.5 mr-0.5" /> Vence Hoje
                              </Badge>
                            )}
                          </div>
                          {/* Row 3: Dados fixos */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs flex-1">
                            <div>
                              <span className="text-muted-foreground text-[11px]">Valor Parcela</span>
                              <p className="font-mono font-semibold text-foreground">
                                {formatCurrency(Number(inst.valor))}
                              </p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-[11px]">Vencimento</span>
                              <p className={`font-medium ${isInstOverdue ? "text-destructive" : "text-foreground"}`}>
                                {formatDateBR(inst.data_vencimento)}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <span className="text-muted-foreground text-[11px]">Conta Contábil</span>
                              {chart ? (
                                <p className="text-[11px] text-foreground truncate">
                                  <span className="font-mono mr-1">{chart.codigo}</span>
                                  {chart.nome}
                                </p>
                              ) : <p className="text-[11px] text-muted-foreground/40">—</p>}
                            </div>
                          </div>
                          {/* Creator info */}
                          {item.created_by && profilesMap[item.created_by] && (
                            <p className="text-[10px] text-muted-foreground/50 mt-1">
                              Criado por {profilesMap[item.created_by]} em {formatDateBR(item.created_at)}
                            </p>
                          )}
                          {/* Footer: Actions */}
                          <div className="flex items-center flex-wrap gap-0.5 pt-1.5 mt-1.5 border-t border-border">
                            {isMaintenance && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Ver manutenção" onClick={() => openMaintenanceDetail(item.id)}>
                                <Wrench className="h-3 w-3 text-primary" />
                              </Button>
                            )}
                            {!isInstPago && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-1.5 text-[11px] gap-0.5 text-success border-success/30 hover:bg-success/10 shrink-0"
                                onClick={() => handlePayInstallment(inst)}
                              >
                                <Check className="h-3 w-3" /> Pagar
                              </Button>
                            )}
                            <div className="ml-auto flex gap-0">
                              {inst.boleto_url && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Baixar boleto" onClick={() => handleDownloadBoleto(inst)}>
                                  <Download className="h-3 w-3 text-primary" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[11px] gap-0.5 shrink-0" onClick={() => showExpenseDetail(item.id)}>
                                <FileText className="h-3 w-3" /> Detalhes
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Editar despesa" onClick={() => handleEdit(item)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {!isInstPago && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteInstallment(inst)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  };
                });
              }

              const isHarvest = item.id.startsWith("harvest-");
              const isOverdue = item.status === "atrasado";
              const isPago = item.status === "pago";
              const isSelected = selectedIds.has(item.id);
              const todayStr2 = format(new Date(), "yyyy-MM-dd");
              const isDueToday = item.data_vencimento === todayStr2 && !isPago;

              return [{
                vencimento: item.data_vencimento || item.data_emissao || "",
                node: (
                  <Card
                    key={item.id}
                    className={`relative transition-all h-full cursor-pointer ${
                      isSelected ? "ring-2 ring-primary bg-primary/5" : ""
                    } ${isOverdue ? "border-destructive/40" : ""} ${isDueToday ? "border-amber-400 ring-1 ring-amber-300/50" : ""}`}
                    onClick={(e) => { if ((e.target as HTMLElement).closest("button, a, [role='checkbox']")) return; toggleSelect(item.id); }}
                  >
                    <CardContent className="p-3 flex flex-col h-full">
                      {/* Row 1: Checkbox + Nome */}
                      <div className="flex items-center gap-2 min-w-0 mb-1">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.favorecido_nome || "Sem favorecido"}
                        </p>
                      </div>
                      {/* Row 2: Badges */}
                      <div className="flex items-center gap-1 flex-wrap mb-1.5">
                        {item.documento_fiscal_importado && <FileText className="h-3 w-3 text-primary shrink-0" />}
                        {descDisplay && <span className="text-xs text-muted-foreground truncate">{descDisplay}</span>}
                        {isHarvest && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">Colheita</Badge>
                        )}
                        <Badge variant={STATUS_MAP[item.status]?.variant || "outline"} className="text-[10px] shrink-0">
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                        {isDueToday && (
                          <Badge className="text-[10px] bg-amber-500 text-white border-amber-500 animate-pulse hover:bg-amber-500 pointer-events-none shrink-0">
                            <Clock className="h-2.5 w-2.5 mr-0.5" /> Vence Hoje
                          </Badge>
                        )}
                      </div>
                      {/* Row 3: Dados fixos */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs flex-1">
                        <div>
                          <span className="text-muted-foreground text-[11px]">Valor</span>
                          <p className="font-mono font-semibold text-foreground">
                            {formatCurrency(Number(item.valor_total))}
                          </p>
                          {item.valor_pago > 0 && !isPago && (
                            <p className="text-[10px] text-muted-foreground font-mono">
                              Pago: {formatCurrency(Number(item.valor_pago))}
                            </p>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[11px]">{isPago ? "Pago em" : "Vencimento"}</span>
                          <p className={`font-medium ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                            {isPago && item.data_pagamento
                              ? formatDateBR(item.data_pagamento)
                              : item.data_vencimento
                                ? formatDateBR(item.data_vencimento)
                                : "—"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-[11px]">Conta Contábil</span>
                          {chart ? (
                            <p className="text-[11px] text-foreground truncate" title={getChartPath(item.plano_contas_id)}>
                              <span className="font-mono mr-1">{chart.codigo}</span>
                              {chart.nome}
                            </p>
                          ) : <p className="text-[11px] text-muted-foreground/40">—</p>}
                        </div>
                      </div>
                      {/* Creator info */}
                      {item.created_by && profilesMap[item.created_by] && (
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          Criado por {profilesMap[item.created_by]} em {formatDateBR(item.created_at)}
                        </p>
                      )}
                      {/* Footer: Actions */}
                      <div className="flex items-center flex-wrap gap-0.5 pt-1.5 mt-1.5 border-t border-border">
                        {isMaintenance && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Ver manutenção" onClick={() => openMaintenanceDetail(item.id)}>
                            <Wrench className="h-3 w-3 text-primary" />
                          </Button>
                        )}
                        {!isPago && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-1.5 text-[11px] gap-0.5 text-success border-success/30 hover:bg-success/10 shrink-0"
                            onClick={() => handlePayment(item)}
                          >
                            <Check className="h-3 w-3" /> Pagar
                          </Button>
                        )}
                        {isPago && !isHarvest && (
                          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[11px] gap-0.5 shrink-0" onClick={() => showExpenseDetail(item.id)}>
                            <FileText className="h-3 w-3" /> Detalhes
                          </Button>
                        )}
                        {isPago && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-1.5 text-[11px] gap-0.5 text-amber-600 border-amber-400/30 hover:bg-amber-500/10 shrink-0"
                            onClick={async () => {
                              if (!await confirm({ title: "Estornar pagamento", description: `Deseja estornar "${item.descricao}"? O valor voltará para pendente.`, confirmLabel: "Estornar" })) return;
                              if (isHarvest) {
                                const harvestPaymentId = item.id.replace("harvest-", "");
                                await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "colheitas").eq("origem_id", harvestPaymentId);
                                const { data: linkedExpenses } = await supabase.from("expenses").select("id").eq("contrato_id", harvestPaymentId);
                                if (linkedExpenses && linkedExpenses.length > 0) {
                                  for (const exp of linkedExpenses) {
                                    await supabase.from("movimentacoes_bancarias" as any).delete().eq("origem", "despesas").eq("origem_id", exp.id);
                                    await supabase.from("expense_payments" as any).delete().eq("expense_id", exp.id);
                                  }
                                  await supabase.from("expenses").delete().in("id", linkedExpenses.map(e => e.id));
                                }
                                await supabase.from("harvest_payments").delete().eq("id", harvestPaymentId);
                              } else {
                                await createReversalTransactions(item.id, "");
                                await supabase.from("expense_payments" as any).delete().eq("expense_id", item.id);
                                const installs = installmentsMap[item.id];
                                if (installs && installs.length > 0) {
                                  for (const inst of installs) {
                                    if (inst.status === "pago") {
                                      await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
                                    }
                                  }
                                }
                                await supabase.from("expenses").update({ valor_pago: 0, status: "pendente", data_pagamento: null } as any).eq("id", item.id);
                              }
                              toast.success("Pagamento estornado");
                              fetchData();
                            }}
                          >
                            <Undo2 className="h-3 w-3" /> Estornar
                          </Button>
                        )}
                        {!isHarvest && (
                          <div className="ml-auto flex gap-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleEdit(item)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {!isPago && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(item)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              }];
            })
            .sort((a, b) => {
              if (quickFilter === "atrasadas") {
                return b.vencimento.localeCompare(a.vencimento);
              }
              return a.vencimento.localeCompare(b.vencimento);
            })
            .map(entry => entry.node)}
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
        onOpenChange={(v) => { setBatchPayOpen(v); if (!v) { setSelectedIds(new Set()); } }}
        items={batchPayItems}
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
                          {inst.boleto_url && (
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto shrink-0" title="Baixar boleto" onClick={() => handleDownloadBoleto(inst)}>
                              <Download className="h-3 w-3 text-primary" />
                            </Button>
                          )}
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
