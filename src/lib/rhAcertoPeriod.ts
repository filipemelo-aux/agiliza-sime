/**
 * Período de acerto quinzenal do RH (Motoristas / Administrativo-Operacional).
 * Acesso entre os dias 01 e 15 → 16 ao último dia do mês anterior.
 * Acesso entre os dias 16 e 31 → 01 a 15 do mês corrente.
 * (Regra pedida para 01–05 e 16–20; os demais dias seguem a mesma quinzena fechada.)
 */
import { normalizeDateInput } from "@/lib/date";

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

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Monta a quinzena (1 = dias 01–15, 2 = dia 16 ao último dia) de um mês. */
export function buildQuinzena(year: number, monthIndex: number, half: 1 | 2): AcertoPeriod {
  const d = new Date(year, monthIndex, 1);
  const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (half === 1) return { inicio: `${ym}-01`, fim: `${ym}-15`, month: ym };
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { inicio: `${ym}-16`, fim: `${ym}-${pad(last)}`, month: ym };
}

/** Lista de quinzenas fechadas ao redor da atual (mais recentes primeiro). */
export function listQuinzenas(today: Date = new Date(), before = 12, after = 2): AcertoPeriod[] {
  const base = getAcertoPeriod(today);
  const [y, m] = base.month.split("-").map(Number);
  const baseIdx = (m - 1) * 2 + (base.inicio.endsWith("-16") ? 1 : 0);
  const out: AcertoPeriod[] = [];
  for (let i = after; i >= -before; i--) {
    const idx = baseIdx + i;
    const monthIndex = Math.floor(idx / 2);
    out.push(buildQuinzena(y, monthIndex, (((idx % 2) + 2) % 2 === 0 ? 1 : 2)));
  }
  return out;
}

export const labelQuinzena = (p: AcertoPeriod) => {
  const [y, m] = p.month.split("-").map(Number);
  const half = p.inicio.endsWith("-01") ? "1ª" : "2ª";
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${half} quinzena ${MESES[m - 1]}/${y} (${f(p.inicio)} a ${f(p.fim)})`;
};

export const inAcertoPeriod = (d: string | null | undefined, p: AcertoPeriod) => {
  if (!d) return false;
  const s = normalizeDateInput(d);
  return !!s && s >= p.inicio && s <= p.fim;
};

export const formatAcertoPeriod = (p: AcertoPeriod) => {
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  return `${f(p.inicio)} a ${f(p.fim)}`;
};
