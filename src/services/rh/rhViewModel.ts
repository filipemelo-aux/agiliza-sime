/**
 * RH View Model — camada derivada
 * Funções puras que transformam Expenses + Colaboradores em métricas.
 *
 * 🔁 NOVA LÓGICA (folha quinzenal):
 *   A folha consolida despesas JÁ EXISTENTES (salários e adiantamentos pagos)
 *   no período. Não recria despesas. Comissões e descontos pendentes são
 *   adicionados sobre o snapshot.
 *
 *   Líquido por colaborador =
 *     Σ(salários do período)
 *     − Σ(adiantamentos pagos no período)
 *     − Σ(descontos pendentes no período)
 *     + Σ(comissões pendentes no período)
 */
import type { ColaboradorRH } from "./rhColaboradoresService";
import type { Expense } from "./rhFinancialService";
import type { Comissao } from "./comissoesService";
import type { DescontoFolha } from "./descontosFolhaService";

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

// =============================================================
// PERÍODO (folha quinzenal)
// =============================================================

export type TipoPeriodo = "primeira_quinzena" | "segunda_quinzena" | "personalizado" | "mensal";

export type PeriodoFolha = {
  tipo: TipoPeriodo;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string;    // YYYY-MM-DD
  data_pagamento: string; // YYYY-MM-DD
};

const iso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const lastDayOfMonth = (year: number, monthZeroIdx: number) =>
  new Date(year, monthZeroIdx + 1, 0).getDate();

/**
 * Constrói preset de quinzena para o mês informado (YYYY-MM).
 *  - 1ª quinzena: 01 → 15  | pagamento dia 20 do mesmo mês
 *  - 2ª quinzena: 16 → fim | pagamento dia 05 do mês seguinte
 */
export function buildPeriodoQuinzenal(
  month: string,
  qual: "primeira_quinzena" | "segunda_quinzena"
): PeriodoFolha {
  const [y, m] = month.split("-").map(Number);
  const monthIdx = m - 1;
  if (qual === "primeira_quinzena") {
    return {
      tipo: "primeira_quinzena",
      data_inicio: iso(new Date(y, monthIdx, 1)),
      data_fim: iso(new Date(y, monthIdx, 15)),
      data_pagamento: iso(new Date(y, monthIdx, 20)),
    };
  }
  const ultimo = lastDayOfMonth(y, monthIdx);
  return {
    tipo: "segunda_quinzena",
    data_inicio: iso(new Date(y, monthIdx, 16)),
    data_fim: iso(new Date(y, monthIdx, ultimo)),
    data_pagamento: iso(new Date(y, monthIdx + 1, 5)),
  };
}

/** Mês de referência derivado do período (usa início como âncora). */
export function periodoToMesReferencia(p: { data_inicio: string }): string {
  return p.data_inicio.slice(0, 7);
}

// =============================================================
// LINHAS DA PRÉVIA — agora consumindo despesas existentes
// =============================================================

export type PayrollRow = {
  c: ColaboradorRH;
  /** Soma de salários (despesas existentes na categoria folha do período). */
  salario_base: number;
  /** IDs das despesas de salário consumidas. */
  salarioExpenseIds: string[];
  /** Soma de adiantamentos pagos no período. */
  adiantamentos: number;
  /** IDs dos adiantamentos consumidos. */
  adiantamentoExpenseIds: string[];
  /** Comissões pendentes do período. */
  comissoes: number;
  comissaoIds: string[];
  /** Descontos pendentes do período. */
  descontos: number;
  descontoIds: string[];
  /** Complemento salarial automático (garantia de piso = salário base do mês). */
  complemento: number;
  /** Líquido = base − adiant − descontos + comissões + complemento. */
  liquido: number;
};

export function computePayrollRowsFromPeriodo(input: {
  colaboradores: ColaboradorRH[];
  salarios: Expense[];
  adiantamentos: Expense[];
  comissoes: Comissao[];
  descontos: DescontoFolha[];
  selectedSalarioIds?: Set<string>;
  selectedAdiantamentoIds?: Set<string>;
  selectedComissaoIds?: Set<string>;
  selectedDescontoIds?: Set<string>;
  /** Salários do MÊS inteiro (todos os lançamentos), para checagem de piso. */
  salariosDoMes?: Expense[];
}): PayrollRow[] {
  const {
    colaboradores, salarios, adiantamentos, comissoes, descontos,
    selectedSalarioIds, selectedAdiantamentoIds, selectedComissaoIds, selectedDescontoIds,
    salariosDoMes,
  } = input;

  const salByColab = new Map<string, { total: number; ids: string[] }>();
  salarios.forEach((e) => {
    if (!e.favorecido_id) return;
    if (selectedSalarioIds && !selectedSalarioIds.has(e.id)) return;
    const cur = salByColab.get(e.favorecido_id) || { total: 0, ids: [] };
    cur.total += Number(e.valor_total || 0);
    cur.ids.push(e.id);
    salByColab.set(e.favorecido_id, cur);
  });

  // Total de salários no MÊS inteiro (para verificar piso)
  const totalMesByColab = new Map<string, number>();
  (salariosDoMes || []).forEach((e) => {
    if (!e.favorecido_id) return;
    totalMesByColab.set(
      e.favorecido_id,
      (totalMesByColab.get(e.favorecido_id) || 0) + Number(e.valor_total || 0)
    );
  });

  const advByColab = new Map<string, { total: number; ids: string[] }>();
  adiantamentos.forEach((e) => {
    if (!e.favorecido_id) return;
    if (selectedAdiantamentoIds && !selectedAdiantamentoIds.has(e.id)) return;
    const cur = advByColab.get(e.favorecido_id) || { total: 0, ids: [] };
    cur.total += Number(e.valor_pago || e.valor_total || 0);
    cur.ids.push(e.id);
    advByColab.set(e.favorecido_id, cur);
  });

  const comByColab = new Map<string, { total: number; ids: string[] }>();
  comissoes.forEach((c) => {
    if (selectedComissaoIds && !selectedComissaoIds.has(c.id)) return;
    const cur = comByColab.get(c.colaborador_id) || { total: 0, ids: [] };
    cur.total += Number(c.valor_calculado || 0);
    cur.ids.push(c.id);
    comByColab.set(c.colaborador_id, cur);
  });

  const descByColab = new Map<string, { total: number; ids: string[] }>();
  descontos.forEach((d) => {
    if (selectedDescontoIds && !selectedDescontoIds.has(d.id)) return;
    const cur = descByColab.get(d.colaborador_id) || { total: 0, ids: [] };
    cur.total += Number(d.valor || 0);
    cur.ids.push(d.id);
    descByColab.set(d.colaborador_id, cur);
  });

  return colaboradores
    .filter((c) => c.ativo)
    .map((c) => {
      const sal = salByColab.get(c.id) || { total: 0, ids: [] };
      const adv = advByColab.get(c.id) || { total: 0, ids: [] };
      const com = comByColab.get(c.id) || { total: 0, ids: [] };
      const desc = descByColab.get(c.id) || { total: 0, ids: [] };

      // 🛡️ GARANTIA DE SALÁRIO MÍNIMO (piso = salário base cadastrado)
      // Complemento = max(0, salario_base_cadastrado − total recebido no mês)
      const baseCadastrada = Number(c.salario || 0);
      const recebidoMes = totalMesByColab.get(c.id) || 0;
      const complemento =
        baseCadastrada > 0 && recebidoMes < baseCadastrada
          ? Math.round((baseCadastrada - recebidoMes) * 100) / 100
          : 0;

      const liquido = computeLiquido({
        salary: sal.total + complemento,
        adiant: adv.total,
        descontos: desc.total,
        comissoes: com.total,
      });
      return {
        c,
        salario_base: sal.total,
        salarioExpenseIds: sal.ids,
        adiantamentos: adv.total,
        adiantamentoExpenseIds: adv.ids,
        comissoes: com.total,
        comissaoIds: com.ids,
        descontos: desc.total,
        descontoIds: desc.ids,
        complemento,
        liquido,
      };
    })
    .filter(
      (r) =>
        r.salario_base > 0 ||
        r.adiantamentos > 0 ||
        r.comissoes > 0 ||
        r.descontos > 0 ||
        r.complemento > 0
    );
}

/**
 * Cálculo do líquido seguindo a ordem profissional obrigatória:
 *   Líquido = Base − Adiantamentos − Descontos + Comissões
 * Resultado nunca negativo (clamp em 0).
 */
export function computeLiquido(input: {
  salary: number;
  adiant: number;
  descontos: number;
  comissoes: number;
}): number {
  const base = Number(input.salary || 0);
  const aposAdiant = base - Number(input.adiant || 0);
  const aposDesc = aposAdiant - Number(input.descontos || 0);
  const liquido = aposDesc + Number(input.comissoes || 0);
  return Math.max(0, liquido);
}

// =============================================================
// LEGADO (mantido para o histórico mensal, sem uso no novo wizard)
// =============================================================

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
  comissoesPendentes: Comissao[] = [],
  descontosPendentes: DescontoFolha[] = []
) {
  const adiantByColab = new Map<string, number>();
  const folhaByColab = new Map<string, Expense>();
  const comissoesByColab = new Map<string, { total: number; ids: string[] }>();
  const descontosByColab = new Map<string, { total: number; ids: string[] }>();

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

  descontosPendentes.forEach((d) => {
    const cur = descontosByColab.get(d.colaborador_id) || { total: 0, ids: [] };
    cur.total += Number(d.valor || 0);
    cur.ids.push(d.id);
    descontosByColab.set(d.colaborador_id, cur);
  });

  return colaboradores
    .filter((c) => c.ativo)
    .map((c) => {
      const salary = resolveBaseSalary(c, salaryOverrides);
      const adiant = adiantByColab.get(c.id) || 0;
      const com = comissoesByColab.get(c.id) || { total: 0, ids: [] };
      const desc = descontosByColab.get(c.id) || { total: 0, ids: [] };
      const liquido = computeLiquido({
        salary,
        adiant,
        descontos: desc.total,
        comissoes: com.total,
      });
      const existing = folhaByColab.get(c.id);
      return {
        c,
        salary,
        adiant,
        comissoes: com.total,
        comissaoIds: com.ids,
        descontos: desc.total,
        descontoIds: desc.ids,
        liquido,
        existing,
      };
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
