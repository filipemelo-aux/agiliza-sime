import { buildMesCompleto, type AcertoPeriod } from "@/lib/rhAcertoPeriod";
import { parcelasVale } from "./valeParcelas";
import { DEFAULT_RH_PERIOD_CONFIG, type RHPeriodConfig } from "@/lib/rhPeriodConfig";

export const DESCONTO_LABELS: Record<string, string> = {
  inss: "INSS", irrf: "IRRF", credito_trabalhador: "Crédito do Trabalhador",
  multas: "Multa", avaria: "Avaria", faltas: "Falta", combustivel: "Combustível",
  outros: "Outros", vale: "Vale", adiantamento: "Adiantamento",
};
export type TipoDescontoRapido = "credito_trabalhador" | "multas" | "avaria" | "faltas" | "combustivel" | "outros";
export interface PlanoDesconto {
  id: string;
  tipo: TipoDescontoRapido;
  descricao: string;
  /** Crédito do Trabalhador: valor da parcela; demais: valor total. */
  valor: number;
  parcelas: number;
}

export function parcelasDesconto(plano: Pick<PlanoDesconto, "tipo" | "valor" | "parcelas">, periodo: AcertoPeriod, mensal: boolean, config: RHPeriodConfig = DEFAULT_RH_PERIOD_CONFIG) {
  const { valor, parcelas } = plano;
  if (!Number.isFinite(valor) || valor <= 0 || valor > 99999999.99 || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 120) throw new Error("Informe valor positivo e de 1 a 120 parcelas.");
  const total = Math.round(valor * 100) * (plano.tipo === "credito_trabalhador" ? parcelas : 1);
  if (parcelas > total) throw new Error("Cada parcela deve ter ao menos um centavo.");
  if (!mensal) return parcelasVale(total / 100, parcelas, periodo, config);
  const [y, m] = periodo.month.split("-").map(Number);
  return Array.from({ length: parcelas }, (_, i) => {
    const date = new Date(y, m - 1 + i, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { valor: (Math.floor(total / parcelas) + (i < total % parcelas ? 1 : 0)) / 100, periodo: buildMesCompleto(month) };
  });
}

export function descricaoDesconto(d: { tipo: string; descricao: string | null; parcela_numero?: number | null; parcelas_total?: number | null }) {
  const parcela = d.parcela_numero && d.parcelas_total && d.parcelas_total > 1 && !/parcela\s+\d+\//i.test(d.descricao || "") ? ` — parcela ${d.parcela_numero}/${d.parcelas_total}` : "";
  return `${DESCONTO_LABELS[d.tipo] || d.tipo}${d.descricao ? ` · ${d.descricao}` : ""}${parcela}`;
}