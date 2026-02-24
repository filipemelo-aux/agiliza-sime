/**
 * Cliente para o microserviço fiscal (edge function fiscal-service)
 * Usa supabase.functions.invoke() — sem API key no frontend.
 */

import { supabase } from "@/integrations/supabase/client";

interface FiscalResponse<T = any> {
  success: boolean;
  error?: string;
  data?: T;
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
