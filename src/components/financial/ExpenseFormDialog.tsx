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
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { MaintenanceFields, type MaintenanceItem } from "./MaintenanceFields";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Upload, FileText, Trash2, Fuel, Wrench, ChevronDown, ChevronUp, Plus, Minus, FolderTree, CalendarDays, Paperclip, UserPlus } from "lucide-react";
import { parseNfeXml, type NfeItem, type NfeDuplicata } from "@/lib/nfeXmlParser";
import { maskName, maskSentence, maskCurrency, unmaskCurrency, formatCurrency, maskCNPJ } from "@/lib/masks";
import { format } from "date-fns";
import { splitPdfPages } from "@/lib/pdfSplitter";
import { getLocalDateISO } from "@/lib/date";

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
  unidade_id?: string | null;
  
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
  const [manualItemsEnabled, setManualItemsEnabled] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQtd, setNewItemQtd] = useState("1");
  const [newItemValor, setNewItemValor] = useState("");
  const [planoContasId, setPlanoContasId] = useState("");
  const [centroCusto, setCentroCusto] = useState("operacional");
  const [valorTotal, setValorTotal] = useState("");
  const [dataEmissao, setDataEmissao] = useState(getLocalDateISO());
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
  const [showCreateFornecedor, setShowCreateFornecedor] = useState(false);

  // NF-e fields
  const [fornecedorCnpj, setFornecedorCnpj] = useState("");
  const [xmlOriginal, setXmlOriginal] = useState<string | null>(null);
  const [documentoImportado, setDocumentoImportado] = useState(false);
  const [itensNota, setItensNota] = useState<NfeItem[]>([]);
  const [inputMode, setInputMode] = useState<"manual" | "xml">("manual");

  // Installments (parcelas)
  interface Parcela { numero: number; valor: string; data_vencimento: string; boleto_url?: string | null; }
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [useParcelas, setUseParcelas] = useState(false);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [boletoPdfFile, setBoletoPdfFile] = useState<File | null>(null);
  const [boletoPdfExistingUrl, setBoletoPdfExistingUrl] = useState<string | null>(null);
  const boletoInputRef = useRef<HTMLInputElement>(null);

  // Maintenance fields
  const [isManutencao, setIsManutencao] = useState(false);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [tipoManutencao, setTipoManutencao] = useState("corretiva");
  const [kmAtual, setKmAtual] = useState("");
  const [descricaoServico, setDescricaoServico] = useState("");
  const [fornecedorMecanica, setFornecedorMecanica] = useState("");
  const [tipoServico, setTipoServico] = useState("interno");
  const [tempoParado, setTempoParado] = useState("");
  const [proximaManutencaoKm, setProximaManutencaoKm] = useState("");
  const [dataProximaManutencao, setDataProximaManutencao] = useState("");
  const [itensManutencao, setItensManutencao] = useState<MaintenanceItem[]>([]);

  // NFSe / Ordem de Serviço linked to maintenance
  const [hasNfse, setHasNfse] = useState(false);
  const [nfseNumero, setNfseNumero] = useState("");
  interface NfseServiceItem { descricao: string; quantidade: number; valor_unitario: number; valor_total: number; }
  const [nfseItens, setNfseItens] = useState<NfseServiceItem[]>([]);
  const [nfseNewDesc, setNfseNewDesc] = useState("");
  const [nfseNewQtd, setNfseNewQtd] = useState("1");
  const [nfseNewValor, setNfseNewValor] = useState("");
  const [nfseDataEmissao, setNfseDataEmissao] = useState("");
  const [nfseDataVencimento, setNfseDataVencimento] = useState("");
  const [nfseFormaPagamento, setNfseFormaPagamento] = useState("");
  const [nfseFornecedorNome, setNfseFornecedorNome] = useState("");
  const [nfseFornecedorId, setNfseFornecedorId] = useState<string | null>(null);
  const [nfseObservacoes, setNfseObservacoes] = useState("");
   const [nfseUseParcelas, setNfseUseParcelas] = useState(false);
   interface NfseParcela { numero: number; valor: string; data_vencimento: string; }
   const [nfseParcelas, setNfseParcelas] = useState<NfseParcela[]>([]);
   const [nfseBoletoPdfFile, setNfseBoletoPdfFile] = useState<File | null>(null);
   const nfseBoletoInputRef = useRef<HTMLInputElement>(null);
  const nfseValorTotal = useMemo(() => nfseItens.reduce((s, i) => s + i.valor_total, 0), [nfseItens]);

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

  // Filtered chart accounts for expense form (only despesa type)
  const despesaChartAccounts = useMemo(() => {
    const all = chartAccounts.filter(a => a.tipo === "despesa");
    // Mark which accounts are parents (have children)
    const parentIds = new Set(all.filter(a => a.conta_pai_id).map(a => a.conta_pai_id!));
    // Return only leaf accounts (not parents) for selection
    return all.filter(a => !parentIds.has(a.id));
  }, [chartAccounts]);

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
        loadInstallments(expense.id);
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
        descricao: d.descricao,
        quantidade: Number(d.quantidade), valor_unitario: Number(d.valor_unitario), valor_total: Number(d.valor_total),
      })));
    }
  };

  const loadPaymentHistory = async (expenseId: string) => {
    const { data } = await supabase.from("expense_payments" as any).select("*").eq("expense_id", expenseId).order("created_at", { ascending: false });
    setPaymentHistory((data as any) || []);
  };

  const loadInstallments = async (expenseId: string) => {
    const { data } = await supabase.from("expense_installments" as any).select("*").eq("expense_id", expenseId).order("numero_parcela");
    if (data && (data as any[]).length > 0) {
      setUseParcelas(true);
      setParcelas((data as any[]).map((d: any) => ({
        numero: d.numero_parcela,
        valor: String(d.valor),
        data_vencimento: d.data_vencimento,
        boleto_url: d.boleto_url || null,
      })));
      // Check if any installment has boleto attached
      const hasBoleto = (data as any[]).some((d: any) => d.boleto_url);
      if (hasBoleto) {
        setBoletoPdfExistingUrl("__per_installment__");
      }
    } else {
      setUseParcelas(false);
      setParcelas([]);
    }
  };

  const resetForm = () => {
    setDescricao(""); setPlanoContasId(""); setCentroCusto("operacional");
    setValorTotal(""); setDataEmissao(getLocalDateISO()); setDataVencimento("");
    setFormaPagamento(""); setFavorecidoNome(""); setFavorecidoId(null); setDocFiscal("");
    setChaveNfe(""); setObservacoes(""); setVeiculoPlaca(""); setLitros(""); setKmOdometro("");
    setNumeroMulta(""); setFornecedorCnpj(""); setXmlOriginal(null); setDocumentoImportado(false);
    setItensNota([]); setInputMode("manual");
    setManualItemsEnabled(false); setNewItemDesc(""); setNewItemQtd("1"); setNewItemValor("");
    setVeiculoId(null); setTipoManutencao("corretiva"); setKmAtual(""); setDescricaoServico(""); setFornecedorMecanica(""); setTipoServico("interno"); setIsManutencao(false);
    setTempoParado(""); setProximaManutencaoKm(""); setDataProximaManutencao(""); setItensManutencao([]);
    setHasNfse(false); setNfseNumero(""); setNfseItens([]); setNfseNewDesc(""); setNfseNewQtd("1"); setNfseNewValor(""); setNfseDataEmissao("");
    setNfseDataVencimento(""); setNfseFormaPagamento(""); setNfseFornecedorNome(""); setNfseFornecedorId(null);
    setNfseObservacoes(""); setNfseUseParcelas(false); setNfseParcelas([]); setNfseBoletoPdfFile(null);
    setPaymentHistory([]); setUnfueledRecords([]); setShowFuelSuggestion(false);
    setShowDocFiscal(false); setShowHistory(false);
    setParcelas([]); setUseParcelas(false); setIntervaloDias(30);
    setBoletoPdfFile(null); setBoletoPdfExistingUrl(null);
    
  };

  const handleXmlImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const xmlStr = ev.target?.result as string;
        const parsed = parseNfeXml(xmlStr);
        // Auto-fill description with item summaries
        const itemSummary = parsed.itens.length > 0
          ? parsed.itens.map(i => i.descricao).join(", ")
          : `NF ${parsed.numero_nota}`;
        setDescricao(maskSentence(itemSummary));
        setFornecedorCnpj(parsed.fornecedor_cnpj);
        setDocFiscal(parsed.numero_nota);
        setChaveNfe(parsed.chave_nfe.replace(/\D/g, ""));
        setDataEmissao(parsed.data_emissao || getLocalDateISO());
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
          if (parsed.duplicatas[0]?.vencimento) {
            setDataVencimento(parsed.duplicatas[0].vencimento);
          }
        }

        // Lookup supplier in profiles by CNPJ/CPF — auto-create if not found
        if (parsed.fornecedor_cnpj) {
          const cnpjClean = parsed.fornecedor_cnpj.replace(/\D/g, "");
          const { data: supplier } = await supabase
            .from("profiles")
            .select("id, full_name, cnpj, razao_social, nome_fantasia")
            .eq("cnpj", cnpjClean)
            .maybeSingle();

          if (supplier) {
            setFavorecidoId(supplier.id);
            setFavorecidoNome(supplier.nome_fantasia || supplier.razao_social || supplier.full_name);
            toast.success(`XML importado: ${parsed.itens.length} item(ns)${parsed.duplicatas.length > 0 ? `, ${parsed.duplicatas.length} parcela(s)` : ""} — Fornecedor identificado automaticamente`);
          } else if (user?.id) {
            // Auto-create supplier from XML emitente data
            const em = parsed.emitente;
            const { data: created, error: createErr } = await supabase
              .from("profiles")
              .insert({
                user_id: user.id,
                full_name: em.razao_social || parsed.fornecedor_nome,
                razao_social: em.razao_social || null,
                nome_fantasia: em.nome_fantasia || null,
                cnpj: cnpjClean,
                inscricao_estadual: em.inscricao_estadual || null,
                person_type: cnpjClean.length <= 11 ? "fisica" : "juridica",
                category: "fornecedor",
                address_street: em.logradouro || null,
                address_number: em.numero || null,
                address_complement: em.complemento || null,
                address_neighborhood: em.bairro || null,
                address_city: em.municipio || null,
                address_state: em.uf || null,
                address_zip: em.cep || null,
                notes: `Cadastro automático via importação XML - NF ${parsed.numero_nota} em ${new Date().toLocaleDateString("pt-BR")}`,
              })
              .select("id, full_name, nome_fantasia, razao_social")
              .single();

            if (created && !createErr) {
              setFavorecidoId(created.id);
              setFavorecidoNome(created.nome_fantasia || created.razao_social || created.full_name);
              toast.success(`XML importado: ${parsed.itens.length} item(ns)${parsed.duplicatas.length > 0 ? `, ${parsed.duplicatas.length} parcela(s)` : ""} — Novo fornecedor criado automaticamente`);
            } else {
              setFavorecidoNome(parsed.fornecedor_nome);
              setFavorecidoId(null);
              toast.warning(`XML importado, mas não foi possível criar fornecedor automaticamente. Cadastre "${parsed.fornecedor_nome}" manualmente.`, { duration: 6000 });
            }
          } else {
            setFavorecidoNome(parsed.fornecedor_nome);
            toast.success(`XML importado: ${parsed.itens.length} item(ns)${parsed.duplicatas.length > 0 ? `, ${parsed.duplicatas.length} parcela(s)` : ""}`);
          }
        } else {
          setFavorecidoNome(parsed.fornecedor_nome);
          toast.success(`XML importado: ${parsed.itens.length} item(ns)${parsed.duplicatas.length > 0 ? `, ${parsed.duplicatas.length} parcela(s)` : ""}`);
        }
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
    // Auto-fill description from manual items
    if (manualItemsEnabled && itensNota.length > 0 && inputMode === "manual") {
      const summary = itensNota.map(i => i.descricao).join(", ");
      setDescricao(maskSentence(summary));
    }
  }, [itensNota, manualItemsEnabled]);

  // Auto-fill maintenance items from NF-e items when maintenance mode is activated
  useEffect(() => {
    if (isMaintenanceType && itensNota.length > 0 && itensManutencao.length === 0) {
      const converted: MaintenanceItem[] = itensNota.map(item => ({
        descricao: item.descricao,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
      }));
      setItensManutencao(converted);
    }
  }, [isMaintenanceType, itensNota]);

  const handleSave = async () => {
    if (!planoContasId) return toast.error("Selecione a conta contábil");
    if (!descricao.trim()) return toast.error("Informe a descrição");
    if (!valorTotal || Number(valorTotal) <= 0) return toast.error("Informe o valor");
    if (isMaintenanceType) {
      if (!veiculoId) return toast.error("Selecione o veículo para manutenção");
      if (!kmAtual || Number(kmAtual) <= 0) return toast.error("Informe o KM atual");
      if (!tipoManutencao) return toast.error("Selecione o tipo de manutenção");
      if (!hasNfse && !descricaoServico.trim()) return toast.error("Informe a descrição do serviço");

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
      empresa_id: empresaId, unidade_id: empresaId, descricao: descricao.trim(), tipo_despesa: derivedTipoDespesa,
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

    // Save installments + boleto PDF (split per page)
    if (expenseId) {
      await supabase.from("expense_installments" as any).delete().eq("expense_id", expenseId);
      if (useParcelas && parcelas.length > 0) {
        // Split PDF into individual pages and upload each
        let boletoPaths: (string | null)[] = parcelas.map(() => null);

        if (boletoPdfFile) {
          try {
            const pageBlobs = await splitPdfPages(boletoPdfFile);
            const ts = Date.now();
            for (let i = 0; i < parcelas.length; i++) {
              if (i < pageBlobs.length) {
                const path = `boletos/${expenseId}/${ts}_parcela_${i + 1}.pdf`;
                const { error: upErr } = await supabase.storage
                  .from("payment-receipts")
                  .upload(path, pageBlobs[i], { upsert: true, contentType: "application/pdf" });
                if (!upErr) boletoPaths[i] = path;
              }
            }
            if (pageBlobs.length < parcelas.length) {
              toast.info(`PDF tem ${pageBlobs.length} página(s) para ${parcelas.length} parcelas. Parcelas excedentes ficaram sem boleto.`);
            }
          } catch (err: any) {
            console.error("Erro ao dividir PDF:", err);
            toast.warning("Não foi possível dividir o PDF por parcela. Boletos não anexados.");
          }
        } else if (boletoPdfExistingUrl) {
          // Preserve existing per-installment boleto URLs from loaded data
          parcelas.forEach((p, idx) => {
            if (p.boleto_url) boletoPaths[idx] = p.boleto_url;
          });
        }

        await supabase.from("expense_installments" as any).insert(parcelas.map((p, i) => ({
          expense_id: expenseId,
          numero_parcela: p.numero,
          valor: Number(p.valor) || 0,
          data_vencimento: p.data_vencimento,
          status: "pendente",
          boleto_url: boletoPaths[i],
        })));
      }
    }

    if (expenseId && isMaintenanceType && itensManutencao.length > 0) {
      await supabase.from("expense_maintenance_items" as any).delete().eq("expense_id", expenseId);
      await supabase.from("expense_maintenance_items" as any).insert(itensManutencao.map(item => ({
        expense_id: expenseId, tipo: "peca", descricao: item.descricao,
        quantidade: item.quantidade, valor_unitario: item.valor_unitario, valor_total: item.valor_total,
      })));
    }

    // Auto-create/update maintenance record
    if (expenseId && isMaintenanceType && veiculoId) {
      // Aggregate total: parts (NFe) + services (NFSe)
      const custoTotal = (Number(valorTotal) || 0) + (hasNfse ? nfseValorTotal : 0);
      // Use NFSe date as maintenance date when available, otherwise use emission date
      const dataManutencao = hasNfse && nfseDataEmissao ? nfseDataEmissao : dataEmissao;
      // Build description combining parts and services
      const partsDesc = itensManutencao.length > 0
        ? itensManutencao.map(i => i.descricao).join(", ")
        : descricao.trim();
      const servicesDesc = hasNfse && nfseItens.length > 0
        ? nfseItens.map(i => i.descricao).join(", ")
        : "";
      const fullDesc = servicesDesc
        ? `Peças: ${partsDesc} | Serviço: ${servicesDesc}`
        : descricaoServico.trim() || partsDesc;

      const maintenancePayload: any = {
        veiculo_id: veiculoId,
        expense_id: expenseId,
        data_manutencao: dataManutencao,
        odometro: Number(kmAtual) || 0,
        tipo_manutencao: tipoManutencao,
        descricao: fullDesc,
        custo_total: custoTotal,
        fornecedor: hasNfse ? (nfseFornecedorNome.trim() || null) : null,
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

    // Create second expense for NFSe/Ordem de Serviço if enabled
    if (!isEditing && isMaintenanceType && hasNfse && nfseValorTotal > 0) {
      const nfseDescStr = nfseItens.map(i => i.descricao).join(", ");
      const nfsePayload: any = {
        empresa_id: empresaId,
        descricao: nfseDescStr || `NFSe ${nfseNumero} - Serviço de manutenção`,
        tipo_despesa: "manutencao",
        plano_contas_id: planoContasId,
        centro_custo: centroCusto,
        valor_total: nfseValorTotal,
        data_emissao: nfseDataEmissao || dataEmissao,
        data_vencimento: nfseDataVencimento || null,
        forma_pagamento: nfseFormaPagamento || null,
        favorecido_nome: nfseFornecedorNome.trim() || fornecedorMecanica.trim() || null,
        favorecido_id: nfseFornecedorId || null,
        documento_fiscal_numero: nfseNumero.trim() || null,
        origem: "manual",
        observacoes: nfseObservacoes.trim() || `Vinculado à manutenção - ${descricaoServico.trim() || descricao.trim()}`,
        veiculo_id: veiculoId,
        tipo_manutencao: tipoManutencao,
        km_atual: kmAtual ? Number(kmAtual) : null,
        fornecedor_mecanica: fornecedorMecanica.trim() || null,
        created_by: user?.id,
      };

      const { data: nfseData, error: nfseError } = await supabase.from("expenses").insert(nfsePayload).select("id").single();
      if (nfseError) {
        console.error("Erro ao criar despesa NFSe:", nfseError);
        toast.warning("Despesa principal criada, mas houve erro ao criar a despesa da NFSe.");
      } else if (nfseData) {
        // Link NFSe expense to maintenance record
        if (expenseId) {
          await supabase.from("maintenances" as any).update({ nfse_expense_id: nfseData.id }).eq("expense_id", expenseId);
        }
        // Save NFSe installments if any
        if (nfseUseParcelas && nfseParcelas.length > 0) {
          let nfseBoletoPaths: (string | null)[] = nfseParcelas.map(() => null);
          if (nfseBoletoPdfFile) {
            try {
              const pageBlobs = await splitPdfPages(nfseBoletoPdfFile);
              const ts = Date.now();
              for (let i = 0; i < nfseParcelas.length; i++) {
                if (i < pageBlobs.length) {
                  const path = `boletos/${nfseData.id}/${ts}_parcela_${i + 1}.pdf`;
                  const { error: upErr } = await supabase.storage
                    .from("payment-receipts")
                    .upload(path, pageBlobs[i], { upsert: true, contentType: "application/pdf" });
                  if (!upErr) nfseBoletoPaths[i] = path;
                }
              }
              if (pageBlobs.length < nfseParcelas.length) {
                toast.info(`PDF tem ${pageBlobs.length} página(s) para ${nfseParcelas.length} parcelas NFSe. Parcelas excedentes ficaram sem boleto.`);
              }
            } catch (err: any) {
              console.error("Erro ao dividir PDF NFSe:", err);
              toast.warning("Não foi possível dividir o PDF por parcela NFSe.");
            }
          }
          await supabase.from("expense_installments" as any).insert(nfseParcelas.map((p, i) => ({
            expense_id: nfseData.id,
            numero_parcela: p.numero,
            valor: Number(p.valor) || 0,
            data_vencimento: p.data_vencimento,
            status: "pendente",
            boleto_url: nfseBoletoPaths[i],
          })));
        }
      }
    }

    toast.success(expense ? "Despesa atualizada" : hasNfse ? "Duas despesas criadas com sucesso" : "Despesa criada");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const isCategoryWithVehicle = selectedAccount?.tipo_operacional === "combustivel";
  const showFuelFields = isCategoryCombustivel;

  const formaLabel = (v: string) => FORMA_PAGAMENTO_OPTIONS.find(o => o.value === v)?.label || v;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? "Editar" : "Nova"} Despesa
            {isEditing && documentoImportado && (
              <Badge variant="secondary" className="text-[10px]"><FileText className="h-3 w-3 mr-1" />XML</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Input mode selector */}
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

          {inputMode === "xml" && (
            <div className="border-2 border-dashed rounded-lg p-4 text-center space-y-1.5">
              <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Selecione um arquivo XML de NF-e ou NFS-e</p>
              <input ref={fileInputRef} type="file" accept=".xml" onChange={handleXmlImport} className="hidden" />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>{isEditing ? "Reimportar XML" : "Selecionar XML"}</Button>
              {documentoImportado && <Badge variant="default" className="ml-2">Importado ✓</Badge>}
            </div>
          )}

          {/* ── Conta Contábil (Plano de Contas) ── */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs flex items-center gap-1">
                  <FolderTree className="h-3 w-3 text-primary" /> Conta Contábil *
                </Label>
                <Select value={planoContasId} onValueChange={setPlanoContasId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {despesaChartAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-[10px] mr-1 text-muted-foreground">{a.codigo}</span> {a.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Descrição *</Label>
                <Input value={descricao} onChange={e => setDescricao(maskSentence(e.target.value))} placeholder="Ex: Troca de óleo..." className="h-9" />
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Favorecido</Label>
              <PersonSearchInput
                categories={["fornecedor"]}
                placeholder="Buscar fornecedor..."
                selectedName={favorecidoNome || undefined}
                onSelect={p => { setFavorecidoNome(p.full_name); setFavorecidoId(p.id); if (p.cnpj) setFornecedorCnpj(maskCNPJ(p.cnpj)); }}
                onClear={() => { setFavorecidoNome(""); setFavorecidoId(null); }}
                endAction={
                  <button
                    type="button"
                    onClick={() => setShowCreateFornecedor(true)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="Cadastrar fornecedor"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                }
              />
            </div>
            <div>
              <Label className="text-xs">CNPJ Fornecedor</Label>
              <Input value={fornecedorCnpj} onChange={e => setFornecedorCnpj(e.target.value)} placeholder="00.000.000/0000-00" className="h-9" />
            </div>
          </div>

          {/* ── Valor, Emissão, Vencimento ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Valor (R$) *</Label>
              <Input value={valorTotal ? maskCurrency(String(Math.round(parseFloat(valorTotal) * 100))) : ""} onChange={e => setValorTotal(unmaskCurrency(e.target.value))} placeholder="0,00" className="h-9" />
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

          {/* ── Parcelas / Duplicatas ── */}
          <div className={`rounded-lg border p-3 transition-colors ${useParcelas ? "border-primary/50 bg-primary/5" : "border-border"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className={`h-4 w-4 ${useParcelas ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <Label className="text-xs font-medium cursor-pointer" htmlFor="use-parcelas">Parcelamento</Label>
                  <p className="text-[10px] text-muted-foreground">Definir parcelas com vencimentos individuais</p>
                </div>
              </div>
              <Switch id="use-parcelas" checked={useParcelas} onCheckedChange={(checked) => {
                setUseParcelas(checked);
                if (checked && parcelas.length === 0) {
                  const val = Number(valorTotal) || 0;
                  setParcelas([{ numero: 1, valor: String(val.toFixed(2)), data_vencimento: dataVencimento || "" }]);
                }
              }} />
            </div>

            {useParcelas && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {parcelas.length} parcela(s) — Total: {formatCurrency(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0))}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Label className="text-[10px] text-muted-foreground whitespace-nowrap">Intervalo (dias):</Label>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={intervaloDias}
                        onChange={(e) => {
                          const v = Math.max(1, Math.min(365, Number(e.target.value) || 30));
                          setIntervaloDias(v);
                          if (parcelas.length > 1) {
                            const val = Number(valorTotal) || 0;
                            const base = dataVencimento ? new Date(dataVencimento + "T12:00:00") : new Date();
                            const newParcelas: Parcela[] = parcelas.map((p, i) => {
                              const d = new Date(base);
                              d.setDate(d.getDate() + v * i);
                              return { ...p, data_vencimento: getLocalDateISO(d) };
                            });
                            setParcelas(newParcelas);
                          }
                        }}
                        className="h-6 w-16 text-[10px] px-1.5 text-center"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => {
                        const val = Number(valorTotal) || 0;
                        const newCount = parcelas.length + 1;
                        const parcelaVal = (val / newCount).toFixed(2);
                        const base = dataVencimento ? new Date(dataVencimento + "T12:00:00") : new Date();
                        const newParcelas: Parcela[] = [];
                        for (let i = 0; i < newCount; i++) {
                          const d = new Date(base);
                          d.setDate(d.getDate() + intervaloDias * i);
                          newParcelas.push({ numero: i + 1, valor: parcelaVal, data_vencimento: getLocalDateISO(d) });
                        }
                        const diff = val - newParcelas.reduce((s, p) => s + Number(p.valor), 0);
                        if (Math.abs(diff) > 0.001) {
                          newParcelas[newParcelas.length - 1].valor = (Number(newParcelas[newParcelas.length - 1].valor) + diff).toFixed(2);
                        }
                        setParcelas(newParcelas);
                      }}>
                        <Plus className="h-3 w-3 mr-0.5" /> Parcela
                      </Button>
                      {parcelas.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={() => {
                          const val = Number(valorTotal) || 0;
                          const newCount = parcelas.length - 1;
                          const parcelaVal = (val / newCount).toFixed(2);
                          const base = dataVencimento ? new Date(dataVencimento + "T12:00:00") : new Date();
                          const newParcelas: Parcela[] = [];
                          for (let i = 0; i < newCount; i++) {
                            const d = new Date(base);
                            d.setDate(d.getDate() + intervaloDias * i);
                            newParcelas.push({ numero: i + 1, valor: parcelaVal, data_vencimento: getLocalDateISO(d) });
                          }
                          const diff = val - newParcelas.reduce((s, p) => s + Number(p.valor), 0);
                          if (Math.abs(diff) > 0.001) {
                            newParcelas[newParcelas.length - 1].valor = (Number(newParcelas[newParcelas.length - 1].valor) + diff).toFixed(2);
                          }
                          setParcelas(newParcelas);
                        }}>
                          <Minus className="h-3 w-3 mr-0.5" /> Parcela
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] w-[50px]">Nº</TableHead>
                        <TableHead className="text-[10px]">Vencimento</TableHead>
                        <TableHead className="text-[10px] text-right">Valor (R$)</TableHead>
                        <TableHead className="text-[10px] w-[32px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parcelas.map((p, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-[11px] font-mono">{p.numero}</TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={p.data_vencimento}
                              onChange={e => setParcelas(prev => prev.map((pp, i) => i === idx ? { ...pp, data_vencimento: e.target.value } : pp))}
                              className="h-7 text-[11px]"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={p.valor ? maskCurrency(String(Math.round(parseFloat(p.valor) * 100))) : ""}
                              onChange={e => {
                                const newVal = unmaskCurrency(e.target.value);
                                setParcelas(prev => {
                                  const updated = [...prev];
                                  updated[idx] = { ...updated[idx], valor: newVal };
                                  const total = Number(valorTotal) || 0;
                                  const editedSum = updated.slice(0, idx + 1).reduce((s, pp2) => s + (Number(pp2.valor) || 0), 0);
                                  const remaining = total - editedSum;
                                  const afterCount = updated.length - idx - 1;
                                  if (afterCount > 0 && remaining >= 0) {
                                    const each = Math.floor(remaining / afterCount * 100) / 100;
                                    for (let j = idx + 1; j < updated.length; j++) {
                                      updated[j] = { ...updated[j], valor: each.toFixed(2) };
                                    }
                                    const diff2 = remaining - each * afterCount;
                                    if (Math.abs(diff2) > 0.001) {
                                      updated[updated.length - 1] = { ...updated[updated.length - 1], valor: (each + diff2).toFixed(2) };
                                    }
                                  }
                                  return updated;
                                });
                              }}
                              className="h-7 text-[11px] text-right font-mono"
                            />
                          </TableCell>
                          <TableCell>
                            {parcelas.length > 1 && (
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() =>
                                setParcelas(prev => prev.filter((_, i) => i !== idx).map((pp, i) => ({ ...pp, numero: i + 1 })))
                              }>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {Math.abs(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0) - (Number(valorTotal) || 0)) > 0.01 && (
                  <p className="text-[10px] text-destructive font-medium">
                    ⚠ Soma das parcelas ({formatCurrency(parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0))}) difere do valor total ({formatCurrency(Number(valorTotal || 0))})
                  </p>
                )}

                {/* Boleto PDF upload */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground font-medium">
                      Anexar boletos (PDF único, 1 boleto por página na ordem das parcelas)
                    </span>
                  </div>
                  <input
                    ref={boletoInputRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBoletoPdfFile(file);
                        setBoletoPdfExistingUrl(null);
                      }
                      if (boletoInputRef.current) boletoInputRef.current.value = "";
                    }}
                  />
                  {boletoPdfFile ? (
                    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">{boletoPdfFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setBoletoPdfFile(null)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ) : boletoPdfExistingUrl ? (
                    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs truncate flex-1">
                        Boletos anexados ({parcelas.filter(p => p.boleto_url).length} parcela{parcelas.filter(p => p.boleto_url).length !== 1 ? "s" : ""})
                      </span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => {
                        setBoletoPdfExistingUrl(null);
                        setParcelas(prev => prev.map(p => ({ ...p, boleto_url: null })));
                      }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px] gap-1"
                      onClick={() => boletoInputRef.current?.click()}
                    >
                      <Paperclip className="h-3 w-3" /> Selecionar PDF dos boletos
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Litros</Label>
                <Input value={litros ? maskCurrency(String(Math.round(parseFloat(litros) * 100))) : ""} onChange={e => setLitros(unmaskCurrency(e.target.value))} placeholder="0,00" className="h-9" />
              </div>
            </div>
          )}

          {/* ── Manutenção ── */}
          {isMaintenanceType && (
            <div className="space-y-4 p-3 rounded-lg border border-primary/20 bg-primary/5">
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
                tipoServico={tipoServico} onTipoServicoChange={setTipoServico}
                tempoParado={tempoParado} onTempoParadoChange={setTempoParado}
                proximaManutencaoKm={proximaManutencaoKm} onProximaManutencaoKmChange={setProximaManutencaoKm}
                dataProximaManutencao={dataProximaManutencao} onDataProximaManutencaoChange={setDataProximaManutencao}
                itensManutencao={itensManutencao} onItensManutencaoChange={setItensManutencao}
                onTotalChange={(total) => { if (total > 0) setValorTotal(String(total)); }}
                hasNfse={hasNfse}
                onHasNfseChange={setHasNfse}
              />

              {/* NFSe / Ordem de Serviço expanded content */}
              {hasNfse && (
                <div className="rounded-lg border p-3 transition-colors mt-3 border-orange-500/50 bg-orange-500/5">
                  <div className="space-y-4">
                    <div className="flex items-start gap-1.5 rounded-md bg-orange-500/10 px-2.5 py-1.5">
                      <FileText className="h-3.5 w-3.5 text-orange-600 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-orange-700 dark:text-orange-400 font-medium leading-tight">
                        Uma segunda despesa será criada no Contas a Pagar referente à NFSe/OS deste serviço.
                      </p>
                    </div>

                    <div>
                      <Label className="text-xs">Nº NFSe / OS</Label>
                      <Input value={nfseNumero} onChange={e => setNfseNumero(e.target.value)} placeholder="Número do documento" className="h-9" />
                    </div>

                    {/* Itens de serviço da NFSe */}
                    <div>
                      <Label className="text-xs mb-1 block">Serviços ({nfseItens.length})</Label>
                      <div className="flex flex-col sm:flex-row gap-1.5 mb-2" onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!nfseNewDesc.trim()) return toast.error("Informe a descrição do serviço");
                          if (!nfseNewValor || Number(nfseNewValor) <= 0) return toast.error("Informe o valor");
                          const qtd = Number(nfseNewQtd) || 1;
                          const vu = Number(nfseNewValor);
                          setNfseItens(prev => [...prev, { descricao: nfseNewDesc.trim(), quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu }]);
                          setNfseNewDesc(""); setNfseNewQtd("1"); setNfseNewValor("");
                        }
                      }}>
                        <Input className="flex-1 h-9 min-w-0" value={nfseNewDesc} onChange={e => setNfseNewDesc(maskSentence(e.target.value))} placeholder="Descrição do serviço" />
                        <div className="flex gap-1.5">
                          <Input className="w-[60px] h-9" type="number" value={nfseNewQtd} onChange={e => setNfseNewQtd(e.target.value)} placeholder="Qtd" />
                          <Input className="w-[90px] h-9" value={nfseNewValor ? maskCurrency(String(Math.round(parseFloat(nfseNewValor) * 100))) : ""} onChange={e => setNfseNewValor(unmaskCurrency(e.target.value))} placeholder="Valor" />
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                            if (!nfseNewDesc.trim()) return toast.error("Informe a descrição do serviço");
                            if (!nfseNewValor || Number(nfseNewValor) <= 0) return toast.error("Informe o valor");
                            const qtd = Number(nfseNewQtd) || 1;
                            const vu = Number(nfseNewValor);
                            setNfseItens(prev => [...prev, { descricao: nfseNewDesc.trim(), quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu }]);
                            setNfseNewDesc(""); setNfseNewQtd("1"); setNfseNewValor("");
                          }}><Plus className="h-4 w-4" /></Button>
                        </div>
                      </div>
                      {nfseItens.length > 0 && (
                        <div className="border rounded-md overflow-x-auto max-h-[160px] overflow-y-auto">
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
                              {nfseItens.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-[11px] max-w-[150px] truncate">{item.descricao}</TableCell>
                                  <TableCell className="text-[11px] text-right">{item.quantidade}</TableCell>
                                  <TableCell className="text-[11px] text-right font-mono">{formatCurrency(item.valor_unitario)}</TableCell>
                                  <TableCell className="text-[11px] text-right font-mono">{formatCurrency(item.valor_total)}</TableCell>
                                  <TableCell>
                                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setNfseItens(prev => prev.filter((_, i) => i !== idx))}>
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {nfseItens.length > 0 && (
                        <div className="text-right mt-1">
                          <span className="text-xs font-semibold text-foreground">
                            Total NFSe: {formatCurrency(nfseValorTotal)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">Prestador / Oficina</Label>
                        <PersonSearchInput
                          categories={["fornecedor"]}
                          placeholder="Buscar prestador..."
                          selectedName={nfseFornecedorNome || undefined}
                          onSelect={p => { setNfseFornecedorNome(p.razao_social || p.nome_fantasia || p.full_name); setNfseFornecedorId(p.id); }}
                          onClear={() => { setNfseFornecedorNome(""); setNfseFornecedorId(null); }}
                          endAction={
                            <button
                              type="button"
                              onClick={() => setShowCreateFornecedor(true)}
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Cadastrar fornecedor"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Forma de Pagamento</Label>
                        <Select value={nfseFormaPagamento} onValueChange={setNfseFormaPagamento}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {FORMA_PAGAMENTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs">Emissão NFSe</Label>
                        <Input type="date" value={nfseDataEmissao} onChange={e => setNfseDataEmissao(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">Vencimento NFSe</Label>
                        <Input type="date" value={nfseDataVencimento} onChange={e => setNfseDataVencimento(e.target.value)} className="h-9" />
                      </div>
                    </div>

                    {/* NFSe Parcelas */}
                    <div className={`rounded-lg border p-2.5 transition-colors ${nfseUseParcelas ? "border-orange-500/40 bg-orange-500/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CalendarDays className={`h-3.5 w-3.5 ${nfseUseParcelas ? "text-orange-600" : "text-muted-foreground"}`} />
                          <Label className="text-[11px] font-medium cursor-pointer" htmlFor="nfse-parcelas">Parcelamento NFSe</Label>
                        </div>
                        <Switch id="nfse-parcelas" checked={nfseUseParcelas} onCheckedChange={(checked) => {
                          setNfseUseParcelas(checked);
                          if (checked && nfseParcelas.length === 0) {
                            const val = nfseValorTotal;
                            setNfseParcelas([{ numero: 1, valor: String(val.toFixed(2)), data_vencimento: nfseDataVencimento || "" }]);
                          }
                        }} />
                      </div>

                      {nfseUseParcelas && (
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {nfseParcelas.length} parcela(s) — Total: {formatCurrency(nfseParcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0))}
                            </span>
                            <div className="flex gap-1">
                              <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => {
                                const val = nfseValorTotal;
                                const newCount = nfseParcelas.length + 1;
                                const parcelaVal = (val / newCount).toFixed(2);
                                const base = nfseDataVencimento ? new Date(nfseDataVencimento + "T12:00:00") : new Date();
                                const newP: NfseParcela[] = [];
                                for (let i = 0; i < newCount; i++) {
                                  const d = new Date(base);
                                  d.setMonth(d.getMonth() + i);
                                  newP.push({ numero: i + 1, valor: parcelaVal, data_vencimento: getLocalDateISO(d) });
                                }
                                const diff = val - newP.reduce((s, p) => s + Number(p.valor), 0);
                                if (Math.abs(diff) > 0.001) {
                                  newP[newP.length - 1].valor = (Number(newP[newP.length - 1].valor) + diff).toFixed(2);
                                }
                                setNfseParcelas(newP);
                              }}>
                                <Plus className="h-3 w-3 mr-0.5" /> Parcela
                              </Button>
                              {nfseParcelas.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={() => {
                                  const val = nfseValorTotal;
                                  const newCount = nfseParcelas.length - 1;
                                  const parcelaVal = (val / newCount).toFixed(2);
                                  const base = nfseDataVencimento ? new Date(nfseDataVencimento + "T12:00:00") : new Date();
                                  const newP: NfseParcela[] = [];
                                  for (let i = 0; i < newCount; i++) {
                                    const d = new Date(base);
                                    d.setMonth(d.getMonth() + i);
                                    newP.push({ numero: i + 1, valor: parcelaVal, data_vencimento: getLocalDateISO(d) });
                                  }
                                  const diff = val - newP.reduce((s, p) => s + Number(p.valor), 0);
                                  if (Math.abs(diff) > 0.001) {
                                    newP[newP.length - 1].valor = (Number(newP[newP.length - 1].valor) + diff).toFixed(2);
                                  }
                                  setNfseParcelas(newP);
                                }}>
                                  <Minus className="h-3 w-3 mr-0.5" /> Parcela
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="border rounded-md overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="text-[10px] w-[50px]">Nº</TableHead>
                                  <TableHead className="text-[10px]">Vencimento</TableHead>
                                  <TableHead className="text-[10px] text-right">Valor (R$)</TableHead>
                                  <TableHead className="text-[10px] w-[32px]"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {nfseParcelas.map((p, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-[11px] font-mono">{p.numero}</TableCell>
                                    <TableCell>
                                      <Input type="date" value={p.data_vencimento}
                                        onChange={e => setNfseParcelas(prev => prev.map((pp, i) => i === idx ? { ...pp, data_vencimento: e.target.value } : pp))}
                                        className="h-7 text-[11px]"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <Input value={p.valor ? maskCurrency(String(Math.round(parseFloat(p.valor) * 100))) : ""}
                                        onChange={e => {
                                          const newVal = unmaskCurrency(e.target.value);
                                          setNfseParcelas(prev => {
                                            const updated = [...prev];
                                            updated[idx] = { ...updated[idx], valor: newVal };
                                            const total = nfseValorTotal;
                                            const editedSum = updated.slice(0, idx + 1).reduce((s, pp2) => s + (Number(pp2.valor) || 0), 0);
                                            const remaining = total - editedSum;
                                            const afterCount = updated.length - idx - 1;
                                            if (afterCount > 0 && remaining >= 0) {
                                              const each = Math.floor(remaining / afterCount * 100) / 100;
                                              for (let j = idx + 1; j < updated.length; j++) {
                                                updated[j] = { ...updated[j], valor: each.toFixed(2) };
                                              }
                                              const diff2 = remaining - each * afterCount;
                                              if (Math.abs(diff2) > 0.001) {
                                                updated[updated.length - 1] = { ...updated[updated.length - 1], valor: (each + diff2).toFixed(2) };
                                              }
                                            }
                                            return updated;
                                          });
                                        }}
                                        className="h-7 text-[11px] text-right font-mono"
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {nfseParcelas.length > 1 && (
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() =>
                                          setNfseParcelas(prev => prev.filter((_, i) => i !== idx).map((pp, i) => ({ ...pp, numero: i + 1 })))
                                        }>
                                          <Trash2 className="h-3 w-3 text-destructive" />
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {Math.abs(nfseParcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0) - nfseValorTotal) > 0.01 && (
                            <p className="text-[10px] text-destructive font-medium">
                              ⚠ Soma das parcelas difere do valor da NFSe
                            </p>
                          )}

                          {/* NFSe Boleto attachment */}
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground font-medium">
                                Anexar boletos (PDF único, 1 boleto por página na ordem das parcelas)
                              </span>
                            </div>
                            <input
                              ref={nfseBoletoInputRef}
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setNfseBoletoPdfFile(file);
                                if (nfseBoletoInputRef.current) nfseBoletoInputRef.current.value = "";
                              }}
                            />
                            {nfseBoletoPdfFile ? (
                              <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
                                <FileText className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-xs truncate flex-1">{nfseBoletoPdfFile.name}</span>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => setNfseBoletoPdfFile(null)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] gap-1"
                                onClick={() => nfseBoletoInputRef.current?.click()}
                              >
                                <Paperclip className="h-3 w-3" /> Selecionar PDF dos boletos
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Observações NFSe</Label>
                      <Input value={nfseObservacoes} onChange={e => setNfseObservacoes(maskSentence(e.target.value))} placeholder="Observações adicionais..." className="h-9" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Observações ── */}
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea value={observacoes} onChange={e => setObservacoes(maskSentence(e.target.value))} rows={2} className="text-sm" />
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
            <div className="space-y-4 pl-5 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Nº Doc. Fiscal</Label>
                  <Input value={docFiscal} onChange={e => setDocFiscal(e.target.value)} placeholder="Número NF/Recibo" className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Chave NF-e</Label>
                  <Input value={chaveNfe} onChange={e => setChaveNfe(e.target.value.replace(/\D/g, "").slice(0, 44))} placeholder="44 dígitos" maxLength={44} className="h-9" />
                </div>
              </div>

              {isEditing && (
                <div className="grid grid-cols-2 gap-4 text-xs">
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
            </div>
          )}

          {/* Manual item entry (non-maintenance, manual mode) */}
          {!isMaintenanceType && inputMode === "manual" && (
            <div className={`rounded-lg border p-3 transition-colors ${manualItemsEnabled ? "border-primary/50 bg-primary/5" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className={`h-4 w-4 ${manualItemsEnabled ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <Label className="text-xs font-medium cursor-pointer" htmlFor="manual-items-toggle">Inserir itens da nota</Label>
                    <p className="text-[10px] text-muted-foreground">Adicionar produtos/serviços individualmente</p>
                  </div>
                </div>
                <Switch id="manual-items-toggle" checked={manualItemsEnabled} onCheckedChange={setManualItemsEnabled} />
              </div>

              {manualItemsEnabled && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-col sm:flex-row gap-1.5" onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (!newItemDesc.trim()) return toast.error("Informe a descrição do item");
                          if (!newItemValor || Number(newItemValor) <= 0) return toast.error("Informe o valor");
                          const qtd = Number(newItemQtd) || 1;
                          const vu = Number(newItemValor);
                          setItensNota(prev => [...prev, { descricao: newItemDesc.trim(), quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu, ncm: "", cfop: "", unidade: "UN" }]);
                          setNewItemDesc(""); setNewItemQtd("1"); setNewItemValor("");
                        }
                      }}>
                        <Input className="flex-1 h-9 min-w-0" value={newItemDesc} onChange={e => setNewItemDesc(maskSentence(e.target.value))} placeholder="Descrição do item" />
                        <div className="flex gap-1.5">
                          <Input className="w-[60px] h-9" type="number" value={newItemQtd} onChange={e => setNewItemQtd(e.target.value)} placeholder="Qtd" />
                          <Input className="w-[90px] h-9" value={newItemValor ? maskCurrency(String(Math.round(parseFloat(newItemValor) * 100))) : ""} onChange={e => setNewItemValor(unmaskCurrency(e.target.value))} placeholder="Valor" />
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => {
                            if (!newItemDesc.trim()) return toast.error("Informe a descrição do item");
                            if (!newItemValor || Number(newItemValor) <= 0) return toast.error("Informe o valor");
                            const qtd = Number(newItemQtd) || 1;
                            const vu = Number(newItemValor);
                            setItensNota(prev => [...prev, { descricao: newItemDesc.trim(), quantidade: qtd, valor_unitario: vu, valor_total: qtd * vu, ncm: "", cfop: "", unidade: "UN" }]);
                            setNewItemDesc(""); setNewItemQtd("1"); setNewItemValor("");
                          }}><Plus className="h-4 w-4" /></Button>
                        </div>
                  </div>

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
                                <TableCell className="text-[11px] text-right font-mono">{formatCurrency(item.valor_unitario)}</TableCell>
                                <TableCell className="text-[11px] text-right font-mono">{formatCurrency(item.valor_total)}</TableCell>
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
                <div className="space-y-4 pl-5 border-l-2 border-muted">
                  {/* Payment summary */}
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                        <p className="text-sm font-bold font-mono">{formatCurrency(Number(expense?.valor_total || 0))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Pago</p>
                        <p className="text-sm font-bold font-mono text-emerald-600">{formatCurrency(Number(expense?.valor_pago || 0))}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Restante</p>
                        <p className="text-sm font-bold font-mono text-destructive">
                          {formatCurrency((Number(expense?.valor_total || 0) - Number(expense?.valor_pago || 0)))}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Audit */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
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
                              <TableCell className="text-[11px] font-mono">{formatCurrency(Number(p.valor))}</TableCell>
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

    <PersonCreateDialog
      open={showCreateFornecedor}
      onOpenChange={setShowCreateFornecedor}
      onCreated={() => {}}
      defaultCategory="fornecedor"
    />
  </>
  );
}
