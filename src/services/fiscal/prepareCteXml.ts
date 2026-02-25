/**
 * Prepara o XML do CT-e no frontend antes de enviar ao fiscal-service.
 *
 * Fluxo:
 * 1. Busca establishment
 * 2. Gera próximo número via RPC
 * 3. Busca dados do motorista (nome + CPF)
 * 4. Monta CteXmlData e gera XML
 * 5. Salva xml_enviado, numero e chave_acesso no banco
 */

import { supabase } from "@/integrations/supabase/client";
import { buildCteXml, validateCteData, type CteXmlData } from "./xmlBuilder";
import { buscarCodigoIbgePorMunicipio, buscarCodigoIbgePorCep } from "@/lib/ibgeLookup";

export interface PrepararCteResult {
  success: boolean;
  numero?: number;
  chave_acesso?: string;
  xml?: string;
  errors?: string[];
}

export async function prepararCteParaTransmissao(cteId: string): Promise<PrepararCteResult> {
  // 1. Buscar CT-e atualizado do banco
  const { data: cte, error: cteErr } = await supabase
    .from("ctes")
    .select("*")
    .eq("id", cteId)
    .single();

  if (cteErr || !cte) {
    return { success: false, errors: [`CT-e não encontrado: ${cteErr?.message}`] };
  }

  if (!cte.establishment_id) {
    return { success: false, errors: ["CT-e sem estabelecimento vinculado."] };
  }

  // 2. Buscar establishment
  const { data: establishment, error: estErr } = await supabase
    .from("fiscal_establishments")
    .select("*")
    .eq("id", cte.establishment_id)
    .single();

  if (estErr || !establishment) {
    return { success: false, errors: [`Estabelecimento não encontrado: ${estErr?.message}`] };
  }

  if (!establishment.active) {
    return { success: false, errors: ["Estabelecimento inativo."] };
  }

  // 3. Gerar próximo número
  const { data: numero, error: numErr } = await supabase.rpc("next_cte_number", {
    _establishment_id: cte.establishment_id,
  });

  if (numErr || !numero) {
    return { success: false, errors: [`Erro ao gerar número: ${numErr?.message}`] };
  }

  // 4. Buscar motorista (nome + CPF) se houver motorista_id
  let motoristaNome: string | undefined;
  let motoristaCpf: string | undefined;

  if (cte.motorista_id) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name, cnpj, person_type, user_id")
      .eq("id", cte.motorista_id)
      .maybeSingle();

    motoristaNome = profileData?.full_name || undefined;

    const fallbackCpfFromProfile =
      profileData?.person_type === "cpf" && profileData?.cnpj
        ? profileData.cnpj
        : undefined;

    let cpfFromDriverDocs: string | undefined;

    if (profileData?.user_id) {
      const { data: docData } = await supabase
        .from("driver_documents")
        .select("cpf")
        .eq("user_id", profileData.user_id)
        .maybeSingle();

      cpfFromDriverDocs = docData?.cpf || undefined;
    }

    // CPF: prioridade driver_documents, fallback perfil (pessoa física com CNPJ = CPF)
    motoristaCpf = cpfFromDriverDocs || fallbackCpfFromProfile;
  }

  // 5. Resolver códigos IBGE automaticamente (se ausentes)
  const [
    emitIbge,
    origemIbge,
    destinoIbge,
  ] = await Promise.all([
    // Emitente: tenta pelo CEP, depois pelo município+UF
    !establishment.codigo_municipio_ibge && establishment.endereco_cep
      ? buscarCodigoIbgePorCep(establishment.endereco_cep)
      : Promise.resolve(establishment.codigo_municipio_ibge || undefined),
    // Origem
    !cte.municipio_origem_ibge && cte.municipio_origem_nome && cte.uf_origem
      ? buscarCodigoIbgePorMunicipio(cte.uf_origem, cte.municipio_origem_nome)
      : Promise.resolve(cte.municipio_origem_ibge || undefined),
    // Destino
    !cte.municipio_destino_ibge && cte.municipio_destino_nome && cte.uf_destino
      ? buscarCodigoIbgePorMunicipio(cte.uf_destino, cte.municipio_destino_nome)
      : Promise.resolve(cte.municipio_destino_ibge || undefined),
  ]);

  // Fallback: se emitente IBGE ainda não resolveu, tenta por município+UF
  const emitIbgeFinal = emitIbge || (
    establishment.endereco_municipio && establishment.endereco_uf
      ? await buscarCodigoIbgePorMunicipio(establishment.endereco_uf, establishment.endereco_municipio)
      : undefined
  );

  // Salvar IBGE do emitente no establishment para futuras emissões
  if (emitIbgeFinal && !establishment.codigo_municipio_ibge) {
    supabase
      .from("fiscal_establishments")
      .update({ codigo_municipio_ibge: emitIbgeFinal })
      .eq("id", establishment.id)
      .then(() => {}); // fire-and-forget
  }

  // 6. Montar CteXmlData
  const dataEmissao = new Date().toISOString();
  const xmlData: CteXmlData = {
    numero,
    serie: establishment.serie_cte ?? 1,
    cfop: cte.cfop,
    natureza_operacao: cte.natureza_operacao,
    ambiente: (establishment.ambiente || "homologacao") as "homologacao" | "producao",
    uf_emissao: establishment.endereco_uf || "SP",
    data_emissao: dataEmissao,
    tipo_cte: String(cte.tp_cte ?? 0) as any,
    tipo_servico: String(cte.tp_serv ?? 0) as any,

    emitente_cnpj: establishment.cnpj,
    emitente_ie: establishment.inscricao_estadual || undefined,
    emitente_razao_social: establishment.razao_social,
    emitente_nome_fantasia: establishment.nome_fantasia || undefined,
    emitente_endereco_logradouro: establishment.endereco_logradouro || undefined,
    emitente_endereco_numero: establishment.endereco_numero || undefined,
    emitente_endereco_bairro: establishment.endereco_bairro || undefined,
    emitente_endereco_municipio_ibge: emitIbgeFinal || establishment.codigo_municipio_ibge || undefined,
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

    tomador_tipo: String(cte.tomador_tipo ?? 0) as any,
    tomador_cnpj: cte.tomador_cnpj || undefined,
    tomador_ie: cte.tomador_ie || undefined,
    tomador_razao_social: cte.tomador_nome || undefined,
    tomador_endereco: cte.tomador_endereco || undefined,
    tomador_municipio_ibge: cte.tomador_municipio_ibge || undefined,
    tomador_uf: cte.tomador_uf || undefined,

    municipio_origem_ibge: origemIbge || cte.municipio_origem_ibge || undefined,
    municipio_origem_nome: cte.municipio_origem_nome || undefined,
    uf_origem: cte.uf_origem || undefined,
    municipio_destino_ibge: destinoIbge || cte.municipio_destino_ibge || undefined,
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
    rntrc: cte.rntrc || establishment.rntrc || undefined,

    motorista_nome: motoristaNome,
    motorista_cpf: motoristaCpf,

    observacoes: cte.observacoes || undefined,
  };

  // 7. Validar dados obrigatórios
  const validationErrors = validateCteData(xmlData);
  if (validationErrors.length > 0) {
    return {
      success: false,
      errors: validationErrors.map((e) => `${e.field}: ${e.message}`),
    };
  }

  // 8. Gerar XML
  const { xml, chave_acesso } = buildCteXml(xmlData);

  // 9. Salvar no banco
  const { error: updateErr } = await supabase
    .from("ctes")
    .update({
      numero,
      chave_acesso,
      data_emissao: dataEmissao,
      xml_enviado: xml,
    })
    .eq("id", cteId);

  if (updateErr) {
    return { success: false, errors: [`Erro ao salvar XML: ${updateErr.message}`] };
  }

  return { success: true, numero, chave_acesso, xml };
}
