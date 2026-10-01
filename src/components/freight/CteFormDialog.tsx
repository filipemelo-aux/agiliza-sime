import { useEffect, useState, useCallback, useRef } from "react";
import { parseNfeXml, fetchNfeFromSefaz, type NfeData } from "@/lib/nfeImport";
import { buscarCodigoIbgePorMunicipio } from "@/lib/ibgeLookup";
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
import { MapPin, Building2, DollarSign, Truck, FileText, Loader2, Users, Package, Plus, X, FileSignature, Search, Upload, ChevronDown } from "lucide-react";
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

const MODAL_OPTIONS = [
  { value: "01", label: "01 - Rodoviário" },
  { value: "02", label: "02 - Aéreo" },
  { value: "03", label: "03 - Aquaviário" },
  { value: "04", label: "04 - Ferroviário" },
  { value: "05", label: "05 - Dutos" },
];

const RETIRA_OPTIONS = [
  { value: "0", label: "0 - Não" },
  { value: "1", label: "1 - Sim" },
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


function FormBlock({
  icon: Icon,
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  icon: React.ElementType;
  title: string;
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
          <Icon className="h-3 w-3" />
        </span>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">{title}</span>
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {summary ? <span className="truncate text-[11px] text-muted-foreground">{summary}</span> : null}
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        </span>
      </button>
      <div className={open ? "space-y-2.5 border-t border-border bg-card px-3 pb-3 pt-2.5" : "hidden"}>
        {children}
      </div>
    </section>
  );
}

function SubBlock({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <Label className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</Label>
        {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
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
  onCityResolved,
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
  onCityResolved?: (prefix: string, city: { cidade: string; uf: string; ibge: string } | null) => void;
}) {
  const nome = String(form[`${prefix}_nome`] || "");
  const uf = String(form[`${prefix}_uf`] || "");
  const doc = String(form[`${prefix}_cnpj`] || "");
  const filled = nome.trim().length > 0;
  const [expanded, setExpanded] = useState(filled);

  return (
    <section className={`overflow-hidden rounded-lg border bg-card ${filled ? "border-border" : "border-dashed border-border"}`}>
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${filled ? "bg-success" : "bg-muted-foreground/40"}`} />
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">{title}</span>
        <span className="ml-auto truncate text-[11px] text-muted-foreground">
          {filled ? [nome, uf].filter(Boolean).join(" · ") : (doc || "não informado")}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <div className={expanded ? "space-y-2 border-t border-border bg-card px-2.5 pb-2.5 pt-2" : "hidden"}>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Buscar no cadastro</Label>
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
              const cidade = person.address_city ? maskName(person.address_city) : "";
              const ufSel = person.address_state || form[`${prefix}_uf`] || "";
              if (cidade && ufSel) {
                onCityResolved?.(prefix, { cidade, uf: ufSel, ibge: "" });
                buscarCodigoIbgePorMunicipio(ufSel, cidade).then((ibge) => {
                  if (ibge) {
                    set(`${prefix}_municipio_ibge`, ibge);
                    onCityResolved?.(prefix, { cidade, uf: ufSel, ibge });
                  }
                });
              } else {
                onCityResolved?.(prefix, null);
              }
            }}
            onClear={() => {
              set(`${prefix}_nome`, "");
              set(`${prefix}_cnpj`, "");
              set(`${prefix}_ie`, "");
              set(`${prefix}_endereco`, "");
              set(`${prefix}_uf`, "");
              set(`${prefix}_municipio_ibge`, "");
              onCityResolved?.(prefix, null);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <div className="col-span-2 space-y-1">
            <Label className="text-[10px]">Nome / Razão Social</Label>
            <Input className="h-8 text-xs" value={form[`${prefix}_nome`]} onChange={(e) => set(`${prefix}_nome`, maskName(e.target.value))} placeholder="Nome completo ou razão social" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">CNPJ / CPF</Label>
            <div className="relative">
              <Input
                className="h-8 text-xs"
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
              {cnpjLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {cnpjError && <p className="text-[10px] text-destructive">{cnpjError}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">UF</Label>
            <Select value={form[`${prefix}_uf`] || undefined} onValueChange={(v) => set(`${prefix}_uf`, v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
              <SelectContent>{UFS.map((ufItem) => <SelectItem key={ufItem} value={ufItem}>{ufItem}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Inscrição Estadual</Label>
            <Input className="h-8 text-xs" value={form[`${prefix}_ie`]} onChange={(e) => set(`${prefix}_ie`, e.target.value)} placeholder="IE" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Cód. Município IBGE</Label>
            <Input className="h-8 text-xs" value={form[`${prefix}_municipio_ibge`]} onChange={(e) => set(`${prefix}_municipio_ibge`, e.target.value)} placeholder="0000000" />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-[10px]">Endereço</Label>
            <Input className="h-8 text-xs" value={form[`${prefix}_endereco`]} onChange={(e) => set(`${prefix}_endereco`, e.target.value)} placeholder="Logradouro, nº, bairro" />
          </div>
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
      nfe_detalhes: [],
      reboque1_placa: "",
      reboque2_placa: "",
      contratado_id: null,
      contratado_nome: "",
      contratado_documento: "",
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
  const [novaChave, setNovaChave] = useState("");
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

  // Cidade resolvida de cada envolvido (seleção no cadastro, CNPJ ou NF-e importada)
  const partyCitiesRef = useRef<Record<string, { cidade: string; uf: string; ibge: string }>>({});
  const [routeTick, setRouteTick] = useState(0);
  const onCityResolved = useCallback((prefix: string, city: { cidade: string; uf: string; ibge: string } | null) => {
    if (city) partyCitiesRef.current[prefix] = city;
    else delete partyCitiesRef.current[prefix];
    setRouteTick((t) => t + 1);
  }, []);

  // Preenche município/UF de origem e destino da prestação a partir dos envolvidos:
  // origem = expedidor (se houver) senão remetente; destino = recebedor (se houver) senão destinatário.
  useEffect(() => {
    const pick = (main: string, alt: string) => {
      const src = (form as any)[`${main}_nome`] ? main : alt;
      const c = partyCitiesRef.current[src];
      return c && c.cidade ? c : null;
    };
    const o = pick("expedidor", "remetente");
    const d = pick("recebedor", "destinatario");
    if (!o && !d) return;
    setForm((p) => ({
      ...p,
      ...(o ? { municipio_origem_nome: o.cidade, municipio_origem_ibge: o.ibge || p.municipio_origem_ibge, uf_origem: o.uf || p.uf_origem } : {}),
      ...(d ? { municipio_destino_nome: d.cidade, municipio_destino_ibge: d.ibge || p.municipio_destino_ibge, uf_destino: d.uf || p.uf_destino } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.expedidor_nome, form.remetente_nome, form.recebedor_nome, form.destinatario_nome, routeTick]);

  // Detalhe de cada NF-e (número/série derivados da chave quando não informados)
  const getNfeDetalhe = (chave: string): NfeDetalhe => {
    const found = form.nfe_detalhes.find((d) => d.chave === chave);
    return found ?? {
      chave,
      numero: chave.length === 44 ? String(Number(chave.slice(25, 34))) : "",
      serie: chave.length === 44 ? String(Number(chave.slice(22, 25))) : "",
      data_emissao: "", valor: 0, peso: 0, especie: "",
    };
  };
  const setNfeDetalhe = (chave: string, patch: Partial<NfeDetalhe>) =>
    setForm((p) => {
      const base = p.nfe_detalhes.find((d) => d.chave === chave) ?? {
        chave,
        numero: String(Number(chave.slice(25, 34))),
        serie: String(Number(chave.slice(22, 25))),
        data_emissao: "", valor: 0, peso: 0, especie: "",
      };
      return { ...p, nfe_detalhes: [...p.nfe_detalhes.filter((d) => d.chave !== chave), { ...base, ...patch }] };
    });

  // Carretas do veículo selecionado (somente se ainda vazias)
  useEffect(() => {
    if (!form.veiculo_id) return;
    supabase.from("trailers").select("plate").eq("vehicle_id", form.veiculo_id).order("created_at").then(({ data }) => {
      if (!data?.length) return;
      setForm((p) => ({
        ...p,
        reboque1_placa: p.reboque1_placa || (data[0]?.plate ? maskPlate(data[0].plate) : ""),
        reboque2_placa: p.reboque2_placa || (data[1]?.plate ? maskPlate(data[1].plate) : ""),
      }));
    });
  }, [form.veiculo_id]);

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
      if (data.municipio && data.uf) {
        const cidade = maskName(data.municipio);
        const uf = data.uf;
        onCityResolved(prefix, { cidade, uf, ibge: "" });
        buscarCodigoIbgePorMunicipio(uf, cidade).then((ibge) => {
          if (ibge) {
            set(`${prefix}_municipio_ibge`, ibge);
            onCityResolved(prefix, { cidade, uf, ibge });
          }
        });
      }
    } catch {
      setCnpjErrors((p) => ({ ...p, [prefix]: "Erro ao consultar CNPJ" }));
    } finally {
      setCnpjLoading((p) => ({ ...p, [prefix]: false }));
    }
  }, [onCityResolved]);

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

  // Totais da carga somados das notas fiscais vinculadas
  useEffect(() => {
    const detalhes = form.chaves_nfe_ref
      .filter((c) => c.length === 44)
      .map((c) => form.nfe_detalhes.find((d) => d.chave === c))
      .filter(Boolean) as NfeDetalhe[];
    if (detalhes.length === 0) return;
    const peso = detalhes.reduce((s, d) => s + (Number(d.peso) || 0), 0);
    const valor = detalhes.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    if (peso === 0 && valor === 0) return;
    setForm((p) => ({
      ...p,
      peso_bruto: peso > 0 ? peso : p.peso_bruto,
      valor_carga: valor > 0 ? valor : p.valor_carga,
      valor_carga_averb: valor > 0 ? valor : p.valor_carga_averb,
    }));
  }, [form.chaves_nfe_ref, form.nfe_detalhes]);

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
    if (!(form as any).remetente_nome && n.emitente.municipio) {
      partyCitiesRef.current.remetente = { cidade: maskName(n.emitente.municipio), uf: n.emitente.uf, ibge: n.emitente.municipio_ibge };
    }
    if (!(form as any).destinatario_nome && n.destinatario.municipio) {
      partyCitiesRef.current.destinatario = { cidade: maskName(n.destinatario.municipio), uf: n.destinatario.uf, ibge: n.destinatario.municipio_ibge };
    }
    setRouteTick((t) => t + 1);
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

  const buscarChave = async (chave: string) => {
    if (chave.length !== 44) {
      toast({ title: "Chave inválida", description: "A chave da NF-e precisa ter 44 dígitos.", variant: "destructive" });
      return;
    }
    const est = establishments.find((e) => e.id === selectedEstId);
    if (!est) {
      toast({ title: "Selecione o emitente", description: "Escolha o estabelecimento emissor antes de buscar a nota.", variant: "destructive" });
      return;
    }
    setNfeLoading(true);
    try {
      applyNfe(await fetchNfeFromSefaz(chave, est.cnpj));
      setNovaChave("");
      toast({ title: "Nota importada", description: "Confira remetente, destinatário, peso e valores." });
    } catch (e: any) {
      setForm((p) => (p.chaves_nfe_ref.includes(chave) ? p : { ...p, chaves_nfe_ref: [...p.chaves_nfe_ref.filter(Boolean), chave] }));
      setNovaChave("");
      toast({ title: "Nota não encontrada na consulta", description: `${e.message} A chave foi adicionada; complete os dados ou importe o XML.`, variant: "destructive" });
    } finally {
      setNfeLoading(false);
    }
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

  const estSelecionado = establishments.find((e) => e.id === selectedEstId);
  const notasVinculadas = form.chaves_nfe_ref.filter(Boolean).length;
  const tipoCteLabel = TP_CTE_OPTIONS.find((o) => String(form.tp_cte) === o.value)?.label ?? "Normal";
  const rotaOrigem = [form.municipio_origem_nome, form.uf_origem].filter(Boolean).join("/") || "origem";
  const rotaDestino = [form.municipio_destino_nome, form.uf_destino].filter(Boolean).join("/") || "destino";

  return (
  <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col gap-0">
        <SheetHeader className="shrink-0 gap-1.5 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="font-display text-lg leading-tight">
              {cte ? "Editar CT-e" : "Novo CT-e (Rascunho)"}
            </SheetTitle>
            <div className="mr-6 flex shrink-0 items-center gap-1.5">
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {tipoCteLabel}
              </Badge>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide">
                Rascunho
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="max-w-[20rem] truncate font-medium text-foreground">
              {estSelecionado ? estSelecionado.razao_social : "emitente não definido"}
            </span>
            <span aria-hidden>·</span>
            <span className="truncate">{rotaOrigem} <span aria-hidden>→</span> {rotaDestino}</span>
            <span aria-hidden>·</span>
            <span>frete {formatBRL(form.valor_frete)}</span>
            <span aria-hidden>·</span>
            <span>{notasVinculadas} {notasVinculadas === 1 ? "nota" : "notas"}</span>
          </div>
          {linkedContract && (
            <div className="mt-1 inline-flex items-center gap-2 self-start rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">
              <FileSignature className="w-3.5 h-3.5" />
              <span>Vinculado ao Contrato de Frete Nº <strong>{linkedContract.numero}</strong></span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-2.5 overflow-y-auto bg-muted/25 px-4 py-3">

          {/* Emitente + Tipo do documento */}
          <div className="grid gap-2 lg:grid-cols-2">
            <FormBlock
              icon={Building2}
              title="Emitente"
              summary={estSelecionado ? maskCNPJ(estSelecionado.cnpj) : "não definido"}
            >
              <div className="space-y-1">
                <Label className="text-[10px]">Estabelecimento *</Label>
                <Select value={selectedEstId} onValueChange={setSelectedEstId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione o emitente" /></SelectTrigger>
                  <SelectContent>
                    {establishments.map((est) => (
                      <SelectItem key={est.id} value={est.id}>
                        {est.type === "matriz" ? "🏢" : "🏬"} {est.razao_social} ({maskCNPJ(est.cnpj)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Data de emissão *</Label>
                  <Input type="date" className="h-8 text-xs" value={form.data_emissao} onChange={(e) => set("data_emissao", e.target.value)} />
                </div>
              </div>
              {establishments.length === 0 && (
                <p className="text-[11px] text-destructive">Nenhum estabelecimento cadastrado. Cadastre em Configurações Fiscais.</p>
              )}
            </FormBlock>

            <FormBlock icon={FileText} title="Tipo do Documento" summary={`Modal ${form.modal}`}>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Tipo CT-e</Label>
                  <Select value={String(form.tp_cte)} onValueChange={(v) => set("tp_cte", Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TP_CTE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Tipo Serviço</Label>
                  <Select value={String(form.tp_serv)} onValueChange={(v) => set("tp_serv", Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{TP_SERV_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Modal</Label>
                  <Select value={form.modal} onValueChange={(v) => set("modal", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{MODAL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Retira</Label>
                  <Select value={String(form.retira)} onValueChange={(v) => set("retira", Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{RETIRA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </FormBlock>
          </div>


          {/* Envolvidos */}
          <div className="grid gap-2 lg:grid-cols-2">
            <ActorSection
              title="Remetente"
              prefix="remetente"
              form={form}
              set={set}
              lookupCnpj={lookupCnpj}
              cnpjLoading={!!cnpjLoading.remetente}
              cnpjError={cnpjErrors.remetente || ""}
              setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, remetente: v }))}
              onCityResolved={onCityResolved}
            />
            <ActorSection
              title="Destinatário"
              prefix="destinatario"
              form={form}
              set={set}
              lookupCnpj={lookupCnpj}
              cnpjLoading={!!cnpjLoading.destinatario}
              cnpjError={cnpjErrors.destinatario || ""}
              setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, destinatario: v }))}
              onCityResolved={onCityResolved}
            />
            <ActorSection
              title="Expedidor"
              prefix="expedidor"
              form={form}
              set={set}
              lookupCnpj={lookupCnpj}
              cnpjLoading={!!cnpjLoading.expedidor}
              cnpjError={cnpjErrors.expedidor || ""}
              setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, expedidor: v }))}
              onCityResolved={onCityResolved}
            />
            <ActorSection
              title="Recebedor"
              prefix="recebedor"
              form={form}
              set={set}
              lookupCnpj={lookupCnpj}
              cnpjLoading={!!cnpjLoading.recebedor}
              cnpjError={cnpjErrors.recebedor || ""}
              setCnpjError={(v) => setCnpjErrors((p) => ({ ...p, recebedor: v }))}
              onCityResolved={onCityResolved}
            />
          </div>


          {/* Tomador — escolha por checkbox */}
          <FormBlock
            icon={Users}
            title="Tomador do Serviço"
            summary={TOMADOR_TIPO_OPTIONS.find((o) => String(form.tomador_tipo) === o.value)?.label}
          >
            <p className="text-[11px] text-muted-foreground">
              Marque qual dos atores acima é o tomador do serviço (quem paga o frete).
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {TOMADOR_TIPO_OPTIONS.map((o) => {
                const checked = String(form.tomador_tipo) === o.value;
                return (
                  <label
                    key={o.value}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                      checked ? "border-primary bg-primary/5 font-semibold" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => { if (v) set("tomador_tipo", Number(o.value)); }}
                    />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              <div className="space-y-1">
                <Label className="text-[10px]">Ind. IE Tomador</Label>
                <Select value={String(form.ind_ie_toma)} onValueChange={(v) => set("ind_ie_toma", Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{IND_IE_TOMA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
          </FormBlock>


          {/* Prestação — Origem / Destino / Envio */}
          <FormBlock
            icon={MapPin}
            title="Prestação do Serviço"
            summary={`${form.municipio_origem_nome || "origem"} → ${form.municipio_destino_nome || "destino"}`}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <SubBlock title="Origem">
                <div className="space-y-1">
                  <Label className="text-[10px]">Município</Label>
                  <Input className="h-8 text-xs" value={form.municipio_origem_nome} onChange={(e) => set("municipio_origem_nome", maskName(e.target.value))} placeholder="Nome do município" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">IBGE</Label>
                    <Input className="h-8 text-xs" value={form.municipio_origem_ibge} onChange={(e) => set("municipio_origem_ibge", e.target.value)} placeholder="0000000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">UF</Label>
                    <Select value={form.uf_origem || undefined} onValueChange={(v) => set("uf_origem", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </SubBlock>
              <SubBlock title="Destino">
                <div className="space-y-1">
                  <Label className="text-[10px]">Município</Label>
                  <Input className="h-8 text-xs" value={form.municipio_destino_nome} onChange={(e) => set("municipio_destino_nome", maskName(e.target.value))} placeholder="Nome do município" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">IBGE</Label>
                    <Input className="h-8 text-xs" value={form.municipio_destino_ibge} onChange={(e) => set("municipio_destino_ibge", e.target.value)} placeholder="0000000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">UF</Label>
                    <Select value={form.uf_destino || undefined} onValueChange={(v) => set("uf_destino", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </SubBlock>
              <SubBlock title="Envio">
                <div className="space-y-1">
                  <Label className="text-[10px]">Município</Label>
                  <Input className="h-8 text-xs" value={form.municipio_envio_nome} onChange={(e) => set("municipio_envio_nome", maskName(e.target.value))} placeholder="Município de envio" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">IBGE</Label>
                    <Input className="h-8 text-xs" value={form.municipio_envio_ibge} onChange={(e) => set("municipio_envio_ibge", e.target.value)} placeholder="0000000" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">UF</Label>
                    <Select value={form.uf_envio || undefined} onValueChange={(v) => set("uf_envio", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="UF" /></SelectTrigger>
                      <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </SubBlock>
            </div>
          </FormBlock>


          {/* Valores e Tributos */}
          <FormBlock
            icon={DollarSign}
            title="Valores e Tributos"
            summary={`frete ${formatBRL(form.valor_frete)} · IBS+CBS ${formatBRL(form.ibs_uf_valor + form.ibs_mun_valor + form.cbs_valor)}`}
          >

            <SubBlock title="Frete e Recebimento">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Valor Frete (vTPrest)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <Input
                      className="h-8 pl-8 text-xs"
                      value={form.valor_frete ? maskCurrency(String(Math.round(form.valor_frete * 100))) : ""}
                      onChange={(e) => set("valor_frete", Number(unmaskCurrency(e.target.value)) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Valor a Receber (vRec)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <Input
                      className="h-8 pl-8 text-xs"
                      value={form.valor_receber ? maskCurrency(String(Math.round(form.valor_receber * 100))) : ""}
                      onChange={(e) => set("valor_receber", Number(unmaskCurrency(e.target.value)) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Total de Tributos</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <Input
                      className="h-8 pl-8 text-xs"
                      value={form.valor_total_tributos ? maskCurrency(String(Math.round(form.valor_total_tributos * 100))) : ""}
                      onChange={(e) => set("valor_total_tributos", Number(unmaskCurrency(e.target.value)) || 0)}
                    />
                  </div>
                </div>
              </div>
            </SubBlock>

            <SubBlock title="ICMS e Operação">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Alíquota ICMS (%)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={form.aliquota_icms} onChange={(e) => set("aliquota_icms", Number(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Base Cálculo ICMS</Label>
                  <Input className="h-8 bg-muted text-xs text-muted-foreground" value={form.base_calculo_icms ? maskCurrency(String(Math.round(form.base_calculo_icms * 100))) : "0,00"} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Valor ICMS</Label>
                  <Input className="h-8 bg-muted text-xs text-muted-foreground" value={form.valor_icms ? maskCurrency(String(Math.round(form.valor_icms * 100))) : "0,00"} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CST ICMS</Label>
                  <Input className="h-8 text-xs" value={form.cst_icms} onChange={(e) => set("cst_icms", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CFOP</Label>
                  <Select value={form.cfop} onValueChange={(v) => set("cfop", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{CFOPS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Natureza da Operação</Label>
                  <Input className="h-8 text-xs" value={form.natureza_operacao} onChange={(e) => set("natureza_operacao", e.target.value)} />
                </div>
              </div>
            </SubBlock>


            {/* IBS / CBS — Reforma Tributária 2026 (obrigatório no CT-e) */}
            <SubBlock title="IBS / CBS — Reforma Tributária 2026">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Situação (CST)</Label>
                  <Input className="h-8 text-xs" value={form.ibs_cbs_cst} maxLength={3} onChange={(e) => set("ibs_cbs_cst", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Classificação</Label>
                  <Input className="h-8 text-xs" value={form.ibs_cbs_class_trib} maxLength={6} onChange={(e) => set("ibs_cbs_class_trib", e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px]">Base de cálculo</Label>
                  <Input className="h-8 bg-muted text-xs text-muted-foreground" disabled value={formatBRL(form.ibs_cbs_base_calculo)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">IBS Estadual (%)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={form.ibs_uf_aliquota} onChange={(e) => set("ibs_uf_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.ibs_uf_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">IBS Municipal (%)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={form.ibs_mun_aliquota} onChange={(e) => set("ibs_mun_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.ibs_mun_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CBS (%)</Label>
                  <Input className="h-8 text-xs" type="number" step="0.01" value={form.cbs_aliquota} onChange={(e) => set("cbs_aliquota", Number(e.target.value))} />
                  <p className="text-[10px] text-muted-foreground">{formatBRL(form.cbs_valor)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Total IBS + CBS</Label>
                  <Input className="h-8 bg-muted text-xs text-muted-foreground" disabled value={formatBRL(form.ibs_uf_valor + form.ibs_mun_valor + form.cbs_valor)} />
                </div>
              </div>
            </SubBlock>


            {/* Seguro da carga (obrigatório para emitir) */}
            <SubBlock title="Seguro da Carga" hint="Preenchido automaticamente com a seguradora padrão do emitente (Configurações › Fiscal).">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">Responsável pelo seguro</Label>
                  <Select value={String(form.seguro_responsavel)} onValueChange={(v) => set("seguro_responsavel", Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
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
                  <Input className="h-8 text-xs" value={form.seguradora_nome} onChange={(e) => set("seguradora_nome", e.target.value.toUpperCase())} placeholder="Ex.: SURA" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">CNPJ da seguradora</Label>
                  <Input className="h-8 text-xs" value={form.seguradora_cnpj} maxLength={18} onChange={(e) => set("seguradora_cnpj", maskCNPJ(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Nº da apólice</Label>
                  <Input className="h-8 text-xs" value={form.apolice_numero} onChange={(e) => set("apolice_numero", e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[10px]">Nº da averbação (opcional)</Label>
                  <Input className="h-8 text-xs" value={form.averbacao_numero} onChange={(e) => set("averbacao_numero", e.target.value)} />
                </div>
              </div>
            </SubBlock>


            <SubBlock
              title="Desconto (interno)"
              hint="Registrado apenas internamente. Não altera o vTPrest enviado à SEFAZ — ajuste o 'Valor Frete' manualmente, se necessário."
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total do desconto</span>
                <span className={`font-mono text-xs font-semibold ${calcDescontoTotal(desconto) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {calcDescontoTotal(desconto) > 0 ? `− ${formatBRL(calcDescontoTotal(desconto))}` : "nenhum"}
                </span>
              </div>
              <CteDescontoFields value={desconto} onChange={setDesconto} />
            </SubBlock>

            <SubBlock
              title="Componentes do Frete"
              hint={form.componentes_frete.length === 0 ? "nenhum componente" : undefined}
            >
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => set("componentes_frete", [...form.componentes_frete, { xNome: "", vComp: 0 }])}
                >
                  <Plus className="w-3 h-3" /> Adicionar componente
                </Button>
              </div>
              {form.componentes_frete.map((comp, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1 text-xs"
                    placeholder="Nome (ex: FRETE VALOR)"
                    value={comp.xNome}
                    onChange={(e) => {
                      const arr = [...form.componentes_frete];
                      arr[i] = { ...arr[i], xNome: e.target.value };
                      set("componentes_frete", arr);
                    }}
                  />
                  <div className="relative w-32">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <Input
                      className="h-8 pl-7 text-xs"
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
            </SubBlock>

          </FormBlock>


          {/* Carga */}
          <FormBlock
            icon={Package}
            title="Informações da Carga"
            summary={form.produto_predominante ? `${form.produto_predominante}${form.peso_bruto ? ` · ${form.peso_bruto} kg` : ""}` : "produto não informado"}
          >

            <SubBlock title="Carga cadastrada" hint="Ao escolher uma carga, produto, peso, valor e cidades são preenchidos.">
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
                  className="h-8 w-8 shrink-0"
                  title="Cadastrar nova carga"
                  onClick={() => setShowCargaForm(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </SubBlock>

            <SubBlock title="Produto e tipo de carga">
              <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[10px]">Produto predominante</Label>
                  <NaturezaCargaSearchInput
                    value={form.produto_predominante || ""}
                    onChange={(v) => set("produto_predominante", v)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Tipo da carga</Label>
                  <Select value={form.tipo_carga || undefined} onValueChange={(v) => set("tipo_carga", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
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
              </div>
            </SubBlock>

            <SubBlock title="Quantidades (infQ)" hint={form.info_quantidade.length === 0 ? "nenhuma quantidade informada" : undefined}>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => set("info_quantidade", [...form.info_quantidade, { cUnid: "01", tpMed: "", qCarga: 0 }])}
                >
                  <Plus className="w-3 h-3" /> Adicionar quantidade
                </Button>
              </div>
              {form.info_quantidade.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select
                    value={q.cUnid}
                    onValueChange={(v) => {
                      const arr = [...form.info_quantidade];
                      arr[i] = { ...arr[i], cUnid: v };
                      set("info_quantidade", arr);
                    }}
                  >
                    <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
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
                    className="h-8 flex-1 text-xs"
                    placeholder="Tipo medida (ex: PESO BRUTO)"
                    value={q.tpMed}
                    onChange={(e) => {
                      const arr = [...form.info_quantidade];
                      arr[i] = { ...arr[i], tpMed: e.target.value };
                      set("info_quantidade", arr);
                    }}
                  />
                  <Input
                    className="h-8 w-28 text-xs"
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
            </SubBlock>

          </FormBlock>


          {/* Notas fiscais da carga */}
          <FormBlock
            icon={FileText}
            title="Notas Fiscais da Carga"
            summary={`${form.chaves_nfe_ref.filter(Boolean).length} ${form.chaves_nfe_ref.filter(Boolean).length === 1 ? "nota vinculada" : "notas vinculadas"}`}
          >


            <SubBlock
              title="Adicionar nota fiscal"
              hint="A busca pela chave só encontra notas em que a Sime é transportadora ou destinatária. Se não encontrar, importe o XML. Remetente, destinatário, peso, valor e cidades são preenchidos sozinhos."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  className="h-8 flex-1 font-mono text-xs"
                  placeholder="Cole ou digite a chave de acesso (44 dígitos)"
                  maxLength={44}
                  value={novaChave}
                  onChange={(e) => setNovaChave(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscarChave(novaChave); } }}
                />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={nfeLoading || novaChave.length !== 44} onClick={() => buscarChave(novaChave)}>
                    {nfeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Buscar pela chave
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => xmlInputRef.current?.click()}>
                    <Upload className="h-3 w-3" /> Importar XML
                  </Button>
                  <input ref={xmlInputRef} type="file" accept=".xml,text/xml" multiple className="hidden" onChange={handleXmlFiles} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => set("chaves_nfe_ref", [...form.chaves_nfe_ref, ""])}>
                  <Plus className="w-3 h-3" /> Digitar nota manualmente
                </Button>
              </div>
            </SubBlock>


            {/* Lista de notas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Notas vinculadas ({form.chaves_nfe_ref.filter(Boolean).length})</Label>
                {form.chaves_nfe_ref.filter((c) => c.length === 44).length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={nfeLoading} onClick={importFromSefaz}>
                    <Search className="w-3 h-3" /> Buscar todas novamente
                  </Button>
                )}
              </div>
              {form.chaves_nfe_ref.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed border-border p-3 text-center">
                  Nenhuma nota vinculada ainda.
                </p>
              )}
              {form.chaves_nfe_ref.map((chave, i) => {
                const d = getNfeDetalhe(chave);
                return (
                  <div key={i} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">
                        Nota {i + 1}{d.numero ? ` — nº ${d.numero}${d.serie ? ` / série ${d.serie}` : ""}` : ""}
                      </span>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={nfeLoading || chave.length !== 44} onClick={() => buscarChave(chave)}>
                          <Search className="w-3 h-3" /> Buscar
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => {
                          set("chaves_nfe_ref", form.chaves_nfe_ref.filter((_, j) => j !== i));
                        }}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[10px]">Chave de acesso</Label>
                      <Input
                        className="h-7 font-mono text-xs"
                        placeholder="44 dígitos"
                        maxLength={44}
                        value={chave}
                        onChange={(e) => {
                          const arr = [...form.chaves_nfe_ref];
                          arr[i] = e.target.value.replace(/\D/g, "");
                          set("chaves_nfe_ref", arr);
                        }}
                      />
                    </div>
                    {chave.length === 44 && (
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        <div className="space-y-0.5"><Label className="text-[10px]">Número</Label><Input className="h-7 text-xs" value={d.numero} onChange={(e) => setNfeDetalhe(chave, { numero: e.target.value.replace(/\D/g, "") })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Série</Label><Input className="h-7 text-xs" value={d.serie} onChange={(e) => setNfeDetalhe(chave, { serie: e.target.value.replace(/\D/g, "") })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Data de emissão</Label><Input type="date" className="h-7 text-xs" value={d.data_emissao} onChange={(e) => setNfeDetalhe(chave, { data_emissao: e.target.value })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Valor da nota</Label><Input className="h-7 text-xs" value={d.valor ? maskCurrency(String(Math.round(d.valor * 100))) : ""} onChange={(e) => setNfeDetalhe(chave, { valor: Number(unmaskCurrency(e.target.value)) || 0 })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Peso (kg)</Label><Input type="number" className="h-7 text-xs" value={d.peso || ""} onChange={(e) => setNfeDetalhe(chave, { peso: Number(e.target.value) || 0 })} /></div>
                        <div className="space-y-0.5"><Label className="text-[10px]">Espécie</Label><Input className="h-7 text-xs" value={d.especie} onChange={(e) => setNfeDetalhe(chave, { especie: e.target.value.toUpperCase() })} /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>


            <SubBlock title="Totais da carga" hint="Somados automaticamente das notas vinculadas. Editável se necessário.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Peso bruto total (kg)</Label>
                  <Input type="number" step="0.01" className="h-8 text-xs" value={form.peso_bruto || ""} onChange={(e) => set("peso_bruto", Number(e.target.value) || 0)} />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Valor da mercadoria (vCarga)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">R$</span>
                    <Input
                      className="h-8 text-xs pl-8"
                      value={form.valor_carga ? maskCurrency(String(Math.round(form.valor_carga * 100))) : ""}
                      onChange={(e) => set("valor_carga", Number(unmaskCurrency(e.target.value)) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Valor averbado (seguro)</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">R$</span>
                    <Input
                      className="h-8 text-xs pl-8"
                      value={form.valor_carga_averb ? maskCurrency(String(Math.round(form.valor_carga_averb * 100))) : ""}
                      onChange={(e) => set("valor_carga_averb", Number(unmaskCurrency(e.target.value)) || 0)}
                    />
                  </div>
                </div>
              </div>
            </SubBlock>


            <SubBlock title="Outros documentos" hint="Para cargas sem NF-e.">
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]"
                  onClick={() => set("outros_documentos", [...form.outros_documentos, { tipo: "99", descricao: "", numero: "", data_emissao: "", valor: 0 }])}>
                  <Plus className="w-3 h-3" /> Adicionar documento
                </Button>
              </div>
              {form.outros_documentos.map((o, i) => {
                const upd = (patch: Partial<OutroDoc>) => {
                  const arr = [...form.outros_documentos];
                  arr[i] = { ...arr[i], ...patch };
                  set("outros_documentos", arr);
                };
                return (
                  <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-6">

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
            </SubBlock>
          </FormBlock>



          {/* Transporte */}
          <FormBlock
            icon={Truck}
            title="Transporte"
            summary={form.placa_veiculo ? [form.placa_veiculo, form.reboque1_placa, form.reboque2_placa].filter(Boolean).join(" + ") : "veículo não definido"}
          >

            <SubBlock title="Motorista e veículo">
              <div className="space-y-1">
                <Label className="text-[10px]">Buscar motorista</Label>
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
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px]">Placa</Label>
                  <Input
                    className="h-8 text-xs uppercase"
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
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">RNTRC</Label>
                  <Input className="h-8 text-xs" value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Carreta 1</Label>
                  <Input className="h-8 text-xs uppercase" value={form.reboque1_placa} maxLength={8} placeholder="ABC-1D23" onChange={(e) => set("reboque1_placa", maskPlate(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Carreta 2</Label>
                  <Input className="h-8 text-xs uppercase" value={form.reboque2_placa} maxLength={8} placeholder="ABC-1D23" onChange={(e) => set("reboque2_placa", maskPlate(e.target.value))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Nº de eixos</Label>
                  <Input className="h-8 text-xs" type="number" min={2} max={12} value={form.numero_eixos ?? ""} onChange={(e) => set("numero_eixos", e.target.value ? Number(e.target.value) : null)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Lotação</Label>
                  <Select value={form.lotacao ? "1" : "0"} onValueChange={(v) => set("lotacao", v === "1")}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Sim</SelectItem>
                      <SelectItem value="0">Não</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SubBlock>

            <SubBlock title="Contratado" hint="Dono do caminhão, quando ele for de terceiro.">
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
            </SubBlock>

            <SubBlock title="Viagem">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px]">Previsão de saída</Label>
                  <Input className="h-8 text-xs" type="date" value={form.previsao_saida} onChange={(e) => set("previsao_saida", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Previsão de chegada</Label>
                  <Input className="h-8 text-xs" type="date" value={form.previsao_chegada} onChange={(e) => set("previsao_chegada", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Pedido / Ordem carreg.</Label>
                  <Input className="h-8 text-xs" value={form.pedido_numero} onChange={(e) => set("pedido_numero", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Pedágio</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">R$</span>
                    <Input className="h-8 pl-8 text-xs" value={form.valor_pedagio ? maskCurrency(String(Math.round(form.valor_pedagio * 100))) : ""} onChange={(e) => set("valor_pedagio", Number(unmaskCurrency(e.target.value)) || 0)} />
                  </div>
                </div>
              </div>
              {form.previsao_saida && form.previsao_chegada && form.previsao_chegada < form.previsao_saida && (
                <p className="text-[11px] text-destructive">A previsão de chegada está antes da saída.</p>
              )}
            </SubBlock>

          </FormBlock>


          {/* Observações */}
          <FormBlock
            icon={FileText}
            title="Observações"
            defaultOpen={false}
            summary={form.observacoes ? form.observacoes.slice(0, 70) : "sem observações"}
          >
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} className="text-xs" placeholder="Informações complementares..." />
          </FormBlock>
        </div>

        {/* Footer fixo */}
        <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 py-2.5">
          {!linkedContract && (
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox checked={gerarContrato} onCheckedChange={(v) => setGerarContrato(!!v)} className="mt-0.5" />
              <span className="text-[11px] leading-tight">
                <span className="flex items-center gap-1 font-semibold">
                  <FileSignature className="h-3.5 w-3.5" /> Gerar contrato de frete
                </span>
                <span className="block text-muted-foreground">
                  Após salvar, abre o contrato de fretamento (subcontratado) e gera conta a pagar à vista.
                </span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
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
