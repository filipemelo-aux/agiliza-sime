import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  securityMiddleware,
  secureJson,
  secureError,
  getResponseHeaders,
  corsHeaders,
  sanitizePayload,
  validatePayload,
  logSecurityEvent,
  getClientIp,
  VALIDATION_SCHEMAS,
} from "../_shared/security.ts";

// ─── Auth middleware (JWT + admin role) ───────────────────────
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

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

async function enqueueJob(client: any, params: {
  job_type: string;
  entity_id: string;
  establishment_id: string;
  payload: Record<string, unknown>;
  created_by: string;
}) {
  const { data, error } = await client
    .from("fiscal_queue")
    .insert({
      job_type: params.job_type,
      entity_id: params.entity_id,
      establishment_id: params.establishment_id,
      payload: params.payload,
      created_by: params.created_by,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Erro ao criar job na fila: ${error.message}`);
  return data.id;
}

async function triggerWorker() {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fiscal-queue-worker`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ trigger: "fiscal-service" }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

async function callSefazProxyDirect(params: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sefaz-proxy`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(params),
  });
  return await res.json();
}

// ─── Route Handlers ──────────────────────────────────────────

async function handleCteEmit(body: any, userId: string, client: any) {
  const validation = validatePayload(body, VALIDATION_SCHEMAS.cte_emit);
  if (!validation.valid) return secureError(validation.errors.join("; "), 422);

  const { cte_id, sync } = body;
  const cte = await fetchCte(client, cte_id);
  if (cte.status !== "rascunho" && cte.status !== "rejeitado") return secureError(`CT-e não pode ser transmitido (status: ${cte.status})`);
  if (!cte.establishment_id) return secureError("CT-e sem estabelecimento vinculado.");

  const establishment = await fetchEstablishment(client, cte.establishment_id);

  // Use número já gerado pelo frontend (prepararCteParaTransmissao), ou gerar novo
  let numero = cte.numero;
  if (!numero) {
    const { data: newNum, error: numErr } = await client.rpc("next_cte_number", {
      _establishment_id: cte.establishment_id,
    });
    if (numErr) return secureError(`Erro ao gerar número: ${numErr.message}`);
    numero = newNum;
  }

  // Verificar se o XML foi montado pelo frontend
  if (!cte.xml_enviado || cte.xml_enviado === "<placeholder/>") {
    return secureError("XML do CT-e não foi gerado. Tente novamente.");
  }

  // ── Synchronous mode: call sefaz-proxy directly ──────────
  if (sync) {
    await client.from("ctes").update({
      status: "processando",
    }).eq("id", cte_id);

    try {
      const startTime = Date.now();
      const sefazResult = await callSefazProxyDirect({
        action: "autorizar_cte",
        signed_xml: cte.xml_enviado,
        establishment_id: cte.establishment_id,
        document_id: cte_id,
      });
      const responseTimeMs = Date.now() - startTime;

      if (sefazResult.success && sefazResult.status === "autorizado") {
        await client.from("ctes").update({
          status: "autorizado",
          chave_acesso: sefazResult.chave_acesso,
          protocolo_autorizacao: sefazResult.protocolo,
          data_autorizacao: sefazResult.data_autorizacao,
          xml_autorizado: sefazResult.xml_autorizado,
        }).eq("id", cte_id);

        await logFiscal(client, {
          user_id: userId,
          entity_type: "cte",
          entity_id: cte_id,
          action: "autorizado",
          establishment_id: cte.establishment_id,
          cnpj_emissor: establishment.cnpj,
          sefaz_code: sefazResult.cStat || "100",
          sefaz_message: sefazResult.xMotivo || "Autorizado",
          response_time_ms: responseTimeMs,
          ambiente: sefazResult.ambiente,
          details: { numero, chave_acesso: sefazResult.chave_acesso, protocolo: sefazResult.protocolo, sync: true },
        });

        return secureJson({
          success: true,
          sync: true,
          numero,
          status: "autorizado",
          chave_acesso: sefazResult.chave_acesso,
          protocolo: sefazResult.protocolo,
          data_autorizacao: sefazResult.data_autorizacao,
          establishment_id: cte.establishment_id,
        });
      } else {
        const motivo = sefazResult.motivo_rejeicao || sefazResult.error || "Rejeitado pela SEFAZ";
        await client.from("ctes").update({
          status: "rejeitado",
          motivo_rejeicao: motivo,
        }).eq("id", cte_id);

        await logFiscal(client, {
          user_id: userId,
          entity_type: "cte",
          entity_id: cte_id,
          action: "rejeitado",
          establishment_id: cte.establishment_id,
          cnpj_emissor: establishment.cnpj,
          sefaz_code: sefazResult.cStat || "999",
          sefaz_message: motivo,
          response_time_ms: responseTimeMs,
          ambiente: sefazResult.ambiente,
          details: { numero, motivo, sync: true },
        });

        return secureJson({
          success: false,
          sync: true,
          numero,
          status: "rejeitado",
          motivo_rejeicao: motivo,
          cStat: sefazResult.cStat,
          establishment_id: cte.establishment_id,
        });
      }
    } catch (syncErr: any) {
      // On sync error, revert to rascunho so user can retry
      await client.from("ctes").update({ status: "rascunho" }).eq("id", cte_id);
      return secureError(`Erro na comunicação: ${syncErr.message}`, 502);
    }
  }

  // ── Async mode (queue) — original behavior ───────────────
  await client.from("ctes").update({
    status: "processando",
  }).eq("id", cte_id);

  const jobId = await enqueueJob(client, {
    job_type: "cte_emit",
    entity_id: cte_id,
    establishment_id: cte.establishment_id,
    payload: { numero },
    created_by: userId,
  });

  await logFiscal(client, {
    user_id: userId,
    entity_type: "cte",
    entity_id: cte_id,
    action: "emissao_enfileirada",
    establishment_id: cte.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { numero, queue_job_id: jobId },
  });

  triggerWorker();

  return secureJson({ success: true, sync: false, numero, queue_job_id: jobId, establishment_id: cte.establishment_id });
}

async function handleCteCancel(body: any, userId: string, client: any) {
  const validation = validatePayload(body, VALIDATION_SCHEMAS.cte_cancel);
  if (!validation.valid) return secureError(validation.errors.join("; "), 422);

  const { cte_id, justificativa, sync } = body;
  const cte = await fetchCte(client, cte_id);
  if (cte.status !== "autorizado") return secureError("Só é possível cancelar CT-e autorizado.");

  const establishment = cte.establishment_id
    ? await fetchEstablishment(client, cte.establishment_id).catch(() => null)
    : null;

  // ── Synchronous mode ─────────────────────────────────────
  if (sync) {
    await client.from("ctes").update({ status: "processando" }).eq("id", cte_id);

    try {
      const sefazResult = await callSefazProxyDirect({
        action: "cancelar_cte",
        chave_acesso: cte.chave_acesso,
        protocolo: cte.protocolo_autorizacao,
        justificativa,
        establishment_id: cte.establishment_id,
        document_id: cte_id,
      });

      if (sefazResult.success) {
        await client.from("ctes").update({ status: "cancelado" }).eq("id", cte_id);
        await logFiscal(client, {
          user_id: userId, entity_type: "cte", entity_id: cte_id,
          action: "cancelado", establishment_id: cte.establishment_id,
          cnpj_emissor: establishment?.cnpj,
          details: { chave_acesso: cte.chave_acesso, justificativa, sync: true },
        });
        return secureJson({ success: true, sync: true, status: "cancelado" });
      } else {
        await client.from("ctes").update({ status: "autorizado" }).eq("id", cte_id);
        const motivo = sefazResult.motivo_rejeicao || sefazResult.error || "Erro no cancelamento";
        return secureJson({ success: false, sync: true, motivo_rejeicao: motivo, cStat: sefazResult.cStat });
      }
    } catch (syncErr: any) {
      await client.from("ctes").update({ status: "autorizado" }).eq("id", cte_id);
      return secureError(`Erro na comunicação: ${syncErr.message}`, 502);
    }
  }

  // ── Async mode ───────────────────────────────────────────
  await client.from("ctes").update({ status: "processando" }).eq("id", cte_id);

  const jobId = await enqueueJob(client, {
    job_type: "cte_cancel",
    entity_id: cte_id,
    establishment_id: cte.establishment_id || "",
    payload: { justificativa },
    created_by: userId,
  });

  await logFiscal(client, {
    user_id: userId,
    entity_type: "cte",
    entity_id: cte_id,
    action: "cancelamento_enfileirado",
    establishment_id: cte.establishment_id,
    cnpj_emissor: establishment?.cnpj || null,
    details: { justificativa, queue_job_id: jobId },
  });

  triggerWorker();

  return secureJson({ success: true, sync: false, queue_job_id: jobId });
}

async function handleCteStatus(cteId: string, client: any) {
  const cte = await fetchCte(client, cteId);

  const { data: latestJob } = await client
    .from("fiscal_queue")
    .select("id, status, attempts, max_attempts, error_message, created_at, completed_at")
    .eq("entity_id", cteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return secureJson({
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
    queue_job: latestJob || null,
  });
}

async function handleMdfeEmit(body: any, userId: string, client: any) {
  const validation = validatePayload(body, VALIDATION_SCHEMAS.mdfe_emit);
  if (!validation.valid) return secureError(validation.errors.join("; "), 422);

  const { mdfe_id } = body;
  const mdfe = await fetchMdfe(client, mdfe_id);
  if (mdfe.status !== "rascunho") return secureError(`MDF-e não está em rascunho (status: ${mdfe.status})`);
  if (!mdfe.establishment_id) return secureError("MDF-e sem estabelecimento vinculado.");

  const establishment = await fetchEstablishment(client, mdfe.establishment_id);

  const { data: numero, error: numErr } = await client.rpc("next_mdfe_number", {
    _establishment_id: mdfe.establishment_id,
  });
  if (numErr) return secureError(`Erro ao gerar número: ${numErr.message}`);

  await client.from("mdfe").update({
    numero,
    data_emissao: new Date().toISOString(),
    status: "processando",
  }).eq("id", mdfe_id);

  const jobId = await enqueueJob(client, {
    job_type: "mdfe_emit",
    entity_id: mdfe_id,
    establishment_id: mdfe.establishment_id,
    payload: { numero },
    created_by: userId,
  });

  await logFiscal(client, {
    user_id: userId,
    entity_type: "mdfe",
    entity_id: mdfe_id,
    action: "emissao_enfileirada",
    establishment_id: mdfe.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { numero, queue_job_id: jobId },
  });

  triggerWorker();

  return secureJson({ success: true, numero, queue_job_id: jobId, establishment_id: mdfe.establishment_id });
}

async function handleMdfeEncerrar(body: any, userId: string, client: any) {
  const validation = validatePayload(body, VALIDATION_SCHEMAS.mdfe_encerrar);
  if (!validation.valid) return secureError(validation.errors.join("; "), 422);

  const { mdfe_id } = body;
  const mdfe = await fetchMdfe(client, mdfe_id);
  if (mdfe.status !== "autorizado") return secureError("Só é possível encerrar MDF-e autorizado.");

  await client.from("mdfe").update({ status: "processando" }).eq("id", mdfe_id);

  const jobId = await enqueueJob(client, {
    job_type: "mdfe_encerrar",
    entity_id: mdfe_id,
    establishment_id: mdfe.establishment_id || "",
    payload: {},
    created_by: userId,
  });

  const establishment = mdfe.establishment_id
    ? await fetchEstablishment(client, mdfe.establishment_id).catch(() => null)
    : null;

  await logFiscal(client, {
    user_id: userId,
    entity_type: "mdfe",
    entity_id: mdfe_id,
    action: "encerramento_enfileirado",
    establishment_id: mdfe.establishment_id,
    cnpj_emissor: establishment?.cnpj || null,
    details: { queue_job_id: jobId },
  });

  triggerWorker();

  return secureJson({ success: true, queue_job_id: jobId });
}

async function handleQueueStatus(jobId: string, client: any) {
  const { data, error } = await client
    .from("fiscal_queue")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error) return secureError("Job não encontrado", 404);

  return secureJson({
    id: data.id,
    job_type: data.job_type,
    entity_id: data.entity_id,
    status: data.status,
    attempts: data.attempts,
    max_attempts: data.max_attempts,
    error_message: data.error_message,
    result: data.result,
    created_at: data.created_at,
    started_at: data.started_at,
    completed_at: data.completed_at,
  });
}

// ─── Router ──────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = getClientIp(req);

  try {
    // Security middleware: rate limiting + payload size check
    const security = await securityMiddleware(req, "fiscal-service", {
      maxBodySize: 512_000, // 512KB max for fiscal service
    });

    if (!security.ok) return security.response!;

    const { userId, serviceClient } = await authenticate(req);

    // Extract path from body._path
    let path = "/";
    let body: any = security.body || {};

    if (req.method === "POST") {
      path = body._path || "/";
      delete body._path;
      // Sanitize the body
      body = sanitizePayload(body);
    } else {
      const url = new URL(req.url);
      path = url.pathname.replace(/^\/fiscal-service\/?/, "/");
    }

    // Route matching
    if (path === "/cte/emit") return await handleCteEmit(body, userId, serviceClient);
    if (path === "/cte/cancel") return await handleCteCancel(body, userId, serviceClient);
    if (path.startsWith("/cte/status/")) {
      const id = path.replace("/cte/status/", "");
      return await handleCteStatus(id, serviceClient);
    }
    if (path === "/mdfe/emit") return await handleMdfeEmit(body, userId, serviceClient);
    if (path === "/mdfe/encerrar") return await handleMdfeEncerrar(body, userId, serviceClient);
    if (path.startsWith("/queue/status/")) {
      const jobId = path.replace("/queue/status/", "");
      return await handleQueueStatus(jobId, serviceClient);
    }

    return secureError("Rota não encontrada", 404);
  } catch (e: any) {
    const msg = e.message || "Erro interno";
    if (msg === "MISSING_TOKEN" || msg === "INVALID_TOKEN") {
      return secureError("Não autorizado", 401);
    }
    if (msg === "FORBIDDEN") {
      return secureError("Acesso negado", 403);
    }
    return secureError(msg, 500);
  }
});
