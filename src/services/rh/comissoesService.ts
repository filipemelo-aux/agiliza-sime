/**
 * Comissões Service — RH
 *
 * Camada de acesso à tabela `comissoes`.
 *
 * IMPORTANTE: este módulo NÃO gera lançamentos financeiros (Contas a Pagar,
 * movimentações bancárias, etc). As comissões ficam em estado `pendente` até
 * serem enviadas para a folha (`enviado_folha`), momento em que o módulo de
 * Folha de Pagamento será responsável por consolidar os valores em despesas.
 */
import { supabase } from "@/integrations/supabase/client";

export type ComissaoTipo = "motorista" | "embarque";
export type ComissaoOrigem = "cte" | "colheita";
export type ComissaoStatus = "pendente" | "enviado_folha";

export type Comissao = {
  id: string;
  colaborador_id: string;
  tipo: ComissaoTipo;
  origem: ComissaoOrigem;
  referencia_id: string;
  valor_base: number;
  percentual: number | null;
  valor_calculado: number;
  status: ComissaoStatus;
  data_referencia: string;
  folha_pagamento_id: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
};

export type NovaComissao = {
  colaborador_id: string;
  tipo: ComissaoTipo;
  origem: ComissaoOrigem;
  referencia_id: string;
  valor_base: number;
  percentual?: number | null;
  valor_calculado: number;
  data_referencia: string;
  observacoes?: string | null;
};

/** Calcula valor da comissão a partir da base e do percentual. */
export function calcularComissao(valorBase: number, percentual: number): number {
  return Math.round(valorBase * (percentual / 100) * 100) / 100;
}

export async function fetchComissoes(filtros?: {
  colaboradorId?: string;
  status?: ComissaoStatus;
  dataInicio?: string;
  dataFim?: string;
}): Promise<Comissao[]> {
  let q = (supabase.from("comissoes" as any) as any)
    .select("*")
    .order("data_referencia", { ascending: false });

  if (filtros?.colaboradorId) q = q.eq("colaborador_id", filtros.colaboradorId);
  if (filtros?.status) q = q.eq("status", filtros.status);
  if (filtros?.dataInicio) q = q.gte("data_referencia", filtros.dataInicio);
  if (filtros?.dataFim) q = q.lte("data_referencia", filtros.dataFim);

  const { data, error } = await q;
  if (error) throw error;
  return (data as Comissao[]) || [];
}

export async function createComissao(input: NovaComissao): Promise<Comissao> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const { data, error } = await (supabase.from("comissoes" as any) as any)
    .insert({
      ...input,
      percentual: input.percentual ?? null,
      observacoes: input.observacoes ?? null,
      status: "pendente" as ComissaoStatus,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Comissao;
}

export async function updateComissao(
  id: string,
  patch: Partial<Pick<Comissao, "valor_base" | "percentual" | "valor_calculado" | "observacoes" | "data_referencia">>
): Promise<void> {
  const { error } = await (supabase.from("comissoes" as any) as any).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteComissao(id: string): Promise<void> {
  const { error } = await (supabase.from("comissoes" as any) as any).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Marca um conjunto de comissões como enviadas para a folha de pagamento.
 * Ainda NÃO cria a despesa — apenas vincula o `folha_pagamento_id` e altera o status.
 */
export async function marcarComoEnviadasFolha(
  comissaoIds: string[],
  folhaPagamentoId: string
): Promise<void> {
  if (comissaoIds.length === 0) return;
  const { error } = await (supabase.from("comissoes" as any) as any)
    .update({ status: "enviado_folha" as ComissaoStatus, folha_pagamento_id: folhaPagamentoId })
    .in("id", comissaoIds);
  if (error) throw error;
}
