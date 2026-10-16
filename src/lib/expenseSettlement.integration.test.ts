import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

// Opt-in authenticated regression; only its own temporary records are removed.
it.skipIf(!process.env.FINANCIAL_TEST_SESSION_FILE)("settles an expense when its remaining 43 cents are removed, preserving both payments", async () => {
  const path = process.env.FINANCIAL_TEST_SESSION_FILE;
  if (!path) throw new Error("Authenticated session required");
  const minted = JSON.parse(readFileSync(path, "utf8"));
  const ref = minted.storage_key.replace(/^sb-/, "").replace(/-auth-token$/, "");
  const db = createClient(`https://${ref}.supabase.co`, minted.session.access_token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${minted.session.access_token}` } },
  });
  const original = await db.from("expenses").select("empresa_id, tenant_id")
    .eq("id", "1b5502f7-b0dc-45e4-af01-7b5be0ee2f86").single();
  if (original.error) throw original.error;
  let id: string | undefined;
  try {
    const inserted = await db.from("expenses").insert({
      ...original.data, descricao: "TESTE TEMPORÁRIO — quitação após edição",
      valor_total: 1856.33, data_emissao: "2026-09-28", data_vencimento: "2026-09-28",
      tipo_despesa: "outros", centro_custo: "administrativo", created_by: minted.session.user.id,
    }).select("id").single();
    if (inserted.error) throw inserted.error;
    id = inserted.data.id;
    const paid = await db.from("expense_payments").insert([1518.90, 337.00].map(valor => ({
      expense_id: id, tenant_id: original.data.tenant_id, valor,
      forma_pagamento: "pix", data_pagamento: "2026-09-28T12:00:00-03:00", created_by: minted.session.user.id,
    })));
    if (paid.error) throw paid.error;
    const before = await db.from("expenses").select("status,valor_total,valor_pago").eq("id", id).single();
    if (before.error) throw before.error;
    expect(before.data.status).toBe("parcial");
    expect(Number(before.data.valor_total) - Number(before.data.valor_pago)).toBeCloseTo(0.43, 2);
    const edited = await db.from("expenses").update({ valor_total: 1855.90 }).eq("id", id);
    if (edited.error) throw edited.error;
    const after = await db.from("expenses").select("status,valor_total,valor_pago").eq("id", id).single();
    if (after.error) throw after.error;
    expect(after.data).toEqual({ status: "pago", valor_total: 1855.90, valor_pago: 1855.90 });
    const payments = await db.from("expense_payments").select("valor").eq("expense_id", id).order("valor");
    if (payments.error) throw payments.error;
    expect(payments.data).toEqual([{ valor: 337 }, { valor: 1518.90 }]);
  } finally {
    if (id) {
      const removedPayments = await db.from("expense_payments").delete().eq("expense_id", id);
      if (removedPayments.error) throw removedPayments.error;
      const removedExpense = await db.from("expenses").delete().eq("id", id);
      if (removedExpense.error) throw removedExpense.error;
    }
  }
}, 30000);