/**
 * NF-e / NFS-e XML Parser
 * Extracts invoice data from XML strings for expense import
 */

export interface NfeItem {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  ncm: string;
  cfop: string;
  unidade: string;
}

export interface NfeDuplicata {
  numero: string;
  vencimento: string;
  valor: number;
}

export interface NfeEmitente {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
}

export interface NfeData {
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  emitente: NfeEmitente;
  numero_nota: string;
  chave_nfe: string;
  data_emissao: string;
  valor_total: number;
  itens: NfeItem[];
  duplicatas: NfeDuplicata[];
  tipo_despesa_sugerido: string;
  xml_original: string;
}

function getTextContent(parent: Element, tagName: string): string {
  const el = parent.getElementsByTagName(tagName)[0];
  return el?.textContent?.trim() || "";
}

function suggestExpenseType(items: NfeItem[], fornecedor: string): string {
  const allText = items.map(i => i.descricao).join(" ").toLowerCase() + " " + fornecedor.toLowerCase();

  if (/diesel|gasolina|etanol|combust|gnv|arla|lubrificante/.test(allText)) return "combustivel";
  if (/pneu|filtro|pastilha|freio|óleo|motor|peça|manutenç|retifica|oficina/.test(allText)) return "manutencao";
  if (/pedágio|pedagio|sem parar|conectcar|move mais/.test(allText)) return "pedagio";
  if (/imposto|tributo|taxa|icms|pis|cofins|irpj|csll/.test(allText)) return "imposto";
  if (/frete|transporte|carreto/.test(allText)) return "frete_terceiro";
  if (/escritório|papel|toner|impressora|material|limpeza/.test(allText)) return "administrativo";

  return "outros";
}

export function parseNfeXml(xmlString: string): NfeData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML inválido. Verifique o arquivo.");

  // Try NF-e format first
  const emit = doc.getElementsByTagName("emit")[0];
  const ide = doc.getElementsByTagName("ide")[0];
  const infProt = doc.getElementsByTagName("infProt")[0];
  const total = doc.getElementsByTagName("ICMSTot")[0] || doc.getElementsByTagName("vNF")[0]?.parentElement;

  const fornecedor_nome = emit ? (getTextContent(emit, "xFant") || getTextContent(emit, "xNome")) : "";
  const fornecedor_cnpj = emit ? (getTextContent(emit, "CNPJ") || getTextContent(emit, "CPF")) : "";
  const numero_nota = ide ? getTextContent(ide, "nNF") : "";

  // Extract full emitente data
  const enderEmit = emit ? emit.getElementsByTagName("enderEmit")[0] : null;
  const emitente: NfeEmitente = {
    cnpj: fornecedor_cnpj,
    razao_social: emit ? getTextContent(emit, "xNome") : "",
    nome_fantasia: emit ? getTextContent(emit, "xFant") : "",
    inscricao_estadual: emit ? getTextContent(emit, "IE") : "",
    logradouro: enderEmit ? getTextContent(enderEmit, "xLgr") : "",
    numero: enderEmit ? getTextContent(enderEmit, "nro") : "",
    complemento: enderEmit ? getTextContent(enderEmit, "xCpl") : "",
    bairro: enderEmit ? getTextContent(enderEmit, "xBairro") : "",
    municipio: enderEmit ? getTextContent(enderEmit, "xMun") : "",
    uf: enderEmit ? getTextContent(enderEmit, "UF") : "",
    cep: enderEmit ? getTextContent(enderEmit, "CEP") : "",
  };

  // Extract chave from infNFe or protNFe
  let chave_nfe = "";
  const infNFe = doc.getElementsByTagName("infNFe")[0];
  if (infNFe) {
    const id = infNFe.getAttribute("Id") || "";
    chave_nfe = id.replace(/^NFe/, "");
  }
  if (!chave_nfe && infProt) {
    chave_nfe = getTextContent(infProt, "chNFe");
  }

  // Date
  let data_emissao = "";
  if (ide) {
    const dhEmi = getTextContent(ide, "dhEmi") || getTextContent(ide, "dEmi");
    if (dhEmi) data_emissao = dhEmi.substring(0, 10);
  }

  // Total value
  let valor_total = 0;
  if (total) {
    valor_total = parseFloat(getTextContent(total, "vNF")) || 0;
  }

  // Items (det elements)
  const detElements = doc.getElementsByTagName("det");
  const itens: NfeItem[] = [];

  for (let i = 0; i < detElements.length; i++) {
    const det = detElements[i];
    const prod = det.getElementsByTagName("prod")[0];
    if (!prod) continue;

    itens.push({
      descricao: getTextContent(prod, "xProd"),
      quantidade: parseFloat(getTextContent(prod, "qCom")) || 1,
      valor_unitario: parseFloat(getTextContent(prod, "vUnCom")) || 0,
      valor_total: parseFloat(getTextContent(prod, "vProd")) || 0,
      ncm: getTextContent(prod, "NCM"),
      cfop: getTextContent(prod, "CFOP"),
      unidade: getTextContent(prod, "uCom"),
    });
  }

  // If no items found, try NFS-e format (simplified)
  if (itens.length === 0) {
    const servico = doc.getElementsByTagName("Servico")[0] || doc.getElementsByTagName("InfDeclaracaoPrestacaoServico")[0];
    if (servico) {
      const descServ = getTextContent(servico, "Discriminacao") || getTextContent(servico, "xServ") || "Serviço";
      const vServ = parseFloat(getTextContent(servico, "ValorServicos") || getTextContent(servico, "vServ")) || valor_total;
      itens.push({
        descricao: descServ,
        quantidade: 1,
        valor_unitario: vServ,
        valor_total: vServ,
        ncm: "",
        cfop: "",
        unidade: "SV",
      });
    }
  }

  // Parse duplicatas (cobr/dup)
  const duplicatas: NfeDuplicata[] = [];
  const dupElements = doc.getElementsByTagName("dup");
  for (let i = 0; i < dupElements.length; i++) {
    const dup = dupElements[i];
    duplicatas.push({
      numero: getTextContent(dup, "nDup"),
      vencimento: getTextContent(dup, "dVenc"),
      valor: parseFloat(getTextContent(dup, "vDup")) || 0,
    });
  }

  return {
    fornecedor_nome,
    fornecedor_cnpj,
    emitente,
    numero_nota,
    chave_nfe,
    data_emissao,
    valor_total,
    itens,
    duplicatas,
    tipo_despesa_sugerido: suggestExpenseType(itens, fornecedor_nome),
    xml_original: xmlString,
  };
}
