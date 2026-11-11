import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON)("exclui somente o colaborador escolhido, estorna a folha e preserva reembolso anterior e colega pago", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "{}");
  const config = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (key: string) => {
    const match = config.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
    if (!match) throw new Error(`Missing ${key}`);
    return match[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const expenses: string[] = []; let folhaId: string | undefined;
  try {
    const ref = ok(await db.from("expenses").select("empresa_id,tenant_id,plano_contas_id").is("deleted_at", null).limit(1).single());
    const employee = ok(await db.from("profiles").select("id,full_name").in("category", ["motorista", "colaborador"]).limit(1).single());
    const colleague = ok(await db.from("profiles").select("id").in("category", ["motorista", "colaborador"]).neq("id", employee.id).limit(1).single());
    const createExpense = async (valor: number, reimbursement = false) => {
      const e = ok(await db.from("expenses").insert({ ...ref, descricao: "TESTE TEMPORÁRIO — estorno folha", valor_total: valor, data_emissao: "2026-11-01", data_vencimento: "2026-11-05", centro_custo: "operacional", created_by: session.user.id, favorecido_id: employee.id, is_reembolso: reimbursement, reembolso_colaborador_id: reimbursement ? employee.id : null }).select("id").single());
      expenses.push(e.id); return e.id;
    };
    const salaryId = await createExpense(200), siblingExpense = await createExpense(300), reimbId = await createExpense(150, true);
    ok(await db.from("expense_payments").insert({ expense_id: reimbId, valor: 50, forma_pagamento: "pix", data_pagamento: "2026-11-01T12:00:00-03:00", created_by: session.user.id }));
    const f = ok(await db.from("folhas_pagamento").insert({ empresa_id: ref.empresa_id, mes_referencia: "2026-11", data_inicio: "2026-11-01", data_fim: "2026-11-15", data_emissao: "2026-11-01", data_vencimento: "2026-11-20", status: "em_aberto", created_by: session.user.id, total_liquido: 600 }).select("id").single());
    folhaId = f.id;
    const item = ok(await db.from("folhas_pagamento_itens").insert({ folha_id: f.id, expense_id: salaryId, colaborador_id: employee.id, colaborador_nome: "TESTE — selecionado", salario_base: 200, liquido: 300, reembolsos: 100, reembolso_expense_ids: [reimbId] }).select("id").single());
    const sibling = ok(await db.from("folhas_pagamento_itens").insert({ folha_id: f.id, expense_id: siblingExpense, colaborador_id: colleague.id, colaborador_nome: "TESTE — colega", salario_base: 300, liquido: 300 }).select("id").single());
    ok(await db.from("folhas_pagamento").update({ status: "confirmada" }).eq("id", f.id));
    ok(await db.rpc("pay_payroll_item_with_reimbursements", { _item_id: item.id, _date: "2026-11-05", _method: "pix" }));
    ok(await db.rpc("pay_payroll_item_with_reimbursements", { _item_id: sibling.id, _date: "2026-11-05", _method: "pix" }));
    const preview = ok(await db.rpc("delete_payroll_item_with_reversal", { _item_id: item.id })) as { total: number; pagamentos: { id: string }[] };
    expect(preview.total).toBe(300);
    expect(preview.pagamentos).toHaveLength(2);
    expect(ok(await db.from("expense_payments").select("id").eq("expense_id", salaryId))).toHaveLength(1);
    const rejected = await db.rpc("delete_payroll_item_with_reversal", { _item_id: item.id, _execute: true, _expected_payment_ids: [] });
    expect(rejected.error?.message).toContain("alterados");
    expect(ok(await db.from("folhas_pagamento_itens").select("id").eq("id", item.id))).toHaveLength(1);
    const payrollPayments = ok(await db.from("expense_payments").select("lote_id").eq("expense_id", salaryId));
    const batch = payrollPayments[0]?.lote_id;
    if (!batch) throw new Error("Lote ausente");
    ok(await db.rpc("delete_payroll_item_with_reversal", { _item_id: item.id, _execute: true, _expected_payment_ids: preview.pagamentos.map(p => p.id) }));
    expect(ok(await db.from("folhas_pagamento_itens").select("id").eq("id", item.id))).toHaveLength(0);
    expect(ok(await db.from("expenses").select("valor_pago,reembolso_folha_item_id,deleted_at").eq("id", reimbId).single())).toEqual({ valor_pago: 50, reembolso_folha_item_id: null, deleted_at: null });
    expect(ok(await db.from("expenses").select("valor_pago,status").eq("id", siblingExpense).single())).toEqual({ valor_pago: 300, status: "pago" });
    expect(ok(await db.from("folhas_pagamento").select("status,total_liquido").eq("id", f.id).single())).toEqual({ status: "confirmada", total_liquido: 300 });
    expect(ok(await db.from("movimentacoes_bancarias").select("id").eq("origem_id", batch))).toHaveLength(0);
    const second = ok(await db.rpc("delete_payroll_item_with_reversal", { _item_id: sibling.id })) as { pagamentos: { id: string }[] };
    ok(await db.rpc("delete_payroll_item_with_reversal", { _item_id: sibling.id, _execute: true, _expected_payment_ids: second.pagamentos.map(p => p.id) }));
    expect(ok(await db.from("folhas_pagamento").select("id").eq("id", f.id))).toHaveLength(0);
  } finally {
    for (const id of expenses) ok(await db.from("expense_payments").delete().eq("expense_id", id));
    if (folhaId) { ok(await db.from("folhas_pagamento").update({ status: "em_aberto" }).eq("id", folhaId)); ok(await db.from("folhas_pagamento_itens").delete().eq("folha_id", folhaId)); ok(await db.from("folhas_pagamento").delete().eq("id", folhaId)); }
    for (const id of expenses) ok(await db.from("expenses").delete().eq("id", id));
  }
}, 60000);