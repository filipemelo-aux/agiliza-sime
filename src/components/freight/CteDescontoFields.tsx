import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { maskCurrency, unmaskCurrency, maskName, formatCurrency } from "@/lib/masks";

export type DescontoTipo = "nenhum" | "diesel" | "outros";

export interface DescontoState {
  tipo: DescontoTipo;
  litros: string;       // string editável (ex.: "150,5")
  valorLitro: string;   // mascarado em R$
  descricao: string;
  valor: string;        // mascarado em R$ (usado em "outros")
}

export const emptyDesconto: DescontoState = {
  tipo: "nenhum",
  litros: "",
  valorLitro: "",
  descricao: "",
  valor: "",
};

/** Calcula o valor total do desconto a partir do estado. */
export function calcDescontoTotal(d: DescontoState): number {
  if (d.tipo === "diesel") {
    const l = parseFloat((d.litros || "0").replace(",", ".")) || 0;
    const vl = Number(unmaskCurrency(d.valorLitro)) || 0;
    return +(l * vl).toFixed(2);
  }
  if (d.tipo === "outros") {
    return Number(unmaskCurrency(d.valor)) || 0;
  }
  return 0;
}

/** Serializa para JSONB — `null` se não houver desconto. */
export function serializeDesconto(d: DescontoState): Record<string, any> | null {
  if (d.tipo === "nenhum") return null;
  const total = calcDescontoTotal(d);
  if (total <= 0) return null;
  if (d.tipo === "diesel") {
    return {
      tipo: "diesel",
      litros: parseFloat((d.litros || "0").replace(",", ".")) || 0,
      valor_litro: Number(unmaskCurrency(d.valorLitro)) || 0,
      valor: total,
    };
  }
  return {
    tipo: "outros",
    descricao: d.descricao || "",
    valor: total,
  };
}

/** Hidrata estado a partir do JSONB salvo. */
export function deserializeDesconto(raw: any): DescontoState {
  if (!raw || typeof raw !== "object") return emptyDesconto;
  const tipo: DescontoTipo = raw.tipo === "diesel" || raw.tipo === "outros" ? raw.tipo : "nenhum";
  if (tipo === "diesel") {
    return {
      tipo,
      litros: raw.litros != null ? String(raw.litros).replace(".", ",") : "",
      valorLitro: raw.valor_litro
        ? maskCurrency(String(Math.round(Number(raw.valor_litro) * 100)))
        : "",
      descricao: "",
      valor: "",
    };
  }
  if (tipo === "outros") {
    return {
      tipo,
      litros: "",
      valorLitro: "",
      descricao: raw.descricao || "",
      valor: raw.valor ? maskCurrency(String(Math.round(Number(raw.valor) * 100))) : "",
    };
  }
  return emptyDesconto;
}

interface Props {
  value: DescontoState;
  onChange: (next: DescontoState) => void;
}

export function CteDescontoFields({ value, onChange }: Props) {
  const total = calcDescontoTotal(value);
  const set = (patch: Partial<DescontoState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2">
      <Label className="text-xs">Tipo de Desconto</Label>
      <Select value={value.tipo} onValueChange={(v) => set({ tipo: v as DescontoTipo })}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhum">Sem desconto</SelectItem>
          <SelectItem value="diesel">Diesel</SelectItem>
          <SelectItem value="outros">Outros</SelectItem>
        </SelectContent>
      </Select>

      {value.tipo === "diesel" && (
        <div className="grid grid-cols-2 gap-3 p-3 rounded-md border border-border bg-muted/20">
          <div className="space-y-1">
            <Label className="text-xs">Quantidade (L)</Label>
            <Input
              inputMode="decimal"
              placeholder="0"
              value={value.litros}
              onChange={(e) => set({ litros: e.target.value.replace(/[^\d,.]/g, "") })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor por Litro</Label>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={value.valorLitro}
              onChange={(e) => set({ valorLitro: maskCurrency(e.target.value) })}
            />
          </div>
          <div className="col-span-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total do desconto</span>
            <span className="font-mono font-semibold text-destructive">− {formatCurrency(total)}</span>
          </div>
        </div>
      )}

      {value.tipo === "outros" && (
        <div className="space-y-2 p-3 rounded-md border border-border bg-muted/20">
          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Textarea
              rows={2}
              placeholder="Ex.: Adiantamento, pedágio, etc."
              value={value.descricao}
              onChange={(e) => set({ descricao: maskName(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Valor do Desconto</Label>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={value.valor}
              onChange={(e) => set({ valor: maskCurrency(e.target.value) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
