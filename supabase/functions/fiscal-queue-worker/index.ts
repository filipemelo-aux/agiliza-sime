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
 *
 * Flow:
 * 1. Pick pending jobs (up to batch size)
 * 2. Mark as "processing"
 * 3. Execute fiscal operation (call sefaz-proxy)
 * 4. Update job status (completed/failed)
 * 5. Handle retries with exponential backoff
 * 6. Detect timed-out jobs
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
      // Mark as processing
      await client
        .from("fiscal_queue")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

      try {
        const result = await processJob(job, client);
        
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

        results.push({ id: job.id, status: "completed" });
      } catch (err: any) {
        const attempt = job.attempts + 1;
        const canRetry = attempt < job.max_attempts && isRetryableError(err.message);

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

        // Update the entity status to failed if no more retries
        if (!canRetry) {
          await updateEntityStatus(client, job, "erro", err.message);
        }

        results.push({ id: job.id, status: canRetry ? "retry" : "failed", error: err.message });
      }
    }

    return json({ success: true, processed: results.length, results });
  } catch (e: any) {
    console.error("[Worker] Fatal error:", e.message);
    return json({ success: false, error: e.message }, 500);
  }
});

// ─── Job Processing ──────────────────────────────────────────

async function processJob(job: any, client: any) {
  const payload = job.payload || {};

  switch (job.job_type) {
    case "cte_emit":
      return await processCteEmit(job, client);
    case "cte_cancel":
      return await processCteCancel(job, payload, client);
    case "mdfe_emit":
      return await processMdfeEmit(job, client);
    case "mdfe_encerrar":
      return await processMdfeEncerrar(job, client);
    default:
      throw new Error(`Tipo de job desconhecido: ${job.job_type}`);
  }
}

async function processCteEmit(job: any, client: any) {
  const cte = await fetchEntity(client, "ctes", job.entity_id);
  const establishment = await fetchEstablishment(client, job.establishment_id);

  // Call sefaz-proxy
  const sefazResult = await callSefazProxy({
    action: "autorizar_cte",
    signed_xml: cte.xml_enviado || "<placeholder/>",
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  });

  if (sefazResult.success && sefazResult.status === "autorizado") {
    await client.from("ctes").update({
      status: "autorizado",
      chave_acesso: sefazResult.chave_acesso,
      protocolo_autorizacao: sefazResult.protocolo,
      data_autorizacao: sefazResult.data_autorizacao,
      xml_autorizado: sefazResult.xml_autorizado,
    }).eq("id", job.entity_id);
  } else {
    await client.from("ctes").update({
      status: "rejeitado",
      motivo_rejeicao: sefazResult.motivo_rejeicao || "Erro na autorização",
    }).eq("id", job.entity_id);
    throw new Error(sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ");
  }

  await logFiscal(client, {
    user_id: job.created_by,
    entity_type: "cte",
    entity_id: job.entity_id,
    action: sefazResult.status,
    establishment_id: job.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { chave_acesso: sefazResult.chave_acesso, protocolo: sefazResult.protocolo, queue_job_id: job.id },
  });

  return sefazResult;
}

async function processCteCancel(job: any, payload: any, client: any) {
  const cte = await fetchEntity(client, "ctes", job.entity_id);

  const sefazResult = await callSefazProxy({
    action: "cancelar_cte",
    chave_acesso: cte.chave_acesso,
    protocolo: cte.protocolo_autorizacao,
    justificativa: payload.justificativa,
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  });

  if (sefazResult.success) {
    await client.from("ctes").update({ status: "cancelado" }).eq("id", job.entity_id);
  } else {
    throw new Error(sefazResult.error || "Erro no cancelamento");
  }

  return sefazResult;
}

async function processMdfeEmit(job: any, client: any) {
  const mdfe = await fetchEntity(client, "mdfe", job.entity_id);
  const establishment = await fetchEstablishment(client, job.establishment_id);

  const sefazResult = await callSefazProxy({
    action: "autorizar_mdfe",
    signed_xml: mdfe.xml_enviado || "<placeholder/>",
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  });

  if (sefazResult.success && sefazResult.status === "autorizado") {
    await client.from("mdfe").update({
      status: "autorizado",
      chave_acesso: sefazResult.chave_acesso,
      protocolo_autorizacao: sefazResult.protocolo,
      data_autorizacao: sefazResult.data_autorizacao,
      xml_autorizado: sefazResult.xml_autorizado,
    }).eq("id", job.entity_id);
  } else {
    await client.from("mdfe").update({
      status: "rejeitado",
    }).eq("id", job.entity_id);
    throw new Error(sefazResult.motivo_rejeicao || "Rejeitado pela SEFAZ");
  }

  await logFiscal(client, {
    user_id: job.created_by,
    entity_type: "mdfe",
    entity_id: job.entity_id,
    action: sefazResult.status,
    establishment_id: job.establishment_id,
    cnpj_emissor: establishment.cnpj,
    details: { chave_acesso: sefazResult.chave_acesso, protocolo: sefazResult.protocolo, queue_job_id: job.id },
  });

  return sefazResult;
}

async function processMdfeEncerrar(job: any, client: any) {
  const mdfe = await fetchEntity(client, "mdfe", job.entity_id);

  const sefazResult = await callSefazProxy({
    action: "encerrar_mdfe",
    chave_acesso: mdfe.chave_acesso,
    protocolo: mdfe.protocolo_autorizacao,
    establishment_id: job.establishment_id,
    document_id: job.entity_id,
  });

  if (sefazResult.success) {
    await client.from("mdfe").update({
      status: "encerrado",
      data_encerramento: new Date().toISOString(),
      protocolo_encerramento: sefazResult.protocolo,
    }).eq("id", job.entity_id);
  } else {
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

async function callSefazProxy(params: Record<string, unknown>) {
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

async function logFiscal(client: any, params: Record<string, unknown>) {
  await client.from("fiscal_logs").insert(params);
}

async function updateEntityStatus(client: any, job: any, status: string, errorMsg: string) {
  const table = job.job_type.startsWith("cte") ? "ctes" : "mdfe";
  const update: any = { status };
  if (table === "ctes") update.motivo_rejeicao = errorMsg;
  await client.from(table).update(update).eq("id", job.entity_id);
}

function backoffMs(attempt: number): number {
  // Exponential backoff: 30s, 60s, 120s, 240s...
  return Math.min(30_000 * Math.pow(2, attempt), 600_000);
}

function isRetryableError(msg: string): boolean {
  const nonRetryable = ["não encontrado", "não está em rascunho", "desconhecido", "FORBIDDEN"];
  return !nonRetryable.some((s) => msg.toLowerCase().includes(s.toLowerCase()));
}
