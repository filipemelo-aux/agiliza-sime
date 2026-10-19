/** Remaining principal for the receivables grid, rounded to currency cents. */
export function receivableBalance(invoice: { valor_total: number; valor_recebido_total?: number }): number {
  const total = Math.round(Number(invoice.valor_total) * 100);
  const received = Math.round(Number(invoice.valor_recebido_total || 0) * 100);
  return Math.max(0, total - received) / 100;
}

export function totalReceivableBalance(invoices: Array<{ valor_total: number; valor_recebido_total?: number }>): number {
  return invoices.reduce((sum, invoice) => sum + Math.round(receivableBalance(invoice) * 100), 0) / 100;
}