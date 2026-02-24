/**
 * Cliente SEFAZ — comunicação com os webservices da SEFAZ
 * 
 * Toda comunicação real é feita via edge function (servidor),
 * pois requer certificado digital e acesso HTTPS mTLS.
 * Este módulo abstrai as chamadas do frontend.
 */

import { supabase } from "@/integrations/supabase/client";

export type SefazAction =
  | "autorizar_cte"
  | "consultar_cte"
  | "cancelar_cte"
  | "autorizar_mdfe"
  | "consultar_mdfe"
  | "encerrar_mdfe"
  | "cancelar_mdfe";

export interface SefazRequest {
  action: SefazAction;
  signed_xml?: string;
  chave_acesso?: string;
  protocolo?: string;
  justificativa?: string;
  document_id: string;
}

export interface SefazResponse {
  success: boolean;
  status: string;
  chave_acesso?: string;
  protocolo?: string;
  data_autorizacao?: string;
  motivo_rejeicao?: string;
  xml_autorizado?: string;
  raw_response?: string;
}

/**
 * Envia requisição para a SEFAZ via edge function
 */
export async function sendToSefaz(request: SefazRequest): Promise<SefazResponse> {
  const { data, error } = await supabase.functions.invoke("sefaz-proxy", {
    body: request,
  });

  if (error) {
    throw new Error(`Erro na comunicação com SEFAZ: ${error.message}`);
  }

  return {
    success: data?.success ?? false,
    status: data?.status ?? "erro",
    chave_acesso: data?.chave_acesso,
    protocolo: data?.protocolo,
    data_autorizacao: data?.data_autorizacao,
    motivo_rejeicao: data?.motivo_rejeicao,
    xml_autorizado: data?.xml_autorizado,
    raw_response: data?.raw_response,
  };
}

/**
 * Consulta situação de um documento fiscal na SEFAZ
 */
export async function consultarSefaz(
  type: "cte" | "mdfe",
  chaveAcesso: string
): Promise<SefazResponse> {
  const action: SefazAction = type === "cte" ? "consultar_cte" : "consultar_mdfe";

  return sendToSefaz({
    action,
    chave_acesso: chaveAcesso,
    document_id: chaveAcesso,
  });
}

/**
 * Cancela documento fiscal na SEFAZ
 */
export async function cancelarDocumento(
  type: "cte" | "mdfe",
  chaveAcesso: string,
  protocolo: string,
  justificativa: string
): Promise<SefazResponse> {
  if (!justificativa || justificativa.length < 15) {
    throw new Error("Justificativa deve ter no mínimo 15 caracteres");
  }

  const action: SefazAction = type === "cte" ? "cancelar_cte" : "cancelar_mdfe";

  return sendToSefaz({
    action,
    chave_acesso: chaveAcesso,
    protocolo,
    justificativa,
    document_id: chaveAcesso,
  });
}
