export type PayableReportStatus = "atrasado" | "pendente" | "parcial" | "pago";
export type PayableReportFilter = "todos" | "atrasado" | "aberto" | "pago";

/** Interest is cash paid, not amortization of the original debt. */
export function paymentPrincipal(valor: unknown, juros: unknown) {
  return Math.max(0, Math.round(Number(valor || 0) * 100) - Math.round(Number(juros || 0) * 100)) / 100;
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