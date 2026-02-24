import { useEffect, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { MapPin, Building2, DollarSign, Truck, FileText } from "lucide-react";
import type { Cte } from "@/pages/FreightCte";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const CFOPS = [
  { value: "5353", label: "5353 - Prest. serv. transp. (mesma UF)" },
  { value: "6353", label: "6353 - Prest. serv. transp. (interestadual)" },
  { value: "5360", label: "5360 - Prest. serv. transp. subcontratado (mesma UF)" },
  { value: "6360", label: "6360 - Prest. serv. transp. subcontratado (interestadual)" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cte: Cte | null;
  onSaved: () => void;
}

const defaultForm = {
  remetente_nome: "",
  remetente_cnpj: "",
  remetente_ie: "",
  remetente_endereco: "",
  remetente_municipio_ibge: "",
  remetente_uf: "",
  destinatario_nome: "",
  destinatario_cnpj: "",
  destinatario_ie: "",
  destinatario_endereco: "",
  destinatario_municipio_ibge: "",
  destinatario_uf: "",
  valor_frete: 0,
  valor_carga: 0,
  base_calculo_icms: 0,
  aliquota_icms: 0,
  valor_icms: 0,
  cst_icms: "00",
  cfop: "6353",
  natureza_operacao: "PRESTACAO DE SERVICO DE TRANSPORTE",
  municipio_origem_ibge: "",
  municipio_origem_nome: "",
  uf_origem: "",
  municipio_destino_ibge: "",
  municipio_destino_nome: "",
  uf_destino: "",
  placa_veiculo: "",
  rntrc: "",
  produto_predominante: "",
  peso_bruto: 0,
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

export function CteFormDialog({ open, onOpenChange, cte, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (cte) {
      setForm({
        remetente_nome: cte.remetente_nome || "",
        remetente_cnpj: cte.remetente_cnpj || "",
        remetente_ie: cte.remetente_ie || "",
        remetente_endereco: cte.remetente_endereco || "",
        remetente_municipio_ibge: cte.remetente_municipio_ibge || "",
        remetente_uf: cte.remetente_uf || "",
        destinatario_nome: cte.destinatario_nome || "",
        destinatario_cnpj: cte.destinatario_cnpj || "",
        destinatario_ie: cte.destinatario_ie || "",
        destinatario_endereco: cte.destinatario_endereco || "",
        destinatario_municipio_ibge: cte.destinatario_municipio_ibge || "",
        destinatario_uf: cte.destinatario_uf || "",
        valor_frete: Number(cte.valor_frete) || 0,
        valor_carga: Number(cte.valor_carga) || 0,
        base_calculo_icms: Number(cte.base_calculo_icms) || 0,
        aliquota_icms: Number(cte.aliquota_icms) || 0,
        valor_icms: Number(cte.valor_icms) || 0,
        cst_icms: cte.cst_icms || "00",
        cfop: cte.cfop || "6353",
        natureza_operacao: cte.natureza_operacao || "PRESTACAO DE SERVICO DE TRANSPORTE",
        municipio_origem_ibge: cte.municipio_origem_ibge || "",
        municipio_origem_nome: cte.municipio_origem_nome || "",
        uf_origem: cte.uf_origem || "",
        municipio_destino_ibge: cte.municipio_destino_ibge || "",
        municipio_destino_nome: cte.municipio_destino_nome || "",
        uf_destino: cte.uf_destino || "",
        placa_veiculo: cte.placa_veiculo || "",
        rntrc: cte.rntrc || "",
        produto_predominante: cte.produto_predominante || "",
        peso_bruto: Number(cte.peso_bruto) || 0,
        observacoes: cte.observacoes || "",
      });
    } else {
      setForm(defaultForm);
    }
  }, [cte, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  // Auto-calculate ICMS
  useEffect(() => {
    const base = form.valor_frete;
    const icms = base * (form.aliquota_icms / 100);
    setForm((p) => ({ ...p, base_calculo_icms: base, valor_icms: Math.round(icms * 100) / 100 }));
  }, [form.valor_frete, form.aliquota_icms]);

  const handleSave = async () => {
    if (!user) return;
    if (!form.remetente_nome || !form.destinatario_nome) {
      toast({ title: "Campos obrigatórios", description: "Preencha remetente e destinatário.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        created_by: user.id,
        status: "rascunho",
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl">
            {cte ? "Editar CT-e" : "Novo CT-e (Rascunho)"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Remetente */}
          <section className="space-y-3">
            <SectionHeader icon={Building2} title="Remetente" />
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-3">
              <div className="sm:col-span-4 space-y-1.5">
                <Label className="text-xs">Nome / Razão Social *</Label>
                <Input value={form.remetente_nome} onChange={(e) => set("remetente_nome", e.target.value)} placeholder="Nome completo ou razão social" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">UF</Label>
                <Select value={form.remetente_uf || undefined} onValueChange={(v) => set("remetente_uf", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">CNPJ / CPF</Label>
                <Input value={form.remetente_cnpj} onChange={(e) => set("remetente_cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Inscrição Estadual</Label>
                <Input value={form.remetente_ie} onChange={(e) => set("remetente_ie", e.target.value)} placeholder="IE" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Cód. Município IBGE</Label>
                <Input value={form.remetente_municipio_ibge} onChange={(e) => set("remetente_municipio_ibge", e.target.value)} placeholder="0000000" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Endereço</Label>
                <Input value={form.remetente_endereco} onChange={(e) => set("remetente_endereco", e.target.value)} placeholder="Logradouro, nº, bairro" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Destinatário */}
          <section className="space-y-3">
            <SectionHeader icon={Building2} title="Destinatário" />
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-3">
              <div className="sm:col-span-4 space-y-1.5">
                <Label className="text-xs">Nome / Razão Social *</Label>
                <Input value={form.destinatario_nome} onChange={(e) => set("destinatario_nome", e.target.value)} placeholder="Nome completo ou razão social" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs">UF</Label>
                <Select value={form.destinatario_uf || undefined} onValueChange={(v) => set("destinatario_uf", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">CNPJ / CPF</Label>
                <Input value={form.destinatario_cnpj} onChange={(e) => set("destinatario_cnpj", e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Inscrição Estadual</Label>
                <Input value={form.destinatario_ie} onChange={(e) => set("destinatario_ie", e.target.value)} placeholder="IE" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Cód. Município IBGE</Label>
                <Input value={form.destinatario_municipio_ibge} onChange={(e) => set("destinatario_municipio_ibge", e.target.value)} placeholder="0000000" />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Endereço</Label>
                <Input value={form.destinatario_endereco} onChange={(e) => set("destinatario_endereco", e.target.value)} placeholder="Logradouro, nº, bairro" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Prestação — Origem / Destino */}
          <section className="space-y-3">
            <SectionHeader icon={MapPin} title="Prestação" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Origem */}
              <Card className="border-border bg-muted/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Origem</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_origem_nome} onChange={(e) => set("municipio_origem_nome", e.target.value)} placeholder="Nome do município" />
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
              {/* Destino */}
              <Card className="border-border bg-muted/30">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Destino</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Município</Label>
                    <Input value={form.municipio_destino_nome} onChange={(e) => set("municipio_destino_nome", e.target.value)} placeholder="Nome do município" />
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
          </section>

          <Separator />

          {/* Valores e Tributos */}
          <section className="space-y-3">
            <SectionHeader icon={DollarSign} title="Valores e Tributos" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Frete (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_frete} onChange={(e) => set("valor_frete", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor Carga (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_carga} onChange={(e) => set("valor_carga", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Alíquota ICMS (%)</Label>
                <Input type="number" step="0.01" value={form.aliquota_icms} onChange={(e) => set("aliquota_icms", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Base Cálculo ICMS</Label>
                <Input type="number" value={form.base_calculo_icms} disabled className="bg-muted text-muted-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor ICMS</Label>
                <Input type="number" value={form.valor_icms} disabled className="bg-muted text-muted-foreground" />
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
          </section>

          <Separator />

          {/* Transporte */}
          <section className="space-y-3">
            <SectionHeader icon={Truck} title="Transporte" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Placa</Label>
                <Input value={form.placa_veiculo} onChange={(e) => set("placa_veiculo", e.target.value.toUpperCase())} maxLength={7} placeholder="ABC1D23" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">RNTRC</Label>
                <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Produto Predominante</Label>
                <Input value={form.produto_predominante} onChange={(e) => set("produto_predominante", e.target.value)} placeholder="Ex: Soja" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Peso Bruto (kg)</Label>
                <Input type="number" step="0.01" value={form.peso_bruto} onChange={(e) => set("peso_bruto", Number(e.target.value))} />
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
