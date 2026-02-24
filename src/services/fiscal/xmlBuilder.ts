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

function getUfCodigo(uf: string): string {
  const codigos: Record<string, string> = {
    AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23",
    DF: "53", ES: "32", GO: "52", MA: "21", MT: "51", MS: "50",
    MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
    RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
    SP: "35", SE: "28", TO: "17",
  };
  return codigos[uf] || "35";
}

/**
 * Gera chave de acesso de 44 dígitos para CT-e
 * Formato: cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nCT(9) + tpEmis(1) + cCT(8) + cDV(1)
 */
function gerarChaveAcesso(
  uf: string,
  dataEmissao: string,
  cnpj: string,
  modelo: string,
  serie: number,
  numero: number
): string {
  const cUF = getUfCodigo(uf);
  const dt = new Date(dataEmissao);
  const AAMM = String(dt.getFullYear()).slice(2) + String(dt.getMonth() + 1).padStart(2, "0");
  const cnpjLimpo = cnpj.replace(/\D/g, "").padStart(14, "0");
  const mod = modelo.padStart(2, "0");
  const ser = String(serie).padStart(3, "0");
  const nCT = String(numero).padStart(9, "0");
  const tpEmis = "1"; // normal
  const cCT = String(Math.floor(Math.random() * 99999999)).padStart(8, "0");

  const chave = cUF + AAMM + cnpjLimpo + mod + ser + nCT + tpEmis + cCT;

  // Cálculo DV módulo 11
  const pesos = [2,3,4,5,6,7,8,9];
  let soma = 0;
  for (let i = chave.length - 1, p = 0; i >= 0; i--, p++) {
    soma += parseInt(chave[i]) * pesos[p % 8];
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;

  return chave + String(dv);
}

/**
 * Gera o XML do CT-e no layout simplificado da SEFAZ
 * Retorna { xml, chave_acesso }
 */
export function buildCteXml(data: CteXmlData): { xml: string; chave_acesso: string } {
  const tpAmb = getAmbienteCodigo(data.ambiente);
  const ufEmissao = data.uf_emissao || "SP";

  const chave_acesso = gerarChaveAcesso(
    ufEmissao,
    data.data_emissao,
    data.emitente_cnpj,
    "57", // modelo CT-e
    data.serie,
    data.numero
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte">
  <infCte versao="4.00" Id="CTe${chave_acesso}">
    <ide>
      <cUF>${getUfCodigo(ufEmissao)}</cUF>
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

  return { xml, chave_acesso };
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
