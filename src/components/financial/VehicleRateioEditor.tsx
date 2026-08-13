import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Split, AlertTriangle, CheckCircle2 } from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { formatCurrency } from "@/lib/masks";
import { RateioRow, sumRateio, distribuirIgualmente } from "@/lib/rateio";

export interface RateioVehicleOption { id: string; plate: string; brand?: string | null; model?: string | null }

interface Props {
  rows: RateioRow[];
  onChange: (rows: RateioRow[]) => void;
  vehicles: RateioVehicleOption[];
  valorTotal: number;
  compact?: boolean;
}

export default function VehicleRateioEditor({ rows, onChange, vehicles, valorTotal, compact }: Props) {
  const total = useMemo(() => sumRateio(rows), [rows]);
  const diff = Number((valorTotal - total).toFixed(2));
  const ok = Math.abs(diff) < 0.01 && rows.some((r) => r.veiculo_id);

  const patch = (idx: number, p: Partial<RateioRow>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...p } : r)));

  const setValor = (idx: number, valor: number) =>
    patch(idx, { valor_rateado: valor, percentual: valorTotal ? (valor / valorTotal) * 100 : null });

  const setPerc = (idx: number, perc: number) =>
    patch(idx, { percentual: perc, valor_rateado: Number(((valorTotal * perc) / 100).toFixed(2)) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <Split className="h-3.5 w-3.5" /> Rateio entre veículos
        </Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={rows.length === 0 || !valorTotal}
            onClick={() => onChange(distribuirIgualmente(rows, valorTotal))}
          >
            Dividir igualmente
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
            onClick={() => onChange([...rows, { veiculo_id: null, valor_rateado: 0, percentual: null }])}
          >
            <Plus className="h-3 w-3" /> Veículo
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-2 py-1 font-medium">Veículo</th>
              <th className="px-2 py-1 font-medium w-[110px]">Valor (R$)</th>
              <th className="px-2 py-1 font-medium w-[90px]">%</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">
                  Nenhum veículo no rateio. Clique em "Veículo" para adicionar.
                </td>
              </tr>
            )}
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t border-border">
                <td className="px-1 py-1">
                  <Select value={r.veiculo_id || "__none__"} onValueChange={(v) => patch(idx, { veiculo_id: v === "__none__" ? null : v })}>
                    <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Selecione</SelectItem>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.plate}{v.brand || v.model ? ` - ${[v.brand, v.model].filter(Boolean).join(" ")}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-[11px] text-right"
                    value={r.valor_rateado ? maskCurrency(String(Math.round(r.valor_rateado * 100))) : ""}
                    onChange={(e) => setValor(idx, Number(unmaskCurrency(e.target.value)) || 0)}
                    placeholder="0,00"
                  />
                </td>
                <td className="px-1 py-1">
                  <Input
                    className="h-7 text-[11px] text-right"
                    value={r.percentual ? String(Number(r.percentual).toFixed(2)).replace(".", ",") : ""}
                    onChange={(e) => setPerc(idx, Number(e.target.value.replace(",", ".")) || 0)}
                    placeholder="0,00"
                  />
                </td>
                <td className="px-1 py-1">
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => onChange(rows.filter((_, i) => i !== idx))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[11px] ${ok ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"}`}>
        <span className="flex items-center gap-1.5">
          {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          Rateado: {formatCurrency(total)} de {formatCurrency(valorTotal || 0)}
        </span>
        {!ok && <span className="font-semibold">Diferença: {formatCurrency(diff)}</span>}
      </div>
      {!compact && (
        <p className="text-[10px] text-muted-foreground">
          O lançamento permanece único no fluxo de caixa e na fatura. O rateio serve para alocar o custo por veículo na DRE.
        </p>
      )}
    </div>
  );
}
