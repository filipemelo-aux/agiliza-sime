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
import { Package, Settings2 } from "lucide-react";
import { maskName } from "@/lib/masks";
import { Switch } from "@/components/ui/switch";
import type { Carga } from "@/pages/AdminCargas";

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
};

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">{title}</h3>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  carga: Carga | null;
  onSaved: () => void;
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
        tipo: carga.tipo || "",
        ativo: carga.ativo !== false,
        cod_buonny: carga.cod_buonny || "",
        cod_opentech: carga.cod_opentech || "",
        tolerancia_quebra: Number(carga.tolerancia_quebra) || 0,
        ncm: carga.ncm || "",
        sinonimos: carga.sinonimos || "",
      });
    } else {
      setForm(defaultForm);
    }
  }, [carga, open]);

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.produto_predominante) {
      toast({ title: "Campo obrigatório", description: "Informe a descrição da carga.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        produto_predominante: form.produto_predominante,
        tipo: form.tipo || null,
        ativo: form.ativo,
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
        toast({ title: "Natureza de carga atualizada" });
      } else {
        const { error } = await supabase.from("cargas").insert(payload);
        if (error) throw error;
        toast({ title: "Natureza de carga cadastrada" });
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
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle className="font-display text-xl">
            {carga ? "Editar Natureza" : "Nova Natureza de Carga"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Identificação */}
          <section className="space-y-3">
            <SectionHeader icon={Package} title="Identificação" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição *</Label>
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ativo</Label>
                <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
              </div>
            </div>
          </section>

          <Separator />

          {/* Códigos e tolerância */}
          <section className="space-y-3">
            <SectionHeader icon={Settings2} title="Códigos e Tolerância" />
            <div className="space-y-3">
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
                <Input type="number" step="0.0001" value={form.tolerancia_quebra || ""} onChange={(e) => set("tolerancia_quebra", Number(e.target.value))} placeholder="0,0000" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">NCM</Label>
                <Input value={form.ncm} onChange={(e) => set("ncm", e.target.value.replace(/\D/g, ""))} placeholder="Ex: 25202090" maxLength={8} className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sinônimos</Label>
                <Input value={form.sinonimos} onChange={(e) => set("sinonimos", e.target.value)} placeholder="Ex: Gipsita, Sulfato de Cálcio" />
              </div>
            </div>
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
