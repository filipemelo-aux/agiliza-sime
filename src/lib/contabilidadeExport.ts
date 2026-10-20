/** Pure helpers for the monthly accounting package (Contabilidade > Fechamento). */

export function competenciaRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const ini = `${ym}-01`;
  const fim = `${ym}-${String(last).padStart(2, "0")}`;
  return { ini, fim, from: `${ini}T00:00:00-03:00`, to: `${fim}T23:59:59-03:00` };
}

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

/** Open balance status at a reference date: pago, parcial, atrasado or pendente. */
export function payableStatus(total: number, pago: number, vencimento: string, ref: string) {
  const saldo = Math.max(0, cents(total) - cents(pago));
  if (saldo === 0) return "Pago";
  if (String(vencimento).slice(0, 10) < ref) return "Atrasado";
  return cents(pago) > 0 ? "Parcial" : "Pendente";
}

export function payableBalance(total: number, pago: number) {
  return Math.max(0, cents(total) - cents(pago)) / 100;
}

/** Normalizes ICMS CST to its 2-digit code ("020" -> "20"); empty becomes "Sem CST". */
export function normalizeCst(cst: unknown) {
  const d = String(cst ?? "").replace(/\D/g, "");
  if (!d) return "Sem CST";
  return d.slice(-2).padStart(2, "0");
}

export type CteGroupRow = { agencia: string; cst: string; quantidade: number; frete: number; base: number; icms: number };

export function groupCtesByAgenciaCst(
  ctes: Array<{ agencia: string; cst_icms: unknown; valor_frete: unknown; base_calculo_icms: unknown; valor_icms: unknown }>,
): CteGroupRow[] {
  const map = new Map<string, { agencia: string; cst: string; quantidade: number; f: number; b: number; i: number }>();
  for (const c of ctes) {
    const cst = normalizeCst(c.cst_icms);
    const k = `${c.agencia}|${cst}`;
    const g = map.get(k) ?? { agencia: c.agencia, cst, quantidade: 0, f: 0, b: 0, i: 0 };
    g.quantidade++;
    g.f += cents(c.valor_frete);
    g.b += cents(c.base_calculo_icms);
    g.i += cents(c.valor_icms);
    map.set(k, g);
  }
  return [...map.values()]
    .sort((a, b) => a.agencia.localeCompare(b.agencia) || a.cst.localeCompare(b.cst))
    .map((g) => ({ agencia: g.agencia, cst: g.cst, quantidade: g.quantidade, frete: g.f / 100, base: g.b / 100, icms: g.i / 100 }));
}
