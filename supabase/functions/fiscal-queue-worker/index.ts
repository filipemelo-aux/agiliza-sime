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

/**
 * fiscal-queue-worker
 *
 * Processes pending jobs from fiscal_queue table.
 * Called via pg_cron every minute or manually.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const BATCH_SIZE = 5;
  const results: any[] = [];

  try {
    // ── 1. Reset timed-out jobs ──────────────────────────────
    const { data: timedOut } = await client
      .from("fiscal_queue")
      .select("id, attempts, max_attempts, timeout_seconds")
      .eq("status", "processing")
      .lt("started_at", new Date(Date.now() - 120_000).toISOString());

    if (timedOut && timedOut.length > 0) {
      for (const job of timedOut) {
        const canRetry = job.attempts < job.max_attempts;
        await client
          .from("fiscal_queue")
          .update({
            status: canRetry ? "pending" : "timeout",
            error_message: "Timeout: processamento excedeu o tempo limite",
            next_retry_at: canRetry
              ? new Date(Date.now() + backoffMs(job.attempts)).toISOString()
              : null,
          })
          .eq("id", job.id);
      }
      console.log(`[Worker] Reset ${timedOut.length} timed-out jobs`);
    }

    // ── 2. Pick pending jobs ─────────────────────────────────
    const { data: jobs, error: fetchErr } = await client
      .from("fiscal_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error("[Worker] Fetch error:", fetchErr.message);
      return json({ success: false, error: fetchErr.message }, 500);
    }

    if (!jobs || jobs.length === 0) {
      return json({ success: true, processed: 0, message: "No pending jobs" });
    }

    console.log(`[Worker] Processing ${jobs.length} jobs`);

    // ── 3. Process each job ──────────────────────────────────
    for (const job of jobs) {
      const attempt = job.attempts + 1;

      // Mark as processing
      await client
        .from("fiscal_queue")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          attempts: attempt,
        })
        .eq("id", job.id);

      // Log: tentativa de envio
      await logStructured(client, {
        user_id: job.created_by,
        entity_type: job.job_type.startsWith("cte") ? "cte" : "mdfe",
        entity_id: job.entity_id,
        action: "envio_tentativa",
        establishment_id: job.establishment_id,
        queue_job_id: job.id,
        attempt,
        details: { job_type: job.job_type, payload: job.payload },
      });

      try {
        const result = await processJob(job, client, attempt);

        // Mark completed
        await client
          .from("fiscal_queue")
          .update({
            status: "completed",
            result,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id);

        // If this was a contingency job, mark for resend in normal mode
        if (job.contingency_mode && job.contingency_mode !== "normal" && !job.requires_resend) {
          await client
            .from("fiscal_queue")
            .update({ requires_resend: true })
            .eq("id", job.id);
        }

        results.push({ id: job.id, status: "completed" });
      } catch (err: any) {
        const isSefazDown = isSefazOfflineErr(err.message);
        const canRetry = attempt < job.max_attempts && isRetryableError(err.message);

        // Auto-detect SEFAZ offline → activate contingency
        if (isSefazDown && job.establishment_id) {
          await handleContingencyActivation(client, job, err.message);
          // Re-queue with contingency mode
          await client
            .from("fiscal_queue")
            .update({
              status: "pending",
              contingency_mode: await getEstablishmentContingency(client, job.establishment_id),
              next_retry_at: new Date(Date.now() + 5000).toISOString(),
              error_message: `SEFAZ offline detectado: ${err.message}`,
            })
            .eq("id", job.id);

          results.push({ id: job.id, status: "contingency_activated" });
          continue;
        }

        await client
          .from("fiscal_queue")
          .update({
            status: canRetry ? "pending" : "failed",
            error_message: err.message || "Erro desconhecido",
            next_retry_at: canRetry
              ? new Date(Date.now() + backoffMs(attempt)).toISOString()
              : null,
          })
          .eq("id", job.id);

        if (!canRetry) {
          await updateEntityStatus(client, job, "erro", err.message);
        }

        // Log: falha
        await logStructured(client, {
          user_id: job.created_by,
          entity_type: job.job_type.startsWith("cte") ? "cte" : "mdfe",
          entity_id: job.entity_id,
          action: canRetry ? "envio_retry" : "envio_falha",
          establishment_id: job.establishment_id,
          queue_job_id: job.id,
          attempt,
          details: { error: err.message, can_retry: canRetry },
        });

        results.push({ id: job.id, status: canRetry ? "retry" : "failed", error: err.message });
      }
    }

    // ── 4. Check for resendable jobs (contingency → normal) ────
    await processResendQueue(client);

    // ── 5. Check if contingency can be deactivated ───────────
    await checkContingencyRecovery(client);

    return json({ success: true, processed: results.length, results });
  } catch (e: any) {
    console.error("[Worker] Fatal error:", e.message);
    return json({ success: false, error: e.message }, 500);
  }
});

// ─── Job Processing ──────────────────────────────────────────

async function processJob(job: any, client: any, attempt: number) {
  const payload = job.payload || {};

  switch (job.job_type) {
    case "cte_emit":
      return await processCteEmit(job, client, attempt);
    case "cte_cancel":
      return await processCteCancel(job, payload, client, attempt);
    case "mdfe_emit":
      return await processMdfeEmit(job, client, attempt);
    case "mdfe_encerrar":
      return await processMdfeEncerrar(job, client, attempt);
    default:
      throw new Error(`Tipo de job desconhecido: ${job.job_type}`);
  }
}

async function processCteEmit(job: any, client: any, attempt: number) {
  const cte = await fetchEntity(client, "ctes", job.entity_id);
  const establishment = await fetchEstablishment(client, job.establishment_id);

  // Log: XML gerado
  await logStructured(client, {
    user_id: job.created_by,
    entity_type: "cte",
    entity_id: job.entity_id,
    action: "xml_gerado",
    establishment_id: job.establishment_id,
    cnpj_emissor: establishment.cnpj,
    queue_job_id: job.id,
    attempt,
    details: { has_xml: !!cte.xml_enviado, numero: job.payload?.numero },
  });

  const startTime = Date.now();
  const sefazResult = await callSefazProxy({
    action: "autorizar_cte",
    signed_xml: cte.xml_enviado || "<placeholder/>",
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  }, job.contingency_mode);
  const responseTimeMs = Date.now() - startTime;

  if (sefazResult.success && sefazResult.status === "autorizado") {
    await client.from("ctes").update({
      status: "autorizado",
      chave_acesso: sefazResult.chave_acesso,
      protocolo_autorizacao: sefazResult.protocolo,
      data_autorizacao: sefazResult.data_autorizacao,
      xml_autorizado: sefazResult.xml_autorizado,
    }).eq("id", job.entity_id);

    // Log: autorização
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "cte",
      entity_id: job.entity_id,
      action: "autorizado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "100",
      sefaz_message: sefazResult.xMotivo || "Autorizado o uso do CT-e",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment.endereco_uf,
      details: {
        chave_acesso: sefazResult.chave_acesso,
        protocolo: sefazResult.protocolo,
        tpAmb: sefazResult.tpAmb,
        cUF: sefazResult.cUF,
      },
    });
  } else {
    // Log: rejeição
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "cte",
      entity_id: job.entity_id,
      action: "rejeitado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "999",
      sefaz_message: sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment.endereco_uf,
      details: { motivo: sefazResult.motivo_rejeicao },
    });

    await client.from("ctes").update({
      status: "rejeitado",
      motivo_rejeicao: sefazResult.motivo_rejeicao || "Erro na autorização",
    }).eq("id", job.entity_id);
    throw new Error(sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ");
  }

  return sefazResult;
}

async function processCteCancel(job: any, payload: any, client: any, attempt: number) {
  const cte = await fetchEntity(client, "ctes", job.entity_id);
  const establishment = job.establishment_id
    ? await fetchEstablishment(client, job.establishment_id).catch(() => null)
    : null;

  const startTime = Date.now();
  const sefazResult = await callSefazProxy({
    action: "cancelar_cte",
    chave_acesso: cte.chave_acesso,
    protocolo: cte.protocolo_autorizacao,
    justificativa: payload.justificativa,
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  }, job.contingency_mode);
  const responseTimeMs = Date.now() - startTime;

  if (sefazResult.success) {
    await client.from("ctes").update({ status: "cancelado" }).eq("id", job.entity_id);

    // Log: cancelamento
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "cte",
      entity_id: job.entity_id,
      action: "cancelado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment?.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "135",
      sefaz_message: "Evento registrado e vinculado a CT-e",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment?.endereco_uf,
      details: { chave_acesso: cte.chave_acesso, justificativa: payload.justificativa, protocolo: sefazResult.protocolo },
    });
  } else {
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "cte",
      entity_id: job.entity_id,
      action: "cancelamento_rejeitado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment?.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "999",
      sefaz_message: sefazResult.error || "Erro no cancelamento",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment?.endereco_uf,
    });
    throw new Error(sefazResult.error || "Erro no cancelamento");
  }

  return sefazResult;
}

async function processMdfeEmit(job: any, client: any, attempt: number) {
  const mdfe = await fetchEntity(client, "mdfe", job.entity_id);
  const establishment = await fetchEstablishment(client, job.establishment_id);

  await logStructured(client, {
    user_id: job.created_by,
    entity_type: "mdfe",
    entity_id: job.entity_id,
    action: "xml_gerado",
    establishment_id: job.establishment_id,
    cnpj_emissor: establishment.cnpj,
    queue_job_id: job.id,
    attempt,
    details: { has_xml: !!mdfe.xml_enviado, numero: job.payload?.numero },
  });

  const startTime = Date.now();
  const sefazResult = await callSefazProxy({
    action: "autorizar_mdfe",
    signed_xml: mdfe.xml_enviado || "<placeholder/>",
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  }, job.contingency_mode);
  const responseTimeMs = Date.now() - startTime;

  if (sefazResult.success && sefazResult.status === "autorizado") {
    await client.from("mdfe").update({
      status: "autorizado",
      chave_acesso: sefazResult.chave_acesso,
      protocolo_autorizacao: sefazResult.protocolo,
      data_autorizacao: sefazResult.data_autorizacao,
      xml_autorizado: sefazResult.xml_autorizado,
    }).eq("id", job.entity_id);

    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "mdfe",
      entity_id: job.entity_id,
      action: "autorizado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "100",
      sefaz_message: sefazResult.xMotivo || "Autorizado o uso do MDF-e",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment.endereco_uf,
      details: { chave_acesso: sefazResult.chave_acesso, protocolo: sefazResult.protocolo },
    });
  } else {
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "mdfe",
      entity_id: job.entity_id,
      action: "rejeitado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "999",
      sefaz_message: sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment.endereco_uf,
    });

    await client.from("mdfe").update({ status: "rejeitado" }).eq("id", job.entity_id);
    throw new Error(sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ");
  }

  return sefazResult;
}

async function processMdfeEncerrar(job: any, client: any, attempt: number) {
  const mdfe = await fetchEntity(client, "mdfe", job.entity_id);
  const establishment = job.establishment_id
    ? await fetchEstablishment(client, job.establishment_id).catch(() => null)
    : null;

  const startTime = Date.now();
  const sefazResult = await callSefazProxy({
    action: "encerrar_mdfe",
    chave_acesso: mdfe.chave_acesso,
    protocolo: mdfe.protocolo_autorizacao,
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  }, job.contingency_mode);
  const responseTimeMs = Date.now() - startTime;

  if (sefazResult.success) {
    await client.from("mdfe").update({
      status: "encerrado",
      data_encerramento: new Date().toISOString(),
      protocolo_encerramento: sefazResult.protocolo,
    }).eq("id", job.entity_id);

    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "mdfe",
      entity_id: job.entity_id,
      action: "encerrado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment?.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "135",
      sefaz_message: "MDF-e encerrado",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment?.endereco_uf,
      details: { chave_acesso: mdfe.chave_acesso, protocolo: sefazResult.protocolo },
    });
  } else {
    await logStructured(client, {
      user_id: job.created_by,
      entity_type: "mdfe",
      entity_id: job.entity_id,
      action: "encerramento_rejeitado",
      establishment_id: job.establishment_id,
      cnpj_emissor: establishment?.cnpj,
      queue_job_id: job.id,
      attempt,
      sefaz_code: sefazResult.cStat || "999",
      sefaz_message: sefazResult.error || "Erro no encerramento",
      response_time_ms: responseTimeMs,
      sefaz_url: sefazResult.sefaz_url,
      ambiente: sefazResult.ambiente,
      uf: establishment?.endereco_uf,
    });
    throw new Error(sefazResult.error || "Erro no encerramento");
  }

  return sefazResult;
}

// ─── Helpers ─────────────────────────────────────────────────

async function fetchEntity(client: any, table: string, id: string) {
  const { data, error } = await client.from(table).select("*").eq("id", id).single();
  if (error) throw new Error(`${table} não encontrado: ${error.message}`);
  return data;
}

async function fetchEstablishment(client: any, id: string) {
  const { data, error } = await client
    .from("fiscal_establishments")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Estabelecimento não encontrado: ${error.message}`);
  return data;
}

async function callSefazProxy(params: Record<string, unknown>, contingencyMode?: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sefaz-proxy`;
  const body = { ...params };
  if (contingencyMode && contingencyMode !== "normal") {
    body.contingency_mode = contingencyMode;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  });
  return await res.json();
}

interface StructuredLog {
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  establishment_id?: string;
  cnpj_emissor?: string | null;
  queue_job_id?: string;
  attempt?: number;
  sefaz_code?: string;
  sefaz_message?: string;
  response_time_ms?: number;
  sefaz_url?: string;
  ambiente?: string;
  uf?: string;
  details?: Record<string, unknown>;
}

async function logStructured(client: any, log: StructuredLog) {
  try {
    await client.from("fiscal_logs").insert({
      user_id: log.user_id,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      action: log.action,
      establishment_id: log.establishment_id || null,
      cnpj_emissor: log.cnpj_emissor || null,
      queue_job_id: log.queue_job_id || null,
      attempt: log.attempt || null,
      sefaz_code: log.sefaz_code || null,
      sefaz_message: log.sefaz_message || null,
      response_time_ms: log.response_time_ms || null,
      sefaz_url: log.sefaz_url || null,
      ambiente: log.ambiente || null,
      uf: log.uf || null,
      details: log.details || null,
    });
  } catch (e: any) {
    console.error("[Worker] Log insert error:", e.message);
  }
}

async function updateEntityStatus(client: any, job: any, status: string, errorMsg: string) {
  const table = job.job_type.startsWith("cte") ? "ctes" : "mdfe";
  const update: any = { status };
  if (table === "ctes") update.motivo_rejeicao = errorMsg;
  await client.from(table).update(update).eq("id", job.entity_id);
}

function backoffMs(attempt: number): number {
  return Math.min(30_000 * Math.pow(2, attempt), 600_000);
}

function isRetryableError(msg: string): boolean {
  const nonRetryable = ["não encontrado", "não está em rascunho", "desconhecido", "FORBIDDEN"];
  return !nonRetryable.some((s) => msg.toLowerCase().includes(s.toLowerCase()));
}

function isSefazOfflineErr(msg: string): boolean {
  const patterns = [
    "timeout", "timed out", "connection refused", "econnrefused",
    "service unavailable", "503", "502", "504",
    "serviço indisponível", "fora do ar", "cstat: 108", "cstat: 109",
  ];
  const lower = msg.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

// ─── Contingency Management ─────────────────────────────────

async function getEstablishmentContingency(client: any, establishmentId: string): Promise<string> {
  const { data } = await client
    .from("fiscal_establishments")
    .select("contingency_mode, endereco_uf")
    .eq("id", establishmentId)
    .single();

  if (data?.contingency_mode && data.contingency_mode !== "normal") {
    return data.contingency_mode;
  }

  // Auto-determine SVC based on UF
  const svcAnUfs = new Set(["SP", "MG", "MS", "MT", "PR"]);
  const uf = (data?.endereco_uf || "SP").toUpperCase();
  return svcAnUfs.has(uf) ? "svc_an" : "svc_rs";
}

async function handleContingencyActivation(client: any, job: any, errorMessage: string) {
  const establishmentId = job.establishment_id;
  if (!establishmentId) return;

  // Check if already in contingency
  const { data: est } = await client
    .from("fiscal_establishments")
    .select("contingency_mode, endereco_uf")
    .eq("id", establishmentId)
    .single();

  if (est?.contingency_mode && est.contingency_mode !== "normal") {
    return; // Already in contingency
  }

  const svcAnUfs = new Set(["SP", "MG", "MS", "MT", "PR"]);
  const uf = (est?.endereco_uf || "SP").toUpperCase();
  const newMode = svcAnUfs.has(uf) ? "svc_an" : "svc_rs";

  // Activate contingency
  await client
    .from("fiscal_establishments")
    .update({
      contingency_mode: newMode,
      contingency_activated_at: new Date().toISOString(),
      contingency_justification: `Auto-detectado: ${errorMessage}`.substring(0, 500),
    })
    .eq("id", establishmentId);

  // Count pending documents
  const { count } = await client
    .from("fiscal_queue")
    .select("id", { count: "exact", head: true })
    .eq("establishment_id", establishmentId)
    .in("status", ["pending", "processing"]);

  // Record contingency event
  await client.from("contingency_events").insert({
    establishment_id: establishmentId,
    event_type: "auto_detected",
    previous_mode: "normal",
    new_mode: newMode,
    reason: "SEFAZ indisponível detectado automaticamente",
    detected_error: errorMessage.substring(0, 1000),
    documents_pending: count || 0,
    created_by: job.created_by,
  });

  // Log
  await logStructured(client, {
    user_id: job.created_by,
    entity_type: job.job_type.startsWith("cte") ? "cte" : "mdfe",
    entity_id: job.entity_id,
    action: "contingencia_ativada",
    establishment_id: establishmentId,
    details: {
      new_mode: newMode,
      detected_error: errorMessage.substring(0, 200),
      documents_pending: count || 0,
    },
  });

  console.log(`[Worker] Contingency activated for establishment ${establishmentId}: ${newMode}`);
}

/**
 * Process jobs that were completed in contingency and need resending in normal mode.
 */
async function processResendQueue(client: any) {
  const { data: resendJobs } = await client
    .from("fiscal_queue")
    .select("*")
    .eq("status", "completed")
    .eq("requires_resend", true)
    .limit(3);

  if (!resendJobs || resendJobs.length === 0) return;

  for (const job of resendJobs) {
    // Check if establishment is back to normal
    const { data: est } = await client
      .from("fiscal_establishments")
      .select("contingency_mode")
      .eq("id", job.establishment_id)
      .single();

    if (est?.contingency_mode && est.contingency_mode !== "normal") {
      continue; // Still in contingency, skip
    }

    // Create a new job for resending in normal mode
    await client.from("fiscal_queue").insert({
      job_type: job.job_type,
      entity_id: job.entity_id,
      establishment_id: job.establishment_id,
      payload: { ...job.payload, resend: true },
      contingency_mode: "normal",
      original_job_id: job.id,
      created_by: job.created_by,
    });

    // Mark original as no longer requiring resend
    await client
      .from("fiscal_queue")
      .update({ requires_resend: false })
      .eq("id", job.id);

    await logStructured(client, {
      user_id: job.created_by,
      entity_type: job.job_type.startsWith("cte") ? "cte" : "mdfe",
      entity_id: job.entity_id,
      action: "reenvio_enfileirado",
      establishment_id: job.establishment_id,
      details: { original_job_id: job.id, original_contingency_mode: job.contingency_mode },
    });

    console.log(`[Worker] Resend job created for ${job.entity_id} (original: ${job.id})`);
  }
}

/**
 * Check if SEFAZ is back online and deactivate contingency.
 * Tries a status service call for each establishment in contingency.
 */
async function checkContingencyRecovery(client: any) {
  const { data: establishments } = await client
    .from("fiscal_establishments")
    .select("id, contingency_mode, endereco_uf, ambiente")
    .neq("contingency_mode", "normal")
    .eq("active", true);

  if (!establishments || establishments.length === 0) return;

  for (const est of establishments) {
    try {
      // Try status service in normal mode to check if SEFAZ is back
      const statusResult = await callSefazProxy(
        {
          action: est.endereco_uf ? "status_cte" : "status_cte",
          establishment_id: est.id,
        },
        "normal" // Force normal mode for the check
      );

      if (statusResult.success || (statusResult.cStat && !["108", "109"].includes(statusResult.cStat))) {
        // SEFAZ is back! Deactivate contingency
        const previousMode = est.contingency_mode;

        await client
          .from("fiscal_establishments")
          .update({
            contingency_mode: "normal",
            contingency_activated_at: null,
            contingency_justification: null,
          })
          .eq("id", est.id);

        // Count docs to resend
        const { count } = await client
          .from("fiscal_queue")
          .select("id", { count: "exact", head: true })
          .eq("establishment_id", est.id)
          .eq("requires_resend", true);

        await client.from("contingency_events").insert({
          establishment_id: est.id,
          event_type: "deactivated",
          previous_mode: previousMode,
          new_mode: "normal",
          reason: "SEFAZ normalizado - detectado automaticamente",
          documents_pending: count || 0,
        });

        console.log(`[Worker] Contingency deactivated for ${est.id}, ${count || 0} docs to resend`);
      }
    } catch {
      // Still offline, keep contingency
    }
  }
}
