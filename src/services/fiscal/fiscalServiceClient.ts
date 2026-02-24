/**
 * Cliente HTTP para o microserviço fiscal (edge function fiscal-service)
 */

import { supabase } from "@/integrations/supabase/client";

const FISCAL_API_KEY = import.meta.env.VITE_FISCAL_API_KEY || "";

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
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    return { success: false, error: "Usuário não autenticado." };
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const url = `https://${projectId}.supabase.co/functions/v1/fiscal-service${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-fiscal-api-key": FISCAL_API_KEY,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" && body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    return { success: false, error: data.error || `HTTP ${res.status}` };
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
