/**
 * RH Financial Service
 * Camada de leitura desacoplada do financeiro.
 *
 * 🔁 NOVO FLUXO (folha GERA Contas a Pagar)
 *   A folha NÃO consome mais despesas de salário. Salário base agora vem
 *   do CADASTRO do colaborador (`profiles.salario`). A folha apenas:
 *     • Lista ADIANTAMENTOS (despesas pendentes/pagas) do período → para abater
 *     • Lista COMISSÕES pendentes do período → para somar
 *     • Lista DESCONTOS pendentes do período → para abater
 *   Ao confirmar, a folha CRIA uma despesa líquida em Contas a Pagar
 *   (categoria Salários) por colaborador.
 */
import { supabase } from "@/integrations/supabase/client";
import { type Comissao } from "./comissoesService";

export type Expense = {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_emissao: string;
  data_competencia: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  favorecido_id: string | null;
  favorecido_nome: string | null;
  plano_contas_id: string | null;
};

const EXPENSE_COLS =
  "id, descricao, valor_total, valor_pago, status, data_emissao, data_competencia, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id";

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
    .select(EXPENSE_COLS)
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
    .select(EXPENSE_COLS)
    .eq("favorecido_id", colaboradorId)
    .is("deleted_at", null)
    .order("data_emissao", { ascending: false })
    .limit(100);
  if (accountIds.length > 0) q = q.in("plano_contas_id", accountIds);
  const { data } = await q;
  return (data as any) || [];
}

/**
 * Busca ADIANTAMENTOS por COMPETÊNCIA dentro da janela [inicio, fim] da folha.
 * Adiantamentos seguem a PRODUÇÃO do período (competência), não a data financeira.
 */
export async function fetchAdiantamentosPagosNoPeriodo(
  colabIds: string[],
  adiantamentoAccountId: string,
  inicio: string,
  fim: string
): Promise<Expense[]> {
  if (colabIds.length === 0 || !adiantamentoAccountId) return [];
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLS)
    .in("favorecido_id", colabIds)
    .eq("plano_contas_id", adiantamentoAccountId)
    .is("deleted_at", null)
    .gte("data_competencia", inicio)
    .lte("data_competencia", fim)
    .order("data_competencia", { ascending: false });
  if (error) throw error;
  return (data as any) || [];
}

/**
 * Comissões PENDENTES por janela de período (data_referencia entre inicio e fim).
 */
export async function fetchComissoesPendentesNoPeriodo(
  colabIds: string[],
  inicio: string,
  fim: string
): Promise<Comissao[]> {
  if (colabIds.length === 0) return [];
  const { data, error } = await (supabase.from("comissoes" as any) as any)
    .select("*")
    .in("colaborador_id", colabIds)
    .eq("status", "pendente")
    .gte("data_referencia", inicio)
    .lte("data_referencia", fim);
  if (error) throw error;
  return (data as Comissao[]) || [];
}

/**
 * @deprecated Mantido apenas para compatibilidade de leitura mensal.
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
