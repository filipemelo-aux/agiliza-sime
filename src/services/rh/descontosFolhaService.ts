/**
 * Descontos de Folha — RH (estrutura preparada).
 *
 * IMPORTANTE: Esta camada apenas LÊ/ESCREVE registros da tabela `descontos_folha`.
 * NÃO há regra de cálculo automática implementada (INSS, IRRF, faltas etc).
 * A integração com a folha será feita em iteração futura — por enquanto a Folha
 * Mensal apenas exibe a coluna "Descontos" totalizando o que existir.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PlanoDesconto } from "@/lib/rh/descontoParcelas";
import type { AcertoPeriod } from "@/lib/rhAcertoPeriod";

export type DescontoFolhaTipo =
  | "adiantamento"
  | "vale"
  | "inss"
  | "irrf"
  | "faltas"
  | "multas"
  | "combustivel"
  | "credito_trabalhador"
  | "avaria"
  | "outros";

export type DescontoFolha = {
  id: string;
  colaborador_id: string;
  tipo: DescontoFolhaTipo;
  valor: number;
  descricao: string | null;
  data_referencia: string;
  data_original?: string | null;
  folha_pagamento_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  plano_desconto_id?: string | null;
  parcela_numero?: number | null;
  parcelas_total?: number | null;
};

export type NovoDescontoFolha = {
  colaborador_id: string;
  tipo: DescontoFolhaTipo;
  valor: number;
  descricao?: string | null;
  data_referencia: string;
};

const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 1)) };
};

/** Busca descontos pendentes (sem folha) cuja data_referencia cai no mês informado. */
export async function fetchDescontosPendentesForMonth(
  colabIds: string[],
  month: string
): Promise<DescontoFolha[]> {
  if (colabIds.length === 0) return [];
  const { start, end } = monthRange(month);
  const { data, error } = await (supabase.from("descontos_folha" as any) as any)
    .select("*")
    .in("colaborador_id", colabIds)
    .is("folha_pagamento_id", null)
    .gte("data_referencia", start)
    .lt("data_referencia", end);
  if (error) throw error;
  return (data as DescontoFolha[]) || [];
}

export async function createDescontoFolha(input: NovoDescontoFolha): Promise<DescontoFolha> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const { data, error } = await (supabase.from("descontos_folha" as any) as any)
    .insert({
      ...input,
      descricao: input.descricao ?? null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DescontoFolha;
}

/** Cria vários descontos de uma vez (usado pelo cálculo automático INSS/IRRF). */
export async function createDescontosFolhaBatch(
  inputs: NovoDescontoFolha[]
): Promise<DescontoFolha[]> {
  if (inputs.length === 0) return [];
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const rows = inputs.map((i) => ({
    ...i,
    descricao: i.descricao ?? null,
    created_by: userId,
  }));
  const { data, error } = await (supabase.from("descontos_folha" as any) as any)
    .insert(rows)
    .select();
  if (error) throw error;
  return (data as DescontoFolha[]) || [];
}

export async function deleteDescontoFolha(id: string): Promise<void> {
  const { error } = await (supabase.from("descontos_folha" as any) as any).delete().eq("id", id);
  if (error) throw error;
}

/** Creates whole plans atomically; stable plan IDs make a linking retry idempotent. */
export async function criarPlanosDescontoAcerto(colaboradorId: string, periodo: AcertoPeriod, planos: PlanoDesconto[]): Promise<DescontoFolha[]> {
  if (!planos.length) return [];
  const { data, error } = await supabase.rpc("criar_planos_desconto_acerto", {
    _colaborador_id: colaboradorId, _periodo_inicio: periodo.inicio, _periodo_fim: periodo.fim,
    _planos: planos.map((p) => ({ ...p })),
  });
  if (error) throw error;
  return (data || []) as DescontoFolha[];
}

/** Vincula descontos a uma folha gerada (despesa). */
export async function vincularDescontosAFolha(
  ids: string[],
  folhaPagamentoId: string
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await (supabase.from("descontos_folha" as any) as any)
    .update({ folha_pagamento_id: folhaPagamentoId })
    .in("id", ids);
  if (error) throw error;
}

/** Desvincula descontos de uma folha (volta a status pendente). */
export async function desvincularDescontosDaFolha(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await (supabase.from("descontos_folha" as any) as any)
    .update({ folha_pagamento_id: null })
    .in("id", ids);
  if (error) throw error;
}

/** Busca descontos pendentes por janela de datas (folha quinzenal). */
export async function fetchDescontosPendentesNoPeriodo(
  colabIds: string[],
  inicio: string,
  fim: string
): Promise<DescontoFolha[]> {
  if (colabIds.length === 0) return [];
  const { data, error } = await (supabase.from("descontos_folha" as any) as any)
    .select("*")
    .in("colaborador_id", colabIds)
    .is("folha_pagamento_id", null)
    .gte("data_referencia", inicio)
    .lte("data_referencia", fim);
  if (error) throw error;
  return (data as DescontoFolha[]) || [];
}

/**
 * Cria as parcelas FUTURAS de um adiantamento/vale parcelado.
 * A 1ª parcela é descontada na folha atual (não vira registro aqui);
 * as demais viram descontos pendentes nos meses seguintes.
 */
export async function createParcelasFuturasAdiantamento(input: {
  colaborador_id: string;
  mesReferencia: string; // "YYYY-MM" da folha atual
  parcelas: number[]; // todas as parcelas (índice 0 = folha atual)
  descricaoBase: string;
  origemExpenseId: string;
  dataOriginal: string;
}): Promise<void> {
  const { colaborador_id, mesReferencia, parcelas, descricaoBase } = input;
  if (parcelas.length <= 1) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const [y, m] = mesReferencia.split("-").map(Number);
  const rows = parcelas.slice(1).map((valor, i) => {
    const d = new Date(y, m - 1 + i + 1, 1);
    return {
      colaborador_id,
      tipo: "adiantamento" as DescontoFolhaTipo,
      valor,
      descricao: `${descricaoBase} — parcela ${i + 2}/${parcelas.length}`,
      data_referencia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      data_original: input.dataOriginal,
      adiantamento_origem_id: input.origemExpenseId,
      parcela_numero: i + 2,
      parcelas_total: parcelas.length,
      created_by: userId,
    };
  });

  const { error } = await (supabase.from("descontos_folha" as any) as any).insert(rows);
  if (error) throw error;
}

/**
 * Cria as parcelas FUTURAS de um desconto parcelado (índice 0 = folha atual).
 * Mantém o mesmo tipo do desconto original.
 */
export async function createParcelasFuturasDesconto(input: {
  colaborador_id: string;
  tipo: DescontoFolhaTipo;
  mesReferencia: string; // "YYYY-MM" da folha atual
  parcelas: number[];
  descricaoBase: string;
  dataOriginal: string;
}): Promise<void> {
  const { colaborador_id, tipo, mesReferencia, parcelas, descricaoBase } = input;
  if (parcelas.length <= 1) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Usuário não autenticado");

  const [y, m] = mesReferencia.split("-").map(Number);
  const rows = parcelas.slice(1).map((valor, i) => {
    const d = new Date(y, m - 1 + i + 1, 1);
    return {
      colaborador_id,
      tipo,
      valor,
      descricao: `${descricaoBase} — parcela ${i + 2}/${parcelas.length}`,
      data_referencia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
      data_original: input.dataOriginal,
      created_by: userId,
    };
  });

  const { error } = await (supabase.from("descontos_folha" as any) as any).insert(rows);
  if (error) throw error;
}

/**
 * Exclui um desconto criado no acerto (e todas as parcelas do mesmo plano).
 * Bloqueia se for parcela de vale/adiantamento ou se alguma parcela já foi usada em acerto/folha.
 */
export async function excluirDescontoCriado(descontoId: string): Promise<number> {
  const tbl = () => (supabase.from("descontos_folha" as any) as any);
  const { data: d, error } = await tbl().select("id, plano_desconto_id, adiantamento_origem_id").eq("id", descontoId).maybeSingle();
  if (error) throw error;
  if (!d) return 0;
  if (d.adiantamento_origem_id) throw new Error("Parcela de vale/adiantamento: remova o parcelamento pelo botão de Vales/Adiantamentos.");
  const { data: rows, error: e1 } = d.plano_desconto_id
    ? await tbl().select("id, folha_pagamento_id").or(`plano_desconto_id.eq.${d.plano_desconto_id},id.eq.${d.plano_desconto_id}`)
    : await tbl().select("id, folha_pagamento_id").eq("id", descontoId);
  if (e1) throw e1;
  const ids = (rows || []).map((r: any) => r.id);
  if ((rows || []).some((r: any) => r.folha_pagamento_id)) throw new Error("Uma das parcelas já está em uma folha.");
  const { data: usados, error: e2 } = await (supabase.from("acerto_movimentos" as any) as any).select("origem_id").in("origem_id", ids);
  if (e2) throw e2;
  if ((usados || []).length) throw new Error("Uma das parcelas já está em um acerto. Remova-a da movimentação primeiro.");
  const { error: e3 } = await tbl().delete().in("id", ids);
  if (e3) throw e3;
  return ids.length;
}
