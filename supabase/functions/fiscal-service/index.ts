import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

// ─── Auth middleware (JWT only, no client-side API key) ───────
async function authenticate(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("MISSING_TOKEN");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Error("INVALID_TOKEN");
  }

  const userId = data.claims.sub as string;

  // Validate internal API key (server-side only secret)
  const expectedKey = Deno.env.get("FISCAL_SERVICE_API_KEY");
  if (!expectedKey) {
    console.error("[fiscal-service] FISCAL_SERVICE_API_KEY not configured");
    throw new Error("SERVER_CONFIG_ERROR");
  }

  // Service role client for DB operations
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Check admin role
  const { data: roleData } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!roleData) {
    throw new Error("FORBIDDEN");
  }

  return { userId, serviceClient };
}

// ─── Helpers ──────────────────────────────────────────────────
async function fetchEstablishment(client: any, id: string) {
  const { data, error } = await client
    .from("fiscal_establishments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Estabelecimento não encontrado: ${error.message}`);
  if (!data.active) throw new Error("Estabelecimento inativo.");
  return data;
}

async function fetchCte(client: any, id: string) {
  const { data, error } = await client.from("ctes").select("*").eq("id", id).single();
  if (error) throw new Error(`CT-e não encontrado: ${error.message}`);
  return data;
}

async function fetchMdfe(client: any, id: string) {
  const { data, error } = await client.from("mdfe").select("*").eq("id", id).single();
  if (error) throw new Error(`MDF-e não encontrado: ${error.message}`);
  return data;
}

async function logFiscal(client: any, params: Record<string, unknown>) {
  await client.from("fiscal_logs").insert(params);
}

// ─── Route: POST /cte/emit ───────────────────────────────────
async function handleCteEmit(body: any, userId: string, client: any) {
  const { cte_id } = body;
  if (!cte_id) return err("cte_id obrigatório");

  const cte = await fetchCte(client, cte_id);
  if (cte.status !== "rascunho") return err(`CT-e não está em rascunho (status: ${cte.status})`);
  if (!cte.establishment_id) return err("CT-e sem estabelecimento vinculado.");

  const establishment = await fetchEstablishment(client, cte.establishment_id);

  const { data: numero, error: numErr } = await client.rpc("next_cte_number", {
    _establishment_id: cte.establishment_id,
  });
  if (numErr) return err(`Erro ao gerar número: ${numErr.message}`);

  const updateData: Record<string, unknown> = {
    numero,
    data_emissao: new Date().toISOString(),
    status: "processando",
  };

  await client.from("ctes").update(updateData).eq("id", cte_id);

  await logFiscal(client, {
    user_id: userId,
    entity_type: "cte",
    entity_id: cte_id,
    action: "emissao_solicitada",
    establishment_id: cte.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { numero },
  });

  return json({ success: true, numero, establishment_id: cte.establishment_id });
}

// ─── Route: POST /cte/cancel ─────────────────────────────────
async function handleCteCancel(body: any, userId: string, client: any) {
  const { cte_id, justificativa } = body;
  if (!cte_id || !justificativa) return err("cte_id e justificativa obrigatórios");
  if (justificativa.length < 15) return err("Justificativa deve ter no mínimo 15 caracteres");

  const cte = await fetchCte(client, cte_id);
  if (cte.status !== "autorizado") return err("Só é possível cancelar CT-e autorizado.");

  await client.from("ctes").update({ status: "cancelado" }).eq("id", cte_id);

  const establishment = cte.establishment_id
    ? await fetchEstablishment(client, cte.establishment_id).catch(() => null)
    : null;

  await logFiscal(client, {
    user_id: userId,
    entity_type: "cte",
    entity_id: cte_id,
    action: "cancelado",
    establishment_id: cte.establishment_id,
    cnpj_emissor: establishment?.cnpj || null,
    details: { chave_acesso: cte.chave_acesso, justificativa },
  });

  return json({ success: true });
}

// ─── Route: GET /cte/status/:id ──────────────────────────────
async function handleCteStatus(cteId: string, client: any) {
  const cte = await fetchCte(client, cteId);
  return json({
    id: cte.id,
    numero: cte.numero,
    serie: cte.serie,
    status: cte.status,
    chave_acesso: cte.chave_acesso,
    protocolo_autorizacao: cte.protocolo_autorizacao,
    data_emissao: cte.data_emissao,
    data_autorizacao: cte.data_autorizacao,
    motivo_rejeicao: cte.motivo_rejeicao,
    establishment_id: cte.establishment_id,
  });
}

// ─── Route: POST /mdfe/emit ──────────────────────────────────
async function handleMdfeEmit(body: any, userId: string, client: any) {
  const { mdfe_id } = body;
  if (!mdfe_id) return err("mdfe_id obrigatório");

  const mdfe = await fetchMdfe(client, mdfe_id);
  if (mdfe.status !== "rascunho") return err(`MDF-e não está em rascunho (status: ${mdfe.status})`);
  if (!mdfe.establishment_id) return err("MDF-e sem estabelecimento vinculado.");

  const establishment = await fetchEstablishment(client, mdfe.establishment_id);

  const { data: numero, error: numErr } = await client.rpc("next_mdfe_number", {
    _establishment_id: mdfe.establishment_id,
  });
  if (numErr) return err(`Erro ao gerar número: ${numErr.message}`);

  await client.from("mdfe").update({
    numero,
    data_emissao: new Date().toISOString(),
    status: "processando",
  }).eq("id", mdfe_id);

  await logFiscal(client, {
    user_id: userId,
    entity_type: "mdfe",
    entity_id: mdfe_id,
    action: "emissao_solicitada",
    establishment_id: mdfe.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { numero },
  });

  return json({ success: true, numero, establishment_id: mdfe.establishment_id });
}

// ─── Route: POST /mdfe/encerrar ──────────────────────────────
async function handleMdfeEncerrar(body: any, userId: string, client: any) {
  const { mdfe_id } = body;
  if (!mdfe_id) return err("mdfe_id obrigatório");

  const mdfe = await fetchMdfe(client, mdfe_id);
  if (mdfe.status !== "autorizado") return err("Só é possível encerrar MDF-e autorizado.");

  await client.from("mdfe").update({
    status: "encerrado",
    data_encerramento: new Date().toISOString(),
  }).eq("id", mdfe_id);

  const establishment = mdfe.establishment_id
    ? await fetchEstablishment(client, mdfe.establishment_id).catch(() => null)
    : null;

  await logFiscal(client, {
    user_id: userId,
    entity_type: "mdfe",
    entity_id: mdfe_id,
    action: "encerrado",
    establishment_id: mdfe.establishment_id,
    cnpj_emissor: establishment?.cnpj || null,
    details: { chave_acesso: mdfe.chave_acesso },
  });

  return json({ success: true });
}

// ─── Router ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth (JWT + admin role only, no client-side API key)
    const { userId, serviceClient } = await authenticate(req);

    // Extract path from body._path (since supabase.functions.invoke sends body)
    let path = "/";
    let body: any = {};

    if (req.method === "POST") {
      body = await req.json();
      path = body._path || "/";
      delete body._path;
    } else {
      const url = new URL(req.url);
      path = url.pathname.replace(/^\/fiscal-service\/?/, "/");
    }

    // Route matching
    if (path === "/cte/emit") {
      return await handleCteEmit(body, userId, serviceClient);
    }

    if (path === "/cte/cancel") {
      return await handleCteCancel(body, userId, serviceClient);
    }

    if (path.startsWith("/cte/status/")) {
      const id = path.replace("/cte/status/", "");
      return await handleCteStatus(id, serviceClient);
    }

    if (path === "/mdfe/emit") {
      return await handleMdfeEmit(body, userId, serviceClient);
    }

    if (path === "/mdfe/encerrar") {
      return await handleMdfeEncerrar(body, userId, serviceClient);
    }

    return err("Rota não encontrada", 404);
  } catch (e: any) {
    const msg = e.message || "Erro interno";
    if (msg === "MISSING_TOKEN" || msg === "INVALID_TOKEN") {
      return err("Não autorizado", 401);
    }
    if (msg === "FORBIDDEN") {
      return err("Acesso negado", 403);
    }
    if (msg === "SERVER_CONFIG_ERROR") {
      return err("Erro de configuração do servidor", 500);
    }
    return err(msg, 500);
  }
});
