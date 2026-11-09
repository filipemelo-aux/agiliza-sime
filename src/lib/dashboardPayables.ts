import type { RowTone } from "@/components/ui/status-row";

export interface PayableExpense {
  id: string;
  descricao: string | null;
  favorecido_nome: string | null;
  valor_total: number;
  valor_pago: number | null;
  data_vencimento: string | null;
  data_emissao: string | null;
  portal_status?: string | null;
}

export interface PayableInstallment {
  id: string;
  expense_id: string;
  numero_parcela: number | null;
  valor: number;
  data_vencimento: string;
  status: string;
}

export interface PayableUnit {
  id: string;
  expense_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  descricao: string;
  favorecido_nome: string | null;
  portal_status: string | null;
}

/** Open details without narrowing the underlying list to the selected expense. */
export function dashboardPayableNavigation(card: "hoje" | "atrasadas", expenseId: string) {
  return {
    fromNav: true,
    quickFilter: card === "hoje" ? "a_vencer" as const : "atrasadas" as const,
    openExpenseId: expenseId,
  };
}

/**
 * Mesma base do Contas a Pagar: despesa com parcelas conta as parcelas em
 * aberto; despesa de pagamento único (reembolsos do portal inclusos) conta a
 * própria despesa, pelo saldo ainda não pago.
 */
export function buildPayableUnits(
  expenses: PayableExpense[],
  installments: PayableInstallment[]
): PayableUnit[] {
  const byExpense = new Map<string, PayableInstallment[]>();
  installments.forEach((inst) => {
    if (inst.status === "cancelado") return;
    const list = byExpense.get(inst.expense_id) || [];
    list.push(inst);
    byExpense.set(inst.expense_id, list);
  });

  const units: PayableUnit[] = [];
  for (const exp of expenses) {
    const portal = exp.portal_status ?? null;
    const installs = byExpense.get(exp.id);
    if (installs && installs.length > 0) {
      installs.forEach((inst) => units.push({
        id: inst.id,
        expense_id: exp.id,
        numero_parcela: inst.numero_parcela ?? 0,
        valor: Number(inst.valor),
        data_vencimento: inst.data_vencimento,
        descricao: exp.descricao || "—",
        favorecido_nome: exp.favorecido_nome || null,
        portal_status: portal,
      }));
      continue;
    }
    const due = exp.data_vencimento || exp.data_emissao;
    if (!due) continue;
    units.push({
      id: exp.id,
      expense_id: exp.id,
      numero_parcela: 0,
      valor: Math.max(Number(exp.valor_total) - Number(exp.valor_pago || 0), 0),
      data_vencimento: due,
      descricao: exp.descricao || "—",
      favorecido_nome: exp.favorecido_nome || null,
      portal_status: portal,
    });
  }
  return units;
}

/** Cor da linha do Contas a Pagar para reembolsos do portal do motorista. */
export function portalRowTone(portal_status?: string | null): RowTone | null {
  if (portal_status === "em_analise") return "review";
  if (portal_status === "rejeitado") return "cancelled";
  return null;
}

/** Rótulo de situação exibido abaixo do nome, igual ao do Contas a Pagar. */
export function portalRowLabel(portal_status?: string | null): string | null {
  if (portal_status === "em_analise") return "Reembolso em análise (portal)";
  if (portal_status === "rejeitado") return "Reembolso recusado";
  return null;
}
