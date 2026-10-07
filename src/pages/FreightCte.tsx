import { PageTitle } from "@/components/PageTitle";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { useEffect, useState } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Search, FileText, FileCheck2, FileCog, Trash2, Pencil, AlertTriangle, Eye, Printer, Loader2, Upload, FileDown, type LucideIcon } from "lucide-react";
import { SefazIcon } from "@/components/icons/SefazIcon";
import { MdfeIcon } from "@/components/icons/MdfeIcon";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDateBR, normalizeDateInput } from "@/lib/date";
import { limitDisplayText } from "@/lib/displayText";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { cancelarCte } from "@/services/fiscal";
import { CteFormDialog } from "@/components/freight/CteFormDialog";
import { CteServicoFormDialog } from "@/components/freight/CteServicoFormDialog";
import { CteDetailDialog } from "@/components/freight/CteDetailDialog";
import { CteXmlBatchImportDialog } from "@/components/freight/CteXmlBatchImportDialog";
import { CteServicoResumoImportDialog } from "@/components/freight/CteServicoResumoImportDialog";
import { CteInconsistencyDialog } from "@/components/freight/CteInconsistencyDialog";
import { useSortableTable } from "@/hooks/useSortableTable";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { openPrintWindow } from "@/components/freight/freightContractPrint";
import { buildDactePdf } from "@/components/freight/dactePdf";
import { cteXmlToPrintFields } from "@/lib/cteXmlToPrint";
import { CteSefazDialog } from "@/components/freight/CteSefazDialog";
import { PeriodFilter } from "@/components/PeriodFilter";
import { emitirCteViaFocus } from "@/services/fiscal/focusCteService";
import { FilterPrimaryRow, SearchFilterCard } from "@/components/ui/search-filter-card";
import { EmpresaFilter } from "@/components/financial/EmpresaControls";


// Colunas da listagem: exclui xml_enviado/xml_autorizado (grandes) — a edição busca a linha completa por id.
export const CTE_LIST_COLUMNS = "id,numero,serie,chave_acesso,protocolo_autorizacao,status,tomador_id,remetente_nome,remetente_cnpj,remetente_ie,remetente_endereco,remetente_municipio_ibge,remetente_uf,destinatario_nome,destinatario_cnpj,destinatario_ie,destinatario_endereco,destinatario_municipio_ibge,destinatario_uf,valor_frete,valor_carga,base_calculo_icms,aliquota_icms,valor_icms,cst_icms,cfop,natureza_operacao,municipio_origem_ibge,municipio_origem_nome,uf_origem,municipio_destino_ibge,municipio_destino_nome,uf_destino,placa_veiculo,rntrc,motorista_id,veiculo_id,produto_predominante,peso_bruto,motivo_rejeicao,data_emissao,data_autorizacao,observacoes,created_by,created_at,updated_at,establishment_id,expedidor_nome,expedidor_cnpj,expedidor_ie,expedidor_endereco,expedidor_municipio_ibge,expedidor_uf,recebedor_nome,recebedor_cnpj,recebedor_ie,recebedor_endereco,recebedor_municipio_ibge,recebedor_uf,tomador_tipo,tomador_nome,tomador_cnpj,tomador_ie,tomador_endereco,tomador_municipio_ibge,tomador_uf,ind_ie_toma,tp_cte,tp_serv,modal,retira,valor_receber,valor_total_tributos,valor_carga_averb,chaves_nfe_ref,componentes_frete,info_quantidade,municipio_envio_ibge,municipio_envio_nome,uf_envio,tipo_talao,numero_interno,data_carregamento,valor_tonelada,desconto,motorista_nome,ibs_cbs_cst,ibs_cbs_class_trib,ibs_uf_aliquota,ibs_uf_valor,ibs_mun_aliquota,ibs_mun_valor,cbs_aliquota,cbs_valor,ibs_cbs_base_calculo,seguro_responsavel,seguradora_nome,seguradora_cnpj,apolice_numero,averbacao_numero,nfe_detalhes,outros_documentos,reboque1_placa,reboque2_placa,contratado_id,contratado_nome,contratado_documento,previsao_saida,previsao_chegada,lotacao,pedido_numero,valor_pedagio,numero_eixos,gerar_previsao,composicao_frete,frete_minimo,chave_cte_subcontratacao,percentual_reducao_bc,tenant_id";

export interface Cte {
  id: string;
  numero: number | null;
  serie: number;
  chave_acesso: string | null;
  protocolo_autorizacao: string | null;
  status: string;
  tomador_id: string | null;
  remetente_nome: string;
  destinatario_nome: string;
  valor_frete: number;
  cfop: string;
  natureza_operacao: string;
  municipio_origem_nome: string | null;
  uf_origem: string | null;
  municipio_destino_nome: string | null;
  uf_destino: string | null;
  placa_veiculo: string | null;
  motorista_id: string | null;
  data_emissao: string | null;
  data_autorizacao: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  tipo_talao?: string;
  numero_interno?: number | null;
  data_carregamento?: string | null;
  valor_tonelada?: number | null;
  [key: string]: any;
}

const statusColors: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  autorizado: "bg-emerald-500/10 text-emerald-600",
  cancelado: "bg-destructive/10 text-destructive",
  rejeitado: "bg-amber-500/10 text-amber-600",
};

const statusLabels: Record<string, string> = {
  rascunho: "Rascunho",
  autorizado: "Autorizado",
  cancelado: "Cancelado",
  rejeitado: "Rejeitado",
};

export default function FreightCte() {
  const [ctes, setCtes] = useState<Cte[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "producao" | "servico">("todos");
  const [empresa, setEmpresa] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [chooserOpen, setChooserOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [servicoOpen, setServicoOpen] = useState(false);
  const [resumoOpen, setResumoOpen] = useState(false);
  const [inconsistencyOpen, setInconsistencyOpen] = useState(false);
  const [xmlBatchOpen, setXmlBatchOpen] = useState(false);
  const [inconsistencyFocus, setInconsistencyFocus] = useState<string[]>([]);
  
  
  const [editingCte, setEditingCte] = useState<Cte | null>(null);
  const [detailCte, setDetailCte] = useState<Cte | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [printing] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [sefazOpen, setSefazOpen] = useState(false);
  const handleDownloadDacte = async (cteId: string) => {
    const { data, error } = await supabase.from("ctes").select("*").eq("id", cteId).single();
    if (error || !data) throw new Error(error?.message || "CT-e não encontrado");
    // CT-e com XML guardado (ex.: importado): o modelo padrão é preenchido pelo próprio XML, sem consultar a Focus.
    const fromXml = cteXmlToPrintFields((data as any).xml_autorizado);
    const input = fromXml ? { ...(data as any), ...fromXml, status: (data as any).status } : (data as any);
    const num = input.numero ?? input.numero_interno ?? "";
    const pdf = await buildDactePdf([input]);
    // Download direto, sem prévia: o clique no botão SEFAZ é gesto do usuário, então o navegador não bloqueia.
    const url = URL.createObjectURL(pdf.output("blob"));
    const a = document.createElement("a");
    a.href = url;
    a.download = `DACTE-${num || cteId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handlePrintSelected = () => {
    const list = sorted.filter((c) => selectedIds.has(c.id));
    if (!list.length) return;
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
    const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const total = list.reduce((s, c) => s + Number(c.valor_frete || 0), 0);
    const rows = list.map((c) => `<tr><td>${esc(c.tipo_talao === "servico" ? c.numero_interno : c.numero)}</td><td>${c.tipo_talao === "servico" ? "Serviço" : "Produção"}</td><td>${esc(formatDateBR(getEmissaoDate(c)))}</td><td>${esc(getClienteTomador(c))}</td><td>${esc(c.municipio_origem_nome || "")}${c.uf_origem ? "/" + esc(c.uf_origem) : ""} → ${esc(c.municipio_destino_nome || "")}${c.uf_destino ? "/" + esc(c.uf_destino) : ""}</td><td>${esc(c.placa_veiculo || "—")}</td><td class="r">${brl(Number(c.valor_frete || 0))}</td><td>${esc(c.tipo_talao === "servico" ? "Interno" : statusLabels[c.status] || c.status)}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relação de CT-es</title><style>
@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:10px;color:#111}h1{font-size:14px;margin:0 0 4px}
p{margin:0 0 8px;color:#555}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 5px;text-align:left}
th{background:#eee}.r{text-align:right}tfoot td{font-weight:bold}</style></head><body>
<h1>Relação de CT-es</h1><p>${list.length} CT-e(s) · Emitido em ${new Date().toLocaleString("pt-BR")}</p>
<table><thead><tr><th>Nº</th><th>Talão</th><th>Emissão</th><th>Cliente</th><th>Rota</th><th>Placa</th><th class="r">Valor</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody><tfoot><tr><td colspan="6">Total</td><td class="r">${brl(total)}</td><td></td></tr></tfoot></table></body></html>`;
    openPrintWindow(html);
  };

  useEffect(() => {
    fetchCtes();
  }, []);

  const fetchCtes = async () => {
    try {
      const { data, error } = await supabase
        .from("ctes")
        .select(CTE_LIST_COLUMNS)
        .order("data_emissao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCtes((data as any[]) || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getEmissaoDate = (c: Cte) => c.data_emissao || c.created_at;

  const getClienteTomador = (c: Cte) => {
    if (c.tomador_nome) return c.tomador_nome;

    switch (Number(c.tomador_tipo)) {
      case 0:
        return c.remetente_nome || "";
      case 1:
        return c.expedidor_nome || "";
      case 2:
        return c.recebedor_nome || "";
      case 3:
        return c.destinatario_nome || "";
      default:
        return c.remetente_nome || c.destinatario_nome || "";
    }
  };

  const filtered = ctes.filter((c) => {
    const isServico = c.tipo_talao === "servico";
    if (tipoFilter === "producao" && isServico) return false;
    if (tipoFilter === "servico" && !isServico) return false;
    if (empresa && c.establishment_id !== empresa) return false;

    const emissao = normalizeDateInput(getEmissaoDate(c));
    if (dateFrom && (!emissao || emissao < dateFrom)) return false;
    if (dateTo && (!emissao || emissao > dateTo)) return false;

    const q = search.toLowerCase();
    return (
      !q ||
      c.tomador_nome?.toLowerCase().includes(q) ||
      c.remetente_nome?.toLowerCase().includes(q) ||
      c.expedidor_nome?.toLowerCase().includes(q) ||
      c.recebedor_nome?.toLowerCase().includes(q) ||
      c.destinatario_nome?.toLowerCase().includes(q) ||
      String(c.numero).includes(q) ||
      String(c.numero_interno).includes(q) ||
      c.chave_acesso?.includes(q) ||
      c.placa_veiculo?.toLowerCase().includes(q)
    );
  });

  type CteSortKey = "numero" | "talao" | "data" | "cliente" | "placa" | "valor" | "status";
  const { sort, toggle, sorted } = useSortableTable<Cte, CteSortKey>(
    filtered,
    { key: "data", direction: "desc" },
    {
      numero: (c) => (c.tipo_talao === "servico" ? c.numero_interno ?? 0 : c.numero ?? 0),
      talao: (c) => (c.tipo_talao === "servico" ? "Serviço" : "Produção"),
      data: (c) => getEmissaoDate(c) || "",
      cliente: getClienteTomador,
      placa: (c) => c.placa_veiculo || "",
      valor: (c) => Number(c.valor_frete) || 0,
      status: (c) => (c.tipo_talao === "servico" ? "interno" : c.status),
    },
  );

  const handleNew = () => {
    setEditingCte(null);
    setChooserOpen(true);
  };

  const handlePickProducao = () => {
    setChooserOpen(false);
    setFormOpen(true);
  };

  const handlePickServico = () => {
    setChooserOpen(false);
    setServicoOpen(true);
  };

  const handleEdit = async (cte: Cte) => {
    // A listagem não traz os XMLs: busca a linha completa antes de abrir o formulário.
    try {
      const { data } = await supabase.from("ctes").select("*").eq("id", cte.id).single();
      if (data) cte = data as Cte;
    } catch { /* usa o objeto da listagem */ }
    setEditingCte(cte);
    if (cte.tipo_talao === "servico") {
      setServicoOpen(true);
    } else {
      setFormOpen(true);
    }
  };

  // Remove contrato de frete vinculado + despesa pendente antes de excluir o CT-e.
  // O FK em freight_contracts.cte_id é ON DELETE CASCADE, mas a expense (FK SET NULL)
  // ficaria órfã. Aqui garantimos limpeza completa.
  const removeLinkedFreightContract = async (cteId: string) => {
    const { data: contracts } = await supabase
      .from("freight_contracts")
      .select("id, expense_id")
      .eq("cte_id", cteId);
    const expenseIds = (contracts || []).map((c: any) => c.expense_id).filter(Boolean);
    const contractIds = (contracts || []).map((c: any) => c.id);
    if (contractIds.length) {
      await supabase.from("freight_contracts").delete().in("id", contractIds);
    }
    if (expenseIds.length) {
      await supabase.from("expenses").delete().in("id", expenseIds).in("status", ["pendente", "atrasado"]);
    }
    return contractIds.length;
  };

  const handleDelete = async (cte: Cte) => {
    const isServico = cte.tipo_talao === "servico";
    const isAutorizado = cte.status === "autorizado" && !!cte.chave_acesso && !!cte.protocolo_autorizacao;

    // Bloqueia exclusão se a previsão deste CT-e já foi vinculada a uma fatura
    const { data: prevs } = await supabase
      .from("previsoes_recebimento")
      .select("id, status, fatura_previsoes(fatura_id, faturas_recebimento(numero, status))")
      .eq("origem_tipo", "cte")
      .eq("origem_id", cte.id);
    const invoiced = (prevs || []).find((p: any) => (p.fatura_previsoes?.length ?? 0) > 0);
    if (invoiced) {
      const f = (invoiced as any).fatura_previsoes[0]?.faturas_recebimento;
      toast({
        title: "Exclusão bloqueada",
        description: `Este CT-e está vinculado à Fatura nº ${f?.numero ?? "?"} (status: ${f?.status ?? "?"}). Estorne os recebimentos e desvincule/exclua a fatura antes de excluir o CT-e.`,
        variant: "destructive",
      });
      return;
    }


    // Verifica contrato vinculado para informar no diálogo
    const { count: linkedContracts } = await supabase
      .from("freight_contracts")
      .select("id", { count: "exact", head: true })
      .eq("cte_id", cte.id);
    const contractWarning = linkedContracts && linkedContracts > 0
      ? `\n\n⚠️ Há ${linkedContracts} contrato(s) de frete vinculado(s) que também será(ão) excluído(s) (e sua(s) conta(s) a pagar pendente(s)).`
      : "";


    // CT-e de Produção AUTORIZADO → precisa cancelar na SEFAZ antes
    if (!isServico && isAutorizado) {
      const ok = await confirm({
        title: "Cancelar CT-e na SEFAZ e excluir",
        description:
          `Este CT-e (Nº ${cte.numero}) está autorizado pela SEFAZ.\n\n` +
          `Será solicitado o CANCELAMENTO oficial na SEFAZ e, em seguida, o registro será excluído do sistema.\n\n` +
          `Esta operação é IRREVERSÍVEL. Deseja continuar?` + contractWarning,

        confirmLabel: "Cancelar na SEFAZ e excluir",
        variant: "destructive",
      });
      if (!ok) return;

      const justificativa = window.prompt(
        "Justificativa para cancelamento na SEFAZ (mínimo 15 caracteres):",
        "Cancelamento solicitado pelo emitente"
      );
      if (!justificativa) return;
      if (justificativa.trim().length < 15) {
        toast({
          title: "Justificativa inválida",
          description: "A SEFAZ exige no mínimo 15 caracteres.",
          variant: "destructive",
        });
        return;
      }

      setDeletingId(cte.id);
      try {
        const resp = await cancelarCte(
          cte.id,
          cte.chave_acesso!,
          cte.protocolo_autorizacao!,
          justificativa.trim(),
          user?.id || "",
          cte.establishment_id
        );
        if (!resp.success) {
          toast({
            title: "Falha no cancelamento SEFAZ",
            description: resp.motivo_rejeicao || "Não foi possível cancelar o CT-e na SEFAZ. Exclusão abortada.",
            variant: "destructive",
          });
          return;
        }
        // Cancelado com sucesso → excluir contrato vinculado + CT-e
        const removed = await removeLinkedFreightContract(cte.id);
        const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
        if (error) throw error;
        toast({ title: "CT-e cancelado e excluído", description: `Nº ${cte.numero} removido${removed ? ` (e ${removed} contrato de frete vinculado).` : "."}` });

        fetchCtes();
      } catch (err: any) {
        toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
      } finally {
        setDeletingId(null);
      }
      return;
    }

    // Serviço, rascunho, rejeitado, erro ou cancelado → exclusão direta
    const ok = await confirm({
      title: "Excluir CT-e",
      description: (isServico
        ? `Excluir definitivamente este talão de serviço?\n\nEsta ação não pode ser desfeita.`
        : `Este CT-e não foi autorizado pela SEFAZ (status: ${cte.status}). Excluir definitivamente?\n\nEsta ação não pode ser desfeita.`) + contractWarning,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingId(cte.id);
    try {
      const removed = await removeLinkedFreightContract(cte.id);
      const { error } = await supabase.from("ctes").delete().eq("id", cte.id);
      if (error) throw error;
      toast({ title: "CT-e excluído", description: removed ? `Registro removido (e ${removed} contrato de frete vinculado).` : "Registro removido com sucesso." });
      fetchCtes();

    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Seleção em lote ──────────────────────────────────────
  const isBulkDeletable = (c: Cte) =>
    c.tipo_talao === "servico" || c.status !== "autorizado";

  const selectableIds = sorted.filter(isBulkDeletable).map((c) => c.id);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds).filter((id) =>
      sorted.some((c) => c.id === id && isBulkDeletable(c)),
    );
    if (!ids.length) return;

    // Bloqueia CT-es já vinculados a faturas
    const { data: prevs } = await supabase
      .from("previsoes_recebimento")
      .select("origem_id, fatura_previsoes(fatura_id)")
      .eq("origem_tipo", "cte")
      .in("origem_id", ids);
    const blocked = new Set(
      (prevs || [])
        .filter((p: any) => (p.fatura_previsoes?.length ?? 0) > 0)
        .map((p: any) => p.origem_id as string),
    );
    const deletable = ids.filter((id) => !blocked.has(id));

    if (!deletable.length) {
      toast({
        title: "Exclusão bloqueada",
        description: "Todos os CT-es selecionados estão vinculados a faturas. Desvincule-os antes de excluir.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirm({
      title: "Excluir CT-es selecionados",
      description:
        `Confirma excluir ${deletable.length} CT-e(s) e seus contratos de frete vinculados (e contas a pagar pendentes)?` +
        (blocked.size ? `\n\n⚠️ ${blocked.size} CT-e(s) serão ignorados por estarem vinculados a faturas.` : "") +
        "\n\nEsta ação é irreversível.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;

    setBulkDeleting(true);
    let okCount = 0;
    const errors: string[] = [];
    try {
      for (const id of deletable) {
        try {
          await removeLinkedFreightContract(id);
          const { error } = await supabase.from("ctes").delete().eq("id", id);
          if (error) throw error;
          okCount++;
        } catch (err: any) {
          errors.push(`${id.slice(0, 8)}: ${err.message}`);
        }
      }
      toast({
        title: errors.length ? "Concluído com erros" : "CT-es excluídos",
        description: `${okCount} CT-e(s) excluído(s).${errors.length ? "\n" + errors.slice(0, 3).join("\n") : ""}`,
        variant: errors.length ? "destructive" : "default",
      });
      setSelectedIds(new Set());
      fetchCtes();
    } finally {
      setBulkDeleting(false);
    }
  };

  const singleCte = (() => {
    const arr = sorted.filter((c) => selectedIds.has(c.id));
    return arr.length === 1 ? arr[0] : null;
  })();

  const canTransmit = !!singleCte
    && singleCte.tipo_talao !== "servico"
    && ["rascunho", "rejeitado", "processando"].includes(singleCte.status);

  const handleTransmit = async () => {
    if (!singleCte || !canTransmit) return;
    const isProcessing = singleCte.status === "processando";
    if (!isProcessing) {
      const { data: c } = await supabase
        .from("ctes")
        .select("remetente_nome,remetente_cnpj,remetente_ie,destinatario_nome,destinatario_cnpj,destinatario_ie,tomador_nome,tomador_cnpj,tomador_ie,expedidor_nome,expedidor_cnpj,expedidor_ie,recebedor_nome,recebedor_cnpj,recebedor_ie")
        .eq("id", singleCte.id)
        .maybeSingle();
      if (c) {
        const roles: [string, string][] = [["remetente", "Remetente"], ["destinatario", "Destinatário"], ["tomador", "Tomador"], ["expedidor", "Expedidor"], ["recebedor", "Recebedor"]];
        const faltando = roles
          .filter(([k]) => {
            const doc = String((c as any)[`${k}_cnpj`] || "").replace(/\D/g, "");
            const ie = String((c as any)[`${k}_ie`] || "").trim();
            return doc.length === 14 && !ie;
          })
          .map(([k, label]) => `${label}: ${(c as any)[`${k}_nome`] || "—"}`);
        if (faltando.length) {
          const seguir = await confirm({
            title: "Inscrição Estadual não informada",
            description: `Falta a IE de: ${faltando.join("; ")}. A SEFAZ costuma rejeitar o CT-e sem ela (se a empresa for contribuinte). Preencha no cadastro da pessoa, selecione-a de novo no CT-e e salve. Deseja transmitir mesmo assim?`,
            confirmLabel: "Transmitir mesmo assim",
          });
          if (!seguir) return;
        }
      }
    }
    const ok = await confirm({
      title: isProcessing ? "Consultar situação na SEFAZ" : singleCte.status === "rejeitado" ? "Retransmitir CT-e" : "Emitir CT-e na SEFAZ",
      description: isProcessing
        ? "Este CT-e está aguardando retorno. A situação será consultada na SEFAZ e atualizada; se tiver sido rejeitado, ficará liberado para edição."
        : "O CT-e selecionado será transmitido à SEFAZ para autorização no ambiente fiscal configurado. Deseja continuar?",
      confirmLabel: isProcessing ? "Consultar" : "Emitir SEFAZ",
    });
    if (!ok) return;

    setTransmitting(true);
    try {
      const result = await emitirCteViaFocus(singleCte.id);
      if (!result.success) {
        toast({
          title: result.status === "erro_autorizacao" ? "CT-e rejeitado" : "Erro na transmissão",
          description: result.motivo_rejeicao || result.error || "Não foi possível emitir o CT-e.",
          variant: "destructive",
        });
      } else if (result.status === "autorizado") {
        toast({
          title: "CT-e autorizado pela SEFAZ",
          description: `Chave: ${result.chave_acesso || "—"}${result.protocolo ? ` | Protocolo: ${result.protocolo}` : ""}`,
        });
      } else {
        toast({ title: "CT-e enviado", description: "A autorização está sendo processada pela SEFAZ." });
      }
      await fetchCtes();
    } finally {
      setTransmitting(false);
    }
  };

  const cteColumns: DataGridColumn<Cte>[] = [
    {
      key: "numero", header: "N.º", width: "90px",
      sortValue: (c) => (c.tipo_talao === "servico" ? c.numero_interno ?? 0 : c.numero ?? 0),
      cell: (c) => (
        <span className="font-medium tabular-nums">
          {c.tipo_talao === "servico" ? c.numero_interno ?? "—" : c.numero ?? "—"}
        </span>
      ),
    },
    {
      key: "talao", header: "Talão", width: "70px",
      sortValue: (c) => c.tipo_talao || "",
      cell: (c) => <span className="text-muted-foreground whitespace-nowrap">{c.tipo_talao === "servico" ? "Serviço" : "Produção"}</span>,
    },
    {
      key: "data", header: "Emissão", width: "86px",
      sortValue: (c) => getEmissaoDate(c),
      cell: (c) => <span className="tabular-nums whitespace-nowrap">{formatDateBR(getEmissaoDate(c))}</span>,
    },
    {
      key: "cliente", header: "Cliente",
      sortValue: (c) => getClienteTomador(c) || "",
      cell: (c) => <span className="block" title={getClienteTomador(c) || ""}>{limitDisplayText(getClienteTomador(c))}</span>,
    },
    {
      key: "placa", header: "Placa", width: "90px",
      sortValue: (c) => c.placa_veiculo || "",
      cell: (c) => <span className="tabular-nums">{c.placa_veiculo || "—"}</span>,
    },
    {
      key: "valor", header: "Valor", width: "120px", align: "right",
      sortValue: (c) => Number(c.valor_frete),
      cell: (c) => (
        <span className="tabular-nums font-medium">
          {Number(c.valor_frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      ),
    },
    {
      key: "status", header: "Status", width: "100px", align: "center",
      sortValue: (c) => (c.tipo_talao === "servico" ? "interno" : c.status),
      cell: (c) =>
        c.tipo_talao === "servico" ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-700">Interno</Badge>
        ) : (
          <Badge className={statusColors[c.status] || ""}>{statusLabels[c.status] || c.status}</Badge>
        ),
    },
  ];

  return (
    <AdminLayout>
      <ProcessingOverlay open={transmitting || bulkDeleting || !!deletingId} label={transmitting ? "Transmitindo à SEFAZ..." : "Excluindo..."} />
      <div className="container mx-auto px-4 py-3 space-y-3">
        <PageTitle>CT-e</PageTitle>


        <SearchFilterCard contentClassName="block space-y-2">
          <FilterPrimaryRow>
            <div className="mr-auto">
              <PeriodFilter inicio={dateFrom} fim={dateTo} allowClear onChange={(i, f) => { setDateFrom(i); setDateTo(f); }} />
            </div>
            <EmpresaFilter value={empresa} onChange={setEmpresa} />
          </FilterPrimaryRow>
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input placeholder="Buscar nº, remetente, destinatário, placa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos</SelectItem><SelectItem value="producao">Produção</SelectItem><SelectItem value="servico">Serviço</SelectItem></SelectContent>
            </Select>
          </div>
        </SearchFilterCard>

        <GlobalToolbar
          actions={[
            {
              key: "detail", label: "Detalhes", icon: Eye, mode: "single",
              disabled: !singleCte,
              onClick: () => singleCte && setDetailCte(singleCte),
            },
            {
              key: "edit", label: "Editar", icon: Pencil, mode: "single",
              disabled: !singleCte || !(singleCte.tipo_talao === "servico" || singleCte.status === "rascunho" || singleCte.status === "rejeitado"),
              onClick: () => singleCte && handleEdit(singleCte),
            },
            {
              key: "print", label: "Imprimir lista", icon: Printer, mode: "single+batch", variant: "outline",
              disabled: printing || selectedIds.size === 0,
              onClick: handlePrintSelected,
            },
            {
              key: "delete", label: bulkDeleting ? "Excluindo..." : "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive",
              disabled: bulkDeleting || selectedIds.size === 0,
              onClick: () => {
                if (singleCte && !isBulkDeletable(singleCte)) return handleDelete(singleCte);
                handleBulkDelete();
              },
            },
            {
              key: "inconsist", label: "Inconsistências", icon: AlertTriangle, mode: "always", variant: "outline",
              onClick: () => { setInconsistencyFocus(Array.from(selectedIds)); setInconsistencyOpen(true); },
            },
            {
              key: "xmlbatch", label: "Importar XML (Produção)", icon: Upload, mode: "always", variant: "outline",
              onClick: () => setXmlBatchOpen(true),
            },
            {
              key: "resumo", label: "Importar planilha resumida (Serviço)", icon: FileText, mode: "always", variant: "outline",
              onClick: () => setResumoOpen(true),
            },
            { key: "new", label: "Novo CT-e", icon: Plus, mode: "create", variant: "default", priority: true, onClick: handleNew },
            {
              key: "transmit", label: transmitting ? "Emitindo..." : "SEFAZ", icon: transmitting ? Loader2 : (SefazIcon as unknown as LucideIcon), mode: "single", variant: "secondary", priority: !!singleCte, iconClassName: "!h-7 !w-7 md:!h-[26px] md:!w-[26px]",
              disabled: transmitting || !singleCte,
              onClick: () => setSefazOpen(true),
            },
            {
              key: "mdfe", label: "MDF-e", icon: MdfeIcon as unknown as LucideIcon, mode: "single+batch", variant: "outline", priority: selectedIds.size > 0, iconClassName: "!h-6 !w-6 md:!h-[23px] md:!w-[23px]",
              disabled: selectedIds.size === 0 || ctes.some((c) => selectedIds.has(c.id) && c.tipo_talao === "servico"),
              onClick: () => navigate(`/admin/freight/mdfe?ctes=${[...selectedIds].join(",")}`),
            },
          ]}
          selectedCount={selectedIds.size}
        />

        <div className="cte-grid">
          <DataGrid
            rows={sorted}
            columns={cteColumns}
            rowId={(c) => c.id}
            selected={selectedIds}
            rowClassName={(c) => rowToneClass(c.status === "autorizado" ? "resolved" : ["cancelado", "rejeitado", "denegado"].includes(c.status) ? "overdue" : "pending")}
            onSelectedChange={setSelectedIds}
            loading={loading}
            minWidth={860}
            emptyMessage='Nenhum CT-e encontrado. Clique em "Novo CT-e" para criar o primeiro.'
          />

          <StatusLegend className="px-1 pt-2" items={[{ tone: "pending", label: "Rascunho / processando" }, { tone: "resolved", label: "Autorizado" }, { tone: "overdue", label: "Cancelado / rejeitado" }]} />
        </div>

      </div>

      {/* Chooser modal */}
      <Dialog open={chooserOpen} onOpenChange={setChooserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Novo CT-e</DialogTitle>
            <DialogDescription>Selecione o talão ao qual este CT-e pertence.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 mt-2">
            <button
              type="button"
              onClick={handlePickProducao}
              className="text-left border rounded-lg p-4 hover:border-primary hover:bg-primary/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileCheck2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Produção</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  CT-e fiscal completo, transmitido à SEFAZ.
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={handlePickServico}
              className="text-left border rounded-lg p-4 hover:border-amber-500 hover:bg-amber-500/5 transition-colors flex items-start gap-3"
            >
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                <FileCog className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="font-semibold">CT-e do Talão de Serviço</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registro interno simplificado, sem envio à SEFAZ.
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CteFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      <CteServicoFormDialog
        open={servicoOpen}
        onOpenChange={(o) => { setServicoOpen(o); if (!o) setEditingCte(null); }}
        cte={editingCte}
        onSaved={fetchCtes}
      />

      <CteSefazDialog
        cte={singleCte}
        open={sefazOpen}
        onOpenChange={setSefazOpen}
        onTransmit={handleTransmit}
        onDownloadPdf={() => (singleCte ? handleDownloadDacte(singleCte.id) : Promise.resolve())}
        onChanged={fetchCtes}
      />
      {detailCte && (
        <CteDetailDialog
          open={!!detailCte}
          onOpenChange={(open) => !open && setDetailCte(null)}
          cte={detailCte}
          onUpdated={fetchCtes}
          onEdit={(cte) => {
            setDetailCte(null);
            handleEdit(cte);
          }}
        />
      )}
      <CteInconsistencyDialog
        open={inconsistencyOpen}
        onOpenChange={setInconsistencyOpen}
        onDeleted={() => { fetchCtes(); setSelectedIds(new Set()); }}
        focusIds={inconsistencyFocus}
      />
      <CteServicoResumoImportDialog
        open={resumoOpen}
        onOpenChange={setResumoOpen}
        onImported={fetchCtes}
      />
      <CteXmlBatchImportDialog
        open={xmlBatchOpen}
        onOpenChange={setXmlBatchOpen}
        onImported={(ids) => { fetchCtes(); setSelectedIds(new Set(ids)); }}
      />
      {ConfirmDialog}
    </AdminLayout>
  );
}
