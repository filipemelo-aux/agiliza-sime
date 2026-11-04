/**
 * Período de acerto quinzenal do RH (Motoristas / Administrativo-Operacional).
 * Acesso entre os dias 01 e 15 → 16 ao último dia do mês anterior.
 * Acesso entre os dias 16 e 31 → 01 a 15 do mês corrente.
 * (Regra pedida para 01–05 e 16–20; os demais dias seguem a mesma quinzena fechada.)
 */
export interface AcertoPeriod {
  inicio: string; // YYYY-MM-DD
  fim: string; // YYYY-MM-DD
  month: string; // YYYY-MM
}

const pad = (n: number) => String(n).padStart(2, "0");

export function getAcertoPeriod(today: Date = new Date()): AcertoPeriod {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (today.getDate() <= 15) {
    const prev = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0).getDate();
    const ym = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}`;
    return { inicio: `${ym}-16`, fim: `${ym}-${pad(last)}`, month: ym };
  }
  const ym = `${y}-${pad(m + 1)}`;
  return { inicio: `${ym}-01`, fim: `${ym}-15`, month: ym };
}

export const inAcertoPeriod = (d: string | null | undefined, p: AcertoPeriod) => {
  if (!d) return false;
  const s = d.slice(0, 10);
  return s >= p.inicio && s <= p.fim;
};

export const formatAcertoPeriod = (p: AcertoPeriod) => {
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return `${f(p.inicio)} a ${f(p.fim)}`;
};
