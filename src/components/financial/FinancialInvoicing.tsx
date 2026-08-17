import { useState, useEffect, useMemo, Fragment } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { FileText, CheckCircle2, Clock, Eye, DollarSign, Plus, HandCoins, Pencil, Trash2, Printer, Undo2, Loader2, ChevronDown } from "lucide-react";
import { getLocalDateISO } from "@/lib/date";
import { formatCurrency, maskCNPJ, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateBR } from "@/lib/date";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

import { SortableTh } from "@/components/ui/sortable-th";
import { useSortableTable } from "@/hooks/useSortableTable";
import { useAuth } from "@/contexts/AuthContext";


interface Fatura {
  id: string;
  numero: number;
  cliente_id: string;
  valor_total: number;
  num_parcelas: number;
  intervalo_dias: number;
  status: string;
  data_emissao: string;
  created_at: string;
  valor_acrescimo?: number;
  valor_desconto?: number;
  observacoes?: string | null;
  cliente_nome?: string;
  valor_recebido_total?: number;
  has_partial?: boolean;
  origem_label?: string;
  origem_sort?: string;
}

interface Previsao {
  id: string;
  origem_tipo: string;
  origem_id: string;
  valor: number;
  data_prevista: string;
  status: string;
  cliente_id: string;
  cliente_nome?: string;
  metadata?: {
    periodo_inicio?: string;
    periodo_fim?: string;
    fazenda?: string;
    localizacao?: string;
    diaria_cliente?: number;
    valor_mensal?: number;
    detalhamento?: Array<{
      motorista: string;
      placa: string;
      proprietario: string;
      dias: number;
      diaria: number;
      bruto: number;
      descontos: number;
      liquido: number;
    }>;
    // Manual freight forecast fields
    placa?: string;
    motorista?: string;
    peso_kg?: number;
    peso_ton?: number;
    valor_por_ton?: number;
    valor_bruto?: number;
    valor_desconto?: number;
    desconto?: { tipo?: string; litros?: number; valor_litro?: number; descricao?: string; valor?: number };
  };
}

interface ContaReceber {
  id: string;
  fatura_id: string;
  valor: number;
  data_vencimento: string;
  status: string;
  data_recebimento: string | null;
  valor_recebido: number | null;
  forma_recebimento: string | null;
}

interface Cliente {
  id: string;
  full_name: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  faturada: { label: "Faturada", variant: "default" },
  paga: { label: "Paga", variant: "secondary", className: "bg-success/10 text-success border-success/20" },
};

const FORMA_RECEBIMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
];

const INTERVALO_PRESETS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "15", label: "15 dias" },
  { value: "21", label: "21 dias" },
  { value: "28", label: "28 dias" },
  { value: "30", label: "30 dias" },
  { value: "45", label: "45 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

export function FinancialInvoicing() {
  const isMobile = useIsMobile();
  const { unifiedLabel, unifiedCnpjLines, establishments } = useUnifiedCompany();
  const { ConfirmDialog, confirm } = useConfirmDialog();
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [detailPrevisoes, setDetailPrevisoes] = useState<Previsao[]>([]);
  const [detailCtes, setDetailCtes] = useState<Record<string, any>>({});
  const [detailContas, setDetailContas] = useState<ContaReceber[]>([]);

  // New/Edit invoice dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editingFaturaId, setEditingFaturaId] = useState<string | null>(null);
  const [receiveMode, setReceiveMode] = useState(false);

  const [step, setStep] = useState<"client" | "preview">("client");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPrevisoes, setClientPrevisoes] = useState<Previsao[]>([]);
  const [selectedPrevIds, setSelectedPrevIds] = useState<Set<string>>(new Set());
  const [condicaoPagamento, setCondicaoPagamento] = useState<"avista" | "unico" | "parcelado">("avista");
  const [numParcelas, setNumParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<string>(getLocalDateISO());
  const [dataEmissaoEdit, setDataEmissaoEdit] = useState<string>(getLocalDateISO());
  const [acrescimoStr, setAcrescimoStr] = useState("");
  const [descontoStr, setDescontoStr] = useState("");
  const [observacoesFatura, setObservacoesFatura] = useState("");
  const [parcelasCustomOn, setParcelasCustomOn] = useState(false);
  const [parcelasCustom, setParcelasCustom] = useState<{ valor: string; data_vencimento: string }[]>([]);

  const [saving, setSaving] = useState(false);

  // Receive dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receiveFatura, setReceiveFatura] = useState<Fatura | null>(null);
  const [receiveContas, setReceiveContas] = useState<ContaReceber[]>([]);
  const [receiveDate, setReceiveDate] = useState<string>(getLocalDateISO());
  const [receiveForma, setReceiveForma] = useState("pix");
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveContaId, setReceiveContaId] = useState<string>("");
  const [receiveDescontoStr, setReceiveDescontoStr] = useState("");
  const [receiveAcrescimoStr, setReceiveAcrescimoStr] = useState("");
  const [receiveParcial, setReceiveParcial] = useState(false);

  const [baixaValor, setBaixaValor] = useState("");
  const { user } = useAuth();

  // Batch receive dialog
  const [batchReceiveOpen, setBatchReceiveOpen] = useState(false);
  const [batchReceiveFaturas, setBatchReceiveFaturas] = useState<Fatura[]>([]);
  interface BatchReceiveConta extends ContaReceber {
    fatura_numero: number;
    cliente_nome: string;
    parcela_index: number;
    total_parcelas: number;
    saldo: number;
  }
  const [batchReceiveContas, setBatchReceiveContas] = useState<BatchReceiveConta[]>([]);
  const [batchReceiveSelected, setBatchReceiveSelected] = useState<Set<string>>(new Set());
  const [batchReceiveDate, setBatchReceiveDate] = useState<string>(getLocalDateISO());
  const [batchReceiveForma, setBatchReceiveForma] = useState("pix");
  const [batchReceiveValores, setBatchReceiveValores] = useState<Record<string, string>>({});
  const [batchReceiveSaving, setBatchReceiveSaving] = useState(false);

  useEffect(() => {
    fetchFaturas();
    const onFocus = () => fetchFaturas();
    window.addEventListener("focus", onFocus);
    const onVisibility = () => { if (document.visibilityState === "visible") fetchFaturas(); };
    document.addEventListener("visibilitychange", onVisibility);

    // Realtime: refletir novas faturas/atualizações imediatamente
    const channel = supabase
      .channel("faturas_recebimento_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "faturas_recebimento" }, () => fetchFaturas())
      .subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchFaturas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faturas_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .order("numero", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar faturas");
      setLoading(false);
      return;
    }

    const faturasList = (data || []).map((f: any) => ({
      ...f,
      cliente_nome: f.profiles?.full_name || "—",
    }));

    // Soma valor_recebido por fatura para refletir parciais
    const ids = faturasList.map((f: any) => f.id);
    if (ids.length) {
      const { data: contas } = await supabase
        .from("contas_receber")
        .select("fatura_id, valor_recebido, data_vencimento")
        .in("fatura_id", ids);
      const sums: Record<string, number> = {};
      const vencMin: Record<string, string> = {};
      const vencMax: Record<string, string> = {};
      (contas || []).forEach((c: any) => {
        sums[c.fatura_id] = (sums[c.fatura_id] || 0) + Number(c.valor_recebido || 0);
        if (c.data_vencimento) {
          if (!vencMin[c.fatura_id] || c.data_vencimento < vencMin[c.fatura_id]) vencMin[c.fatura_id] = c.data_vencimento;
          if (!vencMax[c.fatura_id] || c.data_vencimento > vencMax[c.fatura_id]) vencMax[c.fatura_id] = c.data_vencimento;
        }
      });
      faturasList.forEach((f: any) => {
        f.valor_recebido_total = sums[f.id] || 0;
        f.has_partial = f.status !== "paga" && f.valor_recebido_total > 0;
        // Data de emissão real = data de criação do registro
        f.data_emissao_real = String(f.created_at).slice(0, 10);
        // Vencimento: primeira parcela (fallback para o campo legado data_emissao)
        f.data_vencimento_ref = vencMin[f.id] || f.data_emissao;
        f.data_vencimento_max = vencMax[f.id] || f.data_vencimento_ref;
        // Condição: à vista só quando parcela única e vence no mesmo dia da emissão
        if (Number(f.num_parcelas) > 1) {
          f.condicao_label = `${f.num_parcelas}x (${f.intervalo_dias}d)`;
        } else if (f.data_vencimento_ref && f.data_vencimento_ref > f.data_emissao_real) {
          const dias = Math.max(
            0,
            Math.round(
              (new Date(`${f.data_vencimento_ref}T12:00:00`).getTime() -
                new Date(`${f.data_emissao_real}T12:00:00`).getTime()) /
                86400000
            )
          );
          f.condicao_label = `A prazo (${dias}d)`;
        } else {
          f.condicao_label = "À vista";
        }
      });



      // Origem + data de emissão real (via fatura_previsoes -> previsoes_recebimento)
      const { data: links } = await supabase
        .from("fatura_previsoes")
        .select("fatura_id, previsoes_recebimento:previsao_id(origem_tipo, data_prevista)")
        .in("fatura_id", ids);
      const origemMap: Record<string, Set<string>> = {};
      const emissaoMap: Record<string, string> = {};
      (links || []).forEach((l: any) => {
        const p = l.previsoes_recebimento;
        if (!p) return;
        if (p.data_prevista && (!emissaoMap[l.fatura_id] || p.data_prevista < emissaoMap[l.fatura_id])) {
          emissaoMap[l.fatura_id] = p.data_prevista;
        }
        const tipo = p.origem_tipo;
        if (!tipo) return;
        if (!origemMap[l.fatura_id]) origemMap[l.fatura_id] = new Set();
        origemMap[l.fatura_id].add(tipo);
      });
      const tipoLabel = (t: string) => t === "cte" ? "CT-e" : t === "colheita" ? "Colheita" : t === "manual" ? "Manual" : t.toUpperCase();
      faturasList.forEach((f: any) => {
        // Emissão real = data do documento de origem (CT-e/colheita), fallback data_emissao da fatura
        if (emissaoMap[f.id]) {
          f.data_emissao_real = emissaoMap[f.id];
          if (f.data_vencimento_ref && f.data_vencimento_ref > f.data_emissao_real && Number(f.num_parcelas) === 1) {
            const dias = Math.round(
              (new Date(`${f.data_vencimento_ref}T12:00:00`).getTime() -
                new Date(`${f.data_emissao_real}T12:00:00`).getTime()) / 86400000
            );
            f.condicao_label = `A prazo (${dias}d)`;
          } else if (Number(f.num_parcelas) === 1) {
            f.condicao_label = "À vista";
          }
        }
        const set = origemMap[f.id];
        if (!set || set.size === 0) { f.origem_label = "—"; f.origem_sort = "zzz"; return; }
        if (set.size > 1) { f.origem_label = "Misto"; f.origem_sort = "misto"; return; }
        const t = Array.from(set)[0];
        f.origem_label = tipoLabel(t);
        f.origem_sort = t;
      });

    }

    setFaturas(faturasList);
    setLoading(false);
  };

  // --- Detail ---
  const openDetail = async (fatura: Fatura) => {
    setSelectedFatura(fatura);
    setDetailOpen(true);

    const { data: links } = await supabase
      .from("fatura_previsoes")
      .select("previsao_id")
      .eq("fatura_id", fatura.id);

    if (links && links.length > 0) {
      const ids = links.map((l: any) => l.previsao_id);
      const { data: prevData } = await supabase
        .from("previsoes_recebimento")
        .select("*")
        .in("id", ids);
      const previsoes = (prevData as Previsao[]) || [];
      setDetailPrevisoes(previsoes);

      const cteIds = previsoes.filter(p => p.origem_tipo === "cte").map(p => p.origem_id);
      if (cteIds.length > 0) {
        const { data: cteData } = await supabase
          .from("ctes")
          .select("id, peso_bruto, valor_carga, valor_frete, valor_tonelada, valor_receber, desconto, placa_veiculo, produto_predominante")
          .in("id", [...new Set(cteIds)]);
        const map: Record<string, any> = {};
        (cteData || []).forEach((c: any) => { map[c.id] = c; });
        setDetailCtes(map);
      } else {
        setDetailCtes({});
      }
    } else {
      setDetailPrevisoes([]);
      setDetailCtes({});
    }

    const { data: contasData } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .order("data_vencimento", { ascending: true });
    setDetailContas((contasData as ContaReceber[]) || []);
  };

  // --- Nova Fatura ---
  const openNewInvoice = async () => {
    setEditingFaturaId(null);
    setReceiveMode(false);

    setStep("client");
    setSelectedClientId("");
    setClientPrevisoes([]);
    setSelectedPrevIds(new Set());
    setCondicaoPagamento("avista");
    setNumParcelas(1);
    setIntervaloDias(30);
    setDataEmissaoEdit(getLocalDateISO());
    setDataVencimentoUnico(getLocalDateISO());
    setAcrescimoStr("");
    setDescontoStr("");
    setObservacoesFatura("");
    setParcelasCustomOn(false);
    setParcelasCustom([]);

    setNewDialogOpen(true);

    const { data } = await supabase
      .from("previsoes_recebimento")
      .select("cliente_id, profiles:cliente_id(full_name)")
      .eq("status", "pendente");

    if (data) {
      const unique = new Map<string, string>();
      data.forEach((d: any) => {
        if (d.cliente_id && d.profiles?.full_name) {
          unique.set(d.cliente_id, d.profiles.full_name);
        }
      });
      setClientes(Array.from(unique.entries()).map(([id, full_name]) => ({ id, full_name })));
    }
  };

  // --- Edit Fatura ---
  const openEditInvoice = async (fatura: Fatura, mode: "edit" | "receive" = "edit") => {
    // Only faturada can be edited (not paid)
    if (mode === "edit" && fatura.status === "paga") {
      toast.error("Faturas pagas não podem ser editadas");
      return;
    }

    // Emissão real (origem das previsões / criação) vs data gravada na fatura
    const emissaoReal = (fatura as any).data_emissao_real || fatura.data_emissao;
    const vencimentoRef = (fatura as any).data_vencimento_ref || fatura.data_emissao;

    let condicao: "avista" | "unico" | "parcelado";
    if (Number(fatura.num_parcelas) > 1) condicao = "parcelado";
    else if (vencimentoRef && emissaoReal && vencimentoRef > emissaoReal) condicao = "unico";
    else condicao = "avista";

    setReceiveMode(mode === "receive");
    setEditingFaturaId(fatura.id);
    setReceiveFatura(fatura);
    setSelectedClientId(fatura.cliente_id);
    setCondicaoPagamento(condicao);
    setNumParcelas(fatura.num_parcelas);
    setIntervaloDias(fatura.intervalo_dias || 30);
    setDataEmissaoEdit(emissaoReal);
    setDataVencimentoUnico(vencimentoRef);
    setAcrescimoStr(Number(fatura.valor_acrescimo || 0) > 0 ? maskCurrency(String(Math.round(Number(fatura.valor_acrescimo) * 100))) : "");
    setDescontoStr(Number(fatura.valor_desconto || 0) > 0 ? maskCurrency(String(Math.round(Number(fatura.valor_desconto) * 100))) : "");
    setObservacoesFatura(fatura.observacoes || "");
    const custom = (fatura as any).parcelas_custom;
    if (Array.isArray(custom) && custom.length > 0) {
      setParcelasCustomOn(true);
      setParcelasCustom(custom.map((p: any) => ({
        valor: maskCurrency(String(Math.round(Number(p.valor || 0) * 100))),
        data_vencimento: p.data_vencimento || emissaoReal,
      })));
    } else if (condicao === "parcelado") {
      // Fatura antiga sem parcelas manuais: reconstrói o cronograma para edição manual
      const n = Math.max(2, Number(fatura.num_parcelas) || 2);
      const total = Number(fatura.valor_total || 0);
      const unit = Math.trunc((total / n) * 100) / 100;
      setParcelasCustomOn(true);
      setParcelasCustom(Array.from({ length: n }).map((_, i) => {
        const d = new Date(`${emissaoReal}T12:00:00`);
        d.setDate(d.getDate() + (i + 1) * (Number(fatura.intervalo_dias) || 30));
        const v = i === n - 1 ? +(total - unit * (n - 1)).toFixed(2) : unit;
        return { valor: maskCurrency(String(Math.round(v * 100))), data_vencimento: d.toISOString().slice(0, 10) };
      }));
    } else {
      setParcelasCustomOn(false);
      setParcelasCustom([]);
    }


    setStep("preview");


    // Load linked previsões (faturado) + any pending for this client
    const { data: links } = await supabase
      .from("fatura_previsoes")
      .select("previsao_id")
      .eq("fatura_id", fatura.id);

    const linkedIds = (links || []).map((l: any) => l.previsao_id);

    const { data: prevLinked } = await supabase
      .from("previsoes_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .in("id", linkedIds.length > 0 ? linkedIds : ["__none__"]);

    const { data: prevPending } = await supabase
      .from("previsoes_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .eq("cliente_id", fatura.cliente_id)
      .eq("status", "pendente");

    const all = [
      ...((prevLinked || []) as any[]),
      ...((prevPending || []) as any[]),
    ].map((p: any) => ({
      ...p,
      cliente_nome: p.profiles?.full_name || "—",
    }));

    // Deduplicate
    const seen = new Set<string>();
    const deduped = all.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    setClientPrevisoes(deduped);
    setSelectedPrevIds(new Set(linkedIds));

    // Also load clients for "Voltar" step
    setClientes([{ id: fatura.cliente_id, full_name: fatura.cliente_nome || "—" }]);
    setNewDialogOpen(true);
  };

  const handleClientSelect = async (clientId: string) => {
    setSelectedClientId(clientId);
    const { data } = await supabase
      .from("previsoes_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .eq("cliente_id", clientId)
      .eq("status", "pendente")
      .order("data_prevista", { ascending: true });

    const mapped = (data || []).map((p: any) => ({
      ...p,
      cliente_nome: p.profiles?.full_name || "—",
    }));
    setClientPrevisoes(mapped);
    setSelectedPrevIds(new Set(mapped.map((p: any) => p.id)));
    setStep("preview");
  };

  const togglePrev = (id: string) => {
    setSelectedPrevIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPrevTotal = clientPrevisoes
    .filter((p) => selectedPrevIds.has(p.id))
    .reduce((s, p) => s + Number(p.valor), 0);

  const acrescimoValor = Number(unmaskCurrency(acrescimoStr) || 0);
  const descontoValor = Number(unmaskCurrency(descontoStr) || 0);
  const totalLiquido = Math.max(selectedPrevTotal + acrescimoValor - descontoValor, 0);

  const effectiveParcelas = condicaoPagamento === "parcelado" ? numParcelas : 1;
  const effectiveIntervalo = condicaoPagamento === "parcelado" ? 0 : 0;
  const effectiveDataEmissao = condicaoPagamento === "unico" ? dataVencimentoUnico : dataEmissaoEdit;

  // Cronograma base: valores divididos igualmente, datas em branco (definição manual)
  const buildDefaultSchedule = (qtd = numParcelas) => {
    const n = Math.max(1, qtd);
    const base = Math.trunc((totalLiquido / n) * 100) / 100;
    return Array.from({ length: n }).map((_, i) => {
      const valor = i === n - 1 ? +(totalLiquido - base * (n - 1)).toFixed(2) : base;
      return {
        valor: maskCurrency(String(Math.round(valor * 100))),
        data_vencimento: "",
      };
    });
  };

  const parcelasCustomAtivo = condicaoPagamento === "parcelado";

  const somaParcelasCustom = parcelasCustom.reduce((s, p) => s + Number(unmaskCurrency(p.valor) || 0), 0);
  const diferencaParcelas = +(totalLiquido - somaParcelasCustom).toFixed(2);

  const updateParcelaCustom = (idx: number, patch: Partial<{ valor: string; data_vencimento: string }>) => {
    setParcelasCustom((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const handleCreateOrUpdateInvoice = async (opts?: { keepOpen?: boolean }): Promise<boolean> => {
    const selectedItems = clientPrevisoes.filter((p) => selectedPrevIds.has(p.id));
    if (selectedItems.length === 0) { toast.error("Selecione ao menos uma previsão"); return false; }
    if (descontoValor > selectedPrevTotal + acrescimoValor) { toast.error("Desconto maior que o valor da fatura"); return false; }
    if (parcelasCustomAtivo) {
      if (parcelasCustom.length === 0) { toast.error("Defina as parcelas personalizadas"); return false; }
      if (parcelasCustom.some((p) => !p.data_vencimento)) { toast.error("Informe o vencimento de todas as parcelas"); return false; }
      if (Math.abs(diferencaParcelas) > 0.01) {
        toast.error(`A soma das parcelas difere do total em ${formatCurrency(Math.abs(diferencaParcelas))}`);
        return false;
      }
    }
    setSaving(true);

    const payloadComum = {
      valor_total: totalLiquido,
      num_parcelas: parcelasCustomAtivo ? parcelasCustom.length : effectiveParcelas,
      intervalo_dias: effectiveIntervalo,
      valor_acrescimo: acrescimoValor,
      valor_desconto: descontoValor,
      observacoes: observacoesFatura.trim() || null,
      parcelas_custom: parcelasCustomAtivo
        ? parcelasCustom.map((p) => ({ valor: Number(unmaskCurrency(p.valor) || 0), data_vencimento: p.data_vencimento }))
        : null,
      ...(effectiveDataEmissao ? { data_emissao: effectiveDataEmissao } : {}),
      status: "faturada" as any,
    } as any;


    try {
      if (editingFaturaId) {
        // --- UPDATE existing fatura ---
        // 1. Delete existing contas_receber for this fatura
        await supabase.from("contas_receber").delete().eq("fatura_id", editingFaturaId);
        // 2. Delete existing links (triggers set previsões back to pendente)
        await supabase.from("fatura_previsoes").delete().eq("fatura_id", editingFaturaId);
        // 3. Update fatura
        const { error: updErr } = await supabase
          .from("faturas_recebimento")
          .update(payloadComum)
          .eq("id", editingFaturaId);
        if (updErr) throw updErr;

        // 4. Re-link previsões
        const links = selectedItems.map((p) => ({
          fatura_id: editingFaturaId,
          previsao_id: p.id,
        }));
        const { error: linkErr } = await supabase.from("fatura_previsoes").insert(links);
        if (linkErr) throw linkErr;

        toast.success("Fatura atualizada com sucesso!");
      } else {
        // --- CREATE new fatura ---
        const { data: fatura, error: faturaErr } = await supabase
          .from("faturas_recebimento")
          .insert({
            cliente_id: selectedClientId,
            ...payloadComum,
          })
          .select()
          .single();

        if (faturaErr) throw faturaErr;

        const links = selectedItems.map((p) => ({
          fatura_id: fatura.id,
          previsao_id: p.id,
        }));

        const { error: linkErr } = await supabase.from("fatura_previsoes").insert(links);
        if (linkErr) throw linkErr;

        toast.success(`Fatura criada com ${effectiveParcelas} parcela(s)!`);
      }

      if (!opts?.keepOpen) setNewDialogOpen(false);
      fetchFaturas();
      return true;
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar fatura");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // --- Delete Fatura ---
  const handleDeleteFatura = async (fatura: Fatura) => {
    if (fatura.status === "paga") {
      toast.error("Faturas pagas não podem ser excluídas");
      return;
    }

    const confirmed = await confirm({
      title: "Excluir Fatura",
      description: `Deseja excluir esta fatura de ${formatCurrency(Number(fatura.valor_total))}? As previsões vinculadas voltarão ao status pendente e os títulos a receber serão removidos.`,
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      // Delete contas_receber
      await supabase.from("contas_receber").delete().eq("fatura_id", fatura.id);
      // Delete links (trigger reverts previsões to pendente)
      await supabase.from("fatura_previsoes").delete().eq("fatura_id", fatura.id);
      // Delete fatura
      const { error } = await supabase.from("faturas_recebimento").delete().eq("id", fatura.id);
      if (error) throw error;

      toast.success("Fatura excluída com sucesso!");
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir fatura");
    }
  };

  // --- Receber ---
  // Abre direto a tela de pagamento (não abre a tela de edição da fatura)
  const openReceive = async (fatura: Fatura) => {
    setReceiveFatura(fatura);
    setEditingFaturaId(null);
    setReceiveMode(false);
    await proceedToReceive(fatura);
  };

  const proceedToReceive = async (target?: Fatura) => {
    const fatura = target || receiveFatura;
    if (!fatura) return;

    // Os títulos são recriados por trigger após salvar a fatura — aguarda até aparecerem
    let contas: ContaReceber[] = [];
    for (let i = 0; i < 6; i++) {
      const { data } = await supabase
        .from("contas_receber")
        .select("*")
        .eq("fatura_id", fatura.id)
        .order("data_vencimento", { ascending: true });
      contas = (data as ContaReceber[]) || [];
      if (contas.length > 0) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    if (contas.length === 0) {
      toast.error("Não foi possível carregar os títulos desta fatura. Tente novamente.");
      return;
    }

    setReceiveContas(contas);
    setNewDialogOpen(false);
    const abertos = contas.filter((c) => Number(c.valor) - Number(c.valor_recebido || 0) > 0.005);
    const primeiroAberto = abertos[0];
    setReceiveContaId(primeiroAberto ? primeiroAberto.id : "");
    setReceiveParcial(false);
    setReceiveDescontoStr("");
    setReceiveAcrescimoStr("");
    const saldoAlvo = primeiroAberto
      ? Number(primeiroAberto.valor) - Number(primeiroAberto.valor_recebido || 0)
      : contas.reduce((s, c) => s + Math.max(0, Number(c.valor) - Number(c.valor_recebido || 0)), 0);
    setBaixaValor(String(+saldoAlvo.toFixed(2)));
    setReceiveDate(getLocalDateISO());
    setReceiveDialogOpen(true);
  };



  // Salva as alterações feitas na janela e já segue para o registro do pagamento
  const handleSaveAndReceive = async () => {
    const ok = await handleCreateOrUpdateInvoice({ keepOpen: true });
    if (!ok) return;
    await proceedToReceive();
  };


  const reloadReceiveContas = async () => {
    if (!receiveFatura) return;
    const { data } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", receiveFatura.id)
      .order("data_vencimento", { ascending: true });
    const contas = (data as ContaReceber[]) || [];
    setReceiveContas(contas);
    const alvo = contas.find((c) => c.id === receiveContaId);
    const proximo = contas.find((c) => Number(c.valor) - Number(c.valor_recebido || 0) > 0.005);
    const escolhido = alvo && Number(alvo.valor) - Number(alvo.valor_recebido || 0) > 0.005 ? alvo : proximo;
    setReceiveContaId(escolhido ? escolhido.id : "");
    const saldo = escolhido
      ? Number(escolhido.valor) - Number(escolhido.valor_recebido || 0)
      : 0;
    setBaixaValor(String(+saldo.toFixed(2)));
    setReceiveParcial(false);
    setReceiveDescontoStr("");
    setReceiveAcrescimoStr("");
    fetchFaturas();
  };

  // Baixa integral da parcela selecionada (valores definidos na fatura)
  const handleBaixaParcialFatura = async () => {
    if (!receiveFatura) return;
    if (!receiveContaId) return toast.error("Selecione a parcela que está sendo quitada");
    if (!receiveDate) return toast.error("Informe a data do recebimento");
    if (!user?.id) return toast.error("Sessão inválida");

    const conta = receiveContas.find((c) => c.id === receiveContaId);
    if (!conta) return toast.error("Parcela não encontrada");

    const saldoTitulo = +(Number(conta.valor) - Number(conta.valor_recebido || 0)).toFixed(2);
    if (saldoTitulo <= 0.005) return toast.error("Esta parcela já está quitada");

    setReceiveSaving(true);
    try {
      const { error } = await supabase.from("receivable_payments" as any).insert({
        conta_receber_id: conta.id,
        valor: saldoTitulo,
        forma_recebimento: receiveForma,
        data_recebimento: receiveDate,
        observacoes: "Quitação da parcela",
        created_by: user.id,
      });
      if (error) throw error;

      toast.success("Parcela quitada!");
      setSelectedFaturaIds(new Set());
      await reloadReceiveContas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar recebimento");
    } finally {
      setReceiveSaving(false);
    }
  };



  const handleReceiveAll = async () => {
    if (!receiveFatura || receiveContas.length === 0) return;
    setReceiveSaving(true);

    try {
      for (const conta of receiveContas) {
        const { error } = await supabase
          .from("contas_receber")
          .update({
            status: "recebido" as any,
            data_recebimento: receiveDate,
            valor_recebido: Number(conta.valor),
            forma_recebimento: receiveForma,
          })
          .eq("id", conta.id);

        if (error) throw error;
      }

      toast.success("Todos os títulos foram recebidos!");
      setReceiveDialogOpen(false);
      setSelectedFaturaIds(new Set());
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar recebimento");
    } finally {
      setReceiveSaving(false);
    }
  };

  // --- Batch Receive ---
  const openBatchReceive = async (faturas: Fatura[]) => {
    const ids = faturas.map((f) => f.id);
    const { data } = await supabase
      .from("contas_receber")
      .select("*")
      .in("fatura_id", ids)
      .order("data_vencimento", { ascending: true });

    const contas = ((data as ContaReceber[]) || []).filter(
      (c) => +(Number(c.valor) - Number(c.valor_recebido || 0)).toFixed(2) > 0.005
    );

    if (contas.length === 0) {
      toast.error("Nenhum título em aberto nas faturas selecionadas");
      return;
    }

    const faturaMap = new Map(faturas.map((f) => [f.id, f]));
    const countsByFatura: Record<string, number> = {};
    contas.forEach((c) => { countsByFatura[c.fatura_id] = (countsByFatura[c.fatura_id] || 0) + 1; });

    const items: BatchReceiveConta[] = contas.map((c) => {
      const f = faturaMap.get(c.fatura_id);
      const saldo = +(Number(c.valor) - Number(c.valor_recebido || 0)).toFixed(2);
      return {
        ...c,
        fatura_numero: f?.numero || 0,
        cliente_nome: f?.cliente_nome || "—",
        parcela_index: 0,
        total_parcelas: countsByFatura[c.fatura_id] || 1,
        saldo,
      };
    });

    // Compute parcela index per fatura
    const idxByFatura: Record<string, number> = {};
    items.forEach((it) => {
      idxByFatura[it.fatura_id] = (idxByFatura[it.fatura_id] || 0) + 1;
      it.parcela_index = idxByFatura[it.fatura_id];
    });

    setBatchReceiveFaturas(faturas);
    setBatchReceiveContas(items);
    setBatchReceiveSelected(new Set(items.map((i) => i.id)));
    setBatchReceiveValores(Object.fromEntries(items.map((i) => [i.id, String(i.saldo)])));
    setBatchReceiveDate(getLocalDateISO());
    setBatchReceiveForma("pix");
    setBatchReceiveOpen(true);
  };

  const getBatchReceiveValor = (id: string, fallback: number) => {
    const v = batchReceiveValores[id];
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  const handleBatchReceiveConfirm = async () => {
    const selected = batchReceiveContas.filter((c) => batchReceiveSelected.has(c.id));
    if (selected.length === 0) return toast.error("Selecione ao menos um título");
    if (!batchReceiveDate) return toast.error("Informe a data do recebimento");
    if (!batchReceiveForma) return toast.error("Informe a forma de recebimento");
    if (!user?.id) return toast.error("Sessão inválida");

    for (const it of selected) {
      const v = getBatchReceiveValor(it.id, it.saldo);
      if (v <= 0.005) return toast.error(`Valor inválido para título #${it.fatura_numero}`);
      if (v > it.saldo + 0.005) return toast.error(`Valor maior que o saldo de ${formatCurrency(it.saldo)}`);
    }

    setBatchReceiveSaving(true);
    try {
      for (const it of selected) {
        const valor = getBatchReceiveValor(it.id, it.saldo);
        const { error } = await supabase.from("receivable_payments" as any).insert({
          conta_receber_id: it.id,
          valor,
          forma_recebimento: batchReceiveForma,
          data_recebimento: batchReceiveDate,
          observacoes: "Recebimento em lote",
          created_by: user.id,
        });
        if (error) throw error;
      }
      toast.success(`${selected.length} título(s) recebido(s) com sucesso!`);
      setBatchReceiveOpen(false);
      setSelectedFaturaIds(new Set());
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar recebimento em lote");
    } finally {
      setBatchReceiveSaving(false);
    }
  };

  // --- Print ---
  const handlePrintFatura = async (fatura: Fatura) => {
    // Load logo as data URL so it appears in blob-printed invoices
    let logoDataUrl = "";
    try {
      const logoRes = await fetch(`${window.location.origin}/logo.png`);
      if (logoRes.ok) {
        const logoBlob = await logoRes.blob();
        logoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(logoBlob);
        });
      }
    } catch {
      // fallback to absolute path if fetch fails
    }
    const logoSrc = logoDataUrl || `${window.location.origin}/logo.png`;

    // Load linked previsões
    const { data: links } = await supabase
      .from("fatura_previsoes")
      .select("previsao_id")
      .eq("fatura_id", fatura.id);

    let previsoes: Previsao[] = [];
    if (links && links.length > 0) {
      const ids = links.map((l: any) => l.previsao_id);
      const { data: prevData } = await supabase
        .from("previsoes_recebimento")
        .select("*")
        .in("id", ids);
      previsoes = (prevData as Previsao[]) || [];
    }

    // Load contas a receber
    const { data: contasData } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .order("data_vencimento", { ascending: true });
    const contas = (contasData as ContaReceber[]) || [];

    // Load all receivable_payments (recebimentos parciais/totais) das parcelas
    const contasIds = contas.map(c => c.id);
    let recebimentos: any[] = [];
    if (contasIds.length > 0) {
      const { data: rpData } = await supabase
        .from("receivable_payments")
        .select("id, conta_receber_id, valor, forma_recebimento, data_recebimento, observacoes, created_at")
        .in("conta_receber_id", contasIds)
        .order("data_recebimento", { ascending: true });
      recebimentos = rpData || [];
    }
    const recebimentosByConta: Record<string, any[]> = {};
    recebimentos.forEach(r => {
      (recebimentosByConta[r.conta_receber_id] ||= []).push(r);
    });

    // Totais de pagamento parcial
    const totalRecebido = contas.reduce((s, c) => s + Number(c.valor_recebido || 0), 0);
    const valorTotalFatura = Number(fatura.valor_total);
    const saldoDevedor = Math.max(valorTotalFatura - totalRecebido, 0);
    const hasPartial = totalRecebido > 0 && fatura.status !== "paga";
    const hasRecebimentos = recebimentos.length > 0;

    // Load full client profile
    const { data: clienteProfile } = await supabase
      .from("profiles")
      .select("full_name, razao_social, cnpj, inscricao_estadual, email, phone, person_type, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip")
      .eq("id", fatura.cliente_id)
      .single();

    // Harvest details: always fetch current harvest_jobs to ensure farm_name reflects
    // the registered farm name (snapshot in metadata may be stale or contain address).
    const colheitaPrevisoes = previsoes.filter(p => p.origem_tipo === "colheita");
    const colheitaIds = colheitaPrevisoes.map(p => p.origem_id);
    let harvestJobs: Record<string, any> = {};
    if (colheitaIds.length > 0) {
      const { data: hjData } = await supabase
        .from("harvest_jobs")
        .select("id, farm_name, location, harvest_period_start, harvest_period_end, payment_value, monthly_value")
        .in("id", [...new Set(colheitaIds)]);
      if (hjData) {
        hjData.forEach((hj: any) => { harvestJobs[hj.id] = hj; });
      }
    }

    // CT-e details: fetch real values for previsões originadas de CT-e
    const ctePrevisoes = previsoes.filter(p => p.origem_tipo === "cte");
    const cteIds = ctePrevisoes.map(p => p.origem_id);
    const ctesById: Record<string, any> = {};
    if (cteIds.length > 0) {
      const { data: cteData } = await supabase
        .from("ctes")
        .select("id, numero, numero_interno, tipo_talao, serie, peso_bruto, valor_carga, valor_frete, valor_tonelada, valor_receber, desconto, placa_veiculo, produto_predominante, data_emissao, establishment_id")
        .in("id", [...new Set(cteIds)]);
      if (cteData) {
        cteData.forEach((c: any) => { ctesById[c.id] = c; });
      }
    }

    // Sort previsões by emission date ascending
    previsoes = [...previsoes].sort((a, b) => {
      const getDate = (p: Previsao): string => {
        const meta = p.metadata as any;
        if (p.origem_tipo === "cte") {
          const c = ctesById[p.origem_id];
          return c?.data_emissao || p.data_prevista || "";
        }
        if (p.origem_tipo === "colheita") {
          const hj = harvestJobs[p.origem_id];
          return meta?.periodo_inicio || hj?.harvest_period_start || p.data_prevista || "";
        }
        return p.data_prevista || "";
      };
      return getDate(a).localeCompare(getDate(b));
    });

    // Determine the issuing establishment for this fatura.
    // Priority: dominant establishment_id among CT-es referenced; fallback to matriz.
    const matriz = establishments.find(e => e.type === "matriz") || establishments[0];
    const estCounts: Record<string, number> = {};
    Object.values(ctesById).forEach((c: any) => {
      if (c?.establishment_id) estCounts[c.establishment_id] = (estCounts[c.establishment_id] || 0) + 1;
    });
    const dominantEstId = Object.keys(estCounts).sort((a, b) => estCounts[b] - estCounts[a])[0];
    const issuingEst =
      (dominantEstId && establishments.find(e => e.id === dominantEstId)) || matriz;

    // Company header: complete data from issuing establishment (matriz or filial).
    const companyName = issuingEst?.razao_social || unifiedLabel || "";
    let companyCnpj = issuingEst ? `CNPJ: ${maskCNPJ(issuingEst.cnpj)}` : unifiedCnpjLines.join(" · ");
    let companyAddress = "";
    if (issuingEst) {
      const { data: estData } = await supabase
        .from("fiscal_establishments")
        .select("inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep")
        .eq("id", issuingEst.id)
        .maybeSingle();
      if (estData) {
        if (estData.inscricao_estadual) companyCnpj += ` · IE: ${estData.inscricao_estadual}`;
        const line1 = [
          estData.endereco_logradouro,
          estData.endereco_numero ? `nº ${estData.endereco_numero}` : null,
          estData.endereco_bairro,
        ].filter(Boolean).join(", ");
        const line2 = [
          estData.endereco_municipio && estData.endereco_uf ? `${estData.endereco_municipio}/${estData.endereco_uf}` : null,
          estData.endereco_cep ? `CEP: ${estData.endereco_cep}` : null,
        ].filter(Boolean).join(" · ");
        companyAddress = [line1, line2].filter(Boolean).join(" — ");
      }
    }




    // Client display info
    const cli = clienteProfile;
    const clienteNomeDisplay = cli?.razao_social || cli?.full_name || fatura.cliente_nome || "—";
    const clienteCnpj = cli?.cnpj || "—";
    const clienteIE = cli?.inscricao_estadual || "—";
    const clienteEmail = cli?.email || "—";
    const clientePhone = cli?.phone || "—";
    const isJuridica = cli?.person_type === "cnpj" || cli?.person_type === "juridica";
    const clientePersonType = isJuridica ? "Pessoa Jurídica" : "Pessoa Física";

    let clienteAddress = "—";
    if (cli) {
      const addrParts = [
        cli.address_street,
        cli.address_number ? `nº ${cli.address_number}` : null,
        cli.address_complement,
        cli.address_neighborhood,
        cli.address_city && cli.address_state ? `${cli.address_city}/${cli.address_state}` : null,
        cli.address_zip ? `CEP: ${cli.address_zip}` : null,
      ].filter(Boolean);
      if (addrParts.length > 0) clienteAddress = addrParts.join(", ");
    }

    // Build harvest details section from metadata (filter context)
    let harvestDetailsHtml = "";
    if (colheitaPrevisoes.length > 0) {
      const sections = colheitaPrevisoes.map(p => {
        const meta = p.metadata as Previsao["metadata"];
        const hj = harvestJobs[p.origem_id];

        // Prioriza nome cadastrado em harvest_jobs (fonte da verdade);
        // metadata é usado como fallback para previsões cuja colheita foi removida.
        const fazenda = hj?.farm_name || meta?.fazenda || "—";
        const localizacao = hj?.location || meta?.localizacao || "—";
        const diaria = meta?.diaria_cliente ?? (hj ? (hj.payment_value || (hj.monthly_value / 30)) : 0);
        const periodoInicio = meta?.periodo_inicio || hj?.harvest_period_start;
        const periodoFim = meta?.periodo_fim || hj?.harvest_period_end;
        const periodo = periodoInicio && periodoFim
          ? `${formatDateBR(periodoInicio)} a ${formatDateBR(periodoFim)}`
          : "—";

        let html = `
<div class="section">
  <div class="section-title">Detalhes da Colheita — ${fazenda}</div>
  <div class="info-grid" style="margin-bottom:12px">
    <div class="info-item"><label>Fazenda</label><span>${fazenda}</span></div>
    <div class="info-item"><label>Localização</label><span>${localizacao}</span></div>
    <div class="info-item"><label>Valor Diária</label><span class="mono">${formatCurrency(Number(diaria))}</span></div>
    <div class="info-item"><label>Período Faturado</label><span>${periodo}</span></div>
  </div>`;

        if (meta?.detalhamento && meta.detalhamento.length > 0) {
          const driverRows = meta.detalhamento.map(d => `<tr>
            <td>${d.motorista}</td>
            <td>${d.placa}</td>
            <td>${d.proprietario || "—"}</td>
            <td class="text-center">${d.dias}</td>
            <td class="text-right mono">${formatCurrency(d.diaria)}</td>
            <td class="text-right mono">${formatCurrency(d.bruto)}</td>
            <td class="text-right mono">${formatCurrency(d.descontos)}</td>
            <td class="text-right mono">${formatCurrency(d.liquido)}</td>
          </tr>`).join("");
          const totDias = meta.detalhamento.reduce((s, d) => s + d.dias, 0);
          const totBruto = meta.detalhamento.reduce((s, d) => s + d.bruto, 0);
          const totDesc = meta.detalhamento.reduce((s, d) => s + d.descontos, 0);
          const totLiq = meta.detalhamento.reduce((s, d) => s + d.liquido, 0);

          html += `
  <table>
    <thead><tr><th>Motorista</th><th>Placa</th><th>Proprietário</th><th class="text-center">Dias</th><th class="text-right">Diária</th><th class="text-right">Bruto</th><th class="text-right">Descontos</th><th class="text-right">Líquido</th></tr></thead>
    <tbody>
      ${driverRows}
      <tr class="total-row">
        <td colspan="3" class="text-right">TOTAIS</td>
        <td class="text-center">${totDias}</td>
        <td></td>
        <td class="text-right mono">${formatCurrency(totBruto)}</td>
        <td class="text-right mono">${formatCurrency(totDesc)}</td>
        <td class="text-right mono">${formatCurrency(totLiq)}</td>
      </tr>
    </tbody>
  </table>`;
        }

        html += `</div>`;
        return html;
      }).join("");

      harvestDetailsHtml = sections;
    }

    // Helper for manual desconto label (used in Previsões Vinculadas table)
    const manualDescontoLabel = (d?: Previsao["metadata"]["desconto"]) => {
      if (!d || !d.tipo || d.tipo === "nenhum") return "—";
      if (d.tipo === "diesel") {
        const litros = Number(d.litros || 0);
        const vl = Number(d.valor_litro || 0);
        return `Diesel ${litros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L × ${formatCurrency(vl)}`;
      }
      if (d.tipo === "outros") return d.descricao || "Outros";
      return d.tipo;
    };

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>faturamento-${String(fatura.numero).padStart(4, '0')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a2e;background:#fff;padding:40px 48px;font-size:13px;line-height:1.5}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;border-bottom:2px solid #1a1a2e;margin-bottom:14px}
.company{font-size:18px;font-weight:700;letter-spacing:-0.3px;color:#1a1a2e}
.company-sub{font-size:11px;color:#6b7280;margin-top:4px}
.company-addr{font-size:10px;color:#9ca3af;margin-top:2px}
.doc-info{text-align:right}
.doc-title{font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1a1a2e;text-transform:uppercase}
.doc-number{font-size:11px;color:#6b7280;margin-top:2px;font-family:monospace}
.section{margin-bottom:20px}
.section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
.info-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 24px}
.info-item label{display:block;font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px}
.info-item span{font-size:12px;font-weight:600;color:#1a1a2e}
.info-item-full{grid-column:1/-1}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{background:#f8f9fa;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;color:#6b7280;padding:4px 6px;text-align:left;border-bottom:2px solid #e5e7eb}
td{padding:4px 6px;font-size:11px;border-bottom:1px solid #f3f4f6}
.text-right{text-align:right}
.text-center{text-align:center}
.mono{font-family:'SF Mono',Monaco,monospace;font-weight:600}
.total-row{background:#f0fdf4;font-weight:700}
.total-row td{border-bottom:2px solid #16a34a;color:#15803d}
.badge{display:inline-block;padding:1px 6px;border-radius:99px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.3px}
.badge-open{background:#fef3c7;color:#92400e}
.badge-received{background:#dcfce7;color:#166534}
.badge-late{background:#fee2e2;color:#991b1b}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:9px;color:#9ca3af}
.summary-box{background:#f8f9fa;border:1px solid #e5e7eb;border-radius:8px;padding:10px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
.summary-item{text-align:center}
.summary-item .value{font-size:14px;font-weight:800;color:#1a1a2e}
.summary-item .label{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:0.3px}
.divider{border:none;border-top:1px dashed #e5e7eb;margin:6px 0}
@media print{body{padding:6px 10px;font-size:9px}@page{margin:5mm;size:A4 portrait}table{font-size:9px}th{padding:2px 4px;font-size:8px}td{padding:1px 4px;font-size:9px;line-height:1.15}.header{margin-bottom:4px;padding-bottom:4px}.summary-box{padding:4px 6px;gap:4px;margin-bottom:6px}.summary-item .value{font-size:11px}.summary-item .label{font-size:7px}.divider{margin:4px 0}.footer{margin-top:5px;padding-top:4px;font-size:7px}h2{font-size:11px;margin-bottom:3px}.section{margin-bottom:6px}.section-title{font-size:8px;margin-bottom:3px;padding-bottom:2px}.info-item label{font-size:7px}.info-item span{font-size:9px}.info-grid,.info-grid-3,.info-grid-4{gap:2px 12px}.company{font-size:13px}.company-sub,.company-addr{font-size:8px}.doc-title{font-size:16px}.doc-number{font-size:9px}.badge{padding:1px 4px;font-size:8px}}
</style></head><body>

<div class="header">
  <div style="display:flex;gap:14px;align-items:center;flex:1;min-width:0">
    <img src="${logoSrc}" alt="" style="height:54px;width:auto;object-fit:contain;flex-shrink:0" />
    <div style="min-width:0">
      <div class="company">${companyName}</div>
      <div class="company-sub">${companyCnpj}</div>
      ${companyAddress ? `<div class="company-addr">${companyAddress}</div>` : ""}
    </div>
  </div>

  <div class="doc-info">
    <div class="doc-title">Fatura #${String(fatura.numero).padStart(4, '0')}</div>
    <div class="doc-number">${formatDateBR(fatura.data_emissao)} · ${fatura.num_parcelas === 1 ? 'À Vista' : fatura.num_parcelas + 'x'} · ${(STATUS_MAP[fatura.status] || STATUS_MAP.rascunho).label}</div>
    <div style="font-size:14px;font-weight:800;margin-top:2px">${formatCurrency(Number(fatura.valor_total))}</div>
  </div>
</div>


<div class="section">
  <div class="section-title">Dados do Cliente</div>
  <div class="info-grid-4" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:4px 16px">
    <div class="info-item"><label>${isJuridica ? "Razão Social" : "Nome"}</label><span>${clienteNomeDisplay}</span></div>
    <div class="info-item"><label>${isJuridica ? "CNPJ" : "CPF"}</label><span>${clienteCnpj}</span></div>
    <div class="info-item"><label>IE</label><span>${clienteIE}</span></div>
    <div class="info-item"><label>Telefone</label><span>${clientePhone}</span></div>
    <div class="info-item" style="grid-column:1/3"><label>Endereço</label><span>${clienteAddress}</span></div>
    <div class="info-item" style="grid-column:3/5"><label>E-mail</label><span>${clienteEmail}</span></div>
  </div>
</div>

${harvestDetailsHtml}

${previsoes.length > 0 ? `
<div class="section">
  <div class="section-title">Previsões Vinculadas (${previsoes.length})</div>
  <table>
    <thead><tr>
      <th>Origem</th><th>Emissão</th>
      <th class="text-right">Peso</th><th class="text-right">R$/Ton</th>
      <th class="text-right">Bruto</th><th>Desconto</th><th class="text-right">Vl. Desc.</th>
      <th class="text-right">Líquido</th>
    </tr></thead>
    <tbody>
      ${previsoes.map(p => {
        const meta = p.metadata as any;
        const hj = harvestJobs[p.origem_id];
        const fazenda = hj?.farm_name || meta?.fazenda || "";
        const periodoInicio = meta?.periodo_inicio || hj?.harvest_period_start;
        const periodoFim = meta?.periodo_fim || hj?.harvest_period_end;
        const isCte = p.origem_tipo === "cte";
        const cte = isCte ? ctesById[p.origem_id] : null;
        let descricao: string;
        let badgeText: string;
        if (isCte) {
          descricao = "Conhecimento de Transporte";
          const cteNum = cte?.numero ?? cte?.numero_interno;
          badgeText = cteNum ? `CT-e ${cteNum}` : "CT-e";
        } else if (p.origem_tipo === "manual") {
          const placa = meta?.placa ? ` · ${meta.placa}` : "";
          const motorista = meta?.motorista ? ` · ${meta.motorista}` : "";
          descricao = `Frete Manual${placa}${motorista}`;
          badgeText = "Manual";
        } else {
          descricao = fazenda ? `Colheita — ${fazenda}` : "Colheita";
          badgeText = "Colheita";
        }
        const periodoStr = periodoInicio && periodoFim
          ? `${formatDateBR(periodoInicio)} a ${formatDateBR(periodoFim)}`
          : formatDateBR(p.data_prevista);

        const isManual = p.origem_tipo === "manual";

        // Resolve real values: CT-e from ctes table, Manual from metadata

        const peso = isCte
          ? Number(cte?.peso_bruto || 0)
          : Number(meta?.peso_kg || 0);
        const vTon = isCte
          ? Number(cte?.valor_tonelada || 0)
          : Number(meta?.valor_por_ton || 0);
        const brutoCalc = isCte
          ? (Number(cte?.peso_bruto || 0) / 1000) * Number(cte?.valor_tonelada || 0)
          : Number(meta?.valor_bruto || 0);
        // Fallback: se não há peso/valor por tonelada, usa valor_frete (CT-e) ou líquido + desconto (manual)
        const bruto = brutoCalc > 0
          ? brutoCalc
          : isCte
            ? Number(cte?.valor_frete || 0)
            : (Number(p.valor) + Number(meta?.valor_desconto || 0));
        const cteDescontoVal = isCte
          ? (() => {
              const d = cte?.desconto;
              if (!d) return 0;
              if (typeof d === "number") return Number(d) || 0;
              return Number(d?.valor || 0);
            })()
          : 0;
        const vDesc = isCte ? cteDescontoVal : Number(meta?.valor_desconto || 0);
        const liquido = isCte
          ? Number(cte?.valor_receber || cte?.valor_frete || p.valor)
          : Number(p.valor);

        const cteDescontoLabel = (() => {
          if (!isCte || !cte?.desconto) return "—";
          const d = cte.desconto;
          if (typeof d === "object") {
            if (d.tipo === "diesel") {
              const litros = Number(d.litros || 0);
              const vl = Number(d.valor_litro || 0);
              return `Diesel ${litros.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} L × ${formatCurrency(vl)}`;
            }
            if (d.tipo === "outros") return d.descricao || "Outros";
            if (d.tipo) return d.tipo;
          }
          return cteDescontoVal > 0 ? "Desconto" : "—";
        })();

        const pesoCell = peso > 0
          ? `${peso.toLocaleString("pt-BR", { minimumFractionDigits: 0 })} kg` : "—";
        const vTonCell = vTon > 0 ? formatCurrency(vTon) : "—";
        const brutoCell = bruto > 0 ? formatCurrency(bruto) : "—";
        const descLabelCell = isManual ? manualDescontoLabel(meta?.desconto) : cteDescontoLabel;
        const vDescCell = vDesc > 0 ? formatCurrency(vDesc) : "—";

        return `<tr>
          <td><span class="badge" style="background:#f0f9ff;color:#0369a1">${badgeText}</span></td>
          <td>${periodoStr}</td>
          <td class="text-right mono">${pesoCell}</td>
          <td class="text-right mono">${vTonCell}</td>
          <td class="text-right mono">${brutoCell}</td>
          <td>${descLabelCell}</td>
          <td class="text-right mono">${vDescCell}</td>
          <td class="text-right mono">${formatCurrency(liquido)}</td>
        </tr>`;
      }).join("")}
      <tr class="total-row">
        <td colspan="7" class="text-right">Total</td>
        <td class="text-right mono">${formatCurrency(previsoes.reduce((s, p) => s + Number(p.valor), 0))}</td>
      </tr>
    </tbody>
  </table>
</div>
` : ""}

${hasPartial ? `
<div class="section">
  <div class="section-title">Pagamento Parcial Recebido</div>
  <div class="summary-box" style="background:#fffbeb;border-color:#fcd34d">
    <div class="summary-item"><div class="label">Valor da Fatura</div><div class="value mono">${formatCurrency(valorTotalFatura)}</div></div>
    <div class="summary-item"><div class="label">Total Recebido</div><div class="value mono" style="color:#15803d">${formatCurrency(totalRecebido)}</div></div>
    <div class="summary-item"><div class="label">Saldo Devedor</div><div class="value mono" style="color:#991b1b">${formatCurrency(saldoDevedor)}</div></div>
  </div>
</div>
` : ""}

<div class="section">
  <div class="section-title">Parcelas / Contas a Receber (${contas.length})</div>
  <table>
    <thead><tr><th>#</th><th>Vencimento</th><th class="text-right">Valor</th><th class="text-right">Recebido</th><th class="text-right">Saldo</th><th class="text-center">Status</th></tr></thead>
    <tbody>
      ${contas.map((c, i) => {
        const recebido = Number(c.valor_recebido || 0);
        const valor = Number(c.valor);
        const saldo = Math.max(valor - recebido, 0);
        const badgeClass = c.status === "recebido" ? "badge-received" : c.status === "atrasado" ? "badge-late" : "badge-open";
        const statusLabel = c.status === "recebido" ? "Recebido" : c.status === "atrasado" ? "Atrasado" : recebido > 0 ? "Parcial" : "Aberto";
        return `<tr>
          <td>${i + 1}</td>
          <td>${formatDateBR(c.data_vencimento)}</td>
          <td class="text-right mono">${formatCurrency(valor)}</td>
          <td class="text-right mono" style="${recebido > 0 ? 'color:#15803d' : 'color:#9ca3af'}">${recebido > 0 ? formatCurrency(recebido) : "—"}</td>
          <td class="text-right mono" style="${saldo > 0 ? 'color:#991b1b' : 'color:#9ca3af'}">${saldo > 0 ? formatCurrency(saldo) : "—"}</td>
          <td class="text-center"><span class="badge ${badgeClass}">${statusLabel}</span></td>
        </tr>`;
      }).join("")}
      <tr class="total-row">
        <td colspan="2" class="text-right">TOTAIS</td>
        <td class="text-right mono">${formatCurrency(valorTotalFatura)}</td>
        <td class="text-right mono">${formatCurrency(totalRecebido)}</td>
        <td class="text-right mono">${formatCurrency(saldoDevedor)}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
</div>

${hasRecebimentos ? `
<div class="section">
  <div class="section-title">Recebimentos Registrados (${recebimentos.length})</div>
  <table>
    <thead><tr><th>#</th><th>Data Recebimento</th><th>Parcela</th><th>Forma</th><th>Observações</th><th class="text-right">Valor</th></tr></thead>
    <tbody>
      ${recebimentos
        .slice()
        .sort((a, b) => (a.data_recebimento || "").localeCompare(b.data_recebimento || ""))
        .map((r, idx) => {
          const idxParcela = contas.findIndex(c => c.id === r.conta_receber_id);
          const parcelaLabel = idxParcela >= 0 ? `${idxParcela + 1}/${contas.length}` : "—";
          return `<tr>
            <td>${idx + 1}</td>
            <td>${formatDateBR(r.data_recebimento)}</td>
            <td>${parcelaLabel}</td>
            <td>${r.forma_recebimento || "—"}</td>
            <td>${r.observacoes ? String(r.observacoes).replace(/</g, "&lt;") : "—"}</td>
            <td class="text-right mono" style="color:#15803d">${formatCurrency(Number(r.valor))}</td>
          </tr>`;
        }).join("")}
      <tr class="total-row">
        <td colspan="5" class="text-right">TOTAL RECEBIDO</td>
        <td class="text-right mono">${formatCurrency(totalRecebido)}</td>
      </tr>
    </tbody>
  </table>
</div>
` : ""}

<hr class="divider" />

<div class="footer">
  Documento gerado em ${new Date().toLocaleString("pt-BR")} · ${companyName}
</div>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        setTimeout(() => win.print(), 300);
      });
    }
  };

  const totalFaturado = faturas.reduce((s, f) => s + Number(f.valor_total), 0);
  const hasPendingContas = (f: Fatura) => f.status === "faturada";
  const isPaid = (f: Fatura) => f.status === "paga";

  const handleReverseFatura = async (fatura: Fatura) => {
    const ok = await confirm({
      title: "Estornar recebimento",
      description: `Deseja estornar o recebimento da fatura #${String(fatura.numero).padStart(4, '0')}? Os títulos voltarão para "aberto" e as movimentações bancárias serão removidas.`,
      confirmLabel: "Estornar",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { data: contas, error: errFetch } = await supabase
        .from("contas_receber")
        .select("id")
        .eq("fatura_id", fatura.id)
        .eq("status", "recebido");
      if (errFetch) throw errFetch;

      for (const c of (contas || [])) {
        const { error } = await supabase
          .from("contas_receber")
          .update({
            status: "aberto" as any,
            data_recebimento: null,
            valor_recebido: null,
            forma_recebimento: null,
          })
          .eq("id", (c as any).id);
        if (error) throw error;
      }
      toast.success("Recebimento estornado com sucesso");
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar recebimento");
    }
  };

  // ─── Seleção em lote ──────────────────────────────────────
  const [selectedFaturaIds, setSelectedFaturaIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleFaturaSelect = (id: string) => {
    setSelectedFaturaIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectedFaturas = faturas.filter((f) => selectedFaturaIds.has(f.id));
  const bulkDeletable = selectedFaturas.filter((f) => f.status !== "paga");
  const bulkReversible = selectedFaturas.filter((f) => isPaid(f));

  const handleBulkDelete = async () => {
    if (!bulkDeletable.length) {
      toast.error("Nenhuma fatura selecionada pode ser excluída (faturas pagas devem ser estornadas antes).");
      return;
    }
    const skipped = selectedFaturas.length - bulkDeletable.length;
    const ok = await confirm({
      title: "Excluir faturas selecionadas",
      description:
        `Deseja excluir ${bulkDeletable.length} fatura(s)? As previsões vinculadas voltarão para pendente e os títulos a receber serão removidos.` +
        (skipped ? `\n\n⚠️ ${skipped} fatura(s) paga(s) serão ignoradas.` : "") +
        "\n\nEsta ação é irreversível.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setBulkBusy(true);
    let okCount = 0;
    const errors: string[] = [];
    try {
      for (const f of bulkDeletable) {
        try {
          await supabase.from("contas_receber").delete().eq("fatura_id", f.id);
          await supabase.from("fatura_previsoes").delete().eq("fatura_id", f.id);
          const { error } = await supabase.from("faturas_recebimento").delete().eq("id", f.id);
          if (error) throw error;
          okCount++;
        } catch (err: any) {
          errors.push(`#${String(f.numero).padStart(4, "0")}: ${err.message}`);
        }
      }
      if (errors.length) toast.error(`${okCount} excluída(s). Erros: ${errors.slice(0, 3).join(" | ")}`);
      else toast.success(`${okCount} fatura(s) excluída(s) com sucesso!`);
      setSelectedFaturaIds(new Set());
      fetchFaturas();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkReverse = async () => {
    if (!bulkReversible.length) {
      toast.error("Nenhuma fatura paga selecionada para estorno.");
      return;
    }
    const skipped = selectedFaturas.length - bulkReversible.length;
    const ok = await confirm({
      title: "Estornar recebimentos",
      description:
        `Deseja estornar o recebimento de ${bulkReversible.length} fatura(s)? Os títulos voltarão para "aberto" e as movimentações bancárias serão removidas.` +
        (skipped ? `\n\n⚠️ ${skipped} fatura(s) não paga(s) serão ignoradas.` : ""),
      confirmLabel: "Estornar",
      variant: "destructive",
    });
    if (!ok) return;

    setBulkBusy(true);
    let okCount = 0;
    const errors: string[] = [];
    try {
      for (const f of bulkReversible) {
        try {
          const { data: contas, error: errFetch } = await supabase
            .from("contas_receber")
            .select("id")
            .eq("fatura_id", f.id)
            .eq("status", "recebido");
          if (errFetch) throw errFetch;
          for (const c of contas || []) {
            const { error } = await supabase
              .from("contas_receber")
              .update({
                status: "aberto" as any,
                data_recebimento: null,
                valor_recebido: null,
                forma_recebimento: null,
              })
              .eq("id", (c as any).id);
            if (error) throw error;
          }
          okCount++;
        } catch (err: any) {
          errors.push(`#${String(f.numero).padStart(4, "0")}: ${err.message}`);
        }
      }
      if (errors.length) toast.error(`${okCount} estornada(s). Erros: ${errors.slice(0, 3).join(" | ")}`);
      else toast.success(`${okCount} recebimento(s) estornado(s) com sucesso!`);
      setSelectedFaturaIds(new Set());
      fetchFaturas();
    } finally {
      setBulkBusy(false);
    }
  };



  const { sort, toggle, sorted: faturasSorted } = useSortableTable<Fatura, "numero" | "data_emissao_real" | "data_vencimento_ref" | "cliente_nome" | "valor_total" | "condicao_label" | "status">(
    faturas,
    { key: "numero", direction: "desc" },
    {
      numero: (r) => r.numero,
      data_emissao_real: (r) => (r as any).data_emissao_real || r.data_emissao,
      data_vencimento_ref: (r) => (r as any).data_vencimento_ref || r.data_emissao,
      cliente_nome: (r) => r.cliente_nome || "",
      valor_total: (r) => Number(r.valor_total),
      condicao_label: (r) => (r as any).condicao_label || "",
      status: (r) => (r.has_partial ? "parcial" : r.status),
    },
  );

  const singleFatura = selectedFaturas.length === 1 ? selectedFaturas[0] : null;

  const faturaColumns: DataGridColumn<Fatura>[] = useMemo(() => [
    {
      key: "numero", header: "Nº", width: "80px",
      sortValue: (f) => f.numero,
      cell: (f) => <span className="font-mono text-muted-foreground">#{String(f.numero).padStart(4, "0")}</span>,
    },
    {
      key: "emissao", header: "Emissão", width: "110px",
      sortValue: (f) => (f as any).data_emissao_real || f.data_emissao,
      cell: (f) => <span className="tabular-nums">{formatDateBR((f as any).data_emissao_real || f.data_emissao)}</span>,
    },
    {
      key: "cliente", header: "Cliente",
      sortValue: (f) => f.cliente_nome || "",
      cell: (f) => <span className="font-medium truncate block max-w-[320px]">{f.cliente_nome}</span>,
    },
    {
      key: "vencimento", header: "Vencimento", width: "130px",
      sortValue: (f) => (f as any).data_vencimento_ref || f.data_emissao,
      cell: (f) => (
        <span className="tabular-nums whitespace-nowrap">
          {formatDateBR((f as any).data_vencimento_ref || f.data_emissao)}
          {f.num_parcelas > 1 && (f as any).data_vencimento_max !== (f as any).data_vencimento_ref && (
            <span className="text-[10px] text-muted-foreground"> …{formatDateBR((f as any).data_vencimento_max)}</span>
          )}
        </span>
      ),
    },
    {
      key: "valor", header: "Valor", width: "140px", align: "right",
      sortValue: (f) => Number(f.valor_total),
      cell: (f) => (
        <span className="tabular-nums font-medium">
          {formatCurrency(Number(f.valor_total))}
          {f.has_partial && (
            <span className="block text-[10px] text-amber-600 font-normal">
              Receb: {formatCurrency(f.valor_recebido_total || 0)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "condicao", header: "Condição", width: "110px", align: "center",
      sortValue: (f) => (f as any).condicao_label || "",
      cell: (f) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {(f as any).condicao_label || (f.num_parcelas === 1 ? "À vista" : `${f.num_parcelas}x (${f.intervalo_dias}d)`)}
        </span>
      ),
    },
    {
      key: "status", header: "Status", width: "100px", align: "center",
      sortValue: (f) => (f.has_partial ? "parcial" : f.status),
      cell: (f) => {
        const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
        return (
          <Badge variant={f.has_partial ? "secondary" : st.variant} className={cn("text-[10px]", !f.has_partial && st.className)}>
            {f.has_partial ? "Parcial" : st.label}
          </Badge>
        );
      },
    },
  ], []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Faturamento</h1>
      </div>


      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={FileText} label="Total de Faturas" value={faturas.length} />
        <SummaryCard icon={DollarSign} label="Valor Faturado" value={formatCurrency(totalFaturado)} valueColor="green" />
      </div>

      <GlobalToolbar
        actions={[
          { key: "new", label: "Nova Fatura", icon: Plus, mode: "create", variant: "default", onClick: openNewInvoice },
          {
            key: "detail", label: "Detalhes", icon: Eye, mode: "single",
            disabled: !singleFatura,
            onClick: () => singleFatura && openDetail(singleFatura),
          },
          {
            key: "edit", label: "Editar", icon: Pencil, mode: "single",
            disabled: !singleFatura || singleFatura.status === "paga",
            onClick: () => singleFatura && openEditInvoice(singleFatura),
          },
          {
            key: "receive", label: "Receber", icon: HandCoins, mode: "single+batch",
            disabled: selectedFaturas.length === 0 || !selectedFaturas.some((f) => hasPendingContas(f)),
            onClick: () => {
              const pending = selectedFaturas.filter((f) => hasPendingContas(f));
              if (pending.length === 1) openReceive(pending[0]);
              else if (pending.length > 1) openBatchReceive(pending);
            },
          },
          {
            key: "print", label: "Imprimir", icon: Printer, mode: "single",
            disabled: !singleFatura,
            onClick: () => singleFatura && handlePrintFatura(singleFatura),
          },
          {
            key: "reverse", label: "Estornar", icon: Undo2, mode: "single+batch",
            disabled: bulkBusy || bulkReversible.length === 0,
            onClick: handleBulkReverse,
          },
          {
            key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive",
            disabled: bulkBusy || bulkDeletable.length === 0,
            onClick: handleBulkDelete,
          },
        ]}
        selectedCount={selectedFaturaIds.size}
      >
        {selectedFaturaIds.size > 0 && (
          <span className="text-[11px] font-mono text-primary">
            {formatCurrency(selectedFaturas.reduce((s, f) => s + Number(f.valor_total), 0))}
          </span>
        )}
      </GlobalToolbar>

      <DataGrid
        rows={faturasSorted}
        columns={faturaColumns}
        rowId={(f) => f.id}
        selected={selectedFaturaIds}
        rowClassName={(f) => rowToneClass(f.status === "paga" ? "resolved" : "pending")}
        onSelectedChange={setSelectedFaturaIds}
        loading={loading}
        minWidth={1000}
        emptyMessage='Nenhuma fatura encontrada. Clique em "Nova Fatura" para criar.'
        footer={
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{faturasSorted.length} fatura(s)</span>
            <span className="font-mono">Total: {formatCurrency(totalFaturado)}</span>
          </div>
        }
      />

      <StatusLegend className="px-1" items={[{ tone: "pending", label: "Em aberto / parcial" }, { tone: "resolved", label: "Recebida / paga" }]} />


      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Fatura #{String(selectedFatura?.numero ?? 0).padStart(4, '0')}</DialogTitle>
          </DialogHeader>
          {selectedFatura && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{selectedFatura.cliente_nome}</strong></div>
                <div><span className="text-muted-foreground">Emissão:</span> <strong>{formatDateBR(selectedFatura.data_emissao)}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong>{formatCurrency(Number(selectedFatura.valor_total))}</strong></div>
                <div><span className="text-muted-foreground">Condição:</span> <strong>{selectedFatura.num_parcelas === 1 ? "À vista" : `${selectedFatura.num_parcelas}x (a cada ${selectedFatura.intervalo_dias} dias)`}</strong></div>
                {Number(selectedFatura.valor_acrescimo || 0) > 0 && (
                  <div><span className="text-muted-foreground">Acréscimo:</span> <strong>{formatCurrency(Number(selectedFatura.valor_acrescimo))}</strong></div>
                )}
                {Number(selectedFatura.valor_desconto || 0) > 0 && (
                  <div><span className="text-muted-foreground">Desconto:</span> <strong>{formatCurrency(Number(selectedFatura.valor_desconto))}</strong></div>
                )}
                {selectedFatura.observacoes && (
                  <div className="col-span-2"><span className="text-muted-foreground">Observações:</span> <strong>{selectedFatura.observacoes}</strong></div>
                )}
              </div>


              <div>
                <p className="text-sm font-semibold mb-2">Previsões Vinculadas ({detailPrevisoes.length})</p>
                <div className="overflow-x-auto border rounded max-h-[280px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Detalhes</TableHead>
                        <TableHead className="text-right">Peso</TableHead>
                        <TableHead className="text-right">R$/Ton</TableHead>
                        <TableHead className="text-right">Bruto</TableHead>
                        <TableHead className="text-right">Desconto</TableHead>
                        <TableHead className="text-right">Líquido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPrevisoes.map((p) => {
                        const m: any = p.metadata || {};
                        const isManual = p.origem_tipo === "manual";
                        const isCte = p.origem_tipo === "cte";
                        const isColheita = p.origem_tipo === "colheita";
                        const cte = isCte ? detailCtes[p.origem_id] : null;

                        // Resolve fields per origem
                        const placa = isManual
                          ? (m.placa || "—")
                          : isCte
                            ? (cte?.placa_veiculo || "—")
                            : "—";

                        const pesoKg = isManual
                          ? Number(m.peso_kg || 0)
                          : isCte
                            ? Number(cte?.peso_bruto || 0)
                            : 0;

                        const valorTon = isManual
                          ? Number(m.valor_por_ton || 0)
                          : isCte
                            ? Number(cte?.valor_tonelada || 0)
                            : 0;

                        const valorBruto = isManual
                          ? Number(m.valor_bruto || 0)
                          : isCte
                            ? Number(cte?.valor_carga || cte?.valor_frete || 0)
                            : 0;

                        const valorDesc = isManual
                          ? Number(m.valor_desconto || 0)
                          : isCte
                            ? Number(cte?.desconto || 0)
                            : 0;

                        let detalhes = "—";
                        if (isManual) {
                          detalhes = m.motorista || "Frete Manual";
                        } else if (isCte) {
                          detalhes = cte?.produto_predominante || "CT-e";
                        } else if (isColheita) {
                          detalhes = m.fazenda || "—";
                        }

                        const descTipo = m.desconto?.tipo;
                        let descLabel = "—";
                        if (isManual && descTipo && descTipo !== "nenhum") {
                          if (descTipo === "diesel") {
                            descLabel = `Diesel ${Number(m.desconto.litros || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}L`;
                          } else if (descTipo === "outros") {
                            descLabel = m.desconto.descricao || "Outros";
                          } else {
                            descLabel = descTipo;
                          }
                        }
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="text-xs">
                              <Badge variant="outline">{isCte ? "CT-e" : isManual ? "Manual" : "Colheita"}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">{formatDateBR(p.data_prevista)}</TableCell>
                            <TableCell className="text-xs font-mono">{placa}</TableCell>
                            <TableCell className="text-xs">{detalhes}</TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {pesoKg > 0 ? `${pesoKg.toLocaleString("pt-BR")} kg` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {valorTon > 0 ? formatCurrency(valorTon) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {valorBruto > 0 ? formatCurrency(valorBruto) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono">
                              {valorDesc > 0
                                ? <span title={descLabel}>{formatCurrency(valorDesc)}</span>
                                : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrency(Number(p.valor))}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Contas a Receber ({detailContas.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Recebimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailContas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{formatDateBR(c.data_vencimento)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant={c.status === "recebido" ? "default" : c.status === "atrasado" ? "destructive" : "outline"}>
                              {c.status === "recebido" ? "Recebido" : c.status === "atrasado" ? "Atrasado" : "Aberto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{c.data_recebimento ? formatDateBR(c.data_recebimento) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => handlePrintFatura(selectedFatura)} className="gap-1.5">
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New/Edit Invoice Dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingFaturaId
                ? "Editar Fatura"
                : step === "client"
                  ? "Nova Fatura — Selecionar Cliente"
                  : "Nova Fatura — Condições"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editingFaturaId ? "Edite as condições da fatura" : "Crie uma nova fatura"}
            </DialogDescription>


          </DialogHeader>

          {step === "client" && !editingFaturaId && (
            <div className="space-y-4">
              {clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente com previsões pendentes.</p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {clientes.map((c) => (
                    <Button
                      key={c.id}
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => handleClientSelect(c.id)}
                    >
                      {c.full_name}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Cliente: <strong className="text-foreground">{clientes.find((c) => c.id === selectedClientId)?.full_name}</strong>
              </p>

              {/* Previsões list */}
              <div className="border rounded max-h-[180px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedPrevIds.size === clientPrevisoes.length && clientPrevisoes.length > 0}
                          onCheckedChange={() => {
                            if (selectedPrevIds.size === clientPrevisoes.length) {
                              setSelectedPrevIds(new Set());
                            } else {
                              setSelectedPrevIds(new Set(clientPrevisoes.map((p) => p.id)));
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPrevisoes.map((p) => (
                      <TableRow key={p.id} className={selectedPrevIds.has(p.id) ? "bg-accent/30" : ""}>
                        <TableCell>
                          <Checkbox checked={selectedPrevIds.has(p.id)} onCheckedChange={() => togglePrev(p.id)} />
                        </TableCell>
                        <TableCell className="text-xs">{p.origem_tipo === "cte" ? "CT-e" : p.origem_tipo === "manual" ? "Manual" : "Colheita"}</TableCell>
                        <TableCell className="text-xs">{formatDateBR(p.data_prevista)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-sm text-muted-foreground">
                Selecionadas: <strong className="text-foreground">{selectedPrevIds.size}</strong> |
                Subtotal: <strong className="text-foreground">{formatCurrency(selectedPrevTotal)}</strong>
              </div>

              {/* Acréscimos / Descontos */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acréscimos / Descontos</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Acréscimo (R$)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="0,00"
                      value={acrescimoStr}
                      onChange={(e) => setAcrescimoStr(maskCurrency(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Desconto (R$)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="0,00"
                      value={descontoStr}
                      onChange={(e) => setDescontoStr(maskCurrency(e.target.value))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    rows={2}
                    placeholder="Ex.: desconto comercial, acréscimo por reentrega..."
                    value={observacoesFatura}
                    onChange={(e) => setObservacoesFatura(e.target.value)}
                  />

                </div>
              </div>


              {/* Payment condition */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Condição de Pagamento</Label>
                <RadioGroup
                  value={condicaoPagamento}
                  onValueChange={(v) => {
                    const val = v as "avista" | "unico" | "parcelado";
                    setCondicaoPagamento(val);
                    if (val === "avista") {
                      setNumParcelas(1);
                      setIntervaloDias(0);
                    } else if (val === "unico") {
                      setNumParcelas(1);
                      setIntervaloDias(0);
                      if (!editingFaturaId) setDataVencimentoUnico(getLocalDateISO());
                    } else {
                      const n = Math.max(2, numParcelas);
                      setNumParcelas(n);
                      setIntervaloDias(0);
                      setParcelasCustomOn(true);
                      if (parcelasCustom.length !== n) setParcelasCustom(buildDefaultSchedule(n));
                    }

                  }}
                  className="flex gap-4 flex-wrap"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="avista" id="avista" />
                    <Label htmlFor="avista" className="cursor-pointer text-sm">À Vista</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="unico" id="unico" />
                    <Label htmlFor="unico" className="cursor-pointer text-sm">Pagamento Único</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="parcelado" id="parcelado" />
                    <Label htmlFor="parcelado" className="cursor-pointer text-sm">Parcelado</Label>
                  </div>
                </RadioGroup>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Data de Emissão</Label>
                    <Input
                      type="date"
                      value={dataEmissaoEdit}
                      onChange={(e) => setDataEmissaoEdit(e.target.value)}
                      disabled={condicaoPagamento === "unico"}
                    />
                  </div>
                  {condicaoPagamento === "unico" && (
                    <div>
                      <Label className="text-xs">Data de Vencimento</Label>
                      <Input
                        type="date"
                        value={dataVencimentoUnico}
                        onChange={(e) => setDataVencimentoUnico(e.target.value)}
                        />
                    </div>
                  )}
                </div>

                {condicaoPagamento === "parcelado" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nº de Parcelas</Label>
                      <Input
                        type="number"
                        min={2}
                        max={48}
                        value={numParcelas}
                        onChange={(e) => {
                          const n = Math.max(2, Number(e.target.value) || 2);
                          setNumParcelas(n);
                          setParcelasCustom((prev) => {
                            if (prev.length === n) return prev;
                            const base = buildDefaultSchedule(n);
                            return base.map((p, i) => ({ ...p, data_vencimento: prev[i]?.data_vencimento || "" }));
                          });
                        }}
                      />
                    </div>
                    <div className="flex items-end">
                      <p className="text-[11px] text-muted-foreground">
                        Valores divididos igualmente (editáveis). Informe manualmente o vencimento de cada parcela.
                      </p>
                    </div>

                    <div className="col-span-2 border-t pt-2">
                        <div className="mt-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">Valor e vencimento de cada parcela</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setParcelasCustom((prev) =>
                                buildDefaultSchedule(prev.length || numParcelas).map((p, i) => ({
                                  ...p,
                                  data_vencimento: prev[i]?.data_vencimento || "",
                                }))
                              )}
                            >
                              Dividir igualmente
                            </Button>
                          </div>

                          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                            {parcelasCustom.map((p, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-[11px] w-12 text-muted-foreground">{i + 1}/{parcelasCustom.length}</span>
                                <Input
                                  className="h-8 text-xs flex-1"
                                  value={p.valor}
                                  onChange={(e) => updateParcelaCustom(i, { valor: maskCurrency(e.target.value) })}
                                />
                                <Input
                                  type="date"
                                  className="h-8 text-xs w-[140px]"
                                  value={p.data_vencimento}
                                  onChange={(e) => updateParcelaCustom(i, { data_vencimento: e.target.value })}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => setParcelasCustom(prev => {
                                    const next = prev.filter((_, idx) => idx !== i);
                                    setNumParcelas(Math.max(2, next.length));
                                    return next;
                                  })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              onClick={() => setParcelasCustom(prev => {
                                const next = [...prev, { valor: "", data_vencimento: "" }];
                                setNumParcelas(next.length);
                                return next;
                              })}
                            >
                              + Adicionar parcela
                            </Button>
                            <span className={Math.abs(diferencaParcelas) > 0.01 ? "text-destructive font-semibold" : "text-green-600 font-semibold"}>
                              Soma: {formatCurrency(somaParcelasCustom)}
                              {Math.abs(diferencaParcelas) > 0.01 && ` · diferença ${formatCurrency(diferencaParcelas)}`}
                            </span>
                          </div>
                        </div>
                    </div>

                  </div>
                )}


              </div>

              {/* Summary preview */}
              <div className="text-xs border rounded p-3 bg-muted/30 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(selectedPrevTotal)}</span></div>
                {acrescimoValor > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Acréscimo</span><span className="font-mono">+ {formatCurrency(acrescimoValor)}</span></div>
                )}
                {descontoValor > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="font-mono">- {formatCurrency(descontoValor)}</span></div>
                )}
                <div className="flex justify-between border-t pt-1 font-semibold"><span>Total da fatura</span><span className="font-mono">{formatCurrency(totalLiquido)}</span></div>

                <div className="border-t pt-1.5 mt-1 space-y-0.5">
                  {condicaoPagamento === "avista" ? (
                    <p className="font-medium">À vista — vencimento em {formatDateBR(dataEmissaoEdit)}</p>
                  ) : condicaoPagamento === "unico" ? (
                    <p className="font-medium">Pagamento único — vencimento em {formatDateBR(dataVencimentoUnico)}</p>
                  ) : (
                    <>
                      <p className="font-medium">
                        {parcelasCustomAtivo
                          ? `${parcelasCustom.length}x com valores personalizados`
                          : `${numParcelas}x de ${formatCurrency(totalLiquido / numParcelas)} · prazo de ${intervaloDias} dias`}
                      </p>
                      <div className="max-h-24 overflow-y-auto space-y-0.5 pt-1">
                        {(parcelasCustomAtivo
                          ? parcelasCustom.map((p, i) => ({
                              label: `Parcela ${i + 1}/${parcelasCustom.length} — ${p.data_vencimento ? formatDateBR(p.data_vencimento) : "—"}`,
                              valor: Number(unmaskCurrency(p.valor) || 0),
                            }))
                          : Array.from({ length: numParcelas }).map((_, i) => {
                              const base = new Date(`${dataEmissaoEdit}T12:00:00`);
                              base.setDate(base.getDate() + (i + 1) * intervaloDias);
                              const unit = Math.trunc((totalLiquido / numParcelas) * 100) / 100;
                              return {
                                label: `Parcela ${i + 1}/${numParcelas} — ${base.toLocaleDateString("pt-BR")}`,
                                valor: i === numParcelas - 1 ? totalLiquido - unit * (numParcelas - 1) : unit,
                              };
                            })
                        ).map((row, i) => (
                          <div key={i} className="flex justify-between text-muted-foreground">
                            <span>{row.label}</span>
                            <span className="font-mono">{formatCurrency(row.valor)}</span>
                          </div>
                        ))}
                      </div>

                    </>
                  )}
                </div>
              </div>


              <div className="flex gap-2">
                {!editingFaturaId && (
                  <Button variant="outline" onClick={() => setStep("client")} className="flex-1">Voltar</Button>
                )}
                <Button variant="outline" onClick={() => setNewDialogOpen(false)} className="flex-1">Cancelar</Button>
                <Button onClick={() => handleCreateOrUpdateInvoice()} className="flex-1" disabled={saving || selectedPrevIds.size === 0}>
                  {saving ? "Salvando..." : editingFaturaId ? "Salvar Alterações" : "Confirmar Fatura"}
                </Button>

              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog - per-title with partial support */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recebimento da Fatura</DialogTitle>

          </DialogHeader>
          {receiveFatura && (
            <div className="space-y-3">
              {(() => {
                const totalFatura = Number(receiveFatura.valor_total);
                const recebido = receiveContas.reduce((s, c) => s + Number(c.valor_recebido || 0), 0);
                const saldo = Math.max(0, +(receiveContas.reduce((s, c) => s + Number(c.valor), 0) - recebido).toFixed(2));
                return (
                  <>
                    <div className="text-xs text-muted-foreground p-2 rounded bg-muted/30 border">
                      <p>Cliente: <strong className="text-foreground">{receiveFatura.cliente_nome}</strong></p>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div><span className="block">Valor da fatura</span><strong className="text-foreground font-mono">{formatCurrency(totalFatura)}</strong></div>
                        <div><span className="block">Recebido</span><strong className="text-green-600 font-mono">{formatCurrency(recebido)}</strong></div>
                        <div><span className="block">Saldo</span><strong className={`font-mono ${saldo > 0 ? "text-amber-600" : "text-green-600"}`}>{formatCurrency(saldo)}</strong></div>
                      </div>
                    </div>

                    {saldo > 0.005 && (() => {
                      const contaSel = receiveContas.find(c => c.id === receiveContaId);
                      const saldoTitulo = contaSel ? +(Number(contaSel.valor) - Number(contaSel.valor_recebido || 0)).toFixed(2) : 0;
                      const aPagar = saldoTitulo;
                      return (
                      <div className="border rounded-md p-3 space-y-2">
                        <p className="text-xs font-semibold">Lançar pagamento</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Parcela que está sendo quitada</Label>
                            <Select
                              value={receiveContaId}
                              onValueChange={(v) => {
                                setReceiveContaId(v);
                                const c = receiveContas.find(x => x.id === v);
                                const s = c ? +(Number(c.valor) - Number(c.valor_recebido || 0)).toFixed(2) : 0;
                                setBaixaValor(String(s));
                              }}
                            >
                              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione a parcela" /></SelectTrigger>
                              <SelectContent>
                                {receiveContas.map((c, i) => {
                                  const s = +(Number(c.valor) - Number(c.valor_recebido || 0)).toFixed(2);
                                  return (
                                    <SelectItem key={c.id} value={c.id} disabled={s <= 0.005}>
                                      {`Parcela ${i + 1}/${receiveContas.length} — venc. ${formatDateBR(c.data_vencimento)} — ${s > 0.005 ? `saldo ${formatCurrency(s)}` : "quitada"}`}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Data</Label>
                            <Input type="date" className="h-9 text-xs" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Forma de pagamento</Label>
                          <Select value={receiveForma} onValueChange={setReceiveForma}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["pix", "boleto", "transferencia", "ted", "dinheiro", "cheque", "cartao_credito", "cartao_debito"].map(v => (
                                <SelectItem key={v} value={v}>{v === "pix" ? "PIX" : v === "ted" ? "TED" : v.charAt(0).toUpperCase() + v.slice(1).replace("_", " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex justify-between text-[11px] text-muted-foreground border-t pt-2">
                          <span>Saldo da parcela: <strong className="font-mono text-foreground">{formatCurrency(saldoTitulo)}</strong></span>
                          <span>Total a receber: <strong className="font-mono text-foreground">{formatCurrency(Math.max(0, aPagar))}</strong></span>
                        </div>

                        <Button
                          className="w-full bg-green-600 hover:bg-green-700 text-white h-9"
                          disabled={receiveSaving || !receiveContaId}
                          onClick={handleBaixaParcialFatura}
                        >
                          <HandCoins className="h-4 w-4 mr-1" />
                          {receiveSaving ? "Registrando..." : "Registrar pagamento"}
                        </Button>
                      </div>
                      );
                    })()}

                  </>
                );
              })()}


              <div>
                <p className="text-xs font-semibold mb-1.5">Títulos ({receiveContas.length})</p>
                <div className="border rounded">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs h-8">Vencimento</TableHead>
                        <TableHead className="text-xs h-8 text-right">Valor</TableHead>
                        <TableHead className="text-xs h-8 text-right">Recebido</TableHead>
                        <TableHead className="text-xs h-8 text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiveContas.map((c) => {
                        const recebido = Number(c.valor_recebido || 0);
                        const isParcial = c.status !== "recebido" && recebido > 0;
                        const label = c.status === "recebido"
                          ? "Recebido"
                          : isParcial
                            ? "Parcial"
                            : c.status === "atrasado" ? "Atrasado" : "Aberto";
                        const variant: any = c.status === "recebido"
                          ? "default"
                          : isParcial ? "secondary"
                          : c.status === "atrasado" ? "destructive" : "outline";
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-xs py-1.5">{formatDateBR(c.data_vencimento)}</TableCell>
                            <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                            <TableCell className={`text-xs py-1.5 text-right font-mono ${isParcial ? "text-amber-600" : "text-muted-foreground"}`}>
                              {recebido > 0 ? formatCurrency(recebido) : "—"}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-center">
                              <Badge variant={variant} className="text-[10px]">{label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setReceiveDialogOpen(false)}>Fechar</Button>
              </div>
            </div>

          )}
        </DialogContent>
      </Dialog>


      {ConfirmDialog}
    </div>
  );
}
