import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, CalendarRange, Loader2 } from "lucide-react";
import { toast } from "@/lib/notice";
import { useRHPeriodConfig } from "@/hooks/useRHPeriodConfig";
import { DEFAULT_RH_PERIOD_CONFIG } from "@/lib/rhPeriodConfig";

export function JanelaSalarioConfigCard() {
  const { config, loading, error, save } = useRHPeriodConfig();
  const [draft, setDraft] = useState(DEFAULT_RH_PERIOD_CONFIG);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(config); }, [config]);
  const persist = async () => {
    setSaving(true);
    try { await save(draft); toast.success("Competências e prazos do acerto salvos."); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Falha ao salvar as configurações."); }
    finally { setSaving(false); }
  };
  return <Card><CardContent className="p-4 space-y-4 max-w-2xl">
    <div className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Competências e prazos do acerto</h3></div>
    {loading ? <div className="flex gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div> : error ? <p className="text-xs text-destructive">Não foi possível carregar as configurações.</p> : <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1"><Label htmlFor="q1-start" className="text-xs">1ª quinzena — início</Label><Input id="q1-start" value="1" readOnly className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="q1-end" className="text-xs">1ª quinzena — fim</Label><Input id="q1-end" type="number" min={1} max={27} step={1} value={draft.firstEndDay} disabled={saving} onChange={(e) => setDraft({ ...draft, firstEndDay: Number(e.target.value) })} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="q1-pay" className="text-xs">Acerto até — mesmo mês</Label><Input id="q1-pay" type="number" min={draft.firstEndDay + 1} max={28} step={1} value={draft.firstPayDay} disabled={saving} onChange={(e) => setDraft({ ...draft, firstPayDay: Number(e.target.value) })} className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="q2-start" className="text-xs">2ª quinzena — início</Label><Input id="q2-start" value={draft.firstEndDay + 1} readOnly className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="q2-end" className="text-xs">2ª quinzena — fim</Label><Input id="q2-end" value="Último dia do mês" readOnly className="h-9" /></div>
        <div className="space-y-1"><Label htmlFor="q2-pay" className="text-xs">Acerto até — mês seguinte</Label><Input id="q2-pay" type="number" min={1} max={28} step={1} value={draft.secondPayDay} disabled={saving} onChange={(e) => setDraft({ ...draft, secondPayDay: Number(e.target.value) })} className="h-9" /></div>
      </div>
      <div className="border-l-2 border-primary pl-3 space-y-1 text-xs text-foreground">
        <p><strong>1ª quinzena:</strong> dia 1 a {draft.firstEndDay} · acerto até dia {draft.firstPayDay} do mesmo mês.</p>
        <p><strong>2ª quinzena:</strong> dia {draft.firstEndDay + 1} ao último dia do mês · acerto até dia {draft.secondPayDay} do mês seguinte.</p>
      </div>
      <p className="text-[11px] text-muted-foreground">Fechamentos existentes mantêm suas datas. Limites das quinzenas com movimentações ou parcelas vinculadas são preservados.</p>
      <Button onClick={persist} disabled={saving} className="gap-2">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar competências e prazos</Button>
    </>}
  </CardContent></Card>;
}
