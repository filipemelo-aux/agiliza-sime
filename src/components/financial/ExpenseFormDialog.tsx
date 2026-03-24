import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { MaintenanceFields, type MaintenanceItem } from "./MaintenanceFields";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Trash2, Fuel, Wrench, ChevronDown, ChevronUp, Plus, FolderTree, CalendarDays } from "lucide-react";
import { parseNfeXml, type NfeItem, type NfeDuplicata } from "@/lib/nfeXmlParser";
import { format } from "date-fns";

const CENTRO_CUSTO_OPTIONS = [
  { value: "frota_propria", label: "Frota Própria" },
  { value: "frota_terceiros", label: "Frota Terceiros" },
  { value: "administrativo", label: "Administrativo" },
  { value: "operacional", label: "Operacional" },
];

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

const ORIGEM_MAP: Record<string, string> = {
  manual: "Manual",
  xml: "Importação XML",
  abastecimento: "Abastecimento",
};

interface ChartAccount { id: string; codigo: string; nome: string; tipo: string; conta_pai_id: string | null; tipo_operacional?: string | null; }

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
  litros: number | null;
  km_odometro: number | null;
  numero_multa: string | null;
  documento_fiscal_importado?: boolean;
  xml_original?: string | null;
  fornecedor_cnpj?: string | null;
  veiculo_id?: string | null;
  tipo_manutencao?: string | null;
  km_atual?: number | null;
  fornecedor_mecanica?: string | null;
  tempo_parado?: string | null;
  proxima_manutencao_km?: number | null;
  origem?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

interface PaymentRecord {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
}

interface FuelingRecord {
  id: string;
  data_abastecimento: string;
  quantidade_litros: number;
  valor_total: number;
  posto_combustivel: string | null;
  status_faturamento: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
  empresaId: string;
  chartAccounts: ChartAccount[];
  onSaved: () => void;
}

export function ExpenseFormDialog({ open, onOpenChange, expense, empresaId, chartAccounts: externalChartAccounts, onSaved }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!expense;

  const [descricao, setDescricao] = useState("");
  const [planoContasId, setPlanoContasId] = useState("");
  const [centroCusto, setCentroCusto] = useState("operacional");
  const [valorTotal, setValorTotal] = useState("");
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split("T")[0]);
  const [dataVencimento, setDataVencimento] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [favorecidoNome, setFavorecidoNome] = useState("");
  const [favorecidoId, setFavorecidoId] = useState<string | null>(null);
  const [docFiscal, setDocFiscal] = useState("");
  const [chaveNfe, setChaveNfe] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [litros, setLitros] = useState("");
  const [kmOdometro, setKmOdometro] = useState("");
  const [numeroMulta, setNumeroMulta] = useState("");
  const [saving, setSaving] = useState(false);

  // NF-e fields
  const [fornecedorCnpj, setFornecedorCnpj] = useState("");
  const [xmlOriginal, setXmlOriginal] = useState<string | null>(null);
  const [documentoImportado, setDocumentoImportado] = useState(false);
  const [itensNota, setItensNota] = useState<NfeItem[]>([]);
  const [inputMode, setInputMode] = useState<"manual" | "xml">("manual");

  // Installments (parcelas)
  interface Parcela { numero: number; valor: string; data_vencimento: string; }
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [useParcelas, setUseParcelas] = useState(false);

  // Maintenance fields
  const [isManutencao, setIsManutencao] = useState(false);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [tipoManutencao, setTipoManutencao] = useState("corretiva");
  const [kmAtual, setKmAtual] = useState("");
  const [descricaoServico, setDescricaoServico] = useState("");
  const [fornecedorMecanica, setFornecedorMecanica] = useState("");
  const [tempoParado, setTempoParado] = useState("");
  const [proximaManutencaoKm, setProximaManutencaoKm] = useState("");
  const [dataProximaManutencao, setDataProximaManutencao] = useState("");
  const [itensManutencao, setItensManutencao] = useState<MaintenanceItem[]>([]);

  // Use external chart accounts
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);

  useEffect(() => {
    if (!open) return;
    if (externalChartAccounts.length > 0) {
      setChartAccounts(externalChartAccounts);
    } else {
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("ativo", true).order("codigo")
        .then(({ data }) => setChartAccounts((data as any) || []));
    }
  }, [open, externalChartAccounts]);

  // Build hierarchical path for a chart account
  const chartMap = useMemo(() => {
    const m = new Map<string, ChartAccount>();
    chartAccounts.forEach(a => m.set(a.id, a));
    return m;
  }, [chartAccounts]);

  const getChartPath = (chartId: string | null | undefined): string => {
    if (!chartId) return "";
    const parts: string[] = [];
    let current = chartMap.get(chartId);
    while (current) {
      parts.unshift(current.nome);
      current = current.conta_pai_id ? chartMap.get(current.conta_pai_id) : undefined;
    }
    return parts.join(" › ");
  };

  const getChartCode = (chartId: string | null | undefined): string => {
    if (!chartId) return "";
    return chartMap.get(chartId)?.codigo || "";
  };

  // Derive maintenance from selected chart account
  const selectedAccount = chartAccounts.find(c => c.id === planoContasId);
  const isCategoryMaintenance = selectedAccount?.tipo_operacional === "manutencao";

  // Auto-activate maintenance when category has tipo_operacional = manutencao
  useEffect(() => {
    if (isCategoryMaintenance) {
      setIsManutencao(true);
    }
  }, [isCategoryMaintenance]);

  // Filtered chart accounts for expense form (only despesa type, leaf nodes)
  const despesaChartAccounts = useMemo(() =>
    chartAccounts.filter(a => a.tipo === "despesa"), [chartAccounts]);

  // Histórico
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Fuel linking
  const [unfueledRecords, setUnfueledRecords] = useState<FuelingRecord[]>([]);
  const [showFuelSuggestion, setShowFuelSuggestion] = useState(false);

  // Collapsible sections
  const [showDocFiscal, setShowDocFiscal] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (expense) {
      setDescricao(expense.descricao);
      setPlanoContasId(expense.plano_contas_id || "");
      setCentroCusto(expense.centro_custo);
      setValorTotal(String(expense.valor_total));
      setDataEmissao(expense.data_emissao);
      setDataVencimento(expense.data_vencimento || "");
      setFormaPagamento(expense.forma_pagamento || "");
      setFavorecidoNome(expense.favorecido_nome || "");
      setFavorecidoId(expense.favorecido_id || null);
      setDocFiscal(expense.documento_fiscal_numero || "");
      setChaveNfe(expense.chave_nfe || "");
      setObservacoes(expense.observacoes || "");
      setVeiculoPlaca(expense.veiculo_placa || "");
      setLitros(expense.litros ? String(expense.litros) : "");
      setKmOdometro(expense.km_odometro ? String(expense.km_odometro) : "");
      setNumeroMulta(expense.numero_multa || "");
      setFornecedorCnpj(expense.fornecedor_cnpj || "");
      setDocumentoImportado(expense.documento_fiscal_importado || false);
      setXmlOriginal(expense.xml_original || null);
      setInputMode(expense.documento_fiscal_importado ? "xml" : "manual");
      // Determine maintenance from chart account tipo_operacional
      const expAccount = chartAccounts.find(c => c.id === expense.plano_contas_id);
      setIsManutencao(expAccount?.tipo_operacional === "manutencao");
      setVeiculoId(expense.veiculo_id || null);
      setTipoManutencao(expense.tipo_manutencao || "corretiva");
      setKmAtual(expense.km_atual ? String(expense.km_atual) : "");
      setFornecedorMecanica(expense.fornecedor_mecanica || "");
      setTempoParado(expense.tempo_parado || "");
      setProximaManutencaoKm(expense.proxima_manutencao_km ? String(expense.proxima_manutencao_km) : "");
      setShowDocFiscal(!!(expense.documento_fiscal_numero || expense.chave_nfe));
      setShowHistory(false);
      if (expense.id) {
        loadItems(expense.id);
        if (expAccount?.tipo_operacional === "manutencao") loadMaintenanceItems(expense.id);
        loadPaymentHistory(expense.id);
      }
    } else {
      resetForm();
    }
  }, [expense, open]);

  // Show fuel suggestion for combustivel account
  const isCategoryCombustivel = selectedAccount?.tipo_operacional === "combustivel";
  useEffect(() => {
    if (isCategoryCombustivel && !isEditing) {
      loadUnfueledRecords();
    } else {
      setShowFuelSuggestion(false);
      setUnfueledRecords([]);
    }
  }, [isCategoryCombustivel, isEditing]);

  const loadUnfueledRecords = async () => {
    const { data } = await supabase
      .from("fuelings")
      .select("id, data_abastecimento, quantidade_litros, valor_total, posto_combustivel, status_faturamento")
      .eq("status_faturamento", "nao_faturado")
      .is("deleted_at", null)
      .order("data_abastecimento", { ascending: false })
      .limit(5);
    if (data && data.length > 0) {
      setUnfueledRecords(data as any);
      setShowFuelSuggestion(true);
    }
  };

  const loadItems = async (expenseId: string) => {
    const { data } = await supabase.from("expense_items").select("*").eq("expense_id", expenseId).order("created_at");
    if (data) {
      setItensNota(data.map(d => ({
        descricao: d.descricao, quantidade: Number(d.quantidade),
        valor_unitario: Number(d.valor_unitario), valor_total: Number(d.valor_total),
        ncm: d.ncm || "", cfop: d.cfop || "", unidade: d.unidade || "",
      })));
    }
  };

  const loadMaintenanceItems = async (expenseId: string) => {
    const { data } = await supabase.from("expense_maintenance_items" as any).select("*").eq("expense_id", expenseId).order("created_at");
    if (data) {
      setItensManutencao((data as any[]).map(d => ({
        tipo: d.tipo || "peca", descricao: d.descricao,
        quantidade: Number(d.quantidade), valor_unitario: Number(d.valor_unitario), valor_total: Number(d.valor_total),
      })));
    }
  };

  const loadPaymentHistory = async (expenseId: string) => {
    const { data } = await supabase.from("expense_payments" as any).select("*").eq("expense_id", expenseId).order("created_at", { ascending: false });
    setPaymentHistory((data as any) || []);
  };

  const resetForm = () => {
    setDescricao(""); setPlanoContasId(""); setCentroCusto("operacional");
    setValorTotal(""); setDataEmissao(new Date().toISOString().split("T")[0]); setDataVencimento("");
    setFormaPagamento(""); setFavorecidoNome(""); setFavorecidoId(null); setDocFiscal("");
    setChaveNfe(""); setObservacoes(""); setVeiculoPlaca(""); setLitros(""); setKmOdometro("");
    setNumeroMulta(""); setFornecedorCnpj(""); setXmlOriginal(null); setDocumentoImportado(false);
    setItensNota([]); setInputMode("manual");
    setVeiculoId(null); setTipoManutencao("corretiva"); setKmAtual(""); setDescricaoServico(""); setFornecedorMecanica(""); setIsManutencao(false);
    setTempoParado(""); setProximaManutencaoKm(""); setDataProximaManutencao(""); setItensManutencao([]);
    setPaymentHistory([]); setUnfueledRecords([]); setShowFuelSuggestion(false);
    setShowDocFiscal(false); setShowHistory(false);
    setParcelas([]); setUseParcelas(false);
  };

  const handleXmlImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const xmlStr = ev.target?.result as string;
        const parsed = parseNfeXml(xmlStr);
        setDescricao(parsed.itens.length > 0 ? `NF ${parsed.numero_nota} - ${parsed.fornecedor_nome}` : `NF ${parsed.numero_nota}`);
        setFavorecidoNome(parsed.fornecedor_nome);
        setFornecedorCnpj(parsed.fornecedor_cnpj);
        setDocFiscal(parsed.numero_nota);
        setChaveNfe(parsed.chave_nfe);
        setDataEmissao(parsed.data_emissao || new Date().toISOString().split("T")[0]);
        setValorTotal(String(parsed.valor_total));
        // Auto-select chart account based on XML suggestion
        const suggestedType = parsed.tipo_despesa_sugerido;
        const matchingAccount = chartAccounts.find(c => c.tipo_operacional === suggestedType);
        if (matchingAccount) setPlanoContasId(matchingAccount.id);
        setXmlOriginal(parsed.xml_original);
        setDocumentoImportado(true);
        setItensNota(parsed.itens);
        setShowDocFiscal(true);
        // Parse duplicatas/parcelas from XML
        if (parsed.duplicatas.length > 0) {
          setUseParcelas(true);
          setParcelas(parsed.duplicatas.map((d, i) => ({
            numero: i + 1,
            valor: String(d.valor),
            data_vencimento: d.vencimento,
          })));
          // Set first due date as main due date
          if (parsed.duplicatas[0]?.vencimento) {
            setDataVencimento(parsed.duplicatas[0].vencimento);
          }
        }
        toast.success(`XML importado: ${parsed.itens.length} item(ns)${parsed.duplicatas.length > 0 ? `, ${parsed.duplicatas.length} parcela(s)` : ""}`);
      } catch (err: any) {
        toast.error(err.message || "Erro ao processar XML");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeItem = (index: number) => setItensNota(prev => prev.filter((_, i) => i !== index));

  const isMaintenanceType = isManutencao;

  useEffect(() => {
    if (itensNota.length > 0 && !isMaintenanceType) {
      const sum = itensNota.reduce((s, i) => s + Number(i.valor_total), 0);
      if (sum > 0) setValorTotal(String(sum.toFixed(2)));
    }
  }, [itensNota]);

  const handleSave = async () => {
    if (!planoContasId) return toast.error("Selecione a conta contábil");
    if (!descricao.trim()) return toast.error("Informe a descrição");
    if (!valorTotal || Number(valorTotal) <= 0) return toast.error("Informe o valor");
    if (isMaintenanceType) {
      if (!veiculoId) return toast.error("Selecione o veículo para manutenção");
      if (!kmAtual || Number(kmAtual) <= 0) return toast.error("Informe o KM atual");
      if (!tipoManutencao) return toast.error("Selecione o tipo de manutenção");
      if (!descricaoServico.trim()) return toast.error("Informe a descrição do serviço");

      // Validate odometer is greater than last recorded KM
      const { data: lastKmData } = await supabase
        .from("expenses")
        .select("km_atual")
        .eq("veiculo_id", veiculoId)
        .not("km_atual", "is", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastKm = lastKmData?.km_atual ? Number(lastKmData.km_atual) : null;
      if (lastKm !== null && Number(kmAtual) <= lastKm) {
        return toast.error(`KM deve ser maior que o último registrado (${lastKm.toLocaleString("pt-BR")} km)`);
      }
    }

    const trimmedChave = chaveNfe.trim();
    if (trimmedChave) {
      const { data: existing } = await supabase.from("expenses").select("id").eq("chave_nfe", trimmedChave).is("deleted_at", null).maybeSingle();
      if (existing && existing.id !== expense?.id) return toast.error("Já existe uma despesa com esta chave de NF-e.");
    }

    // Derive tipo_despesa from account for backward compatibility
    const derivedTipoDespesa = selectedAccount?.tipo_operacional === "manutencao" ? "manutencao"
      : selectedAccount?.tipo_operacional === "combustivel" ? "combustivel"
      : "outros";

    setSaving(true);
    const payload: any = {
      empresa_id: empresaId, descricao: descricao.trim(), tipo_despesa: derivedTipoDespesa,
      plano_contas_id: planoContasId, centro_custo: centroCusto,
      valor_total: Number(valorTotal), data_emissao: dataEmissao,
      data_vencimento: dataVencimento || null, forma_pagamento: formaPagamento || null,
      favorecido_nome: favorecidoNome.trim() || null, favorecido_id: favorecidoId || null,
      documento_fiscal_numero: docFiscal.trim() || null, chave_nfe: trimmedChave || null,
      origem: documentoImportado ? "xml" : "manual",
      observacoes: observacoes.trim() || null, veiculo_placa: veiculoPlaca.trim() || null,
      litros: litros ? Number(litros) : null, km_odometro: kmOdometro ? Number(kmOdometro) : null,
      numero_multa: numeroMulta.trim() || null, documento_fiscal_importado: documentoImportado,
      xml_original: xmlOriginal, fornecedor_cnpj: fornecedorCnpj.trim() || null,
      veiculo_id: isMaintenanceType ? veiculoId : null,
      tipo_manutencao: isMaintenanceType ? tipoManutencao : null,
      km_atual: isMaintenanceType && kmAtual ? Number(kmAtual) : null,
      fornecedor_mecanica: isMaintenanceType ? (fornecedorMecanica.trim() || null) : null,
      tempo_parado: isMaintenanceType ? (tempoParado.trim() || null) : null,
      proxima_manutencao_km: isMaintenanceType && proximaManutencaoKm ? Number(proximaManutencaoKm) : null,
    };

    let expenseId = expense?.id;

    if (expense) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
      if (error) {
        toast.error(error.message.includes("idx_expenses_chave_nfe_unique") ? "Chave NF-e duplicada" : error.message);
        setSaving(false); return;
      }
    } else {
      payload.created_by = user?.id;
      const { data, error } = await supabase.from("expenses").insert(payload).select("id").single();
      if (error) {
        toast.error(error.message.includes("idx_expenses_chave_nfe_unique") ? "Chave NF-e duplicada" : error.message);
        setSaving(false); return;
      }
      expenseId = data.id;
    }

    if (expenseId && itensNota.length > 0) {
      await supabase.from("expense_items").delete().eq("expense_id", expenseId);
      await supabase.from("expense_items").insert(itensNota.map(item => ({
        expense_id: expenseId, descricao: item.descricao, quantidade: item.quantidade,
        valor_unitario: item.valor_unitario, valor_total: item.valor_total,
        ncm: item.ncm || null, cfop: item.cfop || null, unidade: item.unidade || null,
      })));
    }

    // Save installments
    if (expenseId) {
      await supabase.from("expense_installments" as any).delete().eq("expense_id", expenseId);
      if (useParcelas && parcelas.length > 0) {
        await supabase.from("expense_installments" as any).insert(parcelas.map(p => ({
          expense_id: expenseId,
          numero_parcela: p.numero,
          valor: Number(p.valor) || 0,
          data_vencimento: p.data_vencimento,
          status: "pendente",
        })));
      }
    }

    if (expenseId && isMaintenanceType && itensManutencao.length > 0) {
      await supabase.from("expense_maintenance_items" as any).delete().eq("expense_id", expenseId);
      await supabase.from("expense_maintenance_items" as any).insert(itensManutencao.map(item => ({
        expense_id: expenseId, tipo: item.tipo, descricao: item.descricao,
        quantidade: item.quantidade, valor_unitario: item.valor_unitario, valor_total: item.valor_total,
      })));
    }

    // Auto-create/update maintenance record
    if (expenseId && isMaintenanceType && veiculoId) {
      const maintenancePayload: any = {
        veiculo_id: veiculoId,
        expense_id: expenseId,
        data_manutencao: dataEmissao,
        odometro: Number(kmAtual) || 0,
        tipo_manutencao: tipoManutencao,
        descricao: descricaoServico.trim() || descricao.trim(),
        custo_total: Number(valorTotal) || 0,
        fornecedor: fornecedorMecanica.trim() || null,
        status: "realizada",
        proxima_manutencao_km: proximaManutencaoKm ? Number(proximaManutencaoKm) : null,
        data_proxima_manutencao: dataProximaManutencao || null,
        created_by: user?.id,
      };

      const { data: existingMaint } = await supabase
        .from("maintenances" as any)
        .select("id")
        .eq("expense_id", expenseId)
        .maybeSingle();

      if (existingMaint) {
        await supabase.from("maintenances" as any).update(maintenancePayload).eq("id", (existingMaint as any).id);
      } else {
        await supabase.from("maintenances" as any).insert(maintenancePayload);
      }
    }

    toast.success(expense ? "Despesa atualizada" : "Despesa criada");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const isCategoryWithVehicle = selectedAccount?.tipo_operacional === "combustivel";
  const showFuelFields = isCategoryCombustivel;

  const formaLabel = (v: string) => FORMA_PAGAMENTO_OPTIONS.find(o => o.value === v)?.label || v;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? "Editar" : "Nova"} Despesa
            {isEditing && documentoImportado && (
              <Badge variant="secondary" className="text-[10px]"><FileText className="h-3 w-3 mr-1" />XML</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input mode selector for new expense */}
          {!isEditing && (
            <div className="flex gap-2">
              <Button
                variant={inputMode === "manual" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setInputMode("manual")}
              >
                <FileText className="h-3.5 w-3.5" /> Manual
              </Button>
              <Button
                variant={inputMode === "xml" ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setInputMode("xml")}
              >
                <Upload className="h-3.5 w-3.5" /> Importar XML
              </Button>
            </div>
          )}

          {inputMode === "xml" && !isEditing && (
            <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-2">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Selecione um arquivo XML de NF-e ou NFS-e</p>
              <input ref={fileInputRef} type="file" accept=".xml" onChange={handleXmlImport} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Selecionar XML</Button>
              {documentoImportado && <Badge variant="default" className="ml-2">Importado ✓</Badge>}
            </div>
          )}

          {/* ── Conta Contábil (Plano de Contas) ── */}
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <FolderTree className="h-3 w-3 text-primary" /> Conta Contábil *
                </Label>
                <Select value={planoContasId} onValueChange={setPlanoContasId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {despesaChartAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-[10px] mr-1">{a.codigo}</span> {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Descrição *</Label>
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Troca de óleo..." className="h-9" />
              </div>
            </div>

            {/* Hierarchical path display */}
            {selectedAccount && (
              <div className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2">
                <FolderTree className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground font-medium">Hierarquia</p>
                  <p className="text-xs text-foreground truncate" title={getChartPath(planoContasId)}>
                    {getChartPath(planoContasId) || "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">{getChartCode(planoContasId)}</p>
                </div>
              </div>
            )}
          </div>

          {/* ── É manutenção? ── */}
          <div className={`rounded-lg border p-3 transition-colors ${isManutencao ? "border-primary/50 bg-primary/5" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className={`h-4 w-4 ${isManutencao ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <Label className="text-xs font-medium cursor-pointer" htmlFor="is-manutencao">É manutenção do veículo?</Label>
                  <p className="text-[10px] text-muted-foreground">Registra no histórico de manutenção da frota</p>
                </div>
              </div>
              <Switch
                id="is-manutencao"
                checked={isManutencao}
                onCheckedChange={(checked) => {
                  setIsManutencao(checked);
                  // If turning on and no maintenance category selected, auto-select it
                  if (checked && !isCategoryMaintenance) {
                    const maintAccount = chartAccounts.find(c => c.tipo_operacional === "manutencao");
                    if (maintAccount) setPlanoContasId(maintAccount.id);
                  }
                }}
              />
            </div>
            {isManutencao && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5">
                <Wrench className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-primary font-medium leading-tight">
                  Essa despesa será registrada também no histórico de manutenção do veículo selecionado.
                </p>
              </div>
            )}
          </div>

          {/* Fuel suggestion */}
          {showFuelSuggestion && unfueledRecords.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Fuel className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">Abastecimentos não faturados</span>
                </div>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Existem {unfueledRecords.length} abastecimentos pendentes. Use o módulo de Abastecimentos para gerar contas a pagar em lote.
                </p>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                  window.location.href = "/admin/fuelings";
                }}>
                  Ir para Abastecimentos
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Favorecido + CNPJ ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Favorecido</Label>
              <PersonSearchInput
                categories={["fornecedor"]}
                placeholder="Buscar fornecedor..."
                selectedName={favorecidoNome || undefined}
                onSelect={p => { setFavorecidoNome(p.full_name); setFavorecidoId(p.id); }}
                onClear={() => { setFavorecidoNome(""); setFavorecidoId(null); }}
              />
            </div>
            <div>
              <Label className="text-xs">CNPJ Fornecedor</Label>
              <Input value={fornecedorCnpj} onChange={e => setFornecedorCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="h-9" />
            </div>
          </div>

          {/* ── Valor, Emissão, Vencimento ── */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} placeholder="0,00" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Emissão</Label>
              <Input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Vencimento</Label>
              <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="h-9" />
            </div>
          </div>

          {/* ── Centro Custo, Forma Pgto ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Centro de Custo</Label>
              <Select value={centroCusto} onValueChange={setCentroCusto}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CENTRO_CUSTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMA_PAGAMENTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Vehicle-specific fields (for combustivel category) ── */}
          {isCategoryWithVehicle && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Placa Veículo</Label>
                <Input value={veiculoPlaca} onChange={e => setVeiculoPlaca(e.target.value)} placeholder="ABC1D23" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">Km Odômetro</Label>
                <Input type="number" value={kmOdometro} onChange={e => setKmOdometro(e.target.value)} placeholder="0" className="h-9" />
              </div>
            </div>
          )}
          {showFuelFields && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Litros</Label>
                <Input type="number" step="0.01" value={litros} onChange={e => setLitros(e.target.value)} placeholder="0,00" className="h-9" />
              </div>
            </div>
          )}

          {/* ── Manutenção ── */}
          {isMaintenanceType && (
            <div className="space-y-3 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Dados da Manutenção</span>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                Essa despesa será registrada também no histórico de manutenção do veículo.
              </p>
              <MaintenanceFields
                veiculoId={veiculoId} onVeiculoIdChange={setVeiculoId}
                kmAtual={kmAtual} onKmAtualChange={setKmAtual}
                tipoManutencao={tipoManutencao} onTipoManutencaoChange={setTipoManutencao}
                descricaoServico={descricaoServico} onDescricaoServicoChange={setDescricaoServico}
                fornecedorMecanica={fornecedorMecanica} onFornecedorMecanicaChange={setFornecedorMecanica}
                tempoParado={tempoParado} onTempoParadoChange={setTempoParado}
                proximaManutencaoKm={proximaManutencaoKm} onProximaManutencaoKmChange={setProximaManutencaoKm}
                dataProximaManutencao={dataProximaManutencao} onDataProximaManutencaoChange={setDataProximaManutencao}
                itensManutencao={itensManutencao} onItensManutencaoChange={setItensManutencao}
                onTotalChange={(total) => { if (total > 0) setValorTotal(String(total)); }}
              />
            </div>
          )}

          {/* ── Observações ── */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} className="text-sm" />
          </div>

          {/* ── Doc Fiscal (collapsible) ── */}
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
            onClick={() => setShowDocFiscal(!showDocFiscal)}
          >
            {showDocFiscal ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Documento Fiscal
            {(docFiscal || chaveNfe) && <Badge variant="secondary" className="text-[9px] ml-1">Preenchido</Badge>}
          </button>
          {showDocFiscal && (
            <div className="space-y-3 pl-5 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nº Doc. Fiscal</Label>
                  <Input value={docFiscal} onChange={e => setDocFiscal(e.target.value)} placeholder="Número NF/Recibo" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Chave NF-e</Label>
                  <Input value={chaveNfe} onChange={e => setChaveNfe(e.target.value)} placeholder="44 dígitos" maxLength={44} className="h-9" />
                </div>
              </div>

              {isEditing && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Origem:</span>{" "}
                    <span>{ORIGEM_MAP[expense?.origem || "manual"] || expense?.origem}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Importado:</span>{" "}
                    <span>{documentoImportado ? "Sim" : "Não"}</span>
                  </div>
                </div>
              )}

              {/* Items da Nota */}
              {itensNota.length > 0 && (
                <div>
                  <Label className="text-xs mb-1 block">Itens da Nota ({itensNota.length})</Label>
                  <div className="border rounded-md overflow-x-auto max-h-[200px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Descrição</TableHead>
                          <TableHead className="text-[10px] text-right">Qtd</TableHead>
                          <TableHead className="text-[10px] text-right">Vl. Unit.</TableHead>
                          <TableHead className="text-[10px] text-right">Total</TableHead>
                          <TableHead className="text-[10px] w-[32px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensNota.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-[11px] max-w-[160px] truncate">{item.descricao}</TableCell>
                            <TableCell className="text-[11px] text-right">{item.quantidade}</TableCell>
                            <TableCell className="text-[11px] text-right font-mono">{item.valor_unitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-[11px] text-right font-mono">{item.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Histórico (editing only, collapsible) ── */}
          {isEditing && (
            <>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Histórico
                {paymentHistory.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] ml-1">{paymentHistory.length} pgto(s)</Badge>
                )}
              </button>
              {showHistory && (
                <div className="space-y-3 pl-5 border-l-2 border-muted">
                  {/* Payment summary */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                        <p className="text-sm font-bold font-mono">R$ {Number(expense?.valor_total || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Pago</p>
                        <p className="text-sm font-bold font-mono text-emerald-600">R$ {Number(expense?.valor_pago || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Restante</p>
                        <p className="text-sm font-bold font-mono text-destructive">
                          R$ {(Number(expense?.valor_total || 0) - Number(expense?.valor_pago || 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Audit */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Criado em:</span>{" "}
                      {expense?.created_at ? format(new Date(expense.created_at), "dd/MM/yyyy HH:mm") : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Atualizado em:</span>{" "}
                      {expense?.updated_at ? format(new Date(expense.updated_at), "dd/MM/yyyy HH:mm") : "—"}
                    </div>
                  </div>

                  {/* Payment history */}
                  {paymentHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">Nenhum pagamento registrado</p>
                  ) : (
                    <div className="border rounded-md overflow-x-auto max-h-[200px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Data</TableHead>
                            <TableHead className="text-[10px]">Valor</TableHead>
                            <TableHead className="text-[10px]">Forma</TableHead>
                            <TableHead className="text-[10px]">Obs</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentHistory.map(p => (
                            <TableRow key={p.id}>
                              <TableCell className="text-[11px]">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                              <TableCell className="text-[11px] font-mono">R$ {Number(p.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</TableCell>
                              <TableCell className="text-[11px]">{formaLabel(p.forma_pagamento)}</TableCell>
                              <TableCell className="text-[11px] max-w-[80px] truncate">{p.observacoes || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Save ── */}
          <div className="pt-2 border-t">
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
