import { supabase } from "@/integrations/supabase/client";

export interface FocusCteEmissionResult {
  success: boolean;
  status?: string;
  chave_acesso?: string;
  protocolo?: string;
  motivo_rejeicao?: string;
  dacte_url?: string;
  xml_url?: string;
  error?: string;
}

export async function emitirCteViaFocus(cteId: string): Promise<FocusCteEmissionResult> {
  const { data, error } = await supabase.functions.invoke("focus-nfe", {
    body: { action: "emitir_cte_salvo", cte_id: cteId },
  });

  if (error) return { success: false, error: error.message || "Falha ao acessar a emissão fiscal" };
  if (!data?.success) {
    return {
      success: false,
      status: data?.status,
      motivo_rejeicao: data?.motivo_rejeicao,
      error: data?.error || data?.motivo_rejeicao || "A SEFAZ não autorizou o CT-e",
    };
  }
  return data as FocusCteEmissionResult;
}