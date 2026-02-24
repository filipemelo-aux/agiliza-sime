import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskCNPJ, unmaskCNPJ, maskCEP, unmaskCEP, maskName, maskOnlyNumbers } from "@/lib/masks";
import { useCepLookup } from "@/hooks/useCepLookup";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Establishment = Tables<"fiscal_establishments">;
type Certificate = Tables<"fiscal_certificates">;

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const defaultForm = {
  razao_social: "",
  nome_fantasia: "",
  cnpj: "",
  inscricao_estadual: "",
  type: "filial" as "matriz" | "filial",
  rntrc: "",
  serie_cte: 1,
  serie_mdfe: 1,
  ultimo_numero_cte: 0,
  ultimo_numero_mdfe: 0,
  endereco_logradouro: "",
  endereco_numero: "",
  endereco_bairro: "",
  endereco_municipio: "",
  endereco_uf: "SP",
  endereco_cep: "",
  codigo_municipio_ibge: "",
  ambiente: "homologacao",
  active: true,
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishment: Establishment | null;
  onSaved: () => void;
}

export function FiscalEstablishmentForm({ open, onOpenChange, establishment, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedCertId, setSelectedCertId] = useState<string>("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState("");

  // Load certificates
  useEffect(() => {
    if (!open) return;
    supabase
      .from("fiscal_certificates")
      .select("*")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        setCertificates(data || []);
      });

    // Load existing link
    if (establishment) {
      supabase
        .from("establishment_certificates")
        .select("certificate_id")
        .eq("establishment_id", establishment.id)
        .maybeSingle()
        .then(({ data }) => {
          setSelectedCertId(data?.certificate_id || "");
        });
    } else {
      setSelectedCertId("");
    }
  }, [open, establishment]);

  useEffect(() => {
    if (establishment) {
      setForm({
        razao_social: establishment.razao_social || "",
        nome_fantasia: establishment.nome_fantasia || "",
        cnpj: establishment.cnpj ? maskCNPJ(establishment.cnpj) : "",
        inscricao_estadual: establishment.inscricao_estadual || "",
        type: establishment.type as "matriz" | "filial",
        rntrc: establishment.rntrc || "",
        serie_cte: establishment.serie_cte ?? 1,
        serie_mdfe: establishment.serie_mdfe ?? 1,
        ultimo_numero_cte: establishment.ultimo_numero_cte ?? 0,
        ultimo_numero_mdfe: establishment.ultimo_numero_mdfe ?? 0,
        endereco_logradouro: establishment.endereco_logradouro || "",
        endereco_numero: establishment.endereco_numero || "",
        endereco_bairro: establishment.endereco_bairro || "",
        endereco_municipio: establishment.endereco_municipio || "",
        endereco_uf: establishment.endereco_uf || "SP",
        endereco_cep: establishment.endereco_cep ? maskCEP(establishment.endereco_cep) : "",
        codigo_municipio_ibge: establishment.codigo_municipio_ibge || "",
        ambiente: establishment.ambiente || "homologacao",
        active: establishment.active ?? true,
      });
    } else {
      setForm(defaultForm);
    }
  }, [establishment, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleCnpjLookup = useCallback(async (cnpjValue?: string) => {
    const raw = unmaskCNPJ(cnpjValue || form.cnpj);
    if (raw.length !== 14) return;
    setCnpjLoading(true);
    setCnpjError("");
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${raw}`);
      if (!res.ok) {
        setCnpjError("CNPJ não encontrado");
        return;
      }
      const data = await res.json();
      setForm((p) => ({
        ...p,
        razao_social: data.razao_social ? maskName(data.razao_social) : p.razao_social,
        nome_fantasia: data.nome_fantasia ? maskName(data.nome_fantasia) : p.nome_fantasia,
        endereco_logradouro: data.logradouro ? maskName(data.logradouro) : p.endereco_logradouro,
        endereco_numero: data.numero || p.endereco_numero,
        endereco_bairro: data.bairro ? maskName(data.bairro) : p.endereco_bairro,
        endereco_municipio: data.municipio ? maskName(data.municipio) : p.endereco_municipio,
        endereco_uf: data.uf || p.endereco_uf,
        endereco_cep: data.cep ? maskCEP(data.cep.replace(/\D/g, "")) : p.endereco_cep,
      }));
    } catch {
      setCnpjError("Erro ao consultar CNPJ");
    } finally {
      setCnpjLoading(false);
    }
  }, [form.cnpj]);

  const { lookupCep, loading: cepLoading, error: cepError } = useCepLookup(
    useCallback((data) => {
      setForm((p) => ({
        ...p,
        endereco_logradouro: data.street || p.endereco_logradouro,
        endereco_bairro: data.neighborhood || p.endereco_bairro,
        endereco_municipio: data.city || p.endereco_municipio,
        endereco_uf: data.state || p.endereco_uf,
        endereco_cep: data.cep || p.endereco_cep,
      }));
    }, [])
  );

  const handleSave = async () => {
    if (!form.razao_social || !form.cnpj) {
      toast({ title: "Campos obrigatórios", description: "Preencha razão social e CNPJ.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        cnpj: unmaskCNPJ(form.cnpj) || form.cnpj,
        endereco_cep: unmaskCEP(form.endereco_cep) || form.endereco_cep,
      };

      let estId: string;
      if (establishment) {
        const { error } = await supabase
          .from("fiscal_establishments")
          .update(payload)
          .eq("id", establishment.id);
        if (error) throw error;
        estId = establishment.id;
        toast({ title: "Estabelecimento atualizado" });
      } else {
        const { data, error } = await supabase
          .from("fiscal_establishments")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        estId = data.id;
        toast({ title: "Estabelecimento criado" });
      }

      // Manage certificate link
      await supabase.from("establishment_certificates").delete().eq("establishment_id", estId);
      if (selectedCertId) {
        await supabase.from("establishment_certificates").insert({
          establishment_id: estId,
          certificate_id: selectedCertId,
        });
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl">
            {establishment ? "Editar Estabelecimento" : "Novo Estabelecimento"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Tipo e Ativo */}
          <div className="flex items-center gap-6">
            <div className="space-y-1.5 flex-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matriz">Matriz</SelectItem>
                  <SelectItem value="filial">Filial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>

          {/* Certificado Digital */}
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Certificado Digital
            </Label>
            <Select value={selectedCertId || "none"} onValueChange={(v) => setSelectedCertId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Nenhum certificado vinculado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {certificates.map((cert) => (
                  <SelectItem key={cert.id} value={cert.id}>
                    {cert.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dados */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Razão Social *</Label>
              <Input value={form.razao_social} onChange={(e) => set("razao_social", maskName(e.target.value))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Nome Fantasia</Label>
              <Input value={form.nome_fantasia} onChange={(e) => set("nome_fantasia", maskName(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ *</Label>
              <div className="relative">
                <Input
                  value={form.cnpj}
                  onChange={(e) => {
                    setCnpjError("");
                    const masked = maskCNPJ(e.target.value);
                    const raw = unmaskCNPJ(masked);
                    set("cnpj", masked);
                    if (raw.length === 14) handleCnpjLookup(masked);
                  }}
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                />
                {cnpjLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {cnpjError && <p className="text-xs text-destructive">{cnpjError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Inscrição Estadual</Label>
              <Input value={form.inscricao_estadual} onChange={(e) => set("inscricao_estadual", maskOnlyNumbers(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RNTRC</Label>
              <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ambiente</Label>
              <Select value={form.ambiente} onValueChange={(v) => set("ambiente", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Endereço */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <div className="relative">
                <Input
                  value={form.endereco_cep}
                  maxLength={9}
                  onChange={(e) => {
                    const masked = maskCEP(e.target.value);
                    set("endereco_cep", masked);
                    const raw = masked.replace(/\D/g, "");
                    if (raw.length === 8) lookupCep(raw);
                  }}
                  placeholder="00000-000"
                />
                {cepLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {cepError && <p className="text-xs text-destructive">{cepError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Número</Label>
              <Input value={form.endereco_numero} onChange={(e) => set("endereco_numero", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Logradouro</Label>
              <Input value={form.endereco_logradouro} onChange={(e) => set("endereco_logradouro", maskName(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Bairro</Label>
              <Input value={form.endereco_bairro} onChange={(e) => set("endereco_bairro", maskName(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Município</Label>
              <Input value={form.endereco_municipio} onChange={(e) => set("endereco_municipio", maskName(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">UF</Label>
              <Select value={form.endereco_uf} onValueChange={(v) => set("endereco_uf", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cód. Município IBGE</Label>
              <Input value={form.codigo_municipio_ibge} onChange={(e) => set("codigo_municipio_ibge", maskOnlyNumbers(e.target.value))} maxLength={7} />
            </div>
          </div>

          {/* Séries */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Série CT-e</Label>
              <Input type="number" value={form.serie_cte} onChange={(e) => set("serie_cte", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Último Nº CT-e</Label>
              <Input type="number" value={form.ultimo_numero_cte} onChange={(e) => set("ultimo_numero_cte", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Série MDF-e</Label>
              <Input type="number" value={form.serie_mdfe} onChange={(e) => set("serie_mdfe", Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Último Nº MDF-e</Label>
              <Input type="number" value={form.ultimo_numero_mdfe} onChange={(e) => set("ultimo_numero_mdfe", Number(e.target.value))} />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end gap-3 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : establishment ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
