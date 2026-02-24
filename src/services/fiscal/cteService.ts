/**
 * Serviço de CT-e — orquestra geração, assinatura e envio
 */

import { supabase } from "@/integrations/supabase/client";
import { buildCteXml, type CteXmlData } from "./xmlBuilder";
import { signXml, validateXmlForSigning } from "./xmlSigner";
import { sendToSefaz, consultarSefaz, cancelarDocumento, type SefazResponse } from "./sefazClient";

export interface EmitirCteParams {
  cte_id: string;
  user_id: string;
}

export interface EmitirCteResult {
  success: boolean;
  numero?: number;
  chave_acesso?: string;
  protocolo?: string;
  motivo_rejeicao?: string;
  error?: string;
}

/**
 * Busca configurações fiscais globais (certificado, regime)
 */
async function fetchFiscalSettings() {
  const { data, error } = await supabase
    .from("fiscal_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Erro ao buscar config fiscal: ${error.message}`);
  if (!data) throw new Error("Configurações fiscais não encontradas. Configure antes de emitir.");
  return data;
}

/**
 * Busca dados do estabelecimento emitente
 */
async function fetchEstablishment(establishmentId: string) {
  const { data, error } = await supabase
    .from("fiscal_establishments")
    .select("*")
    .eq("id", establishmentId)
    .single();

  if (error) throw new Error(`Estabelecimento não encontrado: ${error.message}`);
  if (!data.active) throw new Error("Estabelecimento inativo. Ative-o antes de emitir.");
  return data;
}

/**
 * Busca dados do CT-e no banco
 */
async function fetchCte(cteId: string) {
  const { data, error } = await supabase
    .from("ctes")
    .select("*")
    .eq("id", cteId)
    .single();

  if (error) throw new Error(`CT-e não encontrado: ${error.message}`);
  return data;
}

/**
 * Emite CT-e: gera número, monta XML, assina e envia à SEFAZ
 */
export async function emitirCte({ cte_id, user_id }: EmitirCteParams): Promise<EmitirCteResult> {
  try {
    // 1. Buscar dados
    const cte = await fetchCte(cte_id);

    if (cte.status !== "rascunho") {
      throw new Error(`CT-e não está em rascunho (status: ${cte.status})`);
    }

    if (!cte.establishment_id) {
      throw new Error("CT-e sem estabelecimento vinculado. Selecione o emitente.");
    }

    // 2. Buscar establishment + settings em paralelo
    const [establishment, settings] = await Promise.all([
      fetchEstablishment(cte.establishment_id),
      fetchFiscalSettings(),
    ]);

    // 3. Obter próximo número do estabelecimento
    const { data: nextNum, error: numError } = await supabase.rpc("next_cte_number", {
      _establishment_id: cte.establishment_id,
    });
    if (numError) throw new Error(`Erro ao gerar número: ${numError.message}`);

    const numero = nextNum as number;

    // 4. Montar dados para XML (usando dados do establishment)
    const xmlData: CteXmlData = {
      numero,
      serie: establishment.serie_cte ?? 1,
      cfop: cte.cfop,
      natureza_operacao: cte.natureza_operacao,
      ambiente: (establishment.ambiente || settings.ambiente) as "homologacao" | "producao",
      uf_emissao: establishment.endereco_uf || settings.uf_emissao,
      data_emissao: new Date().toISOString(),

      emitente_cnpj: establishment.cnpj,
      emitente_ie: establishment.inscricao_estadual || undefined,
      emitente_razao_social: establishment.razao_social,
      emitente_nome_fantasia: establishment.nome_fantasia || undefined,
      emitente_endereco_logradouro: establishment.endereco_logradouro || undefined,
      emitente_endereco_numero: establishment.endereco_numero || undefined,
      emitente_endereco_bairro: establishment.endereco_bairro || undefined,
      emitente_endereco_municipio_ibge: establishment.codigo_municipio_ibge || undefined,
      emitente_endereco_uf: establishment.endereco_uf || undefined,
      emitente_endereco_cep: establishment.endereco_cep || undefined,

      remetente_nome: cte.remetente_nome,
      remetente_cnpj: cte.remetente_cnpj || undefined,
      remetente_ie: cte.remetente_ie || undefined,
      remetente_endereco: cte.remetente_endereco || undefined,
      remetente_municipio_ibge: cte.remetente_municipio_ibge || undefined,
      remetente_uf: cte.remetente_uf || undefined,

      destinatario_nome: cte.destinatario_nome,
      destinatario_cnpj: cte.destinatario_cnpj || undefined,
      destinatario_ie: cte.destinatario_ie || undefined,
      destinatario_endereco: cte.destinatario_endereco || undefined,
      destinatario_municipio_ibge: cte.destinatario_municipio_ibge || undefined,
      destinatario_uf: cte.destinatario_uf || undefined,

      municipio_origem_ibge: cte.municipio_origem_ibge || undefined,
      municipio_origem_nome: cte.municipio_origem_nome || undefined,
      uf_origem: cte.uf_origem || undefined,
      municipio_destino_ibge: cte.municipio_destino_ibge || undefined,
      municipio_destino_nome: cte.municipio_destino_nome || undefined,
      uf_destino: cte.uf_destino || undefined,

      valor_frete: cte.valor_frete,
      valor_carga: cte.valor_carga,
      base_calculo_icms: cte.base_calculo_icms,
      aliquota_icms: cte.aliquota_icms,
      valor_icms: cte.valor_icms,
      cst_icms: cte.cst_icms,

      produto_predominante: cte.produto_predominante || undefined,
      peso_bruto: cte.peso_bruto || undefined,
      placa_veiculo: cte.placa_veiculo || undefined,
      rntrc: cte.rntrc || undefined,
    };

    // 4. Gerar XML
    const xml = buildCteXml(xmlData);

    // 5. Validar
    const validationErrors = validateXmlForSigning(xml, "cte");
    if (validationErrors.length > 0) {
      throw new Error(`XML inválido: ${validationErrors.join(", ")}`);
    }

    // 6. Assinar
    const { signed_xml } = await signXml({
      xml,
      document_type: "cte",
      document_id: cte_id,
    });

    // 7. Enviar à SEFAZ
    const sefazResponse = await sendToSefaz({
      action: "autorizar_cte",
      signed_xml,
      document_id: cte_id,
    });

    // 8. Atualizar banco
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
      updateData.motivo_rejeicao = sefazResponse.motivo_rejeicao;
    }

    await supabase.from("ctes").update(updateData).eq("id", cte_id);

    // 9. Registrar log fiscal
    await supabase.from("fiscal_logs").insert({
      user_id,
      entity_type: "cte",
      entity_id: cte_id,
      action: sefazResponse.success ? "autorizado" : "rejeitado",
      details: {
        numero,
        chave_acesso: sefazResponse.chave_acesso,
        protocolo: sefazResponse.protocolo,
        motivo: sefazResponse.motivo_rejeicao,
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
 * Consulta situação do CT-e na SEFAZ
 */
export async function consultarCte(chaveAcesso: string): Promise<SefazResponse> {
  return consultarSefaz("cte", chaveAcesso);
}

/**
 * Cancela CT-e na SEFAZ
 */
export async function cancelarCte(
  cteId: string,
  chaveAcesso: string,
  protocolo: string,
  justificativa: string,
  userId: string
): Promise<SefazResponse> {
  const response = await cancelarDocumento("cte", chaveAcesso, protocolo, justificativa);

  if (response.success) {
    await supabase.from("ctes").update({ status: "cancelado" }).eq("id", cteId);

    await supabase.from("fiscal_logs").insert({
      user_id: userId,
      entity_type: "cte",
      entity_id: cteId,
      action: "cancelado",
      details: { chave_acesso: chaveAcesso, justificativa },
    });
  }

  return response;
}
