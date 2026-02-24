/**
 * XML Builder para documentos fiscais (CT-e e MDF-e)
 * Gera XML conforme schema oficial SEFAZ
 *
 * CT-e: Layout 4.00 — Manual de Orientação do Contribuinte (MOC)
 * MDF-e: Layout 3.00
 */

// ─── Interfaces ──────────────────────────────────────────────

export interface CteXmlData {
  // Identificação
  numero: number;
  serie: number;
  cfop: string;
  natureza_operacao: string;
  ambiente: "homologacao" | "producao";
  uf_emissao: string;
  data_emissao: string;
  tipo_cte?: "0" | "1" | "2" | "3"; // 0=Normal, 1=Complementar, 2=Anulação, 3=Substituto
  tipo_servico?: "0" | "1" | "2" | "3"; // 0=Normal, 1=Subcontratação, 2=Redespacho, 3=Redespacho intermediário

  // Emitente (transportadora)
  emitente_cnpj: string;
  emitente_ie: string;
  emitente_razao_social: string;
  emitente_nome_fantasia?: string;
  emitente_endereco_logradouro?: string;
  emitente_endereco_numero?: string;
  emitente_endereco_bairro?: string;
  emitente_endereco_municipio_ibge?: string;
  emitente_endereco_municipio_nome?: string;
  emitente_endereco_uf?: string;
  emitente_endereco_cep?: string;
  emitente_telefone?: string;

  // Remetente
  remetente_nome: string;
  remetente_cnpj?: string;
  remetente_cpf?: string;
  remetente_ie?: string;
  remetente_endereco?: string;
  remetente_municipio_ibge?: string;
  remetente_municipio_nome?: string;
  remetente_uf?: string;
  remetente_cep?: string;

  // Destinatário
  destinatario_nome: string;
  destinatario_cnpj?: string;
  destinatario_cpf?: string;
  destinatario_ie?: string;
  destinatario_endereco?: string;
  destinatario_municipio_ibge?: string;
  destinatario_municipio_nome?: string;
  destinatario_uf?: string;
  destinatario_cep?: string;

  // Tomador do serviço
  tomador_tipo: "0" | "1" | "2" | "3" | "4"; // 0=Remetente, 1=Expedidor, 2=Recebedor, 3=Destinatário, 4=Outros
  tomador_cnpj?: string;
  tomador_cpf?: string;
  tomador_ie?: string;
  tomador_razao_social?: string;
  tomador_nome_fantasia?: string;
  tomador_telefone?: string;
  tomador_endereco?: string;
  tomador_municipio_ibge?: string;
  tomador_municipio_nome?: string;
  tomador_uf?: string;
  tomador_cep?: string;
  tomador_email?: string;

  // Prestação (origem/destino)
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
  cst_icms: string; // 00, 20, 40, 41, 51, 60, 90
  percentual_reducao_bc?: number; // Para CST 20

  // Carga
  produto_predominante?: string;
  peso_bruto?: number;

  // Modal Rodoviário
  placa_veiculo?: string;
  renavam_veiculo?: string;
  tara_veiculo?: number;
  tipo_rodado?: "01" | "02" | "03" | "04" | "05" | "06"; // 01=Truck, 02=Toco, 03=Cavalo, 04=VAN, 05=Utilitário, 06=Outros
  tipo_carroceria?: "00" | "01" | "02" | "03" | "04" | "05"; // 00=Não aplicável, 01=Aberta, 02=Fechada/Baú, 03=Granelera, 04=Porta Container, 05=Sider
  rntrc?: string;
  ciot?: string; // Código Identificador da Operação de Transporte

  // Motorista
  motorista_nome?: string;
  motorista_cpf?: string;

  // Observações
  observacoes?: string;
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

// ─── Validation ──────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Valida campos obrigatórios do CT-e ANTES da geração do XML.
 * Retorna lista de erros. Lista vazia = válido.
 */
export function validateCteData(data: CteXmlData): ValidationError[] {
  const errors: ValidationError[] = [];

  // Identificação
  if (!data.numero || data.numero <= 0) errors.push({ field: "numero", message: "Número do CT-e é obrigatório e deve ser > 0" });
  if (!data.serie && data.serie !== 0) errors.push({ field: "serie", message: "Série é obrigatória" });
  if (!data.cfop) errors.push({ field: "cfop", message: "CFOP é obrigatório" });
  if (!data.natureza_operacao) errors.push({ field: "natureza_operacao", message: "Natureza da operação é obrigatória" });
  if (!data.uf_emissao) errors.push({ field: "uf_emissao", message: "UF de emissão é obrigatória" });
  if (!data.data_emissao) errors.push({ field: "data_emissao", message: "Data de emissão é obrigatória" });

  // Emitente
  if (!data.emitente_cnpj) errors.push({ field: "emitente_cnpj", message: "CNPJ do emitente é obrigatório" });
  if (data.emitente_cnpj && data.emitente_cnpj.replace(/\D/g, "").length !== 14) {
    errors.push({ field: "emitente_cnpj", message: "CNPJ do emitente deve ter 14 dígitos" });
  }
  if (!data.emitente_ie) errors.push({ field: "emitente_ie", message: "IE do emitente é obrigatória" });
  if (!data.emitente_razao_social) errors.push({ field: "emitente_razao_social", message: "Razão social do emitente é obrigatória" });
  if (!data.emitente_endereco_municipio_ibge) errors.push({ field: "emitente_endereco_municipio_ibge", message: "Código IBGE do município do emitente é obrigatório" });
  if (!data.emitente_endereco_uf) errors.push({ field: "emitente_endereco_uf", message: "UF do emitente é obrigatória" });

  // Remetente
  if (!data.remetente_nome) errors.push({ field: "remetente_nome", message: "Nome do remetente é obrigatório" });
  if (!data.remetente_cnpj && !data.remetente_cpf) errors.push({ field: "remetente_cnpj", message: "CNPJ ou CPF do remetente é obrigatório" });

  // Destinatário
  if (!data.destinatario_nome) errors.push({ field: "destinatario_nome", message: "Nome do destinatário é obrigatório" });
  if (!data.destinatario_cnpj && !data.destinatario_cpf) errors.push({ field: "destinatario_cnpj", message: "CNPJ ou CPF do destinatário é obrigatório" });

  // Tomador
  if (!data.tomador_tipo) errors.push({ field: "tomador_tipo", message: "Tipo do tomador é obrigatório" });
  if (data.tomador_tipo === "4") {
    // Tomador "Outros" precisa de dados completos
    if (!data.tomador_cnpj && !data.tomador_cpf) errors.push({ field: "tomador_cnpj", message: "CNPJ ou CPF do tomador é obrigatório quando tipo = Outros" });
    if (!data.tomador_razao_social) errors.push({ field: "tomador_razao_social", message: "Razão social do tomador é obrigatória quando tipo = Outros" });
  }

  // Prestação
  if (!data.municipio_origem_ibge) errors.push({ field: "municipio_origem_ibge", message: "Município de origem (IBGE) é obrigatório" });
  if (!data.municipio_origem_nome) errors.push({ field: "municipio_origem_nome", message: "Nome do município de origem é obrigatório" });
  if (!data.uf_origem) errors.push({ field: "uf_origem", message: "UF de origem é obrigatória" });
  if (!data.municipio_destino_ibge) errors.push({ field: "municipio_destino_ibge", message: "Município de destino (IBGE) é obrigatório" });
  if (!data.municipio_destino_nome) errors.push({ field: "municipio_destino_nome", message: "Nome do município de destino é obrigatório" });
  if (!data.uf_destino) errors.push({ field: "uf_destino", message: "UF de destino é obrigatória" });

  // Valores
  if (data.valor_frete === undefined || data.valor_frete < 0) errors.push({ field: "valor_frete", message: "Valor do frete é obrigatório e deve ser >= 0" });
  if (data.valor_carga === undefined || data.valor_carga < 0) errors.push({ field: "valor_carga", message: "Valor da carga é obrigatório e deve ser >= 0" });
  if (!data.cst_icms) errors.push({ field: "cst_icms", message: "CST do ICMS é obrigatório" });

  // CST 00 (tributado integralmente) requer base + alíquota
  if (data.cst_icms === "00") {
    if (data.base_calculo_icms === undefined || data.base_calculo_icms <= 0) errors.push({ field: "base_calculo_icms", message: "Base de cálculo do ICMS é obrigatória para CST 00" });
    if (data.aliquota_icms === undefined || data.aliquota_icms <= 0) errors.push({ field: "aliquota_icms", message: "Alíquota do ICMS é obrigatória para CST 00" });
  }

  // Modal rodoviário
  if (!data.rntrc) errors.push({ field: "rntrc", message: "RNTRC é obrigatório para modal rodoviário" });
  if (!data.placa_veiculo) errors.push({ field: "placa_veiculo", message: "Placa do veículo é obrigatória" });

  // Motorista
  if (!data.motorista_cpf) errors.push({ field: "motorista_cpf", message: "CPF do motorista é obrigatório" });
  if (!data.motorista_nome) errors.push({ field: "motorista_nome", message: "Nome do motorista é obrigatório" });

  return errors;
}

// ─── XML Helpers ─────────────────────────────────────────────

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
  return codigos[uf?.toUpperCase()] || "35";
}

/** Limpa documento (CNPJ/CPF) — somente dígitos */
function cleanDoc(doc: string | undefined | null): string {
  return (doc || "").replace(/\D/g, "");
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
  numero: number,
  tpEmis: string = "1"
): string {
  const cUF = getUfCodigo(uf);
  const dt = new Date(dataEmissao);
  const AAMM = String(dt.getFullYear()).slice(2) + String(dt.getMonth() + 1).padStart(2, "0");
  const cnpjLimpo = cleanDoc(cnpj).padStart(14, "0");
  const mod = modelo.padStart(2, "0");
  const ser = String(serie).padStart(3, "0");
  const nCT = String(numero).padStart(9, "0");
  const cCT = String(Math.floor(Math.random() * 99999999)).padStart(8, "0");

  const chave = cUF + AAMM + cnpjLimpo + mod + ser + nCT + tpEmis + cCT;

  // Cálculo DV módulo 11
  const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  for (let i = chave.length - 1, p = 0; i >= 0; i--, p++) {
    soma += parseInt(chave[i]) * pesos[p % 8];
  }
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;

  return chave + String(dv);
}

// ─── ICMS Builder ────────────────────────────────────────────

function buildIcmsXml(data: CteXmlData): string {
  const cst = data.cst_icms;

  switch (cst) {
    case "00": // Tributação normal — Lucro Real
      return `
        <ICMS00>
          <CST>00</CST>
          <vBC>${formatDecimal(data.base_calculo_icms)}</vBC>
          <pICMS>${formatDecimal(data.aliquota_icms)}</pICMS>
          <vICMS>${formatDecimal(data.valor_icms)}</vICMS>
        </ICMS00>`;

    case "20": // Tributação com redução de base de cálculo
      return `
        <ICMS20>
          <CST>20</CST>
          <pRedBC>${formatDecimal(data.percentual_reducao_bc || 0)}</pRedBC>
          <vBC>${formatDecimal(data.base_calculo_icms)}</vBC>
          <pICMS>${formatDecimal(data.aliquota_icms)}</pICMS>
          <vICMS>${formatDecimal(data.valor_icms)}</vICMS>
        </ICMS20>`;

    case "40": // Isento
      return `
        <ICMS45>
          <CST>40</CST>
        </ICMS45>`;

    case "41": // Não tributado
      return `
        <ICMS45>
          <CST>41</CST>
        </ICMS45>`;

    case "51": // Diferimento
      return `
        <ICMS45>
          <CST>51</CST>
        </ICMS45>`;

    case "60": // ICMS cobrado anteriormente por substituição tributária
      return `
        <ICMS60>
          <CST>60</CST>
          <vBCSTRet>${formatDecimal(data.base_calculo_icms)}</vBCSTRet>
          <vICMSSTRet>${formatDecimal(data.valor_icms)}</vICMSSTRet>
          <pICMSSTRet>${formatDecimal(data.aliquota_icms)}</pICMSSTRet>
          <vCred>${formatDecimal(0)}</vCred>
        </ICMS60>`;

    case "90": // Outros
      return `
        <ICMS90>
          <CST>90</CST>
          <pRedBC>${formatDecimal(data.percentual_reducao_bc || 0)}</pRedBC>
          <vBC>${formatDecimal(data.base_calculo_icms)}</vBC>
          <pICMS>${formatDecimal(data.aliquota_icms)}</pICMS>
          <vICMS>${formatDecimal(data.valor_icms)}</vICMS>
          <vCred>${formatDecimal(0)}</vCred>
        </ICMS90>`;

    default:
      // Fallback to CST 00
      return `
        <ICMS00>
          <CST>${escapeXml(cst)}</CST>
          <vBC>${formatDecimal(data.base_calculo_icms)}</vBC>
          <pICMS>${formatDecimal(data.aliquota_icms)}</pICMS>
          <vICMS>${formatDecimal(data.valor_icms)}</vICMS>
        </ICMS00>`;
  }
}

// ─── Tomador Builder ─────────────────────────────────────────

function buildTomadorXml(data: CteXmlData): string {
  // toma3: Remetente(0), Expedidor(1), Recebedor(2), Destinatário(3)
  if (["0", "1", "2", "3"].includes(data.tomador_tipo)) {
    return `
    <toma3>
      <toma>${data.tomador_tipo}</toma>
    </toma3>`;
  }

  // toma4: Outros — precisa dos dados completos
  const doc = data.tomador_cnpj
    ? `<CNPJ>${cleanDoc(data.tomador_cnpj)}</CNPJ>`
    : data.tomador_cpf
    ? `<CPF>${cleanDoc(data.tomador_cpf)}</CPF>`
    : "";

  return `
    <toma4>
      <toma>4</toma>
      ${doc}
      ${data.tomador_ie ? `<IE>${escapeXml(data.tomador_ie)}</IE>` : "<IE>ISENTO</IE>"}
      <xNome>${escapeXml(data.tomador_razao_social)}</xNome>
      ${data.tomador_nome_fantasia ? `<xFant>${escapeXml(data.tomador_nome_fantasia)}</xFant>` : ""}
      ${data.tomador_telefone ? `<fone>${escapeXml(data.tomador_telefone)}</fone>` : ""}
      <enderToma>
        <xLgr>${escapeXml(data.tomador_endereco)}</xLgr>
        <nro>S/N</nro>
        <cMun>${escapeXml(data.tomador_municipio_ibge)}</cMun>
        <xMun>${escapeXml(data.tomador_municipio_nome)}</xMun>
        <CEP>${escapeXml(data.tomador_cep)}</CEP>
        <UF>${escapeXml(data.tomador_uf)}</UF>
      </enderToma>
      ${data.tomador_email ? `<email>${escapeXml(data.tomador_email)}</email>` : ""}
    </toma4>`;
}

// ─── Documento builder (Remetente / Destinatário) ────────────

function buildParticipanteDoc(cnpj?: string, cpf?: string): string {
  if (cnpj) return `<CNPJ>${cleanDoc(cnpj)}</CNPJ>`;
  if (cpf) return `<CPF>${cleanDoc(cpf)}</CPF>`;
  return "";
}

// ─── CT-e XML Builder ────────────────────────────────────────

/**
 * Gera o XML do CT-e conforme schema oficial CT-e 4.00
 *
 * Estrutura segue a ordem exata do MOC:
 * infCte → ide → toma → emit → rem → dest → vPrest → imp → infCTeNorm → infCarga → infModal(rodo)
 *
 * Retorna { xml, chave_acesso }
 */
export function buildCteXml(data: CteXmlData): { xml: string; chave_acesso: string } {
  const tpAmb = getAmbienteCodigo(data.ambiente);
  const ufEmissao = data.uf_emissao || "SP";
  const cUF = getUfCodigo(ufEmissao);
  const cnpjLimpo = cleanDoc(data.emitente_cnpj);
  const tpCTe = data.tipo_cte || "0";
  const tpServ = data.tipo_servico || "0";

  const chave_acesso = gerarChaveAcesso(
    ufEmissao,
    data.data_emissao,
    data.emitente_cnpj,
    "57", // modelo CT-e
    data.serie,
    data.numero
  );

  // Código numérico extraído da chave (posições 35-42)
  const cCT = chave_acesso.substring(35, 43);
  const cDV = chave_acesso.substring(43, 44);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CTe xmlns="http://www.portalfiscal.inf.br/cte">
  <infCte versao="4.00" Id="CTe${chave_acesso}">
    <ide>
      <cUF>${cUF}</cUF>
      <cCT>${cCT}</cCT>
      <CFOP>${escapeXml(data.cfop)}</CFOP>
      <natOp>${escapeXml(data.natureza_operacao)}</natOp>
      <mod>57</mod>
      <serie>${data.serie}</serie>
      <nCT>${String(data.numero).padStart(9, "0")}</nCT>
      <dhEmi>${escapeXml(data.data_emissao)}</dhEmi>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${cDV}</cDV>
      <tpAmb>${tpAmb}</tpAmb>
      <tpCTe>${tpCTe}</tpCTe>
      <procEmi>0</procEmi>
      <verProc>1.0.0</verProc>
      <cMunEnv>${escapeXml(data.emitente_endereco_municipio_ibge)}</cMunEnv>
      <xMunEnv>${escapeXml(data.emitente_endereco_municipio_nome || "")}</xMunEnv>
      <UFEnv>${escapeXml(ufEmissao)}</UFEnv>
      <modal>01</modal>
      <tpServ>${tpServ}</tpServ>
      <cMunIni>${escapeXml(data.municipio_origem_ibge)}</cMunIni>
      <xMunIni>${escapeXml(data.municipio_origem_nome)}</xMunIni>
      <UFIni>${escapeXml(data.uf_origem)}</UFIni>
      <cMunFim>${escapeXml(data.municipio_destino_ibge)}</cMunFim>
      <xMunFim>${escapeXml(data.municipio_destino_nome)}</xMunFim>
      <UFFim>${escapeXml(data.uf_destino)}</UFFim>
      <retira>1</retira>${buildTomadorXml(data)}
    </ide>
    <compl>${data.observacoes ? `
      <xObs>${escapeXml(data.observacoes.substring(0, 2000))}</xObs>` : ""}
    </compl>
    <emit>
      <CNPJ>${cnpjLimpo}</CNPJ>
      <IE>${escapeXml(data.emitente_ie)}</IE>
      <xNome>${escapeXml(data.emitente_razao_social)}</xNome>${data.emitente_nome_fantasia ? `
      <xFant>${escapeXml(data.emitente_nome_fantasia)}</xFant>` : ""}
      <enderEmit>
        <xLgr>${escapeXml(data.emitente_endereco_logradouro)}</xLgr>
        <nro>${escapeXml(data.emitente_endereco_numero || "S/N")}</nro>
        <xBairro>${escapeXml(data.emitente_endereco_bairro)}</xBairro>
        <cMun>${escapeXml(data.emitente_endereco_municipio_ibge)}</cMun>
        <xMun>${escapeXml(data.emitente_endereco_municipio_nome || "")}</xMun>
        <CEP>${escapeXml(data.emitente_endereco_cep)}</CEP>
        <UF>${escapeXml(data.emitente_endereco_uf)}</UF>${data.emitente_telefone ? `
        <fone>${escapeXml(data.emitente_telefone)}</fone>` : ""}
      </enderEmit>
    </emit>
    <rem>
      ${buildParticipanteDoc(data.remetente_cnpj, data.remetente_cpf)}
      ${data.remetente_ie ? `<IE>${escapeXml(data.remetente_ie)}</IE>` : ""}
      <xNome>${escapeXml(data.remetente_nome)}</xNome>
      <enderReme>
        <xLgr>${escapeXml(data.remetente_endereco)}</xLgr>
        <nro>S/N</nro>
        <cMun>${escapeXml(data.remetente_municipio_ibge)}</cMun>
        <xMun>${escapeXml(data.remetente_municipio_nome || "")}</xMun>${data.remetente_cep ? `
        <CEP>${escapeXml(data.remetente_cep)}</CEP>` : ""}
        <UF>${escapeXml(data.remetente_uf)}</UF>
      </enderReme>
    </rem>
    <dest>
      ${buildParticipanteDoc(data.destinatario_cnpj, data.destinatario_cpf)}
      ${data.destinatario_ie ? `<IE>${escapeXml(data.destinatario_ie)}</IE>` : ""}
      <xNome>${escapeXml(data.destinatario_nome)}</xNome>
      <enderDest>
        <xLgr>${escapeXml(data.destinatario_endereco)}</xLgr>
        <nro>S/N</nro>
        <cMun>${escapeXml(data.destinatario_municipio_ibge)}</cMun>
        <xMun>${escapeXml(data.destinatario_municipio_nome || "")}</xMun>${data.destinatario_cep ? `
        <CEP>${escapeXml(data.destinatario_cep)}</CEP>` : ""}
        <UF>${escapeXml(data.destinatario_uf)}</UF>
      </enderDest>
    </dest>
    <vPrest>
      <vTPrest>${formatDecimal(data.valor_frete)}</vTPrest>
      <vRec>${formatDecimal(data.valor_frete)}</vRec>
    </vPrest>
    <imp>
      <ICMS>${buildIcmsXml(data)}
      </ICMS>
    </imp>
    <infCTeNorm>
      <infCarga>
        <vCarga>${formatDecimal(data.valor_carga)}</vCarga>${data.produto_predominante ? `
        <proPred>${escapeXml(data.produto_predominante)}</proPred>` : ""}${data.peso_bruto ? `
        <infQ>
          <cUnid>01</cUnid>
          <tpMed>PESO BRUTO</tpMed>
          <qCarga>${formatDecimal(data.peso_bruto, 4)}</qCarga>
        </infQ>` : ""}
      </infCarga>
      <infModal versaoModal="4.00">
        <rodo>
          <RNTRC>${escapeXml(data.rntrc)}</RNTRC>${data.ciot ? `
          <CIOT>
            <CIOT>${escapeXml(data.ciot)}</CIOT>
            <CNPJ>${cnpjLimpo}</CNPJ>
          </CIOT>` : ""}
          <occ>
            <nOcc>${data.numero}</nOcc>
            <dEmi>${escapeXml(data.data_emissao.split("T")[0])}</dEmi>
          </occ>
          <veic>
            <cInt>001</cInt>
            <placa>${escapeXml(data.placa_veiculo)}</placa>${data.renavam_veiculo ? `
            <RENAVAM>${escapeXml(data.renavam_veiculo)}</RENAVAM>` : ""}${data.tara_veiculo ? `
            <tara>${data.tara_veiculo}</tara>` : ""}${data.tipo_rodado ? `
            <tpRod>${data.tipo_rodado}</tpRod>` : ""}${data.tipo_carroceria ? `
            <tpCar>${data.tipo_carroceria}</tpCar>` : ""}
            <UF>${escapeXml(data.uf_origem || ufEmissao)}</UF>
          </veic>
          <moto>
            <xNome>${escapeXml(data.motorista_nome)}</xNome>
            <CPF>${cleanDoc(data.motorista_cpf)}</CPF>
          </moto>
        </rodo>
      </infModal>
    </infCTeNorm>
  </infCte>
</CTe>`;

  return { xml, chave_acesso };
}

/**
 * Wrapper function com nome mais semântico.
 * Valida dados obrigatórios e gera o XML.
 * Lança erro se validação falhar.
 */
export function generateCTeXML(cteData: CteXmlData): { xml: string; chave_acesso: string } {
  const errors = validateCteData(cteData);
  if (errors.length > 0) {
    const messages = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    throw new Error(`Validação falhou: ${messages}`);
  }
  return buildCteXml(cteData);
}

/**
 * Gera o XML do MDF-e no layout simplificado da SEFAZ 3.00
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
      <cUF>${getUfCodigo(data.emitente_uf)}</cUF>
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
      <CNPJ>${cleanDoc(data.emitente_cnpj)}</CNPJ>
      <IE>${escapeXml(data.emitente_ie)}</IE>
      <xNome>${escapeXml(data.emitente_razao_social)}</xNome>
    </emit>
    <infModal versaoModal="3.00">
      <rodo>
        ${data.rntrc ? `<RNTRC>${escapeXml(data.rntrc)}</RNTRC>` : ""}
        <veicTracao>
          <placa>${escapeXml(data.placa_veiculo)}</placa>
          ${data.motorista_cpf ? `<condutor><xNome>${escapeXml(data.motorista_nome)}</xNome><CPF>${cleanDoc(data.motorista_cpf)}</CPF></condutor>` : ""}
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
