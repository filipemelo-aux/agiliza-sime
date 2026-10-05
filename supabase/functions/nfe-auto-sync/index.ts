import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Sincronização automática de NF-e recebidas, chamada de hora em hora pelo agendador.
// Cada empresa só é consultada nos horários definidos pelo SuperAdmin (hora inicial + intervalo),
// e no máximo uma vez por janela — chamadas repetidas não geram novas consultas no Focus.
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const BASE = "https://api.focusnfe.com.br";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const hour = Number(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }));

  const { data: tenants, error } = await svc.from("tenants")
    .select("id, nfe_sync_start_hour, nfe_sync_interval_hours, nfe_last_auto_sync_at")
    .eq("nfe_sync_enabled", true).eq("status", "active");
  if (error) return json({ error: error.message }, 500);

  const report: Record<string, unknown>[] = [];
  for (const t of tenants || []) {
    const start = t.nfe_sync_start_hour ?? 8, every = Math.max(1, t.nfe_sync_interval_hours ?? 2);
    const due = hour >= start && (hour - start) % every === 0;
    const recent = t.nfe_last_auto_sync_at && now.getTime() - new Date(t.nfe_last_auto_sync_at).getTime() < 50 * 60_000;
    if (!due || recent) continue;
    await svc.from("tenants").update({ nfe_last_auto_sync_at: now.toISOString() }).eq("id", t.id);

    const { data: sec } = await svc.from("tenant_secrets").select("focus_nfe_token_production").eq("tenant_id", t.id).maybeSingle();
    const token = sec?.focus_nfe_token_production || Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO");
    if (!token) { report.push({ tenant: t.id, error: "sem token" }); continue; }
    const auth = { Authorization: "Basic " + btoa(token + ":") };

    const { data: ests } = await svc.from("fiscal_establishments").select("id, cnpj").eq("tenant_id", t.id).eq("active", true);
    const seen = new Set<string>();
    let novas = 0;
    for (const est of ests || []) {
      const cnpj = digits(est.cnpj);
      if (cnpj.length !== 14 || seen.has(cnpj)) continue;
      seen.add(cnpj);
      const { data: last } = await svc.from("nfes_recebidas").select("versao").eq("establishment_id", est.id)
        .order("versao", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      let versao: number | undefined = last?.versao ?? undefined;
      for (let page = 0; page < 30; page++) {
        const r = await fetch(`${BASE}/v2/nfes_recebidas?cnpj=${cnpj}${versao ? `&versao=${versao}` : ""}`, { headers: auth });
        if (!r.ok) { report.push({ tenant: t.id, cnpj, status: r.status }); break; }
        const items: any[] = await r.json().catch(() => []);
        if (!Array.isArray(items) || !items.length) break;
        const byKey = new Map<string, any>();
        for (const i of items) {
          const k = digits(i.chave_nfe);
          if (k.length !== 44) continue;
          const prev = byKey.get(k);
          if (!prev || Number(i.versao) > Number(prev.versao)) byKey.set(k, i);
        }
        const rows = [...byKey.entries()].map(([k, i]) => ({
          tenant_id: t.id, establishment_id: est.id, chave: k,
          data_emissao: i.data_emissao || null, emitente_nome: i.nome_emitente || null,
          emitente_cnpj: digits(i.documento_emitente) || null,
          destinatario_cnpj: digits(i.cnpj_destinatario || i.cpf_destinatario) || null,
          ator: digits(i.cnpj_destinatario) === cnpj ? "destinatario" : "transportadora",
          valor: Number(i.valor_total) || 0, situacao: String(i.situacao || "autorizada").toLowerCase(),
          numero: String(Number(k.slice(25, 34))), serie: String(Number(k.slice(22, 25))), versao: Number(i.versao) || null,
        }));
        if (rows.length) {
          const { error: upErr } = await svc.from("nfes_recebidas").upsert(rows, { onConflict: "tenant_id,chave" });
          if (upErr) { report.push({ tenant: t.id, error: upErr.message }); break; }
          novas += rows.length;
        }
        const maxV = Math.max(...items.map((i) => Number(i.versao) || 0));
        if (!maxV || maxV === versao || items.length < 50) break;
        versao = maxV;
      }
    }
    report.push({ tenant: t.id, novas });
  }
  return json({ ok: true, hour, report });
});
