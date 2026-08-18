import { supabase } from "@/integrations/supabase/client";

/**
 * Integração bidirecional entre Contas a Pagar e Cartão de Crédito.
 *
 * Regra contábil: pagar uma conta com cartão NÃO é saída de caixa — é troca de credor.
 * Por isso a baixa é registrada em `expense_payments` com `skip_cashflow = true`
 * (não gera movimentação bancária) e a obrigação passa a viver dentro da fatura do cartão,
 * que por sua vez gera o título no Contas a Pagar quando fechada.
 */

export interface OpenPayableOption {
  expense_id: string;
  installment_id: string | null;
  descricao: string;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  plano_contas_id: string | null;
  centro_custo: string | null;
  data_vencimento: string | null;
  valor_aberto: number;
  valor_total: number;
  parcela_label: string | null;
  status: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Contas a pagar em aberto (ou parciais), achatadas por parcela quando houver parcelamento. */
export async function searchOpenPayables(term: string, limit = 40): Promise<OpenPayableOption[]> {
  let q = supabase
    .from("expenses")
    .select(
      "id, descricao, favorecido_nome, favorecido_id, plano_contas_id, centro_custo, data_vencimento, valor_total, valor_pago, status",
    )
    .is("deleted_at", null)
    .in("status", ["pendente", "atrasado", "parcial"])
    .order("data_vencimento", { ascending: true })
    .limit(limit);

  const t = term.trim();
  if (t.length >= 2) {
    q = q.or(`descricao.ilike.%${t}%,favorecido_nome.ilike.%${t}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  const expenses = (data as any[]) || [];
  if (expenses.length === 0) return [];

  const ids = expenses.map((e) => e.id);
  const { data: instData } = await supabase
    .from("expense_installments")
    .select("id, expense_id, numero_parcela, total_parcelas, valor, data_vencimento, status")
    .in("expense_id", ids)
    .order("numero_parcela", { ascending: true });

  const byExpense = new Map<string, any[]>();
  ((instData as any[]) || []).forEach((i) => {
    const arr = byExpense.get(i.expense_id) || [];
    arr.push(i);
    byExpense.set(i.expense_id, arr);
  });

  const out: OpenPayableOption[] = [];
  for (const e of expenses) {
    const parcelas = byExpense.get(e.id) || [];
    const base = {
      expense_id: e.id,
      descricao: e.descricao,
      favorecido_nome: e.favorecido_nome ?? null,
      favorecido_id: e.favorecido_id ?? null,
      plano_contas_id: e.plano_contas_id ?? null,
      centro_custo: e.centro_custo ?? null,
      valor_total: Number(e.valor_total || 0),
      status: e.status,
    };
    if (parcelas.length > 0) {
      parcelas
        .filter((p) => p.status !== "pago")
        .forEach((p) => {
          out.push({
            ...base,
            installment_id: p.id,
            data_vencimento: p.data_vencimento,
            valor_aberto: Number(p.valor || 0),
            parcela_label: `${p.numero_parcela}/${p.total_parcelas || parcelas.length}`,
          });
        });
    } else {
      const aberto = round2(Number(e.valor_total || 0) - Number(e.valor_pago || 0));
      if (aberto > 0.009) {
        out.push({
          ...base,
          installment_id: null,
          data_vencimento: e.data_vencimento,
          valor_aberto: aberto,
          parcela_label: null,
        });
      }
    }
  }
  return out;
}

/** Faturas de cartão disponíveis para receber lançamentos. */
export interface CardInvoiceOption {
  id: string;
  card_name: string;
  reference_label: string | null;
  due_date: string;
  status: string;
}

export async function listCardInvoices(limit = 60): Promise<CardInvoiceOption[]> {
  const { data, error } = await supabase
    .from("credit_card_invoices" as any)
    .select("id, card_name, reference_label, due_date, status")
    .is("deleted_at", null)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as any[]) || []) as CardInvoiceOption[];
}

/**
 * Registra a baixa de uma conta a pagar SEM impacto no fluxo de caixa.
 * Retorna o id do `expense_payments` criado.
 */
export async function registerCardDischarge(params: {
  expenseId: string;
  installmentId?: string | null;
  valor: number;
  dataPagamento: string;
  userId?: string;
  observacoes?: string | null;
}): Promise<string> {
  const { expenseId, installmentId, valor, dataPagamento, userId, observacoes } = params;

  const { data: pay, error: payErr } = await supabase
    .from("expense_payments" as any)
    .insert({
      expense_id: expenseId,
      valor,
      forma_pagamento: "cartao_credito",
      data_pagamento: dataPagamento,
      observacoes: observacoes || "Pago com cartão de crédito (sem saída de caixa)",
      created_by: userId,
      juros: 0,
      skip_cashflow: true,
      installment_id: installmentId || null,
    } as any)
    .select("id")
    .single();
  if (payErr) throw payErr;

  await applyExpenseStatus(expenseId, installmentId || null, dataPagamento);
  return (pay as any).id as string;
}

/** Estorna a baixa feita por cartão, devolvendo a conta ao Contas a Pagar. */
export async function revertCardDischarge(params: {
  paymentId: string;
  expenseId: string;
  installmentId?: string | null;
}) {
  const { paymentId, expenseId, installmentId } = params;
  const { error } = await supabase.from("expense_payments" as any).delete().eq("id", paymentId);
  if (error) throw error;

  if (installmentId) {
    await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", installmentId);
  }
  await recalcExpenseFromPayments(expenseId);
}

/** Marca parcela como paga e recalcula o cabeçalho da despesa. */
async function applyExpenseStatus(expenseId: string, installmentId: string | null, dataPagamento: string) {
  if (installmentId) {
    const { error } = await supabase
      .from("expense_installments")
      .update({ status: "pago" } as any)
      .eq("id", installmentId);
    if (error) throw error;

    const { data: allInst } = await supabase
      .from("expense_installments")
      .select("valor, status")
      .eq("expense_id", expenseId);
    const list = ((allInst as any[]) || []);
    const totalPago = list.filter((i) => i.status === "pago").reduce((s, i) => s + Number(i.valor || 0), 0);
    const allPaid = list.length > 0 && list.every((i) => i.status === "pago");
    const { error: upErr } = await supabase
      .from("expenses")
      .update({
        valor_pago: round2(totalPago),
        status: allPaid ? "pago" : "parcial",
        forma_pagamento: "cartao_credito",
        data_pagamento: dataPagamento,
      } as any)
      .eq("id", expenseId);
    if (upErr) throw upErr;
    return;
  }
  await recalcExpenseFromPayments(expenseId, { forma: "cartao_credito", dataPagamento });
}

/** Recalcula valor_pago/status a partir dos pagamentos existentes. */
async function recalcExpenseFromPayments(
  expenseId: string,
  opts?: { forma?: string; dataPagamento?: string },
) {
  const { data: exp } = await supabase
    .from("expenses")
    .select("valor_total")
    .eq("id", expenseId)
    .maybeSingle();
  const total = Number((exp as any)?.valor_total || 0);

  const { data: pays } = await supabase
    .from("expense_payments" as any)
    .select("valor, juros")
    .eq("expense_id", expenseId);
  const pago = ((pays as any[]) || []).reduce(
    (s, p) => s + (Number(p.valor || 0) - Number(p.juros || 0)),
    0,
  );

  const { data: inst } = await supabase
    .from("expense_installments")
    .select("status")
    .eq("expense_id", expenseId);
  const instList = ((inst as any[]) || []);

  let status: string;
  if (instList.length > 0) {
    status = instList.every((i) => i.status === "pago")
      ? "pago"
      : instList.some((i) => i.status === "pago")
        ? "parcial"
        : "pendente";
  } else if (pago <= 0.009) {
    status = "pendente";
  } else {
    status = pago + 0.005 >= total ? "pago" : "parcial";
  }

  const payload: any = { valor_pago: round2(pago), status };
  if (status === "pendente") payload.data_pagamento = null;
  if (opts?.forma) payload.forma_pagamento = opts.forma;
  if (opts?.dataPagamento && status !== "pendente") payload.data_pagamento = opts.dataPagamento;

  const { error } = await supabase.from("expenses").update(payload).eq("id", expenseId);
  if (error) throw error;
}

/** Recalcula o total da fatura a partir dos itens. */
export async function recalcInvoiceTotal(invoiceId: string) {
  const { data } = await supabase
    .from("credit_card_invoice_items" as any)
    .select("amount")
    .eq("invoice_id", invoiceId);
  const total = ((data as any[]) || []).reduce((s, i) => s + Number(i.amount || 0), 0);
  await supabase
    .from("credit_card_invoices" as any)
    .update({ total_amount: round2(total) })
    .eq("id", invoiceId);
  return round2(total);
}

/**
 * FLUXO 1 — Contas a Pagar → Cartão.
 * Quita a conta (sem caixa) e cria o lançamento correspondente na fatura escolhida.
 */
export async function payPayableWithCard(params: {
  invoiceId: string;
  expenseId: string;
  installmentId?: string | null;
  valor: number;
  dataPagamento: string;
  descricao: string;
  favorecidoId?: string | null;
  favorecidoNome?: string | null;
  planoContasId?: string | null;
  centroCusto?: string | null;
  userId?: string;
  observacoes?: string | null;
}) {
  const paymentId = await registerCardDischarge({
    expenseId: params.expenseId,
    installmentId: params.installmentId,
    valor: params.valor,
    dataPagamento: params.dataPagamento,
    userId: params.userId,
    observacoes: params.observacoes,
  });

  const { error } = await supabase.from("credit_card_invoice_items" as any).insert({
    invoice_id: params.invoiceId,
    posted_date: params.dataPagamento,
    description: params.descricao,
    amount: params.valor,
    plano_contas_id: params.planoContasId || null,
    centro_custo: params.centroCusto || null,
    favorecido_id: params.favorecidoId || null,
    favorecido_nome: params.favorecidoNome || null,
    observacoes: "Baixa de conta a pagar via cartão de crédito",
    origem_expense_id: params.expenseId,
    origem_payment_id: paymentId,
    origem_installment_id: params.installmentId || null,
    origem_tipo: "baixa",
  } as any);
  if (error) {
    // rollback lógico da baixa para não deixar a conta quitada sem lançamento na fatura
    await revertCardDischarge({
      paymentId,
      expenseId: params.expenseId,
      installmentId: params.installmentId,
    });
    throw error;
  }

  await recalcInvoiceTotal(params.invoiceId);
  return paymentId;
}
