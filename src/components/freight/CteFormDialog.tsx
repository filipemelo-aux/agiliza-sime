import { useEffect, useState, useCallback, useRef } from "react";
import { parseNfeXml, fetchNfeFromSefaz, type NfeData } from "@/lib/nfeImport";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { MapPin, Building2, DollarSign, Truck, FileText, Loader2, Users, Package, Plus, X, FileSignature, Search, Upload } from "lucide-react";
import { maskCNPJ, unmaskCNPJ, maskDocument, maskCurrency, unmaskCurrency, maskName, maskPlate, unmaskPlate } from "@/lib/masks";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonSearchInput } from "./PersonSearchInput";
import { lookupDriverByPlate, lookupVehicleByDriver } from "@/lib/vehicleDriverLookup";
import { CargaSearchInput } from "./CargaSearchInput";
import { NaturezaCargaSearchInput } from "./NaturezaCargaSearchInput";
import { CargaFormDialog } from "./CargaFormDialog";
import { FreightContractDialog } from "./FreightContractDialog";
import {
  CteDescontoFields,
  type DescontoState,
  emptyDesconto,
  calcDescontoTotal,
  serializeDesconto,
  deserializeDesconto,
} from "./CteDescontoFields";
import type { Cte } from "@/pages/FreightCte";
import type { Tables } from "@/integrations/supabase/types";

type Establishment = Tables<"fiscal_establishments">;

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const CFOPS = [
  { value: "5353", label: "5353 - Prest. serv. transp. (mesma UF)" },
  { value: "6353", label: "6353 - Prest. serv. transp. (interestadual)" },
  { value: "5352", label: "5352 - Prest. serv. transp. estab. industrial (mesma UF)" },
  { value: "6352", label: "6352 - Prest. serv. transp. estab. industrial (interestadual)" },
  { value: "5360", label: "5360 - Prest. serv. transp. subcontratado (mesma UF)" },
  { value: "6360", label: "6360 - Prest. serv. transp. subcontratado (interestadual)" },
];

const TP_CTE_OPTIONS = [
  { value: "0", label: "0 - Normal" },
  { value: "1", label: "1 - Complementar" },
  { value: "2", label: "2 - Anulação" },
  { value: "3", label: "3 - Substituto" },
];

const TP_SERV_OPTIONS = [
  { value: "0", label: "0 - Normal" },
  { value: "1", label: "1 - Subcontratação" },
  { value: "2", label: "2 - Redespacho" },
  { value: "3", label: "3 - Redespacho Intermediário" },
  { value: "4", label: "4 - Serviço Multimodal" },
];

const TOMADOR_TIPO_OPTIONS = [
  { value: "0", label: "0 - Remetente" },
  { value: "1", label: "1 - Expedidor" },
  { value: "2", label: "2 - Recebedor" },
  { value: "3", label: "3 - Destinatário" },
  { value: "4", label: "4 - Outros" },
];

const IND_IE_TOMA_OPTIONS = [
  { value: "1", label: "1 - Contribuinte ICMS" },
  { value: "2", label: "2 - Isento" },
  { value: "9", label: "9 - Não contribuinte" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte | null;
  onSaved: () => void;
}

interface NfeDetalhe { chave: string; numero: string; serie: string; data_emissao: string; valor: number; peso: number; especie: string }
interface OutroDoc { tipo: string; descricao: string; numero: string; data_emissao: string; valor: number }

const defaultForm = {
  // Tipo e serviço
  tp_cte: 0,
  tp_serv: 0,
  modal: "01",
  retira: 1,
  // Remetente
  remetente_nome: "",
  remetente_cnpj: "",
  remetente_ie: "",
  remetente_endereco: "",
  remetente_municipio_ibge: "",
  remetente_uf: "",
  // Destinatário
  destinatario_nome: "",
  destinatario_cnpj: "",
  destinatario_ie: "",
  destinatario_endereco: "",
  destinatario_municipio_ibge: "",
  destinatario_uf: "",
  // Expedidor
  expedidor_nome: "",
  expedidor_cnpj: "",
  expedidor_ie: "",
  expedidor_endereco: "",
  expedidor_municipio_ibge: "",
  expedidor_uf: "",
  // Recebedor
  recebedor_nome: "",
  recebedor_cnpj: "",
  recebedor_ie: "",
  recebedor_endereco: "",
  recebedor_municipio_ibge: "",
  recebedor_uf: "",
  // Tomador
  tomador_tipo: null as number | null,
  tomador_nome: "",
  tomador_cnpj: "",
  tomador_ie: "",
  tomador_endereco: "",
  tomador_municipio_ibge: "",
  tomador_uf: "",
  ind_ie_toma: 1,
  // Valores
  valor_frete: 0,
  valor_receber: 0,
  valor_carga: 0,
  valor_carga_averb: 0,
  base_calculo_icms: 0,
  aliquota_icms: 0,
  valor_icms: 0,
  valor_total_tributos: 0,
  cst_icms: "00",
  cfop: "6353",
  natureza_operacao: "PRESTACAO DE SERVICO DE TRANSPORTE",
  // Prestação
  municipio_origem_ibge: "",
  municipio_origem_nome: "",
  uf_origem: "",
  municipio_destino_ibge: "",
  municipio_destino_nome: "",
  uf_destino: "",
  municipio_envio_ibge: "",
  municipio_envio_nome: "",
  uf_envio: "",
  // Transporte
  placa_veiculo: "",
  rntrc: "",
  produto_predominante: "",
  tipo_carga: "",
  peso_bruto: 0,
  // Carga
  componentes_frete: [] as { xNome: string; vComp: number }[],
  info_quantidade: [] as { cUnid: string; tpMed: string; qCarga: number }[],
  chaves_nfe_ref: [] as string[],
  // IDs
  motorista_id: null as string | null,
  veiculo_id: null as string | null,
  tomador_id: null as string | null,
  // Data
  data_emissao: "",
  // Obs
  observacoes: "",
  // IBS/CBS 2026
  ibs_cbs_cst: "000",
  ibs_cbs_class_trib: "000001",
  ibs_cbs_base_calculo: 0,
  ibs_uf_aliquota: 0.1,
  ibs_uf_valor: 0,
  ibs_mun_aliquota: 0,
  ibs_mun_valor: 0,
  // Notas / documentos
  nfe_detalhes: [] as NfeDetalhe[],
  outros_documentos: [] as OutroDoc[],
  // Conjunto e contratado
  reboque1_placa: "",
  reboque2_placa: "",
  numero_eixos: null as number | null,
  lotacao: true,
  contratado_id: null as string | null,
  contratado_nome: "",
  contratado_documento: "",
  // Prazos / pedido / pedágio
  previsao_saida: "",
  previsao_chegada: "",
  pedido_numero: "",
  valor_pedagio: 0,
  cbs_aliquota: 0.9,
  cbs_valor: 0,
  // Seguro
  seguro_responsavel: 4,
  seguradora_nome: "",
  seguradora_cnpj: "",
  apolice_numero: "",
  averbacao_numero: "",
};

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">{title}</h3>
    </div>
  );
}

function ActorSection({
  title,
  prefix,
  form,
  set,
  searchCategories,
  lookupCnpj,
  cnpjLoading,
  cnpjError,
  setCnpjError,
}: {
  title: string;
  prefix: string;
  form: any;
  set: (key: string, value: any) => void;
  searchCategories?: string[];
  lookupCnpj: (raw: string, prefix: string) => void;
  cnpjLoading: boolean;
  cnpjError: string;
  setCnpjError: (v: string) => void;
}) {
  return (
    <section className="space-y-4">
      <SectionHeader icon={Building2} title={title} />
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Buscar no cadastro</Label>
        <PersonSearchInput
          categories={searchCategories}
          placeholder={`Buscar ${title.toLowerCase()} cadastrado...`}
          selectedName={form[`${prefix}_nome`] || undefined}
          onSelect={(person) => {
            set(`${prefix}_nome`, person.razao_social || person.full_name);
            set(`${prefix}_cnpj`, person.cnpj ? maskDocument(person.cnpj) : form[`${prefix}_cnpj`]);
            set(`${prefix}_ie`, person.inscricao_estadual || form[`${prefix}_ie`]);
            set(`${prefix}_uf`, person.address_state || form[`${prefix}_uf`]);
            set(`${prefix}_endereco`, [person.address_street, person.address_number, person.address_neighborhood].filter(Boolean).join(", ") || form[`${prefix}_endereco`]);
          }}
          onClear={() => {
            set(`${prefix}_nome`, "");
            set(`${prefix}_cnpj`, "");
            set(`${prefix}_ie`, "");
            set(`${prefix}_endereco`, "");
            set(`${prefix}_uf`, "");
            set(`${prefix}_municipio_ibge`, "");
          }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-3">
        <div className="sm:col-span-4 space-y-1.5">
          <Label className="text-xs">Nome / Razão Social</Label>
          <Input value={form[`${prefix}_nome`]} onChange={(e) => set(`${prefix}_nome`, maskName(e.target.value))} placeholder="Nome completo ou razão social" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">UF</Label>
          <Select value={form[`${prefix}_uf`] || undefined} onValueChange={(v) => set(`${prefix}_uf`, v)}>
            <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
            <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">CNPJ / CPF</Label>
          <div className="relative">
            <Input
              value={form[`${prefix}_cnpj`]}
              onChange={(e) => {
                setCnpjError("");
                const masked = maskDocument(e.target.value);
                set(`${prefix}_cnpj`, masked);
                const raw = unmaskCNPJ(masked);
                if (raw.length === 14) lookupCnpj(raw, prefix);
              }}
              maxLength={18}
              placeholder="00.000.000/0000-00"
            />
            {cnpjLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Inscrição Estadual</Label>
          <Input value={form[`${prefix}_ie`]} onChange={(e) => set(`${prefix}_ie`, e.target.value)} placeholder="IE" />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Cód. Município IBGE</Label>
          <Input value={form[`${prefix}_municipio_ibge`]} onChange={(e) => set(`${prefix}_municipio_ibge`, e.target.value)} placeholder="0000000" />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label className="text-xs">Endereço</Label>
          <Input value={form[`${prefix}_endereco`]} onChange={(e) => set(`${prefix}_endereco`, e.target.value)} placeholder="Logradouro, nº, bairro" />
        </div>
      </div>
    </section>
  );
}

export function CteFormDialog({ open, onOpenChange, cte, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [saving, setSaving] = useState(false);
  const [gerarContrato, setGerarContrato] = useState(false);
  const [savedCteForContract, setSavedCteForContract] = useState<Cte | null>(null);
  const [keepOpenAfterContract, setKeepOpenAfterContract] = useState(false);
  const [linkedContract, setLinkedContract] = useState<{ id: string; numero: number | string } | null>(null);

  useEffect(() => {
    if (!open || !cte?.id) { setLinkedContract(null); return; }
    let cancelled = false;
    supabase
      .from("freight_contracts")
      .select("id, numero")
      .eq("cte_id", cte.id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setLinkedContract(data as any); });
    return () => { cancelled = true; };
  }, [open, cte?.id]);

  const resetForNextCte = () => {
    setForm((p) => ({
      ...p,
      placa_veiculo: "",
      rntrc: "",
      peso_bruto: 0,
      info_quantidade: [],
      chaves_nfe_ref: [],
      motorista_id: null,
      veiculo_id: null,
      observacoes: "",
    }));
    setMotoristaNome(undefined);
    setDesconto(emptyDesconto);
    toast({ title: "Pronto para o próximo CT-e", description: "Dados gerais mantidos. Atualize motorista, placa, peso e quantidades." });
  };
  const [form, setForm] = useState(defaultForm);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstId, setSelectedEstId] = useState<string>("");

  const [showCargaForm, setShowCargaForm] = useState(false);
  const [motoristaNome, setMotoristaNome] = useState<string | undefined>(undefined);
  const [desconto, setDesconto] = useState<DescontoState>(emptyDesconto);

  // CNPJ loading states for each actor
  const [cnpjLoading, setCnpjLoading] = useState<Record<string, boolean>>({});
  const [cnpjErrors, setCnpjErrors] = useState<Record<string, string>>({});
  const [nfeLoading, setNfeLoading] = useState(false);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("fiscal_establishments")
      .select("*")
      .eq("active", true)
      .order("type")
      .order("razao_social")
      .then(({ data }) => {
        if (data) {
          setEstablishments(data);
          // Não pré-selecionar emitente: o usuário deve escolher manualmente para evitar erros.
        }
      });
  }, [open]);

  useEffect(() => {
    if (cte) {
      setForm({
        tp_cte: cte.tp_cte ?? 0,
        tp_serv: cte.tp_serv ?? 0,
        modal: cte.modal || "01",
        retira: cte.retira ?? 1,
        remetente_nome: cte.remetente_nome ? maskName(cte.remetente_nome) : "",
        remetente_cnpj: cte.remetente_cnpj ? maskDocument(cte.remetente_cnpj) : "",
        remetente_ie: cte.remetente_ie || "",
        remetente_endereco: cte.remetente_endereco || "",
        remetente_municipio_ibge: cte.remetente_municipio_ibge || "",
        remetente_uf: cte.remetente_uf || "",
        destinatario_nome: cte.destinatario_nome ? maskName(cte.destinatario_nome) : "",
        destinatario_cnpj: cte.destinatario_cnpj ? maskDocument(cte.destinatario_cnpj) : "",
        destinatario_ie: cte.destinatario_ie || "",
        destinatario_endereco: cte.destinatario_endereco || "",
        destinatario_municipio_ibge: cte.destinatario_municipio_ibge || "",
        destinatario_uf: cte.destinatario_uf || "",
        expedidor_nome: cte.expedidor_nome ? maskName(cte.expedidor_nome) : "",
        expedidor_cnpj: cte.expedidor_cnpj ? maskDocument(cte.expedidor_cnpj) : "",
        expedidor_ie: cte.expedidor_ie || "",
        expedidor_endereco: cte.expedidor_endereco || "",
        expedidor_municipio_ibge: cte.expedidor_municipio_ibge || "",
        expedidor_uf: cte.expedidor_uf || "",
        recebedor_nome: cte.recebedor_nome ? maskName(cte.recebedor_nome) : "",
        recebedor_cnpj: cte.recebedor_cnpj ? maskDocument(cte.recebedor_cnpj) : "",
        recebedor_ie: cte.recebedor_ie || "",
        recebedor_endereco: cte.recebedor_endereco || "",
        recebedor_municipio_ibge: cte.recebedor_municipio_ibge || "",
        recebedor_uf: cte.recebedor_uf || "",
        tomador_tipo: cte.tomador_tipo ?? null,
        tomador_nome: cte.tomador_nome ? maskName(cte.tomador_nome) : "",
        tomador_cnpj: cte.tomador_cnpj ? maskDocument(cte.tomador_cnpj) : "",
        tomador_ie: cte.tomador_ie || "",
        tomador_endereco: cte.tomador_endereco || "",
        tomador_municipio_ibge: cte.tomador_municipio_ibge || "",
        tomador_uf: cte.tomador_uf || "",
        ind_ie_toma: cte.ind_ie_toma ?? 1,
        valor_frete: Number(cte.valor_frete) || 0,
        valor_receber: Number(cte.valor_receber) || 0,
        valor_carga: Number(cte.valor_carga) || 0,
        valor_carga_averb: Number(cte.valor_carga_averb) || 0,
        base_calculo_icms: Number(cte.base_calculo_icms) || 0,
        aliquota_icms: Number(cte.aliquota_icms) || 0,
        valor_icms: Number(cte.valor_icms) || 0,
        valor_total_tributos: Number(cte.valor_total_tributos) || 0,
        cst_icms: cte.cst_icms || "00",
        cfop: cte.cfop || "6353",
        natureza_operacao: cte.natureza_operacao || "PRESTACAO DE SERVICO DE TRANSPORTE",
        municipio_origem_ibge: cte.municipio_origem_ibge || "",
        municipio_origem_nome: cte.municipio_origem_nome ? maskName(cte.municipio_origem_nome) : "",
        uf_origem: cte.uf_origem || "",
        municipio_destino_ibge: cte.municipio_destino_ibge || "",
        municipio_destino_nome: cte.municipio_destino_nome ? maskName(cte.municipio_destino_nome) : "",
        uf_destino: cte.uf_destino || "",
        municipio_envio_ibge: cte.municipio_envio_ibge || "",
        municipio_envio_nome: cte.municipio_envio_nome ? maskName(cte.municipio_envio_nome) : "",
        uf_envio: cte.uf_envio || "",
        placa_veiculo: cte.placa_veiculo ? maskPlate(cte.placa_veiculo) : "",
        rntrc: cte.rntrc || "",
        produto_predominante: cte.produto_predominante ? maskName(cte.produto_predominante) : "",
        tipo_carga: (cte as any).tipo_carga || "",
        peso_bruto: Number(cte.peso_bruto) || 0,
        componentes_frete: Array.isArray(cte.componentes_frete) ? cte.componentes_frete : [],
        info_quantidade: Array.isArray(cte.info_quantidade) ? cte.info_quantidade : [],
        chaves_nfe_ref: Array.isArray(cte.chaves_nfe_ref) ? cte.chaves_nfe_ref : [],
        motorista_id: cte.motorista_id || null,
        veiculo_id: cte.veiculo_id || null,
        tomador_id: cte.tomador_id || null,
        observacoes: cte.observacoes || "",
        ibs_cbs_cst: (cte as any).ibs_cbs_cst || "000",
        ibs_cbs_class_trib: (cte as any).ibs_cbs_class_trib || "000001",
        ibs_cbs_base_calculo: Number((cte as any).ibs_cbs_base_calculo) || 0,
        ibs_uf_aliquota: (cte as any).ibs_uf_aliquota ?? 0.1,
        ibs_uf_valor: Number((cte as any).ibs_uf_valor) || 0,
        ibs_mun_aliquota: (cte as any).ibs_mun_aliquota ?? 0,
        ibs_mun_valor: Number((cte as any).ibs_mun_valor) || 0,
        cbs_aliquota: (cte as any).cbs_aliquota ?? 0.9,
        cbs_valor: Number((cte as any).cbs_valor) || 0,
        seguro_responsavel: (cte as any).seguro_responsavel ?? 4,
        seguradora_nome: (cte as any).seguradora_nome || "",
        seguradora_cnpj: (cte as any).seguradora_cnpj ? maskCNPJ((cte as any).seguradora_cnpj) : "",
        nfe_detalhes: Array.isArray((cte as any).nfe_detalhes) ? (cte as any).nfe_detalhes : [],
        outros_documentos: Array.isArray((cte as any).outros_documentos) ? (cte as any).outros_documentos : [],
        reboque1_placa: (cte as any).reboque1_placa ? maskPlate((cte as any).reboque1_placa) : "",
        reboque2_placa: (cte as any).reboque2_placa ? maskPlate((cte as any).reboque2_placa) : "",
        numero_eixos: (cte as any).numero_eixos ?? null,
        lotacao: (cte as any).lotacao ?? true,
        contratado_id: (cte as any).contratado_id || null,
        contratado_nome: (cte as any).contratado_nome || "",
        contratado_documento: (cte as any).contratado_documento ? maskDocument((cte as any).contratado_documento) : "",
        previsao_saida: (cte as any).previsao_saida || "",
        previsao_chegada: (cte as any).previsao_chegada || "",
        pedido_numero: (cte as any).pedido_numero || "",
        valor_pedagio: Number((cte as any).valor_pedagio) || 0,
        apolice_numero: (cte as any).apolice_numero || "",
        averbacao_numero: (cte as any).averbacao_numero || "",
        data_emissao: ((cte as any).data_emissao ? String((cte as any).data_emissao).slice(0, 10) : new Date().toISOString().slice(0, 10)),
      });
      if (cte.establishment_id) setSelectedEstId(cte.establishment_id);
      setDesconto(deserializeDesconto((cte as any).desconto));

      // Load motorista name for display
      if (cte.motorista_id) {
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", cte.motorista_id)
          .single()
          .then(({ data }) => {
            if (data?.full_name) setMotoristaNome(data.full_name);
          });
      } else {
        setMotoristaNome(undefined);
      }
    } else {
      setForm(defaultForm);
      setMotoristaNome(undefined);
      setDesconto(emptyDesconto);
    }
  }, [cte, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const lookupCnpj = useCallback(async (raw: string, prefix: string) => {
    if (raw.length !== 14) return;
    setCnpjLoading((p) => ({ ...p, [prefix]: true }));
    setCnpjErrors((p) => ({ ...p, [prefix]: "" }));
    try {
      const { lookupCnpj } = await import("@/lib/cnpjLookup");
      const data = await lookupCnpj(raw);
      setForm((p) => ({
        ...p,
        [`${prefix}_nome`]: data.razao_social ? maskName(data.razao_social) : p[`${prefix}_nome` as keyof typeof p],
        [`${prefix}_uf`]: data.uf || p[`${prefix}_uf` as keyof typeof p],
        [`${prefix}_endereco`]: data.logradouro
          ? `${maskName(data.logradouro)}${data.numero ? `, ${data.numero}` : ""}${data.bairro ? ` - ${maskName(data.bairro)}` : ""}`
          : p[`${prefix}_endereco` as keyof typeof p],
      }));
    } catch {
      setCnpjErrors((p) => ({ ...p, [prefix]: "Erro ao consultar CNPJ" }));
    } finally {
      setCnpjLoading((p) => ({ ...p, [prefix]: false }));
    }
  }, []);

  // Auto-calculate ICMS
  useEffect(() => {
    const base = form.valor_frete;
    const icms = base * (form.aliquota_icms / 100);
    setForm((p) => ({ ...p, base_calculo_icms: base, valor_icms: Math.round(icms * 100) / 100 }));
  }, [form.valor_frete, form.aliquota_icms]);

  // Auto-calculate IBS/CBS sobre o valor total do frete
  useEffect(() => {
    const base = Number(form.valor_frete) || 0;
    const r = (aliq: number) => Math.round(base * ((Number(aliq) || 0) / 100) * 100) / 100;
    setForm((p) => ({
      ...p,
      ibs_cbs_base_calculo: base,
      ibs_uf_valor: r(p.ibs_uf_aliquota),
      ibs_mun_valor: r(p.ibs_mun_aliquota),
      cbs_valor: r(p.cbs_aliquota),
    }));
  }, [form.valor_frete, form.ibs_uf_aliquota, form.ibs_mun_aliquota, form.cbs_aliquota]);

  // Seguro padrão do emitente (somente quando ainda vazio)
  useEffect(() => {
    const est: any = establishments.find((e) => e.id === selectedEstId);
    if (!est) return;
    setForm((p) => ({
      ...p,
      seguradora_nome: p.seguradora_nome || est.seguradora_nome || "",
      seguradora_cnpj: p.seguradora_cnpj || (est.seguradora_cnpj ? maskCNPJ(est.seguradora_cnpj) : ""),
      apolice_numero: p.apolice_numero || est.apolice_numero || "",
    }));
  }, [selectedEstId, establishments]);

  const applyNfe = (n: NfeData) => {
    setForm((p) => {
      const chaves = p.chaves_nfe_ref.filter((c) => c && c !== n.chave);
      const emptyIdx = p.chaves_nfe_ref.indexOf("");
      const isFirst = chaves.length === 0;
      const fill = (prefix: string, party: NfeData["emitente"]) => ({
        [`${prefix}_nome`]: (p as any)[`${prefix}_nome`] || maskName(party.nome),
        [`${prefix}_cnpj`]: (p as any)[`${prefix}_cnpj`] || (party.documento ? maskDocument(party.documento) : ""),
        [`${prefix}_ie`]: (p as any)[`${prefix}_ie`] || party.ie,
        [`${prefix}_endereco`]: (p as any)[`${prefix}_endereco`] || party.endereco,
        [`${prefix}_municipio_ibge`]: (p as any)[`${prefix}_municipio_ibge`] || party.municipio_ibge,
        [`${prefix}_uf`]: (p as any)[`${prefix}_uf`] || party.uf,
      });
      void emptyIdx;
      return {
        ...p,
        ...fill("remetente", n.emitente),
        ...fill("destinatario", n.destinatario),
        chaves_nfe_ref: [...chaves, n.chave],
        // Peso e valor somam quando há mais de uma nota
        peso_bruto: isFirst ? n.peso_bruto : (Number(p.peso_bruto) || 0) + n.peso_bruto,
        valor_carga: isFirst ? n.valor : (Number(p.valor_carga) || 0) + n.valor,
        valor_carga_averb: isFirst ? n.valor : (Number(p.valor_carga_averb) || 0) + n.valor,
        produto_predominante: p.produto_predominante || maskName(n.produto),
        municipio_origem_ibge: p.municipio_origem_ibge || n.emitente.municipio_ibge,
        municipio_origem_nome: p.municipio_origem_nome || maskName(n.emitente.municipio),
        uf_origem: p.uf_origem || n.emitente.uf,
        municipio_destino_ibge: p.municipio_destino_ibge || n.destinatario.municipio_ibge,
        municipio_destino_nome: p.municipio_destino_nome || maskName(n.destinatario.municipio),
        uf_destino: p.uf_destino || n.destinatario.uf,
      };
    });
    setNfeDetalhe(n.chave, {
      numero: n.numero, serie: n.serie, data_emissao: n.data_emissao,
      valor: n.valor, peso: n.peso_bruto, especie: n.especie.toUpperCase(),
    });
  };



  const importFromSefaz = async () => {
    const est = establishments.find((e) => e.id === selectedEstId);
    if (!est) {
      toast({ title: "Selecione o emitente", description: "Escolha o estabelecimento emissor antes de buscar a nota.", variant: "destructive" });
      return;
    }
    const pendentes = form.chaves_nfe_ref.filter((c) => c.length === 44);
    if (pendentes.length === 0) {
      toast({ title: "Informe a chave", description: "Adicione a chave de 44 dígitos da NF-e e clique novamente.", variant: "destructive" });
      return;
    }
    setNfeLoading(true);
    // Recomeça a soma de peso/valor a partir das notas importadas
    setForm((p) => ({ ...p, chaves_nfe_ref: [] }));
    let ok = 0;
    for (const chave of pendentes) {
      try {
        applyNfe(await fetchNfeFromSefaz(chave, est.cnpj));
        ok++;
      } catch (e: any) {
        setForm((p) => ({ ...p, chaves_nfe_ref: [...p.chaves_nfe_ref, chave] }));
        toast({ title: `NF-e ${chave.slice(25, 34)}`, description: e.message, variant: "destructive" });
      }
    }
    setNfeLoading(false);
    if (ok) toast({ title: "Dados importados da SEFAZ", description: `${ok} nota(s) aplicada(s). Confira remetente, destinatário, peso e valores.` });
  };

  const handleXmlFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    let ok = 0;
    for (const f of files) {
      try {
        applyNfe(parseNfeXml(await f.text()));
        ok++;
      } catch (err: any) {
        toast({ title: f.name, description: err.message, variant: "destructive" });
      }
    }
    if (ok) toast({ title: "XML importado", description: `${ok} nota(s) aplicada(s). Confira os dados preenchidos.` });
  };

  const formatBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Auto-fill valor_receber = valor_frete when changing
  useEffect(() => {
    setForm((p) => ({ ...p, valor_receber: p.valor_frete }));
  }, [form.valor_frete]);

  const handleSave = async (keepOpenForNext = false) => {
    if (!user) return;
    if (!selectedEstId) {
      toast({ title: "Campos obrigatórios", description: "Selecione o estabelecimento emissor.", variant: "destructive" });
      return;
    }
    if (!form.remetente_nome || !form.destinatario_nome) {
      toast({ title: "Campos obrigatórios", description: "Preencha remetente e destinatário.", variant: "destructive" });
      return;
    }
    if (!form.data_emissao) {
      toast({ title: "Data obrigatória", description: "Informe a data de emissão.", variant: "destructive" });
      return;
    }
    if (!form.veiculo_id) {
      toast({ title: "Veículo obrigatório", description: "Selecione a placa do veículo da frota própria. Sem isso o CT-e não entra nos relatórios de receita por veículo.", variant: "destructive" });
      return;
    }

    // Se já existe previsão FATURADA para este CT-e, exigir confirmação
    let faturaIdParaRecalcular: string | null = null;
    if (cte) {
      const { data: prevExist } = await supabase
        .from("previsoes_recebimento")
        .select("id, status")
        .eq("origem_tipo", "cte" as any)
        .eq("origem_id", cte.id)
        .maybeSingle();
      if (prevExist?.status === "faturado") {
        const { data: link } = await supabase
          .from("fatura_previsoes")
          .select("fatura_id, faturas_recebimento(numero, status)")
          .eq("previsao_id", prevExist.id)
          .maybeSingle();
        const fatNum = (link as any)?.faturas_recebimento?.numero;
        const fatStatus = (link as any)?.faturas_recebimento?.status;
        if (fatStatus === "paga") {
          toast({
            title: "Fatura já quitada",
            description: `O CT-e está vinculado à fatura Nº ${fatNum} que já foi paga. Estorne os recebimentos antes de alterar.`,
            variant: "destructive",
          });
          return;
        }
        const ok = await confirm({
          title: "CT-e já faturado",
          description: `Este CT-e já foi incluído na fatura Nº ${fatNum}. Ao prosseguir, os valores serão atualizados dentro da fatura (sem gerar nova previsão). Deseja continuar?`,
          confirmLabel: "Prosseguir e atualizar fatura",
        });
        if (!ok) return;
        faturaIdParaRecalcular = (link as any)?.fatura_id || null;
      }
    }

    // Verificação de duplicidade: peso + placa + data + valor idênticos
    try {
      const { findCteDuplicates, buildDuplicateConfirmMessage } = await import("@/lib/cteDuplicateCheck");
      const dups = await findCteDuplicates({
        pesoBruto: Number(form.peso_bruto) || 0,
        dataEmissao: form.data_emissao,
        placaVeiculo: unmaskPlate(form.placa_veiculo) || form.placa_veiculo,
        valorFrete: Number(form.valor_frete) || 0,
        excludeId: cte?.id ?? null,
      });
      if (dups.length > 0) {
        const ok = await confirm({
          title: "Possível lançamento duplicado",
          description: buildDuplicateConfirmMessage(dups),
          confirmLabel: "Prosseguir mesmo assim",
          cancelLabel: "Revisar",
        });
        if (!ok) return;
      }
    } catch (e) {
      console.warn("Falha na verificação de duplicidade", e);
    }

    setSaving(true);
    try {
      const { tipo_carga: _tc, ...formWithoutExtra } = form;
      const payload: any = {
        ...formWithoutExtra,
        data_emissao: form.data_emissao ? `${form.data_emissao}T12:00:00` : new Date().toISOString(),
        remetente_cnpj: unmaskCNPJ(form.remetente_cnpj) || form.remetente_cnpj,
        destinatario_cnpj: unmaskCNPJ(form.destinatario_cnpj) || form.destinatario_cnpj,
        expedidor_cnpj: unmaskCNPJ(form.expedidor_cnpj) || form.expedidor_cnpj || null,
        recebedor_cnpj: unmaskCNPJ(form.recebedor_cnpj) || form.recebedor_cnpj || null,
        tomador_cnpj: unmaskCNPJ(form.tomador_cnpj) || form.tomador_cnpj || null,
        placa_veiculo: unmaskPlate(form.placa_veiculo) || form.placa_veiculo,
        created_by: user.id,
        status: "rascunho",
        establishment_id: selectedEstId,
        // Nullify empty fields to avoid FK violations
        motorista_id: form.motorista_id || null,
        veiculo_id: form.veiculo_id || null,
        tomador_id: form.tomador_id || null,
        expedidor_nome: form.expedidor_nome || null,
        recebedor_nome: form.recebedor_nome || null,
        tomador_nome: form.tomador_nome || null,
        valor_carga_averb: form.valor_carga_averb || null,
        seguradora_nome: form.seguradora_nome || null,
        seguradora_cnpj: unmaskCNPJ(form.seguradora_cnpj) || null,
        apolice_numero: form.apolice_numero || null,
        nfe_detalhes: form.chaves_nfe_ref.filter((c) => c.length === 44).map((c) => getNfeDetalhe(c)),
        outros_documentos: form.outros_documentos.filter((o) => o.numero || o.descricao),
        reboque1_placa: unmaskPlate(form.reboque1_placa) || null,
        reboque2_placa: unmaskPlate(form.reboque2_placa) || null,
        contratado_id: form.contratado_id || null,
        contratado_nome: form.contratado_nome || null,
        contratado_documento: form.contratado_documento ? form.contratado_documento.replace(/\D/g, "") : null,
        previsao_saida: form.previsao_saida || null,
        previsao_chegada: form.previsao_chegada || null,
        pedido_numero: form.pedido_numero || null,
        averbacao_numero: form.averbacao_numero || null,
        desconto: serializeDesconto(desconto),
      };

      let savedId: string;
      if (cte) {
        const { error } = await supabase.from("ctes").update(payload).eq("id", cte.id);
        if (error) throw error;
        toast({ title: "CT-e atualizado" });
        savedId = cte.id;
      } else {
        const { data, error } = await supabase.from("ctes").insert(payload).select("id").single();
        if (error) throw error;
        toast({ title: "CT-e criado", description: "Rascunho salvo com sucesso." });
        savedId = data.id;
      }

      // Gerar/atualizar previsão de recebimento (interno) — vincula ao tomador
      // Tomador deve ser definido EXPLICITAMENTE pelo usuário (sem default para destinatário)
      const tipoToPrefix: Record<number, string> = { 0: "remetente", 1: "expedidor", 2: "recebedor", 3: "destinatario" };
      const fAny = form as any;
      // O tipo de tomador escolhido é sempre a fonte da verdade: se o usuário
      // trocar o tomador (ex.: destinatário → remetente), o vínculo é recalculado.
      const derivedTomadorId =
        (form.tomador_tipo !== null && form.tomador_tipo !== 4
          ? fAny[`${tipoToPrefix[form.tomador_tipo]}_profile_id`] || null
          : form.tomador_id || null) ||
        null;


      // Se valor do frete = 0, remove previsão existente e não cria nova (negativos são permitidos para lançamentos em lote)
      if (Number(form.valor_frete) === 0) {
        await supabase
          .from("previsoes_recebimento")
          .delete()
          .eq("origem_tipo", "cte" as any)
          .eq("origem_id", savedId);
        toast({
          title: "Sem previsão de recebimento",
          description: "Valor do frete zerado. Nenhuma previsão a receber foi gerada.",
        });
      } else if (form.tomador_tipo === null) {
        toast({
          title: "Tomador não definido",
          description: "Selecione o tomador do serviço para gerar a previsão de recebimento.",
        });
      } else if (derivedTomadorId) {
        if (derivedTomadorId !== form.tomador_id) {
          await supabase.from("ctes").update({ tomador_id: derivedTomadorId }).eq("id", savedId);
        }

        const dataPrev = form.data_emissao.slice(0, 10);
        const { data: existingPrev } = await supabase
          .from("previsoes_recebimento")
          .select("id")
          .eq("origem_tipo", "cte" as any)
          .eq("origem_id", savedId)
          .maybeSingle();
        const prevPayload: any = {
          cliente_id: derivedTomadorId,
          valor: Number(form.valor_frete),
          data_prevista: dataPrev,
        };
        // Preserva status 'faturado' quando a previsão já está vinculada a uma fatura
        if (!faturaIdParaRecalcular) {
          prevPayload.status = "pendente";
        }
        const { error: prevErr } = existingPrev?.id
          ? await supabase.from("previsoes_recebimento").update(prevPayload).eq("id", existingPrev.id)
          : await supabase.from("previsoes_recebimento").insert({
              origem_tipo: "cte" as any,
              origem_id: savedId,
              ...prevPayload,
              status: "pendente",
            });
        if (prevErr) {
          console.error("Erro ao gerar previsão:", prevErr);
          toast({ title: "Aviso", description: `Previsão não gerada: ${prevErr.message}`, variant: "destructive" });
        } else if (faturaIdParaRecalcular) {
          const { error: recalcErr } = await supabase.rpc("recalculate_fatura", { _fatura_id: faturaIdParaRecalcular });
          if (recalcErr) {
            toast({ title: "Erro ao atualizar fatura", description: recalcErr.message, variant: "destructive" });
          } else {
            toast({ title: "Fatura atualizada", description: "Os valores e títulos da fatura foram recalculados." });
          }
        }
      } else {
        toast({
          title: "Previsão não gerada",
          description: "Selecione o tomador (busque o ator no cadastro) para gerar a previsão de recebimento.",
        });
      }

      onSaved();

      if (gerarContrato) {
        const { data: fresh } = await supabase.from("ctes").select("*").eq("id", savedId).single();
        setKeepOpenAfterContract(keepOpenForNext && !cte);
        setSavedCteForContract(fresh as any);
      } else if (keepOpenForNext && !cte) {
        resetForNextCte();
      } else {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Determine if tomador fields should show (toma=4 means "outros" → needs separate data)
  const showTomadorFields = form.tomador_tipo === 4;

  return (
  <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl">
            {cte ? "Editar CT-e" : "Novo CT-e (Rascunho)"}
          </SheetTitle>
          {linkedContract && (
            <div className="mt-2 inline-flex items-center gap-2 self-start rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">
              <FileSignature className="w-3.5 h-3.5" />
              <span>Vinculado ao Contrato de Frete Nº <strong>{linkedContract.numero}</strong></span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Emitente (Estabelecimento) */}
          <section className="space-y-4">
            <SectionHeader icon={Building2} title="Emitente" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Estabelecimento *</Label>
                <Select value={selectedEstId} onValueChange={setSelectedEstId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o emitente" /></SelectTrigger>
                  <SelectContent>
                    {establishments.map((est) => (
                      <SelectItem key={est.id} value={est.id}>
                        {est.type === "matriz" ? "🏢" : "🏬"} {est.razao_social} ({maskCNPJ(est.cnpj)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data de emissão *</Label>
                <Input
                  type="date"
                  value={form.data_emissao}
                  onChange={(e) => set("data_emissao", e.target.value)}
                />
              </div>
            </div>
            {establishments.length === 0 && (
              <p className="text-xs text-destructive">Nenhum estabelecimento cadastrado. Cadastre em Configurações Fiscais.</p>
            )}
          </section>

          <Separator />

          {/* Remetente */}
          <ActorSection
            title="Remetente"
            prefix="remetente"
            form={form}
            set={set}
            lookupCnpj={lookupCnpj}
            cnpjLoading={!!cnpjLoading.remetente}
            cnpjError={cnpjErrors.remetente || ""}
            setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, remetente: v }))}
          />

          <Separator />

          {/* Destinatário */}
          <ActorSection
            title="Destinatário"
            prefix="destinatario"
            form={form}
            set={set}
            lookupCnpj={lookupCnpj}
            cnpjLoading={!!cnpjLoading.destinatario}
            cnpjError={cnpjErrors.destinatario || ""}
            setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, destinatario: v }))}
          />

          <Separator />

          {/* Expedidor */}
          <ActorSection
            title="Expedidor"
            prefix="expedidor"
            form={form}
            set={set}
            lookupCnpj={lookupCnpj}
            cnpjLoading={!!cnpjLoading.expedidor}
            cnpjError={cnpjErrors.expedidor || ""}
            setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, expedidor: v }))}
          />

          <Separator />

          {/* Recebedor */}
          <ActorSection
            title="Recebedor"
            prefix="recebedor"
            form={form}
            set={set}
            lookupCnpj={lookupCnpj}
            cnpjLoading={!!cnpjLoading.recebedor}
            cnpjError={cnpjErrors.recebedor || ""}
            setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, recebedor: v }))}
          />

          <Separator />

          {/* Tomador — escolha por checkbox */}
          <section className="space-y-3">
            <SectionHeader icon={Users} title="Tomador do Serviço" />
            <p className="text-xs text-muted-foreground">
              Marque qual dos atores acima é o tomador do serviço (quem paga o frete).
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {TOMADOR_TIPO_OPTIONS.map((o) => {
                const checked = String(form.tomador_tipo) === o.value;
                return (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors text-xs ${
                      checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => { if (v) set("tomador_tipo", Number(o.value)); }}
                    />
                    <span className={checked ? "font-semibold text-foreground" : "text-foreground"}>
                      {o.label}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="space-y-1.5 max-w-xs">
              <Label className="text-xs">Ind. IE Tomador</Label>
              <Select value={String(form.ind_ie_toma)} onValueChange={(v) => set("ind_ie_toma", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{IND_IE_TOMA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {showTomadorFields && (
              <ActorSection
                title="Dados do Tomador (Outros)"
                prefix="tomador"
                form={form}
                set={set}
                lookupCnpj={lookupCnpj}
                cnpjLoading={!!cnpjLoading.tomador}
                cnpjError={cnpjErrors.tomador || ""}
                setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, tomador: v }))}
              />
            )}
          </section>

          <Separator />

          {/* Tipo CT-e / Serviço / Modal */}
          <section className="space-y-4">
            <SectionHeader icon={FileText} title="Tipo do Documento" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo CT-e</Label>
                <Select value={String(form.tp_cte)} onValueChange={(v) => set("tp_cte", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TP_CTE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo Serviço</Label>
                <Select value={String(form.tp_serv)} onValueChange={(v) => set("tp_serv", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TP_SERV_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modal</Label>
                <Select value={form.modal} onValueChange={(v) => set("modal", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 - Rodoviário</SelectItem>
                    <SelectItem value="02">02 - Aéreo</SelectItem>
                    <SelectItem value="03">03 - Aquaviário</SelectItem>
                    <SelectItem value="04">04 - Ferroviário</SelectItem>
                    <SelectItem value="05">05 - Dutoviário</SelectItem>
                    <SelectItem value="06">06 - Multimodal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Retira?</Label>
                <Select value={String(form.retira)} onValueChange={(v) => set("retira", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 - Sim</SelectItem>
                    <SelectItem value="1">1 - Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Prestação — Origem / Destino */}
          <section className="space-y-4">
            <SectionHeader icon={MapPin} title="Prestação" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-border bg-muted/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Origem</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_origem_nome} onChange={(e) => set("municipio_origem_nome", maskName(e.target.value))} placeholder="Nome do município" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">IBGE</Label>
                      <Input value={form.municipio_origem_ibge} onChange={(e) => set("municipio_origem_ibge", e.target.value)} placeholder="0000000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">UF</Label>
                      <Select value={form.uf_origem || undefined} onValueChange={(v) => set("uf_origem", v)}>
                        <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                        <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-muted/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Destino</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_destino_nome} onChange={(e) => set("municipio_destino_nome", maskName(e.target.value))} placeholder="Nome do município" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">IBGE</Label>
                      <Input value={form.municipio_destino_ibge} onChange={(e) => set("municipio_destino_ibge", e.target.value)} placeholder="0000000" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">UF</Label>
                      <Select value={form.uf_destino || undefined} onValueChange={(v) => set("uf_destino", v)}>
                        <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                        <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            {/* Município de envio */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Município Envio</Label>
                <Input value={form.municipio_envio_nome} onChange={(e) => set("municipio_envio_nome", maskName(e.target.value))} placeholder="Município de envio" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IBGE Envio</Label>
                <Input value={form.municipio_envio_ibge} onChange={(e) => set("municipio_envio_ibge", e.target.value)} placeholder="0000000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">UF Envio</Label>
                <Select value={form.uf_envio || undefined} onValueChange={(v) => set("uf_envio", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Valores e Tributos */}
          <section className="space-y-4">
            <SectionHeader icon={DollarSign} title="Valores e Tributos" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Frete (vTPrest)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    value={form.valor_frete ? maskCurrency(String(Math.round(form.valor_frete * 100))) : ""}
                    onChange={(e) => set("valor_frete", Number(unmaskCurrency(e.target.value)) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor a Receber (vRec)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    value={form.valor_receber ? maskCurrency(String(Math.round(form.valor_receber * 100))) : ""}
                    onChange={(e) => set("valor_receber", Number(unmaskCurrency(e.target.value)) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Carga (vCarga)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    value={form.valor_carga ? maskCurrency(String(Math.round(form.valor_carga * 100))) : ""}
                    onChange={(e) => set("valor_carga", Number(unmaskCurrency(e.target.value)) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Carga Averb.</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    value={form.valor_carga_averb ? maskCurrency(String(Math.round(form.valor_carga_averb * 100))) : ""}
                    onChange={(e) => set("valor_carga_averb", Number(unmaskCurrency(e.target.value)) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Alíquota ICMS (%)</Label>
                <Input type="number" step="0.01" value={form.aliquota_icms} onChange={(e) => set("aliquota_icms", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Base Cálculo ICMS</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input className="pl-10 bg-muted text-muted-foreground" value={form.base_calculo_icms ? maskCurrency(String(Math.round(form.base_calculo_icms * 100))) : "0,00"} disabled />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor ICMS</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input className="pl-10 bg-muted text-muted-foreground" value={form.valor_icms ? maskCurrency(String(Math.round(form.valor_icms * 100))) : "0,00"} disabled />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Total Tributos</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input
                    className="pl-10"
                    value={form.valor_total_tributos ? maskCurrency(String(Math.round(form.valor_total_tributos * 100))) : ""}
                    onChange={(e) => set("valor_total_tributos", Number(unmaskCurrency(e.target.value)) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CST ICMS</Label>
                <Input value={form.cst_icms} onChange={(e) => set("cst_icms", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">CFOP</Label>
                <Select value={form.cfop} onValueChange={(v) => set("cfop", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CFOPS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Natureza da Operação</Label>
                <Input value={form.natureza_operacao} onChange={(e) => set("natureza_operacao", e.target.value)} />
              </div>
            </div>

            {/* IBS / CBS — Reforma Tributária 2026 (obrigatório no CT-e) */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label className="text-xs font-semibold">IBS / CBS (Reforma Tributária 2026)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Situação (CST)</Label>
                  <Input value={form.ibs_cbs_cst} maxLength={3} onChange={(e) => set("ibs_cbs_cst", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Classificação</Label>
                  <Input value={form.ibs_cbs_class_trib} maxLength={6} onChange={(e) => set("ibs_cbs_class_trib", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px]">Base de cálculo</Label>
                  <Input className="bg-muted text-muted-foreground" disabled value={formatBRL(form.ibs_cbs_base_calculo)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">IBS Estadual (%)</Label>
                  <Input type="number" step="0.01" value={form.ibs_uf_aliquota} onChange={(e) => set("ibs_uf_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.ibs_uf_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">IBS Municipal (%)</Label>
                  <Input type="number" step="0.01" value={form.ibs_mun_aliquota} onChange={(e) => set("ibs_mun_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.ibs_mun_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CBS (%)</Label>
                  <Input type="number" step="0.01" value={form.cbs_aliquota} onChange={(e) => set("cbs_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.cbs_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Total IBS + CBS</Label>
                  <Input className="bg-muted text-muted-foreground" disabled value={formatBRL(form.ibs_uf_valor + form.ibs_mun_valor + form.cbs_valor)} />
                </div>
              </div>
            </div>

            {/* Seguro da carga (obrigatório para emitir) */}
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label className="text-xs font-semibold">Seguro da Carga</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Responsável pelo seguro</Label>
                  <Select value={String(form.seguro_responsavel)} onValueChange={(v) => set("seguro_responsavel", Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">Emitente do CT-e</SelectItem>
                      <SelectItem value="5">Tomador do serviço</SelectItem>
                      <SelectItem value="0">Remetente</SelectItem>
                      <SelectItem value="1">Expedidor</SelectItem>
                      <SelectItem value="2">Recebedor</SelectItem>
                      <SelectItem value="3">Destinatário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Seguradora</Label>
                  <Input value={form.seguradora_nome} onChange={(e) => set("seguradora_nome", e.target.value.toUpperCase())} placeholder="Ex.: SURA" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CNPJ da seguradora</Label>
                  <Input value={form.seguradora_cnpj} maxLength={18} onChange={(e) => set("seguradora_cnpj", maskCNPJ(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Nº da apólice</Label>
                  <Input value={form.apolice_numero} onChange={(e) => set("apolice_numero", e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[10px]">Nº da averbação (opcional)</Label>
                  <Input value={form.averbacao_numero} onChange={(e) => set("averbacao_numero", e.target.value)} />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Preenchido automaticamente com a seguradora padrão do emitente (Configurações › Fiscal).</p>
            </div>

            {/* Desconto (registro interno — não afeta XML/Sefaz) */}
            <div className="space-y-1.5 rounded-md border border-border bg-muted/10 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Desconto (interno)</Label>
                {calcDescontoTotal(desconto) > 0 && (
                  <span className="font-mono text-xs font-semibold text-destructive">
                    − {calcDescontoTotal(desconto).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Registrado apenas internamente. Não altera o vTPrest enviado à SEFAZ — ajuste o "Valor Frete" manualmente, se necessário.
              </p>
              <CteDescontoFields value={desconto} onChange={setDesconto} />
            </div>

            {/* Componentes do Frete */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Componentes do Frete</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => set("componentes_frete", [...form.componentes_frete, { xNome: "", vComp: 0 }])}
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {form.componentes_frete.map((comp, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    className="flex-1"
                    placeholder="Nome (ex: FRETE VALOR)"
                    value={comp.xNome}
                    onChange={(e) => {
                      const arr = [...form.componentes_frete];
                      arr[i] = { ...arr[i], xNome: e.target.value };
                      set("componentes_frete", arr);
                    }}
                  />
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input
                      className="pl-8"
                      value={comp.vComp ? maskCurrency(String(Math.round(comp.vComp * 100))) : ""}
                      onChange={(e) => {
                        const arr = [...form.componentes_frete];
                        arr[i] = { ...arr[i], vComp: Number(unmaskCurrency(e.target.value)) || 0 };
                        set("componentes_frete", arr);
                      }}
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                    set("componentes_frete", form.componentes_frete.filter((_, j) => j !== i));
                  }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* Carga */}
          <section className="space-y-4">
            <SectionHeader icon={Package} title="Informações da Carga" />
            
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Buscar carga cadastrada ou cadastrar nova</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <CargaSearchInput
                    placeholder="Buscar carga por produto..."
                    selectedName={form.produto_predominante || undefined}
                    onSelect={(carga) => {
                      set("produto_predominante", carga.produto_predominante);
                      set("peso_bruto", Number(carga.peso_bruto) || 0);
                      set("valor_carga", Number(carga.valor_carga) || 0);
                      if (carga.valor_carga_averb) set("valor_carga_averb", Number(carga.valor_carga_averb));
                      if (carga.chaves_nfe_ref && carga.chaves_nfe_ref.length > 0) set("chaves_nfe_ref", carga.chaves_nfe_ref);
                      if (carga.remetente_nome && !form.remetente_nome) set("remetente_nome", carga.remetente_nome);
                      if (carga.destinatario_nome && !form.destinatario_nome) set("destinatario_nome", carga.destinatario_nome);
                      if (carga.uf_origem && !form.uf_origem) set("uf_origem", carga.uf_origem);
                      if (carga.uf_destino && !form.uf_destino) set("uf_destino", carga.uf_destino);
                      if (carga.municipio_origem_nome && !form.municipio_origem_nome) set("municipio_origem_nome", carga.municipio_origem_nome);
                      if (carga.municipio_destino_nome && !form.municipio_destino_nome) set("municipio_destino_nome", carga.municipio_destino_nome);
                    }}
                    onClear={() => {
                      set("produto_predominante", "");
                      set("peso_bruto", 0);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  title="Cadastrar nova carga"
                  onClick={() => setShowCargaForm(true)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">Produto Predominante</Label>
                <NaturezaCargaSearchInput
                  value={form.produto_predominante || ""}
                  onChange={(v) => set("produto_predominante", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo da Carga</Label>
                <Select value={form.tipo_carga || undefined} onValueChange={(v) => set("tipo_carga", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="granel_solido">Granel Sólido</SelectItem>
                    <SelectItem value="granel_liquido">Granel Líquido</SelectItem>
                    <SelectItem value="frigorificada">Frigorificada / Refrigerada</SelectItem>
                    <SelectItem value="conteinerizada">Conteinerizada</SelectItem>
                    <SelectItem value="carga_geral">Carga Geral</SelectItem>
                    <SelectItem value="neogranel">Neogranel</SelectItem>
                    <SelectItem value="perigosa">Perigosa (IMO)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Peso Bruto (kg)</Label>
                <Input type="number" step="0.01" value={form.peso_bruto} onChange={(e) => set("peso_bruto", Number(e.target.value))} />
              </div>
            </div>

            {/* Quantidades */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Quantidades (infQ)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => set("info_quantidade", [...form.info_quantidade, { cUnid: "01", tpMed: "", qCarga: 0 }])}
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {form.info_quantidade.map((q, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={q.cUnid}
                    onValueChange={(v) => {
                      const arr = [...form.info_quantidade];
                      arr[i] = { ...arr[i], cUnid: v };
                      set("info_quantidade", arr);
                    }}
                  >
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="00">00 - M3</SelectItem>
                      <SelectItem value="01">01 - KG</SelectItem>
                      <SelectItem value="02">02 - TON</SelectItem>
                      <SelectItem value="03">03 - UN</SelectItem>
                      <SelectItem value="04">04 - LT</SelectItem>
                      <SelectItem value="05">05 - MMBTU</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    placeholder="Tipo medida (ex: PESO BRUTO)"
                    value={q.tpMed}
                    onChange={(e) => {
                      const arr = [...form.info_quantidade];
                      arr[i] = { ...arr[i], tpMed: e.target.value };
                      set("info_quantidade", arr);
                    }}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    step="0.0001"
                    placeholder="Qtde"
                    value={q.qCarga || ""}
                    onChange={(e) => {
                      const arr = [...form.info_quantidade];
                      arr[i] = { ...arr[i], qCarga: Number(e.target.value) };
                      set("info_quantidade", arr);
                    }}
                  />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                    set("info_quantidade", form.info_quantidade.filter((_, j) => j !== i));
                  }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Chaves NF-e */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-xs font-semibold">NF-e Referenciadas</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={nfeLoading} onClick={importFromSefaz}>
                    {nfeLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />} Importar da SEFAZ
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => xmlInputRef.current?.click()}>
                    <Upload className="w-3 h-3" /> Enviar XML
                  </Button>
                  <input ref={xmlInputRef} type="file" accept=".xml,text/xml" multiple className="hidden" onChange={handleXmlFiles} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => set("chaves_nfe_ref", [...form.chaves_nfe_ref, ""])}
                  >
                    <Plus className="w-3 h-3" /> Adicionar
                  </Button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Digite a chave e clique em "Importar da SEFAZ" (a nota precisa ter a Sime como transportadora ou destinatária), ou envie o XML. Remetente, destinatário, peso e valor são preenchidos automaticamente.
              </p>
              {form.chaves_nfe_ref.map((chave, i) => {
                const d = getNfeDetalhe(chave);
                return (
                  <div key={i} className="rounded-md border border-border p-2 space-y-2">
                    <div className="flex gap-2 items-center">
                      <Input
                        className="flex-1 font-mono text-xs"
                        placeholder="Chave de acesso NF-e (44 dígitos)"
                        maxLength={44}
                        value={chave}
                        onChange={(e) => {
                          const arr = [...form.chaves_nfe_ref];
                          arr[i] = e.target.value.replace(/\D/g, "");
                          set("chaves_nfe_ref", arr);
                        }}
                      />
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => {
                        set("chaves_nfe_ref", form.chaves_nfe_ref.filter((_, j) => j !== i));
                      }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {chave.length === 44 && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        <div className="space-y-0.5"><Label className="text-[10px]">Número</Label><Input className="h-7 text-xs" value={d.numero} onChange={(e) => setNfeDetalhe(chave, { numero: e.target.value.replace(/\D/g, "") })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Série</Label><Input className="h-7 text-xs" value={d.serie} onChange={(e) => setNfeDetalhe(chave, { serie: e.target.value.replace(/\D/g, "") })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Emissão</Label><Input type="date" className="h-7 text-xs" value={d.data_emissao} onChange={(e) => setNfeDetalhe(chave, { data_emissao: e.target.value })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Valor</Label><Input className="h-7 text-xs" value={d.valor ? maskCurrency(String(Math.round(d.valor * 100))) : ""} onChange={(e) => setNfeDetalhe(chave, { valor: Number(unmaskCurrency(e.target.value)) || 0 })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Peso (kg)</Label><Input type="number" className="h-7 text-xs" value={d.peso || ""} onChange={(e) => setNfeDetalhe(chave, { peso: Number(e.target.value) || 0 })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Espécie</Label><Input className="h-7 text-xs" value={d.especie} onChange={(e) => setNfeDetalhe(chave, { especie: e.target.value.toUpperCase() })} /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Outros documentos (carga sem NF-e) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Outros documentos (carga sem NF-e)</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => set("outros_documentos", [...form.outros_documentos, { tipo: "99", descricao: "", numero: "", data_emissao: "", valor: 0 }])}>
                  <Plus className="w-3 h-3" /> Adicionar
                </Button>
              </div>
              {form.outros_documentos.map((o, i) => {
                const upd = (patch: Partial<OutroDoc>) => {
                  const arr = [...form.outros_documentos];
                  arr[i] = { ...arr[i], ...patch };
                  set("outros_documentos", arr);
                };
                return (
                  <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end rounded-md border border-border p-2">
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Tipo</Label>
                      <Select value={o.tipo} onValueChange={(v) => upd({ tipo: v })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="00">Declaração</SelectItem>
                          <SelectItem value="10">Dutoviário</SelectItem>
                          <SelectItem value="59">CF-e SAT</SelectItem>
                          <SelectItem value="65">NFC-e</SelectItem>
                          <SelectItem value="99">Outros</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-0.5 sm:col-span-2"><Label className="text-[10px]">Descrição</Label><Input className="h-7 text-xs" value={o.descricao} onChange={(e) => upd({ descricao: e.target.value })} /></div>
                    <div className="space-y-0.5"><Label className="text-[10px]">Número</Label><Input className="h-7 text-xs" value={o.numero} onChange={(e) => upd({ numero: e.target.value })} /></div>
                    <div className="space-y-0.5"><Label className="text-[10px]">Emissão</Label><Input type="date" className="h-7 text-xs" value={o.data_emissao} onChange={(e) => upd({ data_emissao: e.target.value })} /></div>
                    <div className="flex gap-1 items-end">
                      <div className="space-y-0.5 flex-1"><Label className="text-[10px]">Valor</Label><Input className="h-7 text-xs" value={o.valor ? maskCurrency(String(Math.round(o.valor * 100))) : ""} onChange={(e) => upd({ valor: Number(unmaskCurrency(e.target.value)) || 0 })} /></div>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => set("outros_documentos", form.outros_documentos.filter((_, j) => j !== i))}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <Separator />

          {/* Transporte */}
          <section className="space-y-4">
            <SectionHeader icon={Truck} title="Transporte" />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Buscar motorista</Label>
              <PersonSearchInput
                categories={["motorista"]}
                placeholder="Buscar motorista cadastrado..."
                selectedName={motoristaNome}
                onSelect={async (person) => {
                  set("motorista_id", person.id);
                  setMotoristaNome(person.full_name);
                  // Auto-fill vehicle if driver is linked to one
                  try {
                    const v = await lookupVehicleByDriver(person.user_id, person.id);
                    if (v) {
                      set("placa_veiculo", maskPlate(v.plate));
                      if (v.rntrc) set("rntrc", v.rntrc);
                    }
                  } catch {}
                }}
                onClear={() => {
                  set("motorista_id", null);
                  setMotoristaNome(undefined);
                }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Placa</Label>
                <Input
                  value={form.placa_veiculo}
                  onChange={(e) => {
                    const masked = maskPlate(e.target.value);
                    set("placa_veiculo", masked);
                    if (unmaskPlate(masked).length === 7) {
                      lookupDriverByPlate(masked)
                        .then((r) => {
                          if (!r) return;
                          if (r.rntrc) set("rntrc", r.rntrc);
                          if (r.motorista_id) {
                            set("motorista_id", r.motorista_id);
                            setMotoristaNome(r.motorista_nome || undefined);
                          }
                        })
                        .catch(() => {});
                    }
                  }}

                  maxLength={8}
                  placeholder="ABC-1D23"
                  className="uppercase"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RNTRC</Label>
                <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Carreta 1</Label>
                <Input value={form.reboque1_placa} maxLength={8} placeholder="ABC-1D23" className="uppercase" onChange={(e) => set("reboque1_placa", maskPlate(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Carreta 2</Label>
                <Input value={form.reboque2_placa} maxLength={8} placeholder="ABC-1D23" className="uppercase" onChange={(e) => set("reboque2_placa", maskPlate(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nº de eixos</Label>
                <Input type="number" min={2} max={12} value={form.numero_eixos ?? ""} onChange={(e) => set("numero_eixos", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Lotação</Label>
                <Select value={form.lotacao ? "1" : "0"} onValueChange={(v) => set("lotacao", v === "1")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Sim</SelectItem>
                    <SelectItem value="0">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Contratado (dono do caminhão, quando de terceiro)</Label>
              <PersonSearchInput
                categories={["proprietario", "motorista"]}
                placeholder="Buscar proprietário/contratado..."
                selectedName={form.contratado_nome || undefined}
                onSelect={(person) => {
                  set("contratado_id", person.id);
                  set("contratado_nome", person.razao_social || person.full_name);
                  set("contratado_documento", person.cnpj ? maskDocument(person.cnpj) : "");
                }}
                onClear={() => {
                  set("contratado_id", null);
                  set("contratado_nome", "");
                  set("contratado_documento", "");
                }}
              />
              {form.contratado_documento && <p className="text-[10px] text-muted-foreground">Documento: {form.contratado_documento}</p>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Previsão de saída</Label>
                <Input type="date" value={form.previsao_saida} onChange={(e) => set("previsao_saida", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Previsão de chegada</Label>
                <Input type="date" value={form.previsao_chegada} onChange={(e) => set("previsao_chegada", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pedido / Ordem carreg.</Label>
                <Input value={form.pedido_numero} onChange={(e) => set("pedido_numero", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pedágio</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                  <Input className="pl-10" value={form.valor_pedagio ? maskCurrency(String(Math.round(form.valor_pedagio * 100))) : ""} onChange={(e) => set("valor_pedagio", Number(unmaskCurrency(e.target.value)) || 0)} />
                </div>
              </div>
            </div>
            {form.previsao_saida && form.previsao_chegada && form.previsao_chegada < form.previsao_saida && (
              <p className="text-xs text-destructive">A previsão de chegada está antes da saída.</p>
            )}
          </section>

          <Separator />

          {/* Observações */}
          <section className="space-y-4">
            <SectionHeader icon={FileText} title="Observações" />
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} placeholder="Informações complementares..." />
          </section>
        </div>

        {/* Footer fixo */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex flex-col gap-3 bg-background">
          {!linkedContract && (
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={gerarContrato}
                onCheckedChange={(v) => setGerarContrato(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="flex items-center gap-1 font-semibold">
                  <FileSignature className="w-3.5 h-3.5" /> Gerar contrato de frete
                </span>
                <span className="block text-muted-foreground">
                  Após salvar, abre o formulário do contrato de fretamento (subcontratado) e gera conta a pagar à vista.
                </span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            {!cte && (
              <Button variant="secondary" onClick={() => handleSave(true)} disabled={saving} title="Salva e mantém os dados gerais para o próximo CT-e">
                {saving ? "Salvando..." : "Salvar e novo"}
              </Button>
            )}
            <Button onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Salvando..." : cte ? "Atualizar CT-e" : "Salvar CT-e"}
            </Button>
          </div>
        </div>
      </SheetContent>

      <FreightContractDialog
        open={!!savedCteForContract}
        onOpenChange={(o) => {
          if (!o) {
            setSavedCteForContract(null);
            setGerarContrato(false);
            if (keepOpenAfterContract) {
              setKeepOpenAfterContract(false);
              resetForNextCte();
            } else {
              onOpenChange(false);
            }
          }
        }}
        cte={savedCteForContract}
        onSaved={onSaved}
      />
    </Sheet>

    <CargaFormDialog
      open={showCargaForm}
      onOpenChange={setShowCargaForm}
      carga={null}
      onSaved={() => {
        setShowCargaForm(false);
      }}
    />
    {ConfirmDialog}
  </>
  );
}
