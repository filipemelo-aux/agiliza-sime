import { buildQuinzena, type AcertoPeriod } from "@/lib/rhAcertoPeriod";

export function parcelasVale(valor: number, quantidade: number, periodo: AcertoPeriod) {
  const cents = Math.round(valor * 100);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > cents) throw new Error("Quantidade de parcelas inválida");
  const [year, month] = periodo.month.split("-").map(Number);
  const half = periodo.inicio.endsWith("-16") ? 1 : 0;
  return Array.from({ length: quantidade }, (_, i) => {
    const idx = (month - 1) * 2 + half + i;
    return { valor: (Math.floor(cents / quantidade) + (i < cents % quantidade ? 1 : 0)) / 100,
      periodo: buildQuinzena(year, Math.floor(idx / 2), idx % 2 === 0 ? 1 : 2) };
  });
}