/**
 * XML Builder para documentos fiscais (CT-e e MDF-e)
 * Gera XML no formato exigido pela SEFAZ
 */

export interface CteXmlData {
  // Identificação
  numero: number;
  serie: number;
  cfop: string;
  natureza_operacao: string;
  ambiente: "homologacao" | "producao";
  uf_emissao: string;
  data_emissao: string;

  // Emitente
  emitente_cnpj: string;
  emitente_ie: string;
  emitente_razao_social: string;
  emitente_nome_fantasia?: string;
  emitente_endereco_logradouro?: string;
  emitente_endereco_numero?: string;
  emitente_endereco_bairro?: string;
  emitente_endereco_municipio_ibge?: string;
  emitente_endereco_uf?: string;
  emitente_endereco_cep?: string;

  // Remetente
  remetente_nome: string;
  remetente_cnpj?: string;
  remetente_ie?: string;
  remetente_endereco?: string;
  remetente_municipio_ibge?: string;
  remetente_uf?: string;

  // Destinatário
  destinatario_nome: string;
  destinatario_cnpj?: string;
  destinatario_ie?: string;
  destinatario_endereco?: string;
  destinatario_municipio_ibge?: string;
  destinatario_uf?: string;

  // Prestação
  municipio_origem_ibge?: string;
  municipio_origem_nome?: string;
  uf_origem?: string;
  municipio_destino_ibge?: string;
  municipio_destino_nome?: string;
  uf_destino?: string;

  // Valores
  valor_frete: number;
  valor_carga: number;
  base_calculo_icms: number;
  aliquota_icms: number;
  valor_icms: number;
  cst_icms: string;

  // Carga
  produto_predominante?: string;
  peso_bruto?: number;

  // Veículo
  placa_veiculo?: string;
  rntrc?: string;
}

export interface MdfeXmlData {
  numero: number;
  serie: number;
  ambiente: "homologacao" | "producao";
  uf_carregamento?: string;
  uf_descarregamento?: string;
  municipio_carregamento_ibge?: string;
  municipio_descarregamento_ibge?: string;
  placa_veiculo: string;
  rntrc?: string;
  lista_ctes: string[];

  // Emitente
  emitente_cnpj: string;
  emitente_ie: string;
  emitente_razao_social: string;
  emitente_uf: string;

  // Motorista
  motorista_nome?: string;
  motorista_cpf?: string;

  data_emissao: string;
}

function escapeXml(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function getAmbienteCodigo(ambiente: "homologacao" | "producao"): string {
  return ambiente === "producao" ? "1" : "2";
}

/**
 * Gera o XML do CT-e no layout simplificado da SEFAZ
 */
export function buildCteXml(data: CteXmlData): string {
  const tpAmb = getAmbienteCodigo(data.ambiente);

  return `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte">
  <infCte versao="4.00">
    <ide>
      <cUF>${escapeXml(data.uf_emissao)}</cUF>
      <CFOP>${escapeXml(data.cfop)}</CFOP>
      <natOp>${escapeXml(data.natureza_operacao)}</natOp>
      <mod>57</mod>
      <serie>${data.serie}</serie>
      <nCT>${data.numero}</nCT>
      <dhEmi>${escapeXml(data.data_emissao)}</dhEmi>
      <tpAmb>${tpAmb}</tpAmb>
      <tpCTe>0</tpCTe>
      <tpServ>0</tpServ>
    </ide>
    <emit>
      <CNPJ>${escapeXml(data.emitente_cnpj)}</CNPJ>
      <IE>${escapeXml(data.emitente_ie)}</IE>
      <xNome>${escapeXml(data.emitente_razao_social)}</xNome>
      ${data.emitente_nome_fantasia ? `<xFant>${escapeXml(data.emitente_nome_fantasia)}</xFant>` : ""}
      <enderEmit>
        <xLgr>${escapeXml(data.emitente_endereco_logradouro)}</xLgr>
        <nro>${escapeXml(data.emitente_endereco_numero)}</nro>
        <xBairro>${escapeXml(data.emitente_endereco_bairro)}</xBairro>
        <cMun>${escapeXml(data.emitente_endereco_municipio_ibge)}</cMun>
        <UF>${escapeXml(data.emitente_endereco_uf)}</UF>
        <CEP>${escapeXml(data.emitente_endereco_cep)}</CEP>
      </enderEmit>
    </emit>
    <rem>
      <xNome>${escapeXml(data.remetente_nome)}</xNome>
      ${data.remetente_cnpj ? `<CNPJ>${escapeXml(data.remetente_cnpj)}</CNPJ>` : ""}
      ${data.remetente_ie ? `<IE>${escapeXml(data.remetente_ie)}</IE>` : ""}
      ${data.remetente_endereco ? `<enderReme><xLgr>${escapeXml(data.remetente_endereco)}</xLgr><cMun>${escapeXml(data.remetente_municipio_ibge)}</cMun><UF>${escapeXml(data.remetente_uf)}</UF></enderReme>` : ""}
    </rem>
    <dest>
      <xNome>${escapeXml(data.destinatario_nome)}</xNome>
      ${data.destinatario_cnpj ? `<CNPJ>${escapeXml(data.destinatario_cnpj)}</CNPJ>` : ""}
      ${data.destinatario_ie ? `<IE>${escapeXml(data.destinatario_ie)}</IE>` : ""}
      ${data.destinatario_endereco ? `<enderDest><xLgr>${escapeXml(data.destinatario_endereco)}</xLgr><cMun>${escapeXml(data.destinatario_municipio_ibge)}</cMun><UF>${escapeXml(data.destinatario_uf)}</UF></enderDest>` : ""}
    </dest>
    <vPrest>
      <vTPrest>${formatDecimal(data.valor_frete)}</vTPrest>
      <vRec>${formatDecimal(data.valor_frete)}</vRec>
    </vPrest>
    <imp>
      <ICMS>
        <CST>${escapeXml(data.cst_icms)}</CST>
        <vBC>${formatDecimal(data.base_calculo_icms)}</vBC>
        <pICMS>${formatDecimal(data.aliquota_icms)}</pICMS>
        <vICMS>${formatDecimal(data.valor_icms)}</vICMS>
      </ICMS>
    </imp>
    <infCTeNorm>
      <infCarga>
        ${data.produto_predominante ? `<proPred>${escapeXml(data.produto_predominante)}</proPred>` : ""}
        <vCarga>${formatDecimal(data.valor_carga)}</vCarga>
        ${data.peso_bruto ? `<infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>${formatDecimal(data.peso_bruto, 4)}</qCarga></infQ>` : ""}
      </infCarga>
      <infModal versaoModal="4.00">
        <rodo>
          ${data.rntrc ? `<RNTRC>${escapeXml(data.rntrc)}</RNTRC>` : ""}
          ${data.placa_veiculo ? `<veic><placa>${escapeXml(data.placa_veiculo)}</placa></veic>` : ""}
        </rodo>
      </infModal>
    </infCTeNorm>
    <ide>
      <cMunIni>${escapeXml(data.municipio_origem_ibge)}</cMunIni>
      <xMunIni>${escapeXml(data.municipio_origem_nome)}</xMunIni>
      <UFIni>${escapeXml(data.uf_origem)}</UFIni>
      <cMunFim>${escapeXml(data.municipio_destino_ibge)}</cMunFim>
      <xMunFim>${escapeXml(data.municipio_destino_nome)}</xMunFim>
      <UFFim>${escapeXml(data.uf_destino)}</UFFim>
    </ide>
  </infCte>
</CTe>`;
}

/**
 * Gera o XML do MDF-e no layout simplificado da SEFAZ
 */
export function buildMdfeXml(data: MdfeXmlData): string {
  const tpAmb = getAmbienteCodigo(data.ambiente);

  const ctesXml = data.lista_ctes
    .map((chave) => `        <infCTe><chCTe>${escapeXml(chave)}</chCTe></infCTe>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">
  <infMDFe versao="3.00">
    <ide>
      <cUF>${escapeXml(data.emitente_uf)}</cUF>
      <tpAmb>${tpAmb}</tpAmb>
      <mod>58</mod>
      <serie>${data.serie}</serie>
      <nMDF>${data.numero}</nMDF>
      <dhEmi>${escapeXml(data.data_emissao)}</dhEmi>
      <tpEmit>1</tpEmit>
      <UFIni>${escapeXml(data.uf_carregamento)}</UFIni>
      <UFFim>${escapeXml(data.uf_descarregamento)}</UFFim>
    </ide>
    <emit>
      <CNPJ>${escapeXml(data.emitente_cnpj)}</CNPJ>
      <IE>${escapeXml(data.emitente_ie)}</IE>
      <xNome>${escapeXml(data.emitente_razao_social)}</xNome>
    </emit>
    <infModal versaoModal="3.00">
      <rodo>
        ${data.rntrc ? `<RNTRC>${escapeXml(data.rntrc)}</RNTRC>` : ""}
        <veicTracao>
          <placa>${escapeXml(data.placa_veiculo)}</placa>
          ${data.motorista_cpf ? `<condutor><xNome>${escapeXml(data.motorista_nome)}</xNome><CPF>${escapeXml(data.motorista_cpf)}</CPF></condutor>` : ""}
        </veicTracao>
      </rodo>
    </infModal>
    <infDoc>
      <infMunDescarga>
        <cMunDescarga>${escapeXml(data.municipio_descarregamento_ibge)}</cMunDescarga>
${ctesXml}
      </infMunDescarga>
    </infDoc>
  </infMDFe>
</MDFe>`;
}
