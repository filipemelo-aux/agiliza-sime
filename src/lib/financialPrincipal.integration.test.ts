import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON)("sincroniza principal, juros, desconto e estorno nas parcelas", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "{}");
  const config = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (key: string) => {
    const match = config.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
    if (!match) throw new Error(`Missing ${key}`);
    return match[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  let id: string | undefined;
  try {
    const reference = await db.from("expenses").select("empresa_id,tenant_id,plano_contas_id").is("deleted_at", null).limit(1).single();
    if (reference.error) throw reference.error;
    const expense = await db.from("expenses").insert({ ...reference.data, descricao: "TESTE TEMPORÁRIO — auditoria principal", valor_total: 200,
      data_emissao: "2026-10-01", data_vencimento: "2026-10-01", tipo_despesa: "outros", centro_custo: "administrativo", created_by: session.user.id,
    }).select("id").single();
    if (expense.error) throw expense.error;
    id = expense.data.id;
    const parts = await db.from("expense_installments").insert([1, 2].map(n => ({ expense_id: id, tenant_id: reference.data.tenant_id,
      numero_parcela: n, total_parcelas: 2, valor: 100, data_vencimento: "2026-10-01", status: "pendente",
    }))).select("id,numero_parcela").order("numero_parcela");
    if (parts.error) throw parts.error;
    const first = parts.data[0];
    if (!first) throw new Error("Missing installment");
    const payment = await db.from("expense_payments").insert({ expense_id: id, tenant_id: reference.data.tenant_id, valor: 60, juros: 10,
      forma_pagamento: "pix", data_pagamento: "2026-10-02T12:00:00-03:00", created_by: session.user.id, skip_cashflow: true,
    }).select("id").single();
    if (payment.error) throw payment.error;
    const partial = await db.from("expenses").select("status,valor_pago").eq("id", id).single();
    expect(partial.data).toEqual({ status: "parcial", valor_pago: 50 });
    const update = await db.from("expense_payments").update({ valor: 180, juros: 10, desconto: 30 }).eq("id", payment.data.id);
    if (update.error) throw update.error;
    const settled = await db.from("expenses").select("status,valor_pago").eq("id", id).single();
    expect(settled.data).toEqual({ status: "pago", valor_pago: 200 });
    const settledParts = await db.from("expense_installments").select("status").eq("expense_id", id);
    expect(settledParts.data?.map(p => p.status)).toEqual(["pago", "pago"]);
    const removed = await db.from("expense_payments").delete().eq("id", payment.data.id);
    if (removed.error) throw removed.error;
    const reversed = await db.from("expenses").select("status,valor_pago").eq("id", id).single();
    expect(reversed.data).toEqual({ status: "atrasado", valor_pago: 0 });
  } finally {
    if (id) {
      for (const table of ["expense_payments", "expense_installments"] as const) {
        const result = await db.from(table).delete().eq("expense_id", id);
        if (result.error) throw result.error;
      }
      const result = await db.from("expenses").delete().eq("id", id);
      if (result.error) throw result.error;
    }
  }
}, 60000);