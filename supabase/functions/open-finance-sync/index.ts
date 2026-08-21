import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface NormalizedTx {
  externalId: string;
  data: string; // yyyy-MM-dd
  descricao: string;
  valor: number; // sempre positivo
  tipo: "entrada" | "saida";
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function toISODate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function toNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return Number(s);
}

/** Localiza o array de transações em qualquer formato de envelope JSON. */
function findTransactionArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const preferred = ["transactions", "transacoes", "movimentacoes", "movements", "data", "items", "results", "lancamentos"];
  for (const key of preferred) {
    const v = obj[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    if (v && typeof v === "object") {
      const nested = findTransactionArray(v);
      if (nested.length) return nested;
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v as Record<string, unknown>[];
  }
  return [];
}

/** Adaptador: JSON bruto da API -> tipagem padrão de conciliação. */
export function adaptTransactions(payload: unknown): NormalizedTx[] {
  const rows = findTransactionArray(payload);
  const out: NormalizedTx[] = [];
  rows.forEach((row, idx) => {
    if (!row || typeof row !== "object") return;
    const externalIdRaw = pick(row, ["id", "transactionId", "transaction_id", "externalId", "external_id", "fitid", "FITID", "uuid", "identificador"]);
    const dateRaw = pick(row, ["date", "data", "postedAt", "posted_at", "transactionDate", "transaction_date", "dtPosted", "dataMovimentacao", "data_movimentacao"]);
    const descRaw = pick(row, ["description", "descricao", "memo", "name", "historico", "detalhe", "merchant"]);
    const amountRaw = pick(row, ["amount", "valor", "value", "montante", "trnamt"]);

    const data = toISODate(dateRaw);
    const amount = toNumber(amountRaw);
    if (!data || !Number.isFinite(amount)) return;

    const typeHint = String(pick(row, ["type", "tipo", "direction", "creditDebitType", "natureza"]) ?? "").toLowerCase();
    let tipo: "entrada" | "saida";
    if (typeHint.includes("cred") || typeHint === "entrada" || typeHint === "in" || typeHint === "inflow") tipo = "entrada";
    else if (typeHint.includes("deb") || typeHint === "saida" || typeHint === "saída" || typeHint === "out" || typeHint === "outflow") tipo = "saida";
    else tipo = amount >= 0 ? "entrada" : "saida";

    out.push({
      externalId: String(externalIdRaw ?? `${data}-${Math.round(Math.abs(amount) * 100)}-${idx}`),
      data,
      descricao: String(descRaw ?? "Lançamento Open Finance").trim(),
      valor: Math.abs(amount),
      tipo,
    });
  });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Não autenticado" }, 401);

    const apiUrl = Deno.env.get("OPEN_FINANCE_API_URL");
    if (!apiUrl) return json({ error: "Integração Open Finance não configurada" }, 500);

    const upstream = await fetch(apiUrl, { method: "GET", headers: { Accept: "application/json" } });
    const text = await upstream.text();
    if (!upstream.ok) {
      return json({ error: `Falha na API Open Finance (${upstream.status})`, detail: text.slice(0, 300) }, 502);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return json({ error: "Resposta da API Open Finance não é um JSON válido", detail: text.slice(0, 300) }, 502);
    }

    const transactions = adaptTransactions(payload);

    // Deduplicação: ignora tudo que já foi gravado em conciliações anteriores
    const admin = createClient(supabaseUrl, serviceKey);
    const ids = transactions.map((t) => t.externalId);
    const known = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (!chunk.length) continue;
      const { data } = await admin.from("bank_reconciliation_items").select("fitid").in("fitid", chunk);
      (data ?? []).forEach((r: { fitid: string | null }) => r.fitid && known.add(r.fitid));
    }

    const novos = transactions.filter((t) => !known.has(t.externalId));

    return json({
      fetchedAt: new Date().toISOString(),
      total: transactions.length,
      duplicados: transactions.length - novos.length,
      novos: novos.length,
      transactions: novos,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});
