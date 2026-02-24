import { useEffect, useState, useCallback } from "react";
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
import { MapPin, Building2, DollarSign, Truck, FileText, Loader2, Users, Package, Plus, X } from "lucide-react";
import { maskCNPJ, unmaskCNPJ, maskCurrency, unmaskCurrency, maskName, maskPlate, unmaskPlate } from "@/lib/masks";
import { PersonSearchInput } from "./PersonSearchInput";
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
  tomador_tipo: 3,
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
  peso_bruto: 0,
  // Carga
  componentes_frete: [] as { xNome: string; vComp: number }[],
  info_quantidade: [] as { cUnid: string; tpMed: string; qCarga: number }[],
  chaves_nfe_ref: [] as string[],
  // Obs
  observacoes: "",
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
    <section className="space-y-3">
      <SectionHeader icon={Building2} title={title} />
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Buscar no cadastro</Label>
        <PersonSearchInput
          categories={searchCategories}
          placeholder={`Buscar ${title.toLowerCase()} cadastrado...`}
          selectedName={form[`${prefix}_nome`] || undefined}
          onSelect={(person) => {
            set(`${prefix}_nome`, person.razao_social || person.full_name);
            set(`${prefix}_cnpj`, person.cnpj ? maskCNPJ(person.cnpj) : form[`${prefix}_cnpj`]);
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
                const masked = maskCNPJ(e.target.value);
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [selectedEstId, setSelectedEstId] = useState<string>("");

  // CNPJ loading states for each actor
  const [cnpjLoading, setCnpjLoading] = useState<Record<string, boolean>>({});
  const [cnpjErrors, setCnpjErrors] = useState<Record<string, string>>({});

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
          if (!selectedEstId && data.length > 0) setSelectedEstId(data[0].id);
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
        remetente_cnpj: cte.remetente_cnpj ? maskCNPJ(cte.remetente_cnpj) : "",
        remetente_ie: cte.remetente_ie || "",
        remetente_endereco: cte.remetente_endereco || "",
        remetente_municipio_ibge: cte.remetente_municipio_ibge || "",
        remetente_uf: cte.remetente_uf || "",
        destinatario_nome: cte.destinatario_nome ? maskName(cte.destinatario_nome) : "",
        destinatario_cnpj: cte.destinatario_cnpj ? maskCNPJ(cte.destinatario_cnpj) : "",
        destinatario_ie: cte.destinatario_ie || "",
        destinatario_endereco: cte.destinatario_endereco || "",
        destinatario_municipio_ibge: cte.destinatario_municipio_ibge || "",
        destinatario_uf: cte.destinatario_uf || "",
        expedidor_nome: cte.expedidor_nome ? maskName(cte.expedidor_nome) : "",
        expedidor_cnpj: cte.expedidor_cnpj ? maskCNPJ(cte.expedidor_cnpj) : "",
        expedidor_ie: cte.expedidor_ie || "",
        expedidor_endereco: cte.expedidor_endereco || "",
        expedidor_municipio_ibge: cte.expedidor_municipio_ibge || "",
        expedidor_uf: cte.expedidor_uf || "",
        recebedor_nome: cte.recebedor_nome ? maskName(cte.recebedor_nome) : "",
        recebedor_cnpj: cte.recebedor_cnpj ? maskCNPJ(cte.recebedor_cnpj) : "",
        recebedor_ie: cte.recebedor_ie || "",
        recebedor_endereco: cte.recebedor_endereco || "",
        recebedor_municipio_ibge: cte.recebedor_municipio_ibge || "",
        recebedor_uf: cte.recebedor_uf || "",
        tomador_tipo: cte.tomador_tipo ?? 3,
        tomador_nome: cte.tomador_nome ? maskName(cte.tomador_nome) : "",
        tomador_cnpj: cte.tomador_cnpj ? maskCNPJ(cte.tomador_cnpj) : "",
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
        peso_bruto: Number(cte.peso_bruto) || 0,
        componentes_frete: Array.isArray(cte.componentes_frete) ? cte.componentes_frete : [],
        info_quantidade: Array.isArray(cte.info_quantidade) ? cte.info_quantidade : [],
        chaves_nfe_ref: Array.isArray(cte.chaves_nfe_ref) ? cte.chaves_nfe_ref : [],
        observacoes: cte.observacoes || "",
      });
      if (cte.establishment_id) setSelectedEstId(cte.establishment_id);
    } else {
      setForm(defaultForm);
    }
  }, [cte, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const lookupCnpj = useCallback(async (raw: string, prefix: string) => {
    if (raw.length !== 14) return;
    setCnpjLoading((p) => ({ ...p, [prefix]: true }));
    setCnpjErrors((p) => ({ ...p, [prefix]: "" }));
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) { setCnpjErrors((p) => ({ ...p, [prefix]: "CNPJ não encontrado" })); return; }
      const data = await res.json();
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

  // Auto-fill valor_receber = valor_frete when changing
  useEffect(() => {
    setForm((p) => ({ ...p, valor_receber: p.valor_frete }));
  }, [form.valor_frete]);

  const handleSave = async () => {
    if (!user) return;
    if (!selectedEstId) {
      toast({ title: "Campos obrigatórios", description: "Selecione o estabelecimento emissor.", variant: "destructive" });
      return;
    }
    if (!form.remetente_nome || !form.destinatario_nome) {
      toast({ title: "Campos obrigatórios", description: "Preencha remetente e destinatário.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        ...form,
        remetente_cnpj: unmaskCNPJ(form.remetente_cnpj) || form.remetente_cnpj,
        destinatario_cnpj: unmaskCNPJ(form.destinatario_cnpj) || form.destinatario_cnpj,
        expedidor_cnpj: unmaskCNPJ(form.expedidor_cnpj) || form.expedidor_cnpj || null,
        recebedor_cnpj: unmaskCNPJ(form.recebedor_cnpj) || form.recebedor_cnpj || null,
        tomador_cnpj: unmaskCNPJ(form.tomador_cnpj) || form.tomador_cnpj || null,
        placa_veiculo: unmaskPlate(form.placa_veiculo) || form.placa_veiculo,
        created_by: user.id,
        status: "rascunho",
        establishment_id: selectedEstId,
        // Nullify empty actor fields
        expedidor_nome: form.expedidor_nome || null,
        recebedor_nome: form.recebedor_nome || null,
        tomador_nome: form.tomador_nome || null,
        valor_carga_averb: form.valor_carga_averb || null,
      };

      if (cte) {
        const { error } = await supabase.from("ctes").update(payload).eq("id", cte.id);
        if (error) throw error;
        toast({ title: "CT-e atualizado" });
      } else {
        const { error } = await supabase.from("ctes").insert(payload);
        if (error) throw error;
        toast({ title: "CT-e criado", description: "Rascunho salvo com sucesso." });
      }
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Determine if tomador fields should show (toma=4 means "outros" → needs separate data)
  const showTomadorFields = form.tomador_tipo === 4;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl">
            {cte ? "Editar CT-e" : "Novo CT-e (Rascunho)"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Emitente (Estabelecimento) */}
          <section className="space-y-3">
            <SectionHeader icon={Building2} title="Emitente" />
            <div className="space-y-1.5">
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
            {establishments.length === 0 && (
              <p className="text-xs text-destructive">Nenhum estabelecimento cadastrado. Cadastre em Configurações Fiscais.</p>
            )}
          </section>

          <Separator />

          {/* Tipo CT-e / Serviço / Modal */}
          <section className="space-y-3">
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

          {/* Tomador */}
          <section className="space-y-3">
            <SectionHeader icon={Users} title="Tomador do Serviço" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tomador *</Label>
                <Select value={String(form.tomador_tipo)} onValueChange={(v) => set("tomador_tipo", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TOMADOR_TIPO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ind. IE Tomador</Label>
                <Select value={String(form.ind_ie_toma)} onValueChange={(v) => set("ind_ie_toma", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            {!showTomadorFields && (
              <p className="text-xs text-muted-foreground">
                Tomador = <strong>{TOMADOR_TIPO_OPTIONS.find((o) => o.value === String(form.tomador_tipo))?.label}</strong> (dados já preenchidos acima)
              </p>
            )}
          </section>

          <Separator />

          {/* Prestação — Origem / Destino */}
          <section className="space-y-3">
            <SectionHeader icon={MapPin} title="Prestação" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <Card className="border-border bg-muted/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Origem</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_origem_nome} onChange={(e) => set("municipio_origem_nome", maskName(e.target.value))} placeholder="Nome do município" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_destino_nome} onChange={(e) => set("municipio_destino_nome", maskName(e.target.value))} placeholder="Nome do município" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
          <section className="space-y-3">
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

            {/* Componentes do Frete */}
            <div className="space-y-2">
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
          <section className="space-y-3">
            <SectionHeader icon={Package} title="Carga" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Produto Predominante</Label>
                <Input value={form.produto_predominante} onChange={(e) => set("produto_predominante", maskName(e.target.value))} placeholder="Ex: Sulfato de Cálcio" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Peso Bruto (kg)</Label>
                <Input type="number" step="0.01" value={form.peso_bruto} onChange={(e) => set("peso_bruto", Number(e.target.value))} />
              </div>
            </div>

            {/* Quantidades */}
            <div className="space-y-2">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">NF-e Referenciadas</Label>
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
              {form.chaves_nfe_ref.map((chave, i) => (
                <div key={i} className="flex gap-2 items-center">
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
              ))}
            </div>
          </section>

          <Separator />

          {/* Transporte */}
          <section className="space-y-3">
            <SectionHeader icon={Truck} title="Transporte" />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Buscar motorista</Label>
              <PersonSearchInput
                categories={["motorista"]}
                placeholder="Buscar motorista cadastrado..."
                onSelect={(person) => set("motorista_id", person.user_id)}
                onClear={() => set("motorista_id", null)}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Placa</Label>
                <Input value={form.placa_veiculo} onChange={(e) => set("placa_veiculo", maskPlate(e.target.value))} maxLength={8} placeholder="ABC-1D23" className="uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RNTRC</Label>
                <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Observações */}
          <section className="space-y-3">
            <SectionHeader icon={FileText} title="Observações" />
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} placeholder="Informações complementares..." />
          </section>
        </div>

        {/* Footer fixo */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end gap-3 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : cte ? "Atualizar" : "Salvar Rascunho"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
