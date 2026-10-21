import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.OPERATOR_TEST_SESSION_FILE)("operator saves, reads, edits, groups and removes its own temporary expenses", async () => {
  const path = process.env.OPERATOR_TEST_SESSION_FILE;
  if (!path) throw new Error("Operator session required");
  const minted = JSON.parse(readFileSync(path, "utf8"));
  const env = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (name: string) => {
    const found = env.match(new RegExp(`^${name}=["']?([^"'\\r\\n]+)`, "m"));
    if (!found) throw new Error(`Missing ${name}`);
    return found[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${minted.session.access_token}` } },
  });
  const role = await db.rpc("has_role", { _user_id: minted.session.user.id, _role: "operador" });
  expect(role.data).toBe(true);
  const establishment = await db.from("fiscal_establishments").select("id").eq("type", "matriz").limit(1).single();
  if (establishment.error) throw establishment.error;
  const ids: string[] = [];
  try {
    const result = await db.from("expenses").insert([1, 2].map(n => ({
      descricao: `TESTE TEMPORÁRIO ACESSO OPERADOR ${n}`, valor_total: n,
      empresa_id: establishment.data.id,
      tipo_despesa: "outros", centro_custo: "administrativo",
      data_emissao: "2026-10-21", data_vencimento: "2026-10-21", created_by: minted.session.user.id,
    }))).select("id");
    if (result.error) throw result.error;
    ids.push(...result.data.map(row => row.id));
    expect(ids).toHaveLength(2);
    const edited = await db.from("expenses").update({ valor_total: 3 }).eq("id", ids[0]).select("valor_total").single();
    if (edited.error) throw edited.error;
    expect(edited.data.valor_total).toBe(3);
    const grouped = await db.from("expense_group_items").insert({ grupo_expense_id: ids[0], original_expense_id: ids[1], valor: 2 }).select("valor").single();
    if (grouped.error) throw grouped.error;
    expect(grouped.data.valor).toBe(2);
    const denied = await db.rpc("next_cte_number", { _establishment_id: "00000000-0000-0000-0000-000000000000" });
    expect(denied.error?.message).toContain("Agência não encontrada ou sem acesso");
    const fiscal = await db.functions.invoke("focus-nfe", { body: { action: "emitir_cte_salvo", cte_id: "00000000-0000-0000-0000-000000000000" } });
    expect(fiscal.error?.context?.status).toBe(404);
    const response = await fiscal.error?.context?.json();
    expect(response?.error).toBe("CT-e não encontrado");
  } finally {
    if (ids.length) {
      const links = await db.from("expense_group_items").delete().in("grupo_expense_id", ids);
      if (links.error) throw links.error;
      const removed = await db.from("expenses").delete().in("id", ids).select("id");
      if (removed.error) throw removed.error;
      expect(removed.data).toHaveLength(ids.length);
    }
  }
}, 30000);