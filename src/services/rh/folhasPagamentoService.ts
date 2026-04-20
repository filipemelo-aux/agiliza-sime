/**
 * Folhas de Pagamento — serviço de gestão da folha como entidade própria.
 *
 * 🔁 NOVO FLUXO (folha GERA Contas a Pagar)
 *   1. Criar folha (status: em_aberto) com snapshot por colaborador.
 *      Sem efeito no financeiro.
 *   2. Confirmar folha → para CADA item:
 *        a) Vincula comissões/descontos selecionados à folha
 *        b) CRIA UMA despesa em Contas a Pagar com valor LÍQUIDO,
 *           plano de contas "Salários/Folha", vencimento = data_pagamento da folha,
 *           favorecido = colaborador.
 *        c) Salva o expense_id no item da folha.
 *      Status da folha → confirmada (imutável).
 *   3. Pagamento da despesa gerada é feito via Contas a Pagar (ou pelo
 *      botão de quitação dentro do RH, que abre o mesmo diálogo).
 *   4. Cancelar/Excluir folha em aberto → devolve comissões/descontos para
 *      "pendente" e remove o snapshot. Folha confirmada não pode ser
 *      cancelada (precisa estornar pagamento e cancelar despesa antes).
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
  adiantamento_expense_ids: string[];
  /** Despesa GERADA pela folha (Contas a Pagar). */
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
 *   • CRIA UMA despesa em Contas a Pagar por colaborador, com valor LÍQUIDO,
 *     vencimento = data_pagamento da folha, plano de contas = "Salários/Folha"
 *   • Grava o expense_id no item da folha (rastreabilidade)
 *   • Marca folha como `confirmada`
 *
 * Requer `folhaAccountId` (plano de contas de Salários).
 */
export async function confirmarFolha(input: {
  folhaId: string;
  user_id: string;
  /** Categoria do plano de contas de "Salários" — OBRIGATÓRIA para gerar a despesa líquida. */
  folhaAccountId: string;
}): Promise<{ ok: number; fail: number; errors: string[]; despesasCriadas: number }> {
  if (!input.folhaAccountId) {
    throw new Error("Conta de Salários (plano de contas) não configurada.");
  }

  const { folha, itens } = await buscarFolhaComItens(input.folhaId);
  if (folha.status !== "em_aberto") {
    throw new Error(`Folha não está em aberto (status: ${folha.status}).`);
  }

  let ok = 0;
  let fail = 0;
  let despesasCriadas = 0;
  const errors: string[] = [];

  for (const item of itens) {
    try {
      // 1) Vincula comissões e descontos à folha
      if ((item.comissao_ids || []).length > 0) {
        await marcarComoEnviadasFolha(item.comissao_ids, folha.id);
      }
      if ((item.desconto_ids || []).length > 0) {
        await vincularDescontosAFolha(item.desconto_ids, folha.id);
      }

      // 2) Cria a despesa LÍQUIDA em Contas a Pagar (se ainda não existe)
      const valorLiquido = Number(item.liquido || 0);
      if (valorLiquido > 0 && !item.expense_id) {
        const periodoLabel =
          folha.data_inicio && folha.data_fim
            ? `${folha.data_inicio} – ${folha.data_fim}`
            : folha.mes_referencia;
        const { data: exp, error: expErr } = await supabase
          .from("expenses")
          .insert({
            empresa_id: folha.empresa_id,
            created_by: input.user_id,
            descricao: `Folha de pagamento — ${item.colaborador_nome} (${periodoLabel})`,
            valor_total: valorLiquido,
            valor_pago: 0,
            status: "pendente",
            data_emissao: folha.data_emissao,
            data_vencimento: folha.data_vencimento,
            favorecido_id: item.colaborador_id,
            favorecido_nome: item.colaborador_nome,
            plano_contas_id: input.folhaAccountId,
            origem: "manual",
            observacoes:
              `Despesa gerada automaticamente pela folha ${folha.id}. ` +
              `Base: ${item.salario_base} | +Comissões: ${item.comissoes} ` +
              `| −Adiantamentos: ${item.adiantamentos} | −Descontos: ${item.descontos} ` +
              `| Líquido: ${valorLiquido}`,
          })
          .select("id")
          .single();
        if (expErr) throw expErr;

        await (supabase.from("folhas_pagamento_itens" as any) as any)
          .update({ expense_id: (exp as any).id })
          .eq("id", item.id);
        despesasCriadas++;
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

  return { ok, fail, errors, despesasCriadas };
}

export async function cancelarFolha(folhaId: string): Promise<void> {
  const { data: folha, error } = await (supabase.from("folhas_pagamento" as any) as any)
    .select("status")
    .eq("id", folhaId)
    .single();
  if (error) throw error;
  if ((folha as any).status === "confirmada") {
    throw new Error(
      "Folha confirmada não pode ser cancelada. Estorne o pagamento e exclua a despesa em Contas a Pagar primeiro."
    );
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

/**
 * Reabre uma folha CONFIRMADA cuja despesa gerada ainda NÃO foi paga.
 *   • Verifica se nenhuma despesa do snapshot tem valor_pago > 0
 *   • Apaga as despesas geradas (status volta a pendente sem pagamentos)
 *   • Devolve comissões/descontos para pendente
 *   • Status da folha → em_aberto
 */
export async function reabrirFolhaConfirmada(folhaId: string): Promise<void> {
  const { folha, itens } = await buscarFolhaComItens(folhaId);
  if (folha.status !== "confirmada") {
    throw new Error("Apenas folhas confirmadas podem ser reabertas.");
  }
  const expenseIds = itens.map((i) => i.expense_id).filter(Boolean) as string[];
  if (expenseIds.length > 0) {
    const { data: pagas } = await supabase
      .from("expenses")
      .select("id, valor_pago")
      .in("id", expenseIds);
    const temPagamento = (pagas || []).some((e: any) => Number(e.valor_pago || 0) > 0);
    if (temPagamento) {
      throw new Error(
        "Não é possível reabrir: existem despesas desta folha já pagas/parciais. Estorne os pagamentos primeiro em Contas a Pagar."
      );
    }
    // Soft-delete das despesas (mantém histórico)
    await supabase
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", expenseIds);
    // Limpa expense_id dos itens (precisa burlar trigger de bloqueio antes de mudar status)
  }
  // Volta status para em_aberto ANTES de mexer nos itens (trigger só bloqueia se confirmada)
  await (supabase.from("folhas_pagamento" as any) as any)
    .update({ status: "em_aberto", confirmada_em: null, confirmada_por: null })
    .eq("id", folhaId);
  // Limpa expense_id e desvincula comissões/descontos
  for (const item of itens) {
    await (supabase.from("folhas_pagamento_itens" as any) as any)
      .update({ expense_id: null })
      .eq("id", item.id);
    if ((item.comissao_ids || []).length > 0) {
      try { await marcarComoPendentes(item.comissao_ids); } catch {}
    }
    if ((item.desconto_ids || []).length > 0) {
      try { await desvincularDescontosDaFolha(item.desconto_ids); } catch {}
    }
  }
}
