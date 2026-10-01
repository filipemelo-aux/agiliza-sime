// Leitura de NF-e (XML) para preencher o CT-e. Usado tanto para XML enviado
// pelo usuário quanto para o XML baixado da SEFAZ via Focus NFe.
import { supabase } from "@/integrations/supabase/client";

export interface NfeParty {
  nome: string;
  documento: string;
  ie: string;
  endereco: string;
  municipio: string;
  municipio_ibge: string;
  uf: string;
}

export interface NfeData {
  chave: string;
  numero: string;
  serie: string;
  data_emissao: string; // yyyy-mm-dd
  valor: number;
  peso_bruto: number;
  especie: string;
  produto: string;
  natureza: string;
  tipo: string; // 0 entrada, 1 saída
  quantidade: number;
  marca: string;
  cfop: string;
  ncm: string;
  valor_produtos: number;
  bc_icms: number;
  bc_icms_st: number;
  outros: number;
  emitente: NfeParty;
  destinatario: NfeParty;
}

const txt = (el: Element | null | undefined, tag: string) =>
  el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

function party(el: Element | null | undefined): NfeParty {
  const end = el?.getElementsByTagName("enderEmit")[0] || el?.getElementsByTagName("enderDest")[0];
  return {
    nome: txt(el, "xNome"),
    documento: txt(el, "CNPJ") || txt(el, "CPF"),
    ie: txt(el, "IE"),
    endereco: [txt(end, "xLgr"), txt(end, "nro"), txt(end, "xBairro")].filter(Boolean).join(", "),
    municipio: txt(end, "xMun"),
    municipio_ibge: txt(end, "cMun"),
    uf: txt(end, "UF"),
  };
}

export function parseNfeXml(xml: string): NfeData {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Arquivo XML inválido");
  const inf = doc.getElementsByTagName("infNFe")[0];
  if (!inf) throw new Error("O arquivo não é uma NF-e");
  const ide = inf.getElementsByTagName("ide")[0];
  const vol = inf.getElementsByTagName("vol")[0];
  const firstProd = inf.getElementsByTagName("prod")[0];
  const tot = inf.getElementsByTagName("ICMSTot")[0];
  const chave = (inf.getAttribute("Id") || "").replace(/\D/g, "") || txt(doc.documentElement, "chNFe");
  return {
    chave,
    numero: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    data_emissao: (txt(ide, "dhEmi") || txt(ide, "dEmi")).slice(0, 10),
    valor: Number(txt(inf.getElementsByTagName("ICMSTot")[0], "vNF")) || 0,
    peso_bruto: Number(txt(vol, "pesoB")) || Number(txt(vol, "pesoL")) || 0,
    especie: txt(vol, "esp"),
    produto: txt(firstProd, "xProd"),
    natureza: txt(ide, "natOp"),
    tipo: txt(ide, "tpNF"),
    quantidade: Number(txt(vol, "qVol")) || 0,
    marca: txt(vol, "marca"),
    cfop: txt(firstProd, "CFOP"),
    ncm: txt(firstProd, "NCM"),
    valor_produtos: Number(txt(tot, "vProd")) || 0,
    bc_icms: Number(txt(tot, "vBC")) || 0,
    bc_icms_st: Number(txt(tot, "vBCST")) || 0,
    outros: Number(txt(tot, "vOutro")) || 0,
    emitente: party(inf.getElementsByTagName("emit")[0]),
    destinatario: party(inf.getElementsByTagName("dest")[0]),
  };
}

/** Busca a NF-e na SEFAZ (Focus NFe) pela chave. Requer que a Sime conste na nota (destinatária ou transportadora). */
export async function fetchNfeFromSefaz(chave: string, cnpj: string): Promise<NfeData> {
  const { data, error } = await supabase.functions.invoke("focus-nfe", {
    body: { action: "nfe_por_chave", chave, cnpj },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  if (!data?.ok) {
    const msg = typeof data?.data === "object" ? data.data?.mensagem : null;
    throw new Error(msg || (data?.status === 404
      ? "Nota não encontrada na SEFAZ para este CNPJ. Ela pode ainda não ter sido recebida — tente pelo arquivo XML."
      : `Falha na consulta (código ${data?.status})`));
  }
  if (typeof data.data !== "string") throw new Error("A SEFAZ não retornou o XML da nota");
  return parseNfeXml(data.data);
}
