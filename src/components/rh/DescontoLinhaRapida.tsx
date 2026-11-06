import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "@/lib/notice";
import { parcelasDesconto, DESCONTO_LABELS, type PlanoDesconto, type TipoDescontoRapido } from "@/lib/rh/descontoParcelas";
import type { AcertoPeriod } from "@/lib/rhAcertoPeriod";
import { useRHPeriodConfig } from "@/hooks/useRHPeriodConfig";

interface Props { periodo: AcertoPeriod; mensal: boolean; disabled: boolean; onIncluir: (plano: PlanoDesconto) => void }
export function DescontoLinhaRapida({ periodo, mensal, disabled, onIncluir }: Props) {
  const { config } = useRHPeriodConfig();
  const [tipo, setTipo] = useState<TipoDescontoRapido>("credito_trabalhador");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const plano = { tipo, descricao: descricao.trim(), valor: Number(unmaskCurrency(valor)), parcelas: Number(quantidade) };
  const preview = useMemo(() => {
    try { return parcelasDesconto(plano, periodo, mensal, config); } catch { return []; }
  }, [tipo, valor, quantidade, periodo, mensal, config]);
  const incluir = () => {
    if (!descricao.trim() || !preview.length) { toast.error("Informe a descrição, o valor e a quantidade de parcelas."); return; }
    onIncluir({ ...plano, id: crypto.randomUUID() });
    setDescricao(""); setValor(""); setQuantidade("1");
  };
  return <section className="space-y-2 border-y py-3">
    <h3 className="text-xs font-semibold">Outros descontos</h3>
    <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[180px_minmax(120px,1fr)_120px_70px_auto]">
      <div className="col-span-2 space-y-1 sm:col-span-1"><Label htmlFor="desconto-tipo" className="text-xs">Tipo</Label>
        <Select value={tipo} disabled={disabled} onValueChange={(v) => setTipo(v as TipoDescontoRapido)}>
          <SelectTrigger id="desconto-tipo" className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{(["credito_trabalhador", "multas", "avaria", "faltas", "combustivel", "outros"] as const).map((t) => <SelectItem key={t} value={t}>{DESCONTO_LABELS[t]}</SelectItem>)}</SelectContent>
        </Select></div>
      <div className="col-span-2 space-y-1 sm:col-span-1"><Label htmlFor="desconto-descricao" className="text-xs">Descrição</Label>
        <Input id="desconto-descricao" value={descricao} maxLength={255} disabled={disabled} className="h-9 text-xs" onChange={(e) => setDescricao(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="desconto-valor" className="text-xs">{tipo === "credito_trabalhador" ? "Valor da parcela" : "Valor total"}</Label>
        <Input id="desconto-valor" inputMode="decimal" value={valor} disabled={disabled} className="h-9 text-xs" onChange={(e) => setValor(maskCurrency(e.target.value))} /></div>
      <div className="space-y-1"><Label htmlFor="desconto-parcelas" className="text-xs">Parcelas</Label>
        <Input id="desconto-parcelas" type="number" min={1} max={120} step={1} value={quantidade} disabled={disabled} className="h-9 text-xs" onChange={(e) => setQuantidade(e.target.value)} /></div>
      <Button variant="outline" className="col-span-2 sm:col-span-1" disabled={disabled || !preview.length || !descricao.trim()} onClick={incluir}><Plus className="mr-1 h-4 w-4" />Incluir</Button>
    </div>
    {preview.length > 0 && <p className="text-xs text-muted-foreground">{preview.length}x de {formatCurrency(preview[0].valor)}{preview.some((p) => p.valor !== preview[0].valor) ? ` (última: ${formatCurrency(preview[preview.length - 1].valor)})` : ""} · Total {formatCurrency(preview.reduce((s, p) => s + p.valor, 0))} · Primeira: {formatDateBR(periodo.inicio)}{preview.length > 1 ? ` · Última: ${formatDateBR(preview[preview.length - 1].periodo.inicio)}` : ""}</p>}
  </section>;
}