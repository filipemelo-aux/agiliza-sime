import { buildQuinzena, type AcertoPeriod } from "@/lib/rhAcertoPeriod";
import { DEFAULT_RH_PERIOD_CONFIG, type RHPeriodConfig } from "@/lib/rhPeriodConfig";

export function parcelasVale(valor: number, quantidade: number, periodo: AcertoPeriod, config: RHPeriodConfig = DEFAULT_RH_PERIOD_CONFIG) {
  const cents = Math.round(valor * 100);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > cents) throw new Error("Quantidade de parcelas inválida");
  const [year, month] = periodo.month.split("-").map(Number);
  const half = periodo.inicio.endsWith("-01") ? 0 : 1;
  return Array.from({ length: quantidade }, (_, i) => {
    const idx = (month - 1) * 2 + half + i;
    return { valor: (Math.floor(cents / quantidade) + (i < cents % quantidade ? 1 : 0)) / 100,
      periodo: buildQuinzena(year, Math.floor(idx / 2), idx % 2 === 0 ? 1 : 2, config) };
  });
}