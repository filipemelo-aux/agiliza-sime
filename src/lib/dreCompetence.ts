export function effectiveCompetence(row: { data_competencia?: string | null; data_emissao?: string | null }) {
  return (row.data_competencia || row.data_emissao || "").slice(0, 10);
}

export function inCompetence(date: string | null | undefined, start: string, end: string) {
  const day = (date || "").slice(0, 10);
  return !!day && (!start || day >= start) && (!end || day <= end);
}

/** Settlement adjustments affect earnings, but principal must not be expensed again. */
export function settlementAdjustment(payment: { juros?: unknown; desconto?: unknown }) {
  return (Math.round(Number(payment.juros || 0) * 100) - Math.round(Number(payment.desconto || 0) * 100)) / 100;
}

/** A card discharge is financing an existing expense, not a second purchase. */
export function cardCompetenceValue(item: {
  amount: unknown; ignored?: boolean; parcela_atual?: number | null; parcela_total?: number | null;
  origem_expense_id?: string | null;
}, recognizedExpenseIds: Set<string>) {
  if (item.ignored || (item.origem_expense_id && recognizedExpenseIds.has(item.origem_expense_id))) return 0;
  const total = Number(item.parcela_total) || 0;
  if (total > 0 && Number(item.parcela_atual) !== 1) return 0;
  return Math.round(Number(item.amount || 0) * 100) * (total || 1) / 100;
}