import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON)("salva crédito mensal em dez parcelas sem duplicar na repetição e desfaz lote inválido", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "{}");
  const config = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (key: string) => {
    const match = config.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
    if (!match) throw new Error(`Missing ${key}`);
    return match[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } } });
  const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const employee = ok(await db.from("profiles").select("id").eq("is_colaborador_rh", true).eq("category", "colaborador").limit(1).single());
  const id = crypto.randomUUID(), rolledBack = crypto.randomUUID();
  const plan = { id, tipo: "credito_trabalhador", valor: 250, parcelas: 10, descricao: "TESTE TEMPORÁRIO — plano de crédito" };
  const args = { _colaborador_id: employee.id, _periodo_inicio: "2031-01-01", _periodo_fim: "2031-01-31", _planos: [plan] };
  try {
    const first = ok(await db.rpc("criar_planos_desconto_acerto", args));
    const retry = ok(await db.rpc("criar_planos_desconto_acerto", args));
    expect(first).toHaveLength(1);
    expect(retry?.[0]?.id).toBe(first?.[0]?.id);
    const rows = ok(await db.from("descontos_folha").select("valor,data_referencia,parcela_numero").eq("plano_desconto_id", id).order("parcela_numero"));
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => Number(r.valor))).toEqual(Array(10).fill(250));
    expect(rows[0].data_referencia).toBe("2031-01-01");
    expect(rows[9].data_referencia).toBe("2031-10-01");
    const invalid = await db.rpc("criar_planos_desconto_acerto", { ...args, _planos: [{ ...plan, id: rolledBack }, { ...plan, id: crypto.randomUUID(), valor: -1 }] });
    expect(invalid.error).not.toBeNull();
    expect(ok(await db.from("descontos_folha").select("id").eq("plano_desconto_id", rolledBack))).toHaveLength(0);
  } finally {
    ok(await db.from("descontos_folha").delete().in("plano_desconto_id", [id, rolledBack]));
  }
}, 60000);