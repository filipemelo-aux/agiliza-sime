/**
 * NF-e / NFS-e XML Parser
 * Extracts invoice data from XML strings for expense import
 */

export interface NfeItem {
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  /** Custo final do item = vProd + IPI + ST + Frete + Seguro + Outras - Desconto */
  valor_total: number;
  /** Valor bruto do produto (vProd), sem impostos/acréscimos */
  valor_produto?: number;
  /** Impostos e acréscimos somados ao item (líquido de desconto) */
  valor_acrescimos?: number;
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

function getTag(parent: Element, tagName: string): Element | null {
  // Try namespace-aware search first (handles xmlns), then fallback
  return parent.getElementsByTagNameNS("*", tagName)[0] || parent.getElementsByTagName(tagName)[0] || null;
}

function getTextContent(parent: Element, tagName: string): string {
  const el = getTag(parent, tagName);
  return el?.textContent?.trim() || "";
}

function getTags(parent: Element, tagName: string): HTMLCollectionOf<Element> | Element[] {
  const ns = parent.getElementsByTagNameNS("*", tagName);
  if (ns.length > 0) return ns;
  return parent.getElementsByTagName(tagName);
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

  // Try NF-e format first (namespace-aware)
  const root = doc.documentElement;
  const emit = getTag(root, "emit");
  const ide = getTag(root, "ide");
  const infProt = getTag(root, "infProt");
  const icmsTot = getTag(root, "ICMSTot");

  const fornecedor_nome = emit ? (getTextContent(emit, "xFant") || getTextContent(emit, "xNome")) : "";
  const fornecedor_cnpj = emit ? (getTextContent(emit, "CNPJ") || getTextContent(emit, "CPF")) : "";
  const numero_nota = ide ? getTextContent(ide, "nNF") : "";

  // Extract full emitente data
  const enderEmit = emit ? getTag(emit, "enderEmit") : null;
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
  const infNFe = getTag(root, "infNFe");
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

  // Total value — use vNF (total da nota fiscal, inclui frete/seguro/impostos)
  let valor_total = 0;
  if (icmsTot) {
    valor_total = parseFloat(getTextContent(icmsTot, "vNF")) || 0;
  }
  // Fallback: try vNFTot (NF-e 4.01+) or vNF in total group
  if (!valor_total) {
    const totalEl = getTag(root, "total");
    if (totalEl) {
      valor_total = parseFloat(getTextContent(totalEl, "vNFTot")) || parseFloat(getTextContent(totalEl, "vNF")) || 0;
    }
  }

  // Items (det elements) — namespace-aware
  const detElements = getTags(root, "det");
  const itens: NfeItem[] = [];

  const num = (parent: Element | null, tag: string) =>
    parent ? parseFloat(getTextContent(parent, tag)) || 0 : 0;

  for (let i = 0; i < detElements.length; i++) {
    const det = detElements[i];
    const prod = getTag(det, "prod");
    if (!prod) continue;

    const imposto = getTag(det, "imposto");
    const vProd = num(prod, "vProd");
    // Acréscimos que compõem o total da nota (vNF)
    const vFrete = num(prod, "vFrete");
    const vSeg = num(prod, "vSeg");
    const vOutro = num(prod, "vOutro");
    const vDesc = num(prod, "vDesc");
    const vIPI = imposto ? num(getTag(imposto, "IPI"), "vIPI") : 0;
    const vST = imposto ? num(getTag(imposto, "ICMS"), "vICMSST") + num(getTag(imposto, "ICMS"), "vFCPST") : 0;

    const acrescimos = vIPI + vST + vFrete + vSeg + vOutro - vDesc;
    const custoFinal = Number((vProd + acrescimos).toFixed(2));
    const qtd = parseFloat(getTextContent(prod, "qCom")) || 1;

    itens.push({
      descricao: getTextContent(prod, "xProd"),
      quantidade: qtd,
      valor_unitario: qtd ? Number((custoFinal / qtd).toFixed(4)) : custoFinal,
      valor_total: custoFinal,
      valor_produto: vProd,
      valor_acrescimos: Number(acrescimos.toFixed(2)),
      ncm: getTextContent(prod, "NCM"),
      cfop: getTextContent(prod, "CFOP"),
      unidade: getTextContent(prod, "uCom"),
    });
  }

  // Ajuste residual de centavos: garante que a soma dos itens bata com vNF
  if (itens.length > 0 && valor_total > 0) {
    const soma = itens.reduce((s, it) => s + it.valor_total, 0);
    const diff = Number((valor_total - soma).toFixed(2));
    if (Math.abs(diff) > 0 && Math.abs(diff) <= Math.max(0.05, itens.length * 0.02)) {
      const last = itens[itens.length - 1];
      last.valor_total = Number((last.valor_total + diff).toFixed(2));
      last.valor_acrescimos = Number(((last.valor_acrescimos || 0) + diff).toFixed(2));
      last.valor_unitario = last.quantidade ? Number((last.valor_total / last.quantidade).toFixed(4)) : last.valor_total;
    }
  }

  // If no items found, try NFS-e format (simplified)
  if (itens.length === 0) {
    const servico = getTag(root, "Servico") || getTag(root, "InfDeclaracaoPrestacaoServico");
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
  const dupElements = getTags(root, "dup");
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
