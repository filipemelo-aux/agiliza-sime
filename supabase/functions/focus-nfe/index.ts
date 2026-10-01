import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

// Focus NFe connector (homologação by default). Admin/moderator only.
const BASES = {
  homologacao: "https://homologacao.focusnfe.com.br",
  producao: "https://api.focusnfe.com.br",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Não autenticado" }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: authErr } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
  if (authErr || !claims?.claims?.sub) return json({ error: "Não autenticado" }, 401);
  const uid = claims.claims.sub;
  const [{ data: isAdmin }, { data: isMod }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: uid, _role: "moderator" }),
  ]);
  if (!isAdmin && !isMod) return json({ error: "Sem permissão" }, 403);

  let body: { action?: string; cnpj?: string; versao?: number; ref?: string; cte?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = body.action ?? "ping";
  const cnpj = (body.cnpj ?? "").replace(/\D/g, "");
  if (cnpj && cnpj.length !== 14) return json({ error: "CNPJ inválido" }, 400);

  // Consultas de documentos recebidos usam produção (somente leitura). Emissão segue em homologação.
  const isQuery = action === "ping" || action === "nfes_recebidas" || action === "ctes_recebidas" || action === "nfe_por_chave";
  const ambiente = isQuery && Deno.env.get("FOCUS_NFE_TOKEN_PRODUCAO") ? "producao" : "homologacao";
  const token = Deno.env.get(ambiente === "producao" ? "FOCUS_NFE_TOKEN_PRODUCAO" : "FOCUS_NFE_TOKEN_HOMOLOGACAO");
  if (!token) return json({ error: "Token Focus NFe não configurado" }, 500);
  const base = BASES[ambiente];

  let path: string;
  let method = "GET";
  let payload: string | undefined;
  const ref = (body.ref ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  switch (action) {
    case "ping":
    case "nfes_recebidas":
      if (!cnpj) return json({ error: "Informe o CNPJ" }, 400);
      path = `/v2/nfes_recebidas?cnpj=${cnpj}${body.versao ? `&versao=${Number(body.versao)}` : ""}`;
      break;
    case "ctes_recebidas":
      if (!cnpj) return json({ error: "Informe o CNPJ" }, 400);
      path = `/v2/ctes_recebidas?cnpj=${cnpj}${body.versao ? `&versao=${Number(body.versao)}` : ""}`;
      break;
    case "nfe_por_chave": {
      const chave = String((body as any).chave ?? "").replace(/\D/g, "");
      if (chave.length !== 44) return json({ error: "Chave de NF-e inválida" }, 400);
      path = `/v2/nfes_recebidas/${chave}.xml`;
      break;
    }
    case "emitir_cte":
      if (!ref || !body.cte) return json({ error: "Informe ref e cte" }, 400);
      path = `/v2/cte?ref=${ref}`; method = "POST"; payload = JSON.stringify(body.cte);
      break;
    case "consultar_cte":
      if (!ref) return json({ error: "Informe ref" }, 400);
      path = `/v2/cte/${ref}?completa=1`;
      break;
    default:
      return json({ error: "Ação inválida" }, 400);
  }

  const res = await fetch(base + path, {
    method, body: payload,
    headers: { Authorization: "Basic " + btoa(token + ":"), "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return json({
    ok: res.ok,
    status: res.status,
    ambiente,
    total: res.headers.get("X-Total-Count"),
    max_version: res.headers.get("X-Max-Version"),
    data,
  }, 200);
});
