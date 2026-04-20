/**
 * Folhas de Pagamento — serviço de gestão da folha como entidade própria.
 *
 * 🔁 FLUXO QUINZENAL (NOVO)
 *   1. Criar folha (status: em_aberto) → snapshot consolidado:
 *        • Período (data_inicio, data_fim, data_pagamento, tipo_periodo)
 *        • Por colaborador: IDs das despesas de Salário + Adiantamento consumidas
 *          + comissões/descontos pendentes selecionados
 *      Não toca em `expenses` — apenas LISTA o que já existe.
 *   2. Confirmar → marca status `confirmada` + vincula comissões/descontos à folha.
 *      Não cria despesas (elas já existem em Contas a Pagar).
 *   3. Cancelar/Excluir folha em aberto — devolve comissões/descontos para
 *      "pendente" e remove o snapshot.
 */
import { supabase } from "@/integrations/supabase/client";
import { marcarComoEnviadasFolha, marcarComoPendentes } from "./comissoesService";
import { vincularDescontosAFolha, desvincularDescontosDaFolha } from "./descontosFolhaService";
import type { TipoPeriodo } from "./rhViewModel";

export type FolhaStatus = "em_aberto" | "confirmada" | "cancelada";

export type FolhaPagamento = {
  id: string;
  empresa_id: string;
  mes_referencia: string;
  data_inicio: string | null;
  data_fim: string | null;
  tipo_periodo: TipoPeriodo;
  status: FolhaStatus;
  data_emissao: string;
  data_vencimento: string;
  total_base: number;
  total_adiantamentos: number;
  total_descontos: number;
  total_comissoes: number;
  total_liquido: number;
  observacoes: string | null;
  created_by: string;
  confirmada_em: string | null;
  confirmada_por: string | null;
  created_at: string;
  updated_at: string;
};

export type FolhaItem = {
  id: string;
  folha_id: string;
  colaborador_id: string;
  colaborador_nome: string;
  salario_base: number;
  adiantamentos: number;
  descontos: number;
  comissoes: number;
  liquido: number;
  comissao_ids: string[];
  desconto_ids: string[];
  salario_expense_ids: string[];
  adiantamento_expense_ids: string[];
  expense_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FolhaItemInput = Omit<
  FolhaItem,
  "id" | "folha_id" | "expense_id" | "created_at" | "updated_at"
>;

/**
 * Cria uma folha em estado `em_aberto` com seus itens. NÃO toca em `expenses`.
 */
export async function criarFolhaEmAberto(input: {
  empresa_id: string;
  created_by: string;
  mes_referencia: string;
  data_inicio: string;
  data_fim: string;
  tipo_periodo: TipoPeriodo;
  data_emissao: string;
  data_vencimento: string;
  observacoes?: string;
  itens: FolhaItemInput[];
}): Promise<{ folha: FolhaPagamento; itens: FolhaItem[] }> {
  const totals = input.itens.reduce(
    (acc, i) => ({
      base: acc.base + (Number(i.salario_base) || 0),
      adiant: acc.adiant + (Number(i.adiantamentos) || 0),
      desc: acc.desc + (Number(i.descontos) || 0),
      com: acc.com + (Number(i.comissoes) || 0),
      liq: acc.liq + (Number(i.liquido) || 0),
    }),
    { base: 0, adiant: 0, desc: 0, com: 0, liq: 0 }
  );

  const { data: folhaData, error: folhaErr } = await (supabase
    .from("folhas_pagamento" as any) as any)
    .insert({
      empresa_id: input.empresa_id,
      created_by: input.created_by,
      mes_referencia: input.mes_referencia,
      data_inicio: input.data_inicio,
      data_fim: input.data_fim,
      tipo_periodo: input.tipo_periodo,
      status: "em_aberto",
      data_emissao: input.data_emissao,
      data_vencimento: input.data_vencimento,
      total_base: totals.base,
      total_adiantamentos: totals.adiant,
      total_descontos: totals.desc,
      total_comissoes: totals.com,
      total_liquido: totals.liq,
      observacoes: input.observacoes || null,
    })
    .select("*")
    .single();
  if (folhaErr) throw folhaErr;

  const folha = folhaData as FolhaPagamento;
  if (input.itens.length === 0) return { folha, itens: [] };

  const rows = input.itens.map((i) => ({ ...i, folha_id: folha.id }));
  const { data: itensData, error: itensErr } = await (supabase
    .from("folhas_pagamento_itens" as any) as any)
    .insert(rows)
    .select("*");
  if (itensErr) {
    await (supabase.from("folhas_pagamento" as any) as any).delete().eq("id", folha.id);
    throw itensErr;
  }

  return { folha, itens: (itensData as FolhaItem[]) || [] };
}

export async function listarFolhas(filtros?: {
  status?: FolhaStatus;
  mes?: string;
  inicio?: string;
  fim?: string;
}): Promise<FolhaPagamento[]> {
  let q = (supabase.from("folhas_pagamento" as any) as any)
    .select("*")
    .order("data_inicio", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (filtros?.status) q = q.eq("status", filtros.status);
  if (filtros?.mes) q = q.eq("mes_referencia", filtros.mes);
  if (filtros?.inicio) q = q.gte("data_inicio", filtros.inicio);
  if (filtros?.fim) q = q.lte("data_fim", filtros.fim);
  const { data, error } = await q;
  if (error) throw error;
  return (data as FolhaPagamento[]) || [];
}

export async function buscarFolhaComItens(
  folhaId: string
): Promise<{ folha: FolhaPagamento; itens: FolhaItem[] }> {
  const { data: folha, error: e1 } = await (supabase.from("folhas_pagamento" as any) as any)
    .select("*")
    .eq("id", folhaId)
    .single();
  if (e1) throw e1;
  const { data: itens, error: e2 } = await (supabase.from("folhas_pagamento_itens" as any) as any)
    .select("*")
    .eq("folha_id", folhaId)
    .order("colaborador_nome");
  if (e2) throw e2;
  return { folha: folha as FolhaPagamento, itens: (itens as FolhaItem[]) || [] };
}

/**
 * Confirma a folha:
 *   • Vincula comissões/descontos selecionados à folha
 *   • Gera despesa de COMPLEMENTO SALARIAL (piso garantido) quando informado,
 *     na categoria de folha, status pendente, vencimento = data_pagamento da folha
 *   • Marca status como `confirmada`
 *
 * As despesas de Salário e Adiantamento JÁ EXISTEM em Contas a Pagar e foram
 * apenas referenciadas no snapshot do item (salario_expense_ids /
 * adiantamento_expense_ids). Não são recriadas aqui.
 */
export async function confirmarFolha(input: {
  folhaId: string;
  user_id: string;
  /** Categoria do plano de contas usada para "Salários" — necessária para gerar a despesa de complemento. */
  folhaAccountId?: string;
  /** Mapa colaborador_id → valor de complemento salarial (>0). */
  complementos?: Record<string, number>;
}): Promise<{ ok: number; fail: number; errors: string[]; complementosGerados: number }> {
  const { folha, itens } = await buscarFolhaComItens(input.folhaId);
  if (folha.status !== "em_aberto") {
    throw new Error(`Folha não está em aberto (status: ${folha.status}).`);
  }

  let ok = 0;
  let fail = 0;
  let complementosGerados = 0;
  const errors: string[] = [];

  for (const item of itens) {
    try {
      if ((item.comissao_ids || []).length > 0) {
        await marcarComoEnviadasFolha(item.comissao_ids, folha.id);
      }
      if ((item.desconto_ids || []).length > 0) {
        await vincularDescontosAFolha(item.desconto_ids, folha.id);
      }

      // 🛡️ Gerar despesa de COMPLEMENTO SALARIAL (piso garantido)
      const valorComp = Number(input.complementos?.[item.colaborador_id] || 0);
      if (valorComp > 0 && input.folhaAccountId) {
        const { data: exp, error: expErr } = await supabase
          .from("expenses")
          .insert({
            empresa_id: folha.empresa_id,
            created_by: input.user_id,
            descricao: `Complemento salarial — ${item.colaborador_nome} (folha ${folha.data_inicio}–${folha.data_fim})`,
            valor_total: valorComp,
            valor_pago: 0,
            status: "pendente",
            data_emissao: folha.data_emissao,
            data_vencimento: folha.data_vencimento,
            favorecido_id: item.colaborador_id,
            favorecido_nome: item.colaborador_nome,
            plano_contas_id: input.folhaAccountId,
            origem: "folha_pagamento" as any,
            observacoes: `Gerado automaticamente para garantir o piso salarial da folha ${folha.id}.`,
          })
          .select("id")
          .single();
        if (expErr) throw expErr;
        // Anexa o id no snapshot do item
        const novosIds = [...(item.salario_expense_ids || []), (exp as any).id];
        await (supabase.from("folhas_pagamento_itens" as any) as any)
          .update({ salario_expense_ids: novosIds })
          .eq("id", item.id);
        complementosGerados++;
      }

      ok++;
    } catch (e: any) {
      fail++;
      errors.push(`${item.colaborador_nome}: ${e?.message || String(e)}`);
    }
  }

  if (fail === 0) {
    await (supabase.from("folhas_pagamento" as any) as any)
      .update({
        status: "confirmada",
        confirmada_em: new Date().toISOString(),
        confirmada_por: input.user_id,
      })
      .eq("id", input.folhaId);
  }

  return { ok, fail, errors, complementosGerados };
}

export async function cancelarFolha(folhaId: string): Promise<void> {
  const { data: folha, error } = await (supabase.from("folhas_pagamento" as any) as any)
    .select("status")
    .eq("id", folhaId)
    .single();
  if (error) throw error;
  if ((folha as any).status === "confirmada") {
    throw new Error("Folha confirmada não pode ser cancelada por aqui.");
  }
  await (supabase.from("folhas_pagamento" as any) as any)
    .update({ status: "cancelada" })
    .eq("id", folhaId);
}

export async function excluirFolhaEmAberto(folhaId: string): Promise<void> {
  const { folha, itens } = await buscarFolhaComItens(folhaId);
  if (folha.status !== "em_aberto") {
    throw new Error("Apenas folhas em aberto podem ser excluídas.");
  }
  // Devolver comissões/descontos vinculados (segurança extra)
  for (const item of itens) {
    if ((item.comissao_ids || []).length > 0) {
      try { await marcarComoPendentes(item.comissao_ids); } catch {}
    }
    if ((item.desconto_ids || []).length > 0) {
      try { await desvincularDescontosDaFolha(item.desconto_ids); } catch {}
    }
  }
  await (supabase.from("folhas_pagamento" as any) as any).delete().eq("id", folhaId);
}
