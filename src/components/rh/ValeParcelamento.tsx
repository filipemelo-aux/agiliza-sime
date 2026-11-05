import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parcelasVale } from "@/lib/rh/valeParcelas";
import { labelQuinzena, type AcertoPeriod } from "@/lib/rhAcertoPeriod";
import { useRHPeriodConfig } from "@/hooks/useRHPeriodConfig";
interface Props { id: string; valor: number; quantidade: number; periodo: AcertoPeriod; disabled?: boolean; onChange: (n: number) => void }
export function ValeParcelamento({ id, valor, quantidade, periodo, disabled, onChange }: Props) {
  const { config } = useRHPeriodConfig();
  const parcelas = parcelasVale(valor, quantidade, periodo, config);
  const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  return <div className="space-y-2 border-t bg-muted/20 p-2">
    <div className="flex items-center gap-2"><Label htmlFor={`parcelas-${id}`} className="text-xs">Parcelas do desconto</Label>
      <Input id={`parcelas-${id}`} aria-label="Parcelas do desconto" type="number" min={1} max={Math.round(valor * 100)} step={1} disabled={disabled}
        value={quantidade} className="h-7 w-20 text-xs" onChange={(e) => onChange(Math.min(Math.round(valor * 100), Math.max(1, Math.floor(Number(e.target.value) || 1))))} /></div>
    {quantidade > 1 && <div className="space-y-1 text-xs">{parcelas.map((p, i) => <div key={p.periodo.inicio} className="flex flex-wrap justify-between gap-2">
      <span>{i + 1}/{quantidade} · {labelQuinzena(p.periodo)}</span><strong className="font-mono">{brl(p.valor)}</strong>
    </div>)}</div>}
  </div>;
}