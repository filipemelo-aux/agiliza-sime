import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON)("reserva, paga e estorna reembolso sem repetir custo ou caixa", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "{}");
  const config = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (key: string) => {
    const match = config.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
    if (!match) throw new Error(`Missing ${key}`);
    return match[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  let expenseId: string | undefined, folhaId: string | undefined;
  try {
    const ref = ok(await db.from("expenses").select("empresa_id,tenant_id,plano_contas_id").is("deleted_at", null).limit(1).single());
    const employee = ok(await db.from("profiles").select("id,full_name").in("category", ["motorista", "colaborador"]).limit(1).single());
    const e = ok(await db.from("expenses").insert({ ...ref, descricao: "TESTE TEMPORÁRIO — reembolso", valor_total: 150, data_emissao: "2026-10-10", data_vencimento: "2026-10-31", centro_custo: "operacional", created_by: session.user.id, is_reembolso: true, reembolso_colaborador_id: employee.id }).select("id").single());
    expenseId = e.id;
    ok(await db.from("expense_payments").insert({ expense_id: e.id, valor: 50, forma_pagamento: "pix", data_pagamento: "2026-10-11T12:00:00-03:00", created_by: session.user.id }));
    const f = ok(await db.from("folhas_pagamento").insert({ empresa_id: ref.empresa_id, mes_referencia: "2026-10", data_inicio: "2026-10-01", data_fim: "2026-10-31", data_emissao: "2026-10-31", data_vencimento: "2026-11-05", status: "em_aberto", created_by: session.user.id, total_liquido: 100 }).select("id").single());
    folhaId = f.id;
    const item = ok(await db.from("folhas_pagamento_itens").insert({ folha_id: f.id, colaborador_id: employee.id, colaborador_nome: employee.full_name, salario_base: 0, liquido: 100, reembolsos: 100, reembolso_expense_ids: [e.id] }).select("id").single());
    expect(ok(await db.from("expenses").select("valor_pago,reembolso_folha_item_id").eq("id", e.id).single())).toEqual({ valor_pago: 50, reembolso_folha_item_id: item.id });
    const blocked = await db.from("expense_payments").insert({ expense_id: e.id, valor: 100, forma_pagamento: "pix", data_pagamento: "2026-11-05T12:00:00-03:00", created_by: session.user.id });
    expect(blocked.error?.message).toContain("reservado");
    const duplicate = await db.from("folhas_pagamento_itens").insert({ folha_id: f.id, colaborador_id: employee.id, colaborador_nome: employee.full_name, salario_base: 0, liquido: 100, reembolsos: 100, reembolso_expense_ids: [e.id] });
    expect(duplicate.error).not.toBeNull();
    ok(await db.from("folhas_pagamento").update({ status: "confirmada" }).eq("id", f.id));
    expect(ok(await db.rpc("pay_payroll_item_with_reimbursements", { _item_id: item.id, _date: "2026-11-05", _method: "pix" }))).toBe(1);
    expect(ok(await db.rpc("pay_payroll_item_with_reimbursements", { _item_id: item.id, _date: "2026-11-05", _method: "pix" }))).toBe(0);
    expect(ok(await db.from("expenses").select("status,valor_total,valor_pago").eq("id", e.id).single())).toEqual({ status: "pago", valor_total: 150, valor_pago: 150 });
    const payments = ok(await db.from("expense_payments").select("id,lote_id,valor").eq("expense_id", e.id));
    const payrollPay = payments.find(p => p.lote_id);
    if (!payrollPay?.lote_id) throw new Error("Pagamento da folha não encontrado");
    const movements = ok(await db.from("movimentacoes_bancarias").select("valor").eq("origem_id", payrollPay.lote_id));
    expect(movements.map(m => m.valor)).toEqual([100]);
    ok(await db.from("expense_payments").delete().eq("id", payrollPay.id));
    expect(ok(await db.from("expenses").select("valor_pago").eq("id", e.id).single()).valor_pago).toBe(50);
    expect(ok(await db.from("movimentacoes_bancarias").select("id").eq("origem_id", payrollPay.lote_id))).toHaveLength(0);
  } finally {
    if (expenseId) ok(await db.from("expense_payments").delete().eq("expense_id", expenseId));
    if (folhaId) { ok(await db.from("folhas_pagamento").update({ status: "em_aberto" }).eq("id", folhaId)); ok(await db.from("folhas_pagamento_itens").delete().eq("folha_id", folhaId)); ok(await db.from("folhas_pagamento").delete().eq("id", folhaId)); }
    if (expenseId) ok(await db.from("expenses").delete().eq("id", expenseId));
  }
}, 60000);