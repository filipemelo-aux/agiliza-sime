export type ExpenseComposition = "geral" | "pecas" | "servico" | "misto";

interface ItemAmount { quantidade: number; valor_unitario: number; }

export function sumExpenseItems(items: ItemAmount[]) {
  return Math.round(items.reduce((sum, item) => sum + Number(item.quantidade || 0) * Number(item.valor_unitario || 0), 0) * 100) / 100;
}

export function expenseCompositionTotal(mode: ExpenseComposition, parts: number, service: number, general: number) {
  if (mode === "pecas") return parts;
  if (mode === "servico") return service;
  if (mode === "misto") return Math.round((parts + service) * 100) / 100;
  return general;
}