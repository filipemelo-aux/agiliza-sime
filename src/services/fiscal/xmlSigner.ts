/**
 * Assinatura digital de XML fiscal com certificado A1
 * 
 * A assinatura real requer o certificado .pfx no servidor (edge function).
 * Este módulo prepara o XML para envio e delega a assinatura à edge function.
 */

import { supabase } from "@/integrations/supabase/client";

export interface SignXmlRequest {
  xml: string;
  document_type: "cte" | "mdfe";
  document_id: string;
}

export interface SignXmlResponse {
  signed_xml: string;
  digest_value: string;
  signature_value: string;
}

/**
 * Envia o XML para a edge function de assinatura digital.
 * A edge function acessa o certificado A1 armazenado de forma segura.
 */
export async function signXml(request: SignXmlRequest): Promise<SignXmlResponse> {
  const { data, error } = await supabase.functions.invoke("sign-fiscal-xml", {
    body: {
      xml: request.xml,
      document_type: request.document_type,
      document_id: request.document_id,
    },
  });

  if (error) {
    throw new Error(`Erro ao assinar XML: ${error.message}`);
  }

  if (!data?.signed_xml) {
    throw new Error("Resposta inválida da assinatura digital");
  }

  return {
    signed_xml: data.signed_xml,
    digest_value: data.digest_value || "",
    signature_value: data.signature_value || "",
  };
}

/**
 * Valida se o XML possui os campos mínimos antes de enviar para assinatura
 */
export function validateXmlForSigning(xml: string, type: "cte" | "mdfe"): string[] {
  const errors: string[] = [];

  if (!xml || xml.trim().length === 0) {
    errors.push("XML vazio");
    return errors;
  }

  if (type === "cte") {
    if (!xml.includes("<emit>")) errors.push("Bloco <emit> ausente");
    if (!xml.includes("<rem>")) errors.push("Bloco <rem> (remetente) ausente");
    if (!xml.includes("<dest>")) errors.push("Bloco <dest> (destinatário) ausente");
    if (!xml.includes("<vPrest>")) errors.push("Bloco <vPrest> (valores) ausente");
  }

  if (type === "mdfe") {
    if (!xml.includes("<emit>")) errors.push("Bloco <emit> ausente");
    if (!xml.includes("<infModal>")) errors.push("Bloco <infModal> ausente");
    if (!xml.includes("<infDoc>")) errors.push("Bloco <infDoc> ausente");
  }

  return errors;
}
