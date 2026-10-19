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
const PARTS_ACCOUNTS = ["2.1.3.01", "2.1.6.05"];
const SERVICE_ACCOUNTS = ["2.1.3.02", "2.1.3.03", "2.1.3.04", "2.1.3.05", "2.1.3.06", "2.1.6.02"];

/** A conta contábil define o tipo da despesa: peças, serviço (manutenção) ou geral. */
export function compositionFromAccountCode(code: string | null | undefined): ExpenseComposition {
  const c = (code || "").trim();
  if (PARTS_ACCOUNTS.includes(c)) return "pecas";
  if (SERVICE_ACCOUNTS.includes(c)) return "servico";
  return "geral";
}
