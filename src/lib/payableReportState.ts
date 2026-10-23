export type PayableReportStatus = "atrasado" | "pendente" | "parcial" | "pago";
export type PayableReportFilter = "todos" | "atrasado" | "aberto" | "pago";

/** Interest is cash paid, not amortization of the original debt. */
export function paymentPrincipal(valor: unknown, juros: unknown, desconto: unknown = 0) {
  return Math.max(0, Math.round(Number(valor || 0) * 100) - Math.round(Number(juros || 0) * 100) + Math.round(Number(desconto || 0) * 100)) / 100;
}

/** Allocate payments without an installment link oldest-first, just like the database trigger. */
export function installmentPrincipalMap(
  installments: Array<{ id: string; expense_id: string; numero_parcela: number; valor: number; status: string }>,
  payments: Array<{ expense_id: string; installment_id?: string | null; valor: unknown; juros?: unknown; desconto?: unknown }>,
) {
  const paid: Record<string, number> = {};
  const unallocated: Record<string, number> = {};
  for (const p of payments) {
    const cents = Math.round(paymentPrincipal(p.valor, p.juros, p.desconto) * 100);
    if (p.installment_id) paid[p.installment_id] = (paid[p.installment_id] || 0) + cents;
    else unallocated[p.expense_id] = (unallocated[p.expense_id] || 0) + cents;
  }
  const sorted = [...installments].sort((a, b) => a.numero_parcela - b.numero_parcela || a.id.localeCompare(b.id));
  for (const i of sorted) {
    if (i.status === "cancelado") continue;
    const extra = Math.min(unallocated[i.expense_id] || 0, Math.max(0, Math.round(Number(i.valor) * 100) - (paid[i.id] || 0)));
    paid[i.id] = (paid[i.id] || 0) + extra;
    unallocated[i.expense_id] = (unallocated[i.expense_id] || 0) - extra;
  }
  return Object.fromEntries(Object.entries(paid).map(([id, cents]) => [id, cents / 100]));
}

export function payableReportState(total: number, paid: number, savedStatus: string, due: string, today: string) {
  const original = Math.round(total * 100);
  const principal = Math.round(paid * 100);
  const settled = savedStatus === "pago" || principal >= original;
  const balance = settled ? 0 : Math.max(0, original - principal) / 100;
  const overdue = !settled && !!due && due.slice(0, 10) < today;
  const status: PayableReportStatus = settled ? "pago" : principal > 0 ? "parcial" : overdue ? "atrasado" : "pendente";
  return { status, balance, overdue };
}

/** Open here means not yet due: categories must never count the same debt twice. */
export function matchesPayableReportFilter(row: { status: PayableReportStatus; vencido: boolean }, filter: PayableReportFilter) {
  if (filter === "todos") return true;
  if (filter === "pago") return row.status === "pago";
  if (filter === "atrasado") return row.status !== "pago" && row.vencido;
  return row.status !== "pago" && !row.vencido;
}