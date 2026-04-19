/**
 * RH View Model — camada derivada
 * Funções puras que transformam Expenses + Colaboradores + Settings em métricas.
 * Garantem zero duplicação: a "verdade" continua sendo a tabela `expenses`.
 */
import type { ColaboradorRH } from "./rhColaboradoresService";
import type { Expense } from "./rhFinancialService";
import type { Comissao } from "./comissoesService";

export type ColabMetrics = {
  recebido: number;
  adiantamentos: number;
  folhaTotal: number;
  folhaPago: number;
  saldoDevedor: number;
};

export const emptyMetrics = (): ColabMetrics => ({
  recebido: 0,
  adiantamentos: 0,
  folhaTotal: 0,
  folhaPago: 0,
  saldoDevedor: 0,
});

export function buildMetricsByColab(
  colaboradores: ColaboradorRH[],
  expenses: Expense[],
  folhaAccountId?: string,
  adiantamentoAccountId?: string
): Map<string, ColabMetrics> {
  const m = new Map<string, ColabMetrics>();
  colaboradores.forEach((c) => m.set(c.id, emptyMetrics()));

  expenses.forEach((e) => {
    if (!e.favorecido_id) return;
    const r = m.get(e.favorecido_id);
    if (!r) return;
    if (folhaAccountId && e.plano_contas_id === folhaAccountId) {
      r.folhaTotal += Number(e.valor_total || 0);
      r.folhaPago += Number(e.valor_pago || 0);
      r.recebido += Number(e.valor_pago || 0);
    } else if (adiantamentoAccountId && e.plano_contas_id === adiantamentoAccountId) {
      r.adiantamentos += Number(e.valor_total || 0);
    }
  });

  m.forEach((r) => {
    r.saldoDevedor = Math.max(0, r.folhaTotal - r.folhaPago);
  });
  return m;
}

export function filterByAccount(expenses: Expense[], accountId?: string): Expense[] {
  if (!accountId) return [];
  return expenses.filter((e) => e.plano_contas_id === accountId);
}

export function totalsForMonth(expenses: Expense[]) {
  return expenses.reduce((s, e) => s + Number(e.valor_total || 0), 0);
}

export function resolveBaseSalary(
  c: ColaboradorRH,
  salaryOverrides: Record<string, number>
): number {
  const ov = salaryOverrides[c.id];
  if (typeof ov === "number" && !isNaN(ov)) return ov;
  return Number(c.salario || 0);
}

export function computePayrollRows(
  colaboradores: ColaboradorRH[],
  expenses: Expense[],
  folhaAccountId: string | undefined,
  adiantamentoAccountId: string | undefined,
  salaryOverrides: Record<string, number>,
  comissoesPendentes: Comissao[] = []
) {
  const adiantByColab = new Map<string, number>();
  const folhaByColab = new Map<string, Expense>();
  const comissoesByColab = new Map<string, { total: number; ids: string[] }>();

  expenses.forEach((e) => {
    if (!e.favorecido_id) return;
    if (adiantamentoAccountId && e.plano_contas_id === adiantamentoAccountId) {
      adiantByColab.set(
        e.favorecido_id,
        (adiantByColab.get(e.favorecido_id) || 0) + Number(e.valor_total || 0)
      );
    }
    if (folhaAccountId && e.plano_contas_id === folhaAccountId) {
      if (!folhaByColab.has(e.favorecido_id)) folhaByColab.set(e.favorecido_id, e);
    }
  });

  comissoesPendentes.forEach((c) => {
    const cur = comissoesByColab.get(c.colaborador_id) || { total: 0, ids: [] };
    cur.total += Number(c.valor_calculado || 0);
    cur.ids.push(c.id);
    comissoesByColab.set(c.colaborador_id, cur);
  });

  return colaboradores
    .filter((c) => c.ativo)
    .map((c) => {
      const salary = resolveBaseSalary(c, salaryOverrides);
      const adiant = adiantByColab.get(c.id) || 0;
      const com = comissoesByColab.get(c.id) || { total: 0, ids: [] };
      const comissoes = com.total;
      const comissaoIds = com.ids;
      const liquido = Math.max(0, salary + comissoes - adiant);
      const existing = folhaByColab.get(c.id);
      return { c, salary, adiant, comissoes, comissaoIds, liquido, existing };
    });
}

export function computeDueDate(month: string, payDay?: string): string {
  const [y, m] = month.split("-").map(Number);
  const day = Math.min(Math.max(parseInt(payDay || "5", 10) || 5, 1), 28);
  return new Date(y, m, day).toISOString().slice(0, 10);
}

export function computeEmissionDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}
