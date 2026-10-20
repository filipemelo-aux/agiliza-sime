/** Pure helpers for the monthly accounting package (Contabilidade > Fechamento). */

export const UNCLASSIFIED_ACCOUNT = "sem_classificacao";

/** null means all accounts; an empty selection deliberately exports no payables. */
export function includesAccountingAccount(id: string | null | undefined, selected: string[] | null) {
  return selected === null || selected.includes(id || UNCLASSIFIED_ACCOUNT);
}

/** The closing package lists expense accounts only; revenue accounts stay out for now. */
export function isExpenseAccount(tipo: string | null | undefined) {
  return String(tipo ?? "").trim().toLowerCase() === "despesa";
}

const FUEL_CODES = ["2.1.1.01", "2.1.1.02", "2.1.6.01"];
const MAINTENANCE_CODES = ["2.1.6.02", "2.1.6.05"];

/** Classifies an expense account as Combustível, Manutenção (parts/services) or Genérica by its code. */
export function accountingExpenseKind(codigo: string | null | undefined) {
  const c = String(codigo ?? "").trim();
  if (FUEL_CODES.includes(c)) return "Combustível";
  if (c.startsWith("2.1.3.") || MAINTENANCE_CODES.includes(c)) return "Manutenção";
  return "Genérica";
}

export function accountingAgency(establishment?: { type: string; endereco_uf?: string | null } | null) {
  if (!establishment) return "Sem agência";
  const kind = establishment.type === "matriz" ? "Matriz" : "Filial";
  return `${kind} - ${establishment.endereco_uf?.trim().toUpperCase() || "Sem UF"}`;
}

export function accountingCteServiceType(value: unknown) {
  if (value === null || value === undefined || value === "") return "Não informado";
  const labels: Record<string, string> = { "0": "Normal", "1": "Subcontratação", "2": "Redespacho", "3": "Redespacho intermediário", "4": "Serviço vinculado a multimodal" };
  return labels[String(value)] || "Não informado";
}

export function splitAccountingContracts<T extends { contratado_tipo: string }>(rows: T[]) {
  return { PJ: rows.filter((r) => r.contratado_tipo === "PJ"), PF: rows.filter((r) => r.contratado_tipo === "PF") };
}

export function competenciaRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const ini = `${ym}-01`;
  const fim = `${ym}-${String(last).padStart(2, "0")}`;
  return { ini, fim, from: `${ini}T00:00:00-03:00`, to: `${fim}T23:59:59-03:00` };
}

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

type AccountingExpense = { id: string; data_vencimento: string; data_pagamento?: string | null; valor_total: number; valor_pago?: number | null; status?: string; forma_pagamento?: string | null };
type AccountingInstallment = { id: string; expense_id: string; numero_parcela: number; total_parcelas: number | null; data_vencimento: string; valor: number; status: string };
type AccountingPayment = { expense_id: string; installment_id: string | null; data_pagamento: string; valor: number; juros?: number; desconto?: number; forma_pagamento: string };
const inMonth = (date: string | null | undefined, ini: string, fim: string) => !!date && date.slice(0, 10) >= ini && date.slice(0, 10) <= fim;

/** Due-month debt and payment-month cash are separate; never reuse the parent's last payment date for installments. */
export function accountingPayableEntries(e: AccountingExpense, installments: AccountingInstallment[], payments: AccountingPayment[], ym: string, today: string) {
  const { ini, fim } = competenciaRange(ym);
  const history = payments.filter((p) => p.expense_id === e.id);
  const parts = installments.filter((p) => p.expense_id === e.id).sort((a, b) => a.numero_parcela - b.numero_parcela);
  const amortized = (p: AccountingPayment) => Math.max(0, cents(p.valor) - cents(p.juros)) + cents(p.desconto);
  let unlinked = history.length
    ? history.filter((p) => !p.installment_id).reduce((sum, p) => sum + amortized(p), 0)
    : cents(e.valor_pago);
  const lines = parts.length ? parts.map((p) => {
    const linked = history.filter((x) => x.installment_id === p.id).reduce((sum, x) => sum + amortized(x), 0);
    const allocated = Math.min(Math.max(0, cents(p.valor) - linked), unlinked);
    unlinked -= allocated;
    return { parcela: `${p.numero_parcela}/${p.total_parcelas || parts.length}`, venc: p.data_vencimento, total: p.valor, pago: (linked + allocated) / 100, settled: p.status === "pago" };
  }) : [{ parcela: "Única", venc: e.data_vencimento, total: e.valor_total, pago: history.length ? history.reduce((sum, p) => sum + amortized(p), 0) / 100 : Number(e.valor_pago || 0), settled: e.status === "pago" }];
  const atrasadas = lines.filter((l) => !l.settled && payableBalance(l.total, l.pago) > 0 && inMonth(l.venc, ini, fim) && l.venc.slice(0, 10) < today);
  const pagas = history.length ? history.filter((p) => inMonth(p.data_pagamento, ini, fim)).map((p) => {
    const part = parts.find((x) => x.id === p.installment_id);
    return { parcela: part ? `${part.numero_parcela}/${part.total_parcelas || parts.length}` : parts.length ? "Sem vínculo de parcela" : "Única", venc: part?.data_vencimento || e.data_vencimento, total: part?.valor ?? e.valor_total, pago: p.valor, juros: p.juros || 0, desconto: p.desconto || 0, data: p.data_pagamento, forma: p.forma_pagamento };
  }) : inMonth(e.data_pagamento, ini, fim) && Number(e.valor_pago) > 0
    ? [{ parcela: parts.length ? "Pagamento legado" : "Única", venc: e.data_vencimento, total: e.valor_total, pago: Number(e.valor_pago), juros: 0, desconto: 0, data: e.data_pagamento || "", forma: e.forma_pagamento || "" }]
    : [];
  return { atrasadas, pagas };
}

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
