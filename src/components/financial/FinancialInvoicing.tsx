import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { FileText, CheckCircle2, Clock, Eye, DollarSign, Plus, HandCoins, Pencil, Trash2, Printer } from "lucide-react";
import { getLocalDateISO } from "@/lib/date";
import { formatCurrency } from "@/lib/masks";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateBR } from "@/lib/date";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

interface Fatura {
  id: string;
  cliente_id: string;
  valor_total: number;
  num_parcelas: number;
  intervalo_dias: number;
  status: string;
  data_emissao: string;
  created_at: string;
  cliente_nome?: string;
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
  };
}

interface ContaReceber {
  id: string;
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

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  faturada: { label: "Faturada", variant: "default" },
  paga: { label: "Paga", variant: "secondary" },
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
  const [detailContas, setDetailContas] = useState<ContaReceber[]>([]);

  // New/Edit invoice dialog
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editingFaturaId, setEditingFaturaId] = useState<string | null>(null);
  const [step, setStep] = useState<"client" | "preview">("client");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientPrevisoes, setClientPrevisoes] = useState<Previsao[]>([]);
  const [selectedPrevIds, setSelectedPrevIds] = useState<Set<string>>(new Set());
  const [condicaoPagamento, setCondicaoPagamento] = useState<"avista" | "unico" | "parcelado">("avista");
  const [numParcelas, setNumParcelas] = useState(1);
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [dataVencimentoUnico, setDataVencimentoUnico] = useState<string>(getLocalDateISO());
  const [saving, setSaving] = useState(false);

  // Receive dialog
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receiveFatura, setReceiveFatura] = useState<Fatura | null>(null);
  const [receiveContas, setReceiveContas] = useState<ContaReceber[]>([]);
  const [receiveDate, setReceiveDate] = useState<string>(getLocalDateISO());
  const [receiveForma, setReceiveForma] = useState("pix");
  const [receiveSaving, setReceiveSaving] = useState(false);

  useEffect(() => {
    fetchFaturas();
  }, []);

  const fetchFaturas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faturas_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar faturas");
      setLoading(false);
      return;
    }

    setFaturas(
      (data || []).map((f: any) => ({
        ...f,
        cliente_nome: f.profiles?.full_name || "—",
      }))
    );
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
      setDetailPrevisoes((prevData as Previsao[]) || []);
    } else {
      setDetailPrevisoes([]);
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
    setStep("client");
    setSelectedClientId("");
    setClientPrevisoes([]);
    setSelectedPrevIds(new Set());
    setCondicaoPagamento("avista");
    setNumParcelas(1);
    setIntervaloDias(30);
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
  const openEditInvoice = async (fatura: Fatura) => {
    // Only faturada can be edited (not paid)
    if (fatura.status === "paga") {
      toast.error("Faturas pagas não podem ser editadas");
      return;
    }

    setEditingFaturaId(fatura.id);
    setSelectedClientId(fatura.cliente_id);
    setCondicaoPagamento(fatura.num_parcelas === 1 ? "avista" : "parcelado");
    setNumParcelas(fatura.num_parcelas);
    setIntervaloDias(fatura.intervalo_dias);
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

  const effectiveParcelas = condicaoPagamento === "parcelado" ? numParcelas : 1;
  const effectiveIntervalo = condicaoPagamento === "parcelado" ? intervaloDias : 0;
  const effectiveDataEmissao = condicaoPagamento === "unico" ? dataVencimentoUnico : undefined;

  const handleCreateOrUpdateInvoice = async () => {
    const selectedItems = clientPrevisoes.filter((p) => selectedPrevIds.has(p.id));
    if (selectedItems.length === 0) return toast.error("Selecione ao menos uma previsão");
    setSaving(true);

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
          .update({
            valor_total: selectedPrevTotal,
            num_parcelas: effectiveParcelas,
            intervalo_dias: effectiveIntervalo,
            ...(effectiveDataEmissao ? { data_emissao: effectiveDataEmissao } : {}),
            status: "faturada" as any,
          })
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
            valor_total: selectedPrevTotal,
            num_parcelas: effectiveParcelas,
            intervalo_dias: effectiveIntervalo,
            ...(effectiveDataEmissao ? { data_emissao: effectiveDataEmissao } : {}),
            status: "faturada" as any,
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

      setNewDialogOpen(false);
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar fatura");
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
  const openReceive = async (fatura: Fatura) => {
    setReceiveFatura(fatura);
    setReceiveDate(getLocalDateISO());
    setReceiveForma("pix");

    const { data } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .in("status", ["aberto", "atrasado"])
      .order("data_vencimento", { ascending: true });

    setReceiveContas((data as ContaReceber[]) || []);
    setReceiveDialogOpen(true);
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
      fetchFaturas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao registrar recebimento");
    } finally {
      setReceiveSaving(false);
    }
  };

  // --- Print ---
  const handlePrintFatura = async (fatura: Fatura) => {
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

    // Load full client profile
    const { data: clienteProfile } = await supabase
      .from("profiles")
      .select("full_name, razao_social, cnpj, inscricao_estadual, email, phone, person_type, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_zip")
      .eq("id", fatura.cliente_id)
      .single();

    // Harvest details are now read from previsao.metadata (stored at creation time)
    // Fallback to harvest_jobs only for legacy previsões without metadata
    const colheitaPrevisoes = previsoes.filter(p => p.origem_tipo === "colheita");
    const legacyColheitaIds = colheitaPrevisoes.filter(p => !p.metadata?.fazenda).map(p => p.origem_id);
    let harvestJobs: Record<string, any> = {};
    if (legacyColheitaIds.length > 0) {
      const { data: hjData } = await supabase
        .from("harvest_jobs")
        .select("id, farm_name, location, harvest_period_start, harvest_period_end, payment_value, monthly_value")
        .in("id", [...new Set(legacyColheitaIds)]);
      if (hjData) {
        hjData.forEach((hj: any) => { harvestJobs[hj.id] = hj; });
      }
    }

    // Company info
    const companyName = unifiedLabel;
    const cnpjLines = unifiedCnpjLines.join("<br/>");
    const matriz = establishments.find(e => e.type === "matriz") || establishments[0];

    // Build company address from establishment
    let companyAddress = "";
    if (matriz) {
      const { data: estData } = await supabase
        .from("fiscal_establishments")
        .select("endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep")
        .eq("id", matriz.id)
        .single();
      if (estData) {
        const parts = [
          estData.endereco_logradouro,
          estData.endereco_numero ? `nº ${estData.endereco_numero}` : null,
          estData.endereco_bairro,
          estData.endereco_municipio && estData.endereco_uf ? `${estData.endereco_municipio}/${estData.endereco_uf}` : null,
          estData.endereco_cep ? `CEP: ${estData.endereco_cep}` : null,
        ].filter(Boolean);
        companyAddress = parts.join(", ");
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
        const hj = harvestJobs[p.origem_id]; // legacy fallback
        
        const fazenda = meta?.fazenda || hj?.farm_name || "—";
        const localizacao = meta?.localizacao || hj?.location || "—";
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

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Fatura ${fatura.id.slice(0,8).toUpperCase()}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1a1a2e;background:#fff;padding:40px 48px;font-size:13px;line-height:1.5}
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #1a1a2e;margin-bottom:24px}
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
.divider{border:none;border-top:1px dashed #e5e7eb;margin:10px 0}
@media print{body{padding:12px 16px;font-size:8px}@page{margin:8mm;size:portrait}table{font-size:7px}th{padding:3px 5px;font-size:7px}td{padding:3px 5px;font-size:9px}.header{margin-bottom:8px}.summary-box{padding:6px;gap:4px;margin-bottom:8px}.summary-item .value{font-size:11px}.divider{margin:6px 0}.footer{margin-top:10px;padding-top:6px}h2{font-size:11px;margin-bottom:4px}.section{margin-bottom:10px}.section-title{font-size:8px;margin-bottom:4px;padding-bottom:2px}.info-item label{font-size:8px}.info-item span{font-size:10px}.info-grid,.info-grid-3{gap:3px 16px}}
</style></head><body>

<div class="header">
  <div>
    <div class="company">${companyName}</div>
    <div class="company-sub">${cnpjLines}</div>
    ${companyAddress ? `<div class="company-addr">${companyAddress}</div>` : ""}
  </div>
  <div class="doc-info">
    <div class="doc-title">Fatura</div>
    <div class="doc-number">#${fatura.id.slice(0, 8).toUpperCase()}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:4px">${formatDateBR(fatura.data_emissao)}</div>
  </div>
</div>

<div class="summary-box">
  <div class="summary-item">
    <div class="value">${formatCurrency(Number(fatura.valor_total))}</div>
    <div class="label">Valor Total</div>
  </div>
  <div class="summary-item">
    <div class="value">${fatura.num_parcelas === 1 ? 'À Vista' : fatura.num_parcelas + 'x'}</div>
    <div class="label">Condição</div>
  </div>
  <div class="summary-item">
    <div class="value">${(STATUS_MAP[fatura.status] || STATUS_MAP.rascunho).label}</div>
    <div class="label">Status</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Dados do Cliente</div>
  <div class="info-grid">
    <div class="info-item"><label>${isJuridica ? "Razão Social" : "Nome"}</label><span>${clienteNomeDisplay}</span></div>
    <div class="info-item"><label>Tipo</label><span>${clientePersonType}</span></div>
    <div class="info-item"><label>${isJuridica ? "CNPJ" : "CPF"}</label><span>${clienteCnpj}</span></div>
    <div class="info-item"><label>Inscrição Estadual</label><span>${clienteIE}</span></div>
    <div class="info-item"><label>E-mail</label><span>${clienteEmail}</span></div>
    <div class="info-item"><label>Telefone</label><span>${clientePhone}</span></div>
    <div class="info-item info-item-full"><label>Endereço</label><span>${clienteAddress}</span></div>
  </div>
</div>

${harvestDetailsHtml}

${previsoes.length > 0 ? `
<div class="section">
  <div class="section-title">Previsões Vinculadas (${previsoes.length})</div>
  <table>
    <thead><tr><th>Origem</th><th>Descrição</th><th>Período Faturado</th><th class="text-right">Valor</th></tr></thead>
    <tbody>
      ${previsoes.map(p => {
        const meta = p.metadata as Previsao["metadata"];
        const hj = harvestJobs[p.origem_id];
        const fazenda = meta?.fazenda || hj?.farm_name || "";
        const periodoInicio = meta?.periodo_inicio || hj?.harvest_period_start;
        const periodoFim = meta?.periodo_fim || hj?.harvest_period_end;
        const descricao = p.origem_tipo === "cte"
          ? "Conhecimento de Transporte"
          : fazenda
            ? `Colheita — ${fazenda}`
            : "Colheita";
        const periodoStr = periodoInicio && periodoFim
          ? `${formatDateBR(periodoInicio)} a ${formatDateBR(periodoFim)}`
          : formatDateBR(p.data_prevista);
        return `<tr>
          <td><span class="badge" style="background:#f0f9ff;color:#0369a1">${p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</span></td>
          <td style="font-size:11px">${descricao}</td>
          <td>${periodoStr}</td>
          <td class="text-right mono">${formatCurrency(Number(p.valor))}</td>
        </tr>`;
      }).join("")}
      <tr class="total-row">
        <td colspan="3">Total</td>
        <td class="text-right mono">${formatCurrency(previsoes.reduce((s, p) => s + Number(p.valor), 0))}</td>
      </tr>
    </tbody>
  </table>
</div>
` : ""}

<div class="section">
  <div class="section-title">Parcelas / Contas a Receber (${contas.length})</div>
  <table>
    <thead><tr><th>#</th><th>Vencimento</th><th class="text-right">Valor</th><th class="text-center">Status</th><th>Recebimento</th></tr></thead>
    <tbody>
      ${contas.map((c, i) => {
        const badgeClass = c.status === "recebido" ? "badge-received" : c.status === "atrasado" ? "badge-late" : "badge-open";
        const statusLabel = c.status === "recebido" ? "Recebido" : c.status === "atrasado" ? "Atrasado" : "Aberto";
        return `<tr>
          <td>${i + 1}</td>
          <td>${formatDateBR(c.data_vencimento)}</td>
          <td class="text-right mono">${formatCurrency(Number(c.valor))}</td>
          <td class="text-center"><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td>${c.data_recebimento ? formatDateBR(c.data_recebimento) : "—"}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>
</div>

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Faturamento</h1>
        <Button onClick={openNewInvoice} className="gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" />
          Nova Fatura
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={FileText} label="Total de Faturas" value={faturas.length} />
        <SummaryCard icon={DollarSign} label="Valor Faturado" value={formatCurrency(totalFaturado)} valueColor="green" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : faturas.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma fatura encontrada.</p>
            <p className="text-muted-foreground text-xs mt-1">Clique em "Nova Fatura" para criar.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {faturas.map((f) => {
            const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
            return (
              <Card key={f.id}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{f.cliente_nome}</p>
                    <Badge variant={st.variant} className="text-[10px] shrink-0">{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {formatDateBR(f.data_emissao)} · {f.num_parcelas === 1 ? "À vista" : `${f.num_parcelas}x`}
                    </span>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(Number(f.valor_total))}</span>
                  </div>
                  <div className="flex gap-1.5 pt-1 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => openDetail(f)} className="gap-1 h-7 text-xs flex-1">
                      <Eye className="h-3 w-3" /> Detalhes
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handlePrintFatura(f)} className="gap-1 h-7 text-xs">
                      <Printer className="h-3 w-3" />
                    </Button>
                    {f.status !== "paga" && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => openEditInvoice(f)} className="gap-1 h-7 text-xs">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteFatura(f)} className="gap-1 h-7 text-xs text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                    {hasPendingContas(f) && (
                      <Button variant="outline" size="sm" onClick={() => openReceive(f)} className="gap-1 h-7 text-xs flex-1">
                        <HandCoins className="h-3 w-3" /> Receber
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Emissão</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Cliente</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Valor</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Condição</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {faturas.map((f) => {
                    const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
                    return (
                      <tr key={f.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs">{formatDateBR(f.data_emissao)}</td>
                        <td className="px-4 py-2.5 text-xs font-medium">{f.cliente_nome}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold">{formatCurrency(Number(f.valor_total))}</td>
                        <td className="px-4 py-2.5 text-center text-xs">
                          {f.num_parcelas === 1 ? "À vista" : `${f.num_parcelas}x (${f.intervalo_dias}d)`}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(f)} title="Detalhes">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handlePrintFatura(f)} title="Imprimir">
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {f.status !== "paga" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditInvoice(f)} title="Editar">
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteFatura(f)} title="Excluir">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {hasPendingContas(f) && (
                              <Button variant="outline" size="sm" onClick={() => openReceive(f)} className="gap-1 h-7 text-xs">
                                <HandCoins className="h-3 w-3" /> Receber
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Fatura</DialogTitle>
          </DialogHeader>
          {selectedFatura && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{selectedFatura.cliente_nome}</strong></div>
                <div><span className="text-muted-foreground">Emissão:</span> <strong>{formatDateBR(selectedFatura.data_emissao)}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong>{formatCurrency(Number(selectedFatura.valor_total))}</strong></div>
                <div><span className="text-muted-foreground">Condição:</span> <strong>{selectedFatura.num_parcelas === 1 ? "À vista" : `${selectedFatura.num_parcelas}x (a cada ${selectedFatura.intervalo_dias} dias)`}</strong></div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Previsões Vinculadas ({detailPrevisoes.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead>Data Prevista</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPrevisoes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">
                            <Badge variant="outline">{p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{formatDateBR(p.data_prevista)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                        </TableRow>
                      ))}
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
        <DialogContent className="max-w-lg">
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
                        <TableCell className="text-xs">{p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</TableCell>
                        <TableCell className="text-xs">{formatDateBR(p.data_prevista)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="text-sm text-muted-foreground">
                Selecionadas: <strong className="text-foreground">{selectedPrevIds.size}</strong> |
                Total: <strong className="text-foreground">{formatCurrency(selectedPrevTotal)}</strong>
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
                      setDataVencimentoUnico(getLocalDateISO());
                    } else {
                      setNumParcelas(2);
                      setIntervaloDias(30);
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

                {condicaoPagamento === "parcelado" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nº de Parcelas</Label>
                      <Input
                        type="number"
                        min={2}
                        max={48}
                        value={numParcelas}
                        onChange={(e) => setNumParcelas(Math.max(2, Number(e.target.value)))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Intervalo entre parcelas</Label>
                      <Select value={String(intervaloDias)} onValueChange={(v) => setIntervaloDias(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INTERVALO_PRESETS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary preview */}
              <div className="text-xs border rounded p-3 bg-muted/30 space-y-1">
                {condicaoPagamento === "avista" ? (
                  <p className="font-medium">À vista — vencimento na data de emissão</p>
                ) : condicaoPagamento === "unico" ? (
                  <p className="font-medium">Pagamento único — vencimento em {formatDateBR(dataVencimentoUnico)}</p>
                ) : (
                  <>
                    <p className="font-medium">{numParcelas}x de {formatCurrency(selectedPrevTotal / numParcelas)}</p>
                    <p className="text-muted-foreground">Intervalo de {intervaloDias} dias entre parcelas</p>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                {!editingFaturaId && (
                  <Button variant="outline" onClick={() => setStep("client")} className="flex-1">Voltar</Button>
                )}
                <Button onClick={handleCreateOrUpdateInvoice} className={cn("flex-1", editingFaturaId && "w-full")} disabled={saving || selectedPrevIds.size === 0}>
                  {saving ? "Salvando..." : editingFaturaId ? "Salvar Alterações" : "Confirmar Fatura"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receive Dialog */}
      <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento</DialogTitle>
          </DialogHeader>
          {receiveFatura && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p>Cliente: <strong className="text-foreground">{receiveFatura.cliente_nome}</strong></p>
                <p>Valor da fatura: <strong className="text-foreground">{formatCurrency(Number(receiveFatura.valor_total))}</strong></p>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1">Títulos pendentes ({receiveContas.length})</p>
                <div className="border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiveContas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{formatDateBR(c.data_vencimento)}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant={c.status === "atrasado" ? "destructive" : "outline"}>
                              {c.status === "atrasado" ? "Atrasado" : "Aberto"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Data do Recebimento</Label>
                  <Input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
                </div>
                <div>
                  <Label>Forma de Recebimento</Label>
                  <Select value={receiveForma} onValueChange={setReceiveForma}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FORMA_RECEBIMENTO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={handleReceiveAll} className="w-full" disabled={receiveSaving || receiveContas.length === 0}>
                {receiveSaving ? "Processando..." : `Receber ${receiveContas.length} título(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
