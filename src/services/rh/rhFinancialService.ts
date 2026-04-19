/**
 * RH Financial Service
 * Camada de leitura desacoplada do financeiro. Apenas CONSOME `expenses` —
 * nenhuma escrita financeira nem regra de cálculo de pagamento é duplicada aqui.
 * A criação de despesas (folha) reusa o fluxo padrão de Contas a Pagar.
 */
import { supabase } from "@/integrations/supabase/client";
import { marcarComoEnviadasFolha, type Comissao } from "./comissoesService";

export type Expense = {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  favorecido_id: string | null;
  favorecido_nome: string | null;
  plano_contas_id: string | null;
};

export const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};

export async function fetchExpensesForColaboradores(
  colabIds: string[],
  month: string
): Promise<Expense[]> {
  if (colabIds.length === 0) return [];
  const { start, end } = monthRange(month);
  const { data } = await supabase
    .from("expenses")
    .select(
      "id, descricao, valor_total, valor_pago, status, data_emissao, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id"
    )
    .in("favorecido_id", colabIds)
    .is("deleted_at", null)
    .gte("data_emissao", start)
    .lt("data_emissao", end)
    .order("data_emissao", { ascending: false });
  return (data as any) || [];
}

export async function fetchExpensesByColaborador(
  colaboradorId: string,
  accountIds: string[]
): Promise<Expense[]> {
  let q = supabase
    .from("expenses")
    .select(
      "id, descricao, valor_total, valor_pago, status, data_emissao, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id"
    )
    .eq("favorecido_id", colaboradorId)
    .is("deleted_at", null)
    .order("data_emissao", { ascending: false })
    .limit(100);
  if (accountIds.length > 0) q = q.in("plano_contas_id", accountIds);
  const { data } = await q;
  return (data as any) || [];
}

/**
 * Busca todas as comissões PENDENTES dos colaboradores cuja `data_referencia`
 * cai dentro do mês informado. Usado pela Folha Mensal para somar comissões
 * ao salário base de cada colaborador.
 */
export async function fetchComissoesPendentesForMonth(
  colabIds: string[],
  month: string
): Promise<Comissao[]> {
  if (colabIds.length === 0) return [];
  const { start, end } = monthRange(month);
  const { data, error } = await (supabase.from("comissoes" as any) as any)
    .select("*")
    .in("colaborador_id", colabIds)
    .eq("status", "pendente")
    .gte("data_referencia", start)
    .lt("data_referencia", end);
  if (error) throw error;
  return (data as Comissao[]) || [];
}

/**
 * Cria uma despesa de Folha consumindo o fluxo padrão de Contas a Pagar.
 * Não cria movimentação bancária (isso é feito pelos triggers do financeiro
 * quando o pagamento é registrado via expense_payments).
 *
 * Se houver `comissaoIds`, após criar a despesa marca essas comissões como
 * `enviado_folha` e vincula ao `folha_pagamento_id` (id da despesa criada).
 */
export async function createPayrollExpense(input: {
  empresa_id: string;
  created_by: string;
  colaboradorId: string;
  colaboradorNome: string;
  month: string;
  liquido: number;
  salarioBase: number;
  adiantamentos: number;
  comissoes?: number;
  comissaoIds?: string[];
  emissionDate: string;
  dueDate: string;
  folhaAccountId: string;
}): Promise<{ error: Error | null; expenseId?: string }> {
  const comissoes = input.comissoes || 0;
  const obsParts = [
    `Salário base: ${input.salarioBase}`,
    `Adiantamentos descontados: ${input.adiantamentos}`,
  ];
  if (comissoes > 0) obsParts.push(`Comissões somadas: ${comissoes}`);

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      empresa_id: input.empresa_id,
      created_by: input.created_by,
      descricao: `Folha de pagamento ${input.month} — ${input.colaboradorNome}`,
      valor_total: input.liquido,
      data_emissao: input.emissionDate,
      data_vencimento: input.dueDate,
      favorecido_id: input.colaboradorId,
      favorecido_nome: input.colaboradorNome,
      plano_contas_id: input.folhaAccountId,
      tipo_despesa: "outros",
      centro_custo: "administrativo",
      origem: "manual",
      status: "pendente",
      observacoes: `Gerado pelo módulo RH. ${obsParts.join(". ")}.`,
    } as any)
    .select("id")
    .single();

  if (error) return { error: error as any };

  const expenseId = (data as any)?.id as string | undefined;

  // Vincular comissões à folha gerada
  if (expenseId && input.comissaoIds && input.comissaoIds.length > 0) {
    try {
      await marcarComoEnviadasFolha(input.comissaoIds, expenseId);
    } catch (e: any) {
      // Não falha a folha se o vínculo falhar — apenas avisa via console
      console.error("Falha ao vincular comissões à folha:", e);
    }
  }

  return { error: null, expenseId };
}
