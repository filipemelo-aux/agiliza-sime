/**
 * Serviço de MDF-e — orquestra geração, assinatura e envio
 */

import { supabase } from "@/integrations/supabase/client";
import { buildMdfeXml, type MdfeXmlData } from "./xmlBuilder";
import { signXml, validateXmlForSigning } from "./xmlSigner";
import { sendToSefaz, consultarSefaz, cancelarDocumento, type SefazResponse } from "./sefazClient";

export interface EmitirMdfeParams {
  mdfe_id: string;
  user_id: string;
}

export interface EmitirMdfeResult {
  success: boolean;
  numero?: number;
  chave_acesso?: string;
  protocolo?: string;
  motivo_rejeicao?: string;
  error?: string;
}

/**
 * Emite MDF-e: gera número, monta XML, assina e envia à SEFAZ
 */
export async function emitirMdfe({ mdfe_id, user_id }: EmitirMdfeParams): Promise<EmitirMdfeResult> {
  try {
    // 1. Buscar dados
    const [mdfeResult, settingsResult] = await Promise.all([
      supabase.from("mdfe").select("*").eq("id", mdfe_id).single(),
      supabase.from("fiscal_settings").select("*").limit(1).maybeSingle(),
    ]);

    if (mdfeResult.error) throw new Error(`MDF-e não encontrado: ${mdfeResult.error.message}`);
    if (settingsResult.error) throw new Error(`Config fiscal: ${settingsResult.error.message}`);
    if (!settingsResult.data) throw new Error("Configure as configurações fiscais antes de emitir.");

    const mdfe = mdfeResult.data;
    const settings = settingsResult.data;

    if (mdfe.status !== "rascunho") {
      throw new Error(`MDF-e não está em rascunho (status: ${mdfe.status})`);
    }

    // 2. Próximo número
    const { data: nextNum, error: numError } = await supabase.rpc("next_mdfe_number");
    if (numError) throw new Error(`Erro ao gerar número: ${numError.message}`);

    const numero = nextNum as number;

    // 3. Montar XML
    const xmlData: MdfeXmlData = {
      numero,
      serie: settings.serie_mdfe,
      ambiente: settings.ambiente as "homologacao" | "producao",
      uf_carregamento: mdfe.uf_carregamento || undefined,
      uf_descarregamento: mdfe.uf_descarregamento || undefined,
      municipio_carregamento_ibge: mdfe.municipio_carregamento_ibge || undefined,
      municipio_descarregamento_ibge: mdfe.municipio_descarregamento_ibge || undefined,
      placa_veiculo: mdfe.placa_veiculo,
      rntrc: mdfe.rntrc || undefined,
      lista_ctes: mdfe.lista_ctes || [],
      emitente_cnpj: settings.cnpj,
      emitente_ie: settings.inscricao_estadual,
      emitente_razao_social: settings.razao_social,
      emitente_uf: settings.uf_emissao,
      data_emissao: new Date().toISOString(),
    };

    const xml = buildMdfeXml(xmlData);

    // 4. Validar
    const validationErrors = validateXmlForSigning(xml, "mdfe");
    if (validationErrors.length > 0) {
      throw new Error(`XML inválido: ${validationErrors.join(", ")}`);
    }

    // 5. Assinar
    const { signed_xml } = await signXml({
      xml,
      document_type: "mdfe",
      document_id: mdfe_id,
    });

    // 6. Enviar à SEFAZ
    const sefazResponse = await sendToSefaz({
      action: "autorizar_mdfe",
      signed_xml,
      document_id: mdfe_id,
    });

    // 7. Atualizar banco
    const updateData: Record<string, any> = {
      numero,
      data_emissao: new Date().toISOString(),
      xml_enviado: signed_xml,
    };

    if (sefazResponse.success) {
      updateData.status = "autorizado";
      updateData.chave_acesso = sefazResponse.chave_acesso;
      updateData.protocolo_autorizacao = sefazResponse.protocolo;
      updateData.data_autorizacao = sefazResponse.data_autorizacao;
      updateData.xml_autorizado = sefazResponse.xml_autorizado;
    } else {
      updateData.status = "rejeitado";
    }

    await supabase.from("mdfe").update(updateData).eq("id", mdfe_id);

    // 8. Log fiscal
    await supabase.from("fiscal_logs").insert({
      user_id,
      entity_type: "mdfe",
      entity_id: mdfe_id,
      action: sefazResponse.success ? "autorizado" : "rejeitado",
      details: {
        numero,
        chave_acesso: sefazResponse.chave_acesso,
        protocolo: sefazResponse.protocolo,
      },
    });

    return {
      success: sefazResponse.success,
      numero,
      chave_acesso: sefazResponse.chave_acesso || undefined,
      protocolo: sefazResponse.protocolo || undefined,
      motivo_rejeicao: sefazResponse.motivo_rejeicao || undefined,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Consulta situação do MDF-e na SEFAZ
 */
export async function consultarMdfe(chaveAcesso: string): Promise<SefazResponse> {
  return consultarSefaz("mdfe", chaveAcesso);
}

/**
 * Cancela MDF-e na SEFAZ
 */
export async function cancelarMdfe(
  mdfeId: string,
  chaveAcesso: string,
  protocolo: string,
  justificativa: string,
  userId: string
): Promise<SefazResponse> {
  const response = await cancelarDocumento("mdfe", chaveAcesso, protocolo, justificativa);

  if (response.success) {
    await supabase.from("mdfe").update({ status: "cancelado" }).eq("id", mdfeId);

    await supabase.from("fiscal_logs").insert({
      user_id: userId,
      entity_type: "mdfe",
      entity_id: mdfeId,
      action: "cancelado",
      details: { chave_acesso: chaveAcesso, justificativa },
    });
  }

  return response;
}

/**
 * Encerra MDF-e na SEFAZ
 */
export async function encerrarMdfe(
  mdfeId: string,
  chaveAcesso: string,
  protocolo: string,
  userId: string
): Promise<SefazResponse> {
  const response = await sendToSefaz({
    action: "encerrar_mdfe",
    chave_acesso: chaveAcesso,
    protocolo,
    document_id: mdfeId,
  });

  if (response.success) {
    await supabase.from("mdfe").update({
      status: "encerrado",
      data_encerramento: new Date().toISOString(),
      protocolo_encerramento: response.protocolo,
    }).eq("id", mdfeId);

    await supabase.from("fiscal_logs").insert({
      user_id: userId,
      entity_type: "mdfe",
      entity_id: mdfeId,
      action: "encerrado",
      details: { chave_acesso: chaveAcesso },
    });
  }

  return response;
}
