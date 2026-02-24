/**
 * Cliente para o microserviço fiscal (edge function fiscal-service)
 * Usa supabase.functions.invoke() — sem API key no frontend.
 * Suporta fluxo assíncrono via fila de processamento.
 */

import { supabase } from "@/integrations/supabase/client";

interface FiscalResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

interface QueueJobStatus {
  id: string;
  job_type: string;
  entity_id: string;
  status: "pending" | "processing" | "completed" | "failed" | "timeout";
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  result: any;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

async function callFiscalService<T = any>(
  path: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<FiscalResponse<T>> {
  const { data, error } = await supabase.functions.invoke("fiscal-service", {
    method,
    body: { _path: path, ...body },
  });

  if (error) {
    return { success: false, error: error.message || "Erro na requisição fiscal" };
  }

  if (data && data.success === false) {
    return { success: false, error: data.error || "Erro desconhecido" };
  }

  return { success: true, data };
}

// ─── CT-e ────────────────────────────────────────────────────

export async function emitirCteViaService(cteId: string) {
  return callFiscalService("/cte/emit", "POST", { cte_id: cteId });
}

export async function cancelarCteViaService(cteId: string, justificativa: string) {
  return callFiscalService("/cte/cancel", "POST", { cte_id: cteId, justificativa });
}

export async function consultarCteViaService(cteId: string) {
  return callFiscalService(`/cte/status/${cteId}`, "GET");
}

// ─── MDF-e ───────────────────────────────────────────────────

export async function emitirMdfeViaService(mdfeId: string) {
  return callFiscalService("/mdfe/emit", "POST", { mdfe_id: mdfeId });
}

export async function encerrarMdfeViaService(mdfeId: string) {
  return callFiscalService("/mdfe/encerrar", "POST", { mdfe_id: mdfeId });
}

// ─── Queue ───────────────────────────────────────────────────

export async function consultarStatusFila(jobId: string): Promise<FiscalResponse<QueueJobStatus>> {
  return callFiscalService(`/queue/status/${jobId}`, "GET");
}

/**
 * Poll queue job status until completed or failed.
 * Returns the final status.
 */
export async function aguardarProcessamento(
  jobId: string,
  options: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<FiscalResponse<QueueJobStatus>> {
  const { intervalMs = 3000, maxAttempts = 40 } = options;
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = await consultarStatusFila(jobId);
    
    if (!result.success) return result;
    
    const status = result.data?.status;
    if (status === "completed" || status === "failed" || status === "timeout") {
      return result;
    }
    
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  
  return { success: false, error: "Timeout aguardando processamento da fila" };
}

/**
 * Subscribe to queue job changes via Realtime.
 * Returns an unsubscribe function.
 */
export function observarFila(
  jobId: string,
  onUpdate: (job: QueueJobStatus) => void
) {
  const channel = supabase
    .channel(`fiscal-queue-${jobId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "fiscal_queue",
        filter: `id=eq.${jobId}`,
      },
      (payload) => {
        onUpdate(payload.new as QueueJobStatus);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
