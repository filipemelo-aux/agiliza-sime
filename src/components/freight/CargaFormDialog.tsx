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
import { Package, MapPin, Building2, Plus, X, Settings2 } from "lucide-react";
import { maskCNPJ, unmaskCNPJ, maskCurrency, unmaskCurrency, maskName } from "@/lib/masks";
import { PersonSearchInput } from "./PersonSearchInput";
import type { Carga } from "@/pages/AdminCargas";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carga: Carga | null;
  onSaved: () => void;
}

const TIPOS_CARGA = [
  "Granel Sólido",
  "Granel Líquido",
  "Frigorificada",
  "Conteinerizada",
  "Carga Geral",
  "Neogranel",
  "Perigosa (Granel Sólido)",
  "Perigosa (Granel Líquido)",
  "Perigosa (Carga Geral)",
];

const defaultForm = {
  produto_predominante: "",
  tipo: "",
  ativo: true,
  cod_buonny: "",
  cod_opentech: "",
  tolerancia_quebra: 0,
  ncm: "",
  sinonimos: "",
  peso_bruto: 0,
  valor_carga: 0,
  valor_carga_averb: 0,
  unidade: "KG",
  remetente_nome: "",
  remetente_cnpj: "",
  destinatario_nome: "",
  destinatario_cnpj: "",
  municipio_origem_nome: "",
  uf_origem: "",
  municipio_destino_nome: "",
  uf_destino: "",
  chaves_nfe_ref: [] as string[],
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

export function CargaFormDialog({ open, onOpenChange, carga, onSaved }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (carga) {
      setForm({
        produto_predominante: carga.produto_predominante || "",
        tipo: (carga as any).tipo || "",
        ativo: (carga as any).ativo !== false,
        cod_buonny: (carga as any).cod_buonny || "",
        cod_opentech: (carga as any).cod_opentech || "",
        tolerancia_quebra: Number((carga as any).tolerancia_quebra) || 0,
        ncm: (carga as any).ncm || "",
        sinonimos: (carga as any).sinonimos || "",
        peso_bruto: Number(carga.peso_bruto) || 0,
        valor_carga: Number(carga.valor_carga) || 0,
        valor_carga_averb: Number(carga.valor_carga_averb) || 0,
        unidade: carga.unidade || "KG",
        remetente_nome: carga.remetente_nome || "",
        remetente_cnpj: carga.remetente_cnpj ? maskCNPJ(carga.remetente_cnpj) : "",
        destinatario_nome: carga.destinatario_nome || "",
        destinatario_cnpj: carga.destinatario_cnpj ? maskCNPJ(carga.destinatario_cnpj) : "",
        municipio_origem_nome: carga.municipio_origem_nome || "",
        uf_origem: carga.uf_origem || "",
        municipio_destino_nome: carga.municipio_destino_nome || "",
        uf_destino: carga.uf_destino || "",
        chaves_nfe_ref: Array.isArray(carga.chaves_nfe_ref) ? carga.chaves_nfe_ref : [],
        observacoes: carga.observacoes || "",
      });
    } else {
      setForm(defaultForm);
    }
  }, [carga, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.produto_predominante) {
      toast({ title: "Campo obrigatório", description: "Preencha o produto predominante.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        remetente_cnpj: unmaskCNPJ(form.remetente_cnpj) || null,
        destinatario_cnpj: unmaskCNPJ(form.destinatario_cnpj) || null,
        valor_carga_averb: form.valor_carga_averb || null,
        tipo: form.tipo || null,
        cod_buonny: form.cod_buonny || null,
        cod_opentech: form.cod_opentech || null,
        tolerancia_quebra: form.tolerancia_quebra || 0,
        ncm: form.ncm || null,
        sinonimos: form.sinonimos || null,
        created_by: user.id,
      };

      if (carga) {
        const { error } = await supabase.from("cargas").update(payload).eq("id", carga.id);
        if (error) throw error;
        toast({ title: "Carga atualizada" });
      } else {
        const { error } = await supabase.from("cargas").insert(payload);
        if (error) throw error;
        toast({ title: "Carga cadastrada" });
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
            {carga ? "Editar Carga" : "Nova Carga"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Produto e peso */}
          <section className="space-y-3">
            <SectionHeader icon={Package} title="Dados da Carga" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição (Produto) *</Label>
                <Input value={form.produto_predominante} onChange={(e) => set("produto_predominante", maskName(e.target.value))} placeholder="Ex: GESSO" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo || undefined} onValueChange={(v) => set("tipo", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_CARGA.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">NCM</Label>
                <Input value={form.ncm} onChange={(e) => set("ncm", e.target.value.replace(/\D/g, ""))} placeholder="Ex: 25202090" maxLength={8} className="font-mono" />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => set("ativo", e.target.checked)} className="rounded border-border" />
                <Label htmlFor="ativo" className="text-xs cursor-pointer">Ativo</Label>
              </div>
            </div>
          </section>

          <Separator />

          {/* Códigos e tolerância */}
          <section className="space-y-3">
            <SectionHeader icon={Settings2} title="Códigos e Tolerância" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cód. Buonny</Label>
                <Input value={form.cod_buonny} onChange={(e) => set("cod_buonny", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cód. Opentech</Label>
                <Input value={form.cod_opentech} onChange={(e) => set("cod_opentech", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tolerância de Quebra (%)</Label>
                <Input type="number" step="0.01" value={form.tolerancia_quebra || ""} onChange={(e) => set("tolerancia_quebra", Number(e.target.value))} />
              </div>
              <div className="sm:col-span-3 space-y-1.5">
                <Label className="text-xs">Sinônimos</Label>
                <Input value={form.sinonimos} onChange={(e) => set("sinonimos", e.target.value)} placeholder="Ex: Gipsita, Sulfato de Cálcio" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Peso e valores */}
          <section className="space-y-3">
            <SectionHeader icon={Package} title="Peso e Valores" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Peso Bruto</Label>
                <Input type="number" step="0.01" value={form.peso_bruto || ""} onChange={(e) => set("peso_bruto", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unidade</Label>
                <Select value={form.unidade} onValueChange={(v) => set("unidade", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KG">KG</SelectItem>
                    <SelectItem value="TON">TON</SelectItem>
                    <SelectItem value="M3">M³</SelectItem>
                    <SelectItem value="UN">UN</SelectItem>
                    <SelectItem value="LT">LT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor da Carga</Label>
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
            </div>
          </section>

          <Separator />

          {/* Remetente */}
          <section className="space-y-3">
            <SectionHeader icon={Building2} title="Remetente" />
            <PersonSearchInput
              placeholder="Buscar remetente..."
              selectedName={form.remetente_nome || undefined}
              onSelect={(p) => {
                set("remetente_nome", p.razao_social || p.full_name);
                set("remetente_cnpj", p.cnpj ? maskCNPJ(p.cnpj) : "");
              }}
              onClear={() => { set("remetente_nome", ""); set("remetente_cnpj", ""); }}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input value={form.remetente_nome} onChange={(e) => set("remetente_nome", maskName(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ/CPF</Label>
                <Input value={form.remetente_cnpj} onChange={(e) => set("remetente_cnpj", maskCNPJ(e.target.value))} maxLength={18} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Destinatário */}
          <section className="space-y-3">
            <SectionHeader icon={Building2} title="Destinatário" />
            <PersonSearchInput
              placeholder="Buscar destinatário..."
              selectedName={form.destinatario_nome || undefined}
              onSelect={(p) => {
                set("destinatario_nome", p.razao_social || p.full_name);
                set("destinatario_cnpj", p.cnpj ? maskCNPJ(p.cnpj) : "");
              }}
              onClear={() => { set("destinatario_nome", ""); set("destinatario_cnpj", ""); }}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input value={form.destinatario_nome} onChange={(e) => set("destinatario_nome", maskName(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ/CPF</Label>
                <Input value={form.destinatario_cnpj} onChange={(e) => set("destinatario_cnpj", maskCNPJ(e.target.value))} maxLength={18} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Origem / Destino */}
          <section className="space-y-3">
            <SectionHeader icon={MapPin} title="Origem / Destino" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Município Origem</Label>
                <Input value={form.municipio_origem_nome} onChange={(e) => set("municipio_origem_nome", maskName(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">UF Origem</Label>
                <Select value={form.uf_origem || undefined} onValueChange={(v) => set("uf_origem", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Município Destino</Label>
                <Input value={form.municipio_destino_nome} onChange={(e) => set("municipio_destino_nome", maskName(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">UF Destino</Label>
                <Select value={form.uf_destino || undefined} onValueChange={(v) => set("uf_destino", v)}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* NF-e */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">NF-e Referenciadas</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => set("chaves_nfe_ref", [...form.chaves_nfe_ref, ""])}>
                <Plus className="w-3 h-3" /> Adicionar
              </Button>
            </div>
            {form.chaves_nfe_ref.map((chave, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  className="flex-1 font-mono text-xs"
                  placeholder="Chave NF-e (44 dígitos)"
                  maxLength={44}
                  value={chave}
                  onChange={(e) => {
                    const arr = [...form.chaves_nfe_ref];
                    arr[i] = e.target.value.replace(/\D/g, "");
                    set("chaves_nfe_ref", arr);
                  }}
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => set("chaves_nfe_ref", form.chaves_nfe_ref.filter((_, j) => j !== i))}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </section>

          <Separator />

          {/* Observações */}
          <section className="space-y-3">
            <Label className="text-xs">Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
          </section>
        </div>

        <div className="shrink-0 border-t border-border px-6 py-4 flex justify-end gap-3 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : carga ? "Atualizar" : "Cadastrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
