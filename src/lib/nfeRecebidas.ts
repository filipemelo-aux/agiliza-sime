import { supabase } from "@/integrations/supabase/client";

export type NfeAtor = "destinatario" | "transportadora";

export interface NfeRecebida {
  id: string;
  establishment_id: string | null;
  chave: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  emitente_nome: string | null;
  emitente_cnpj: string | null;
  destinatario_cnpj: string | null;
  transportadora_cnpj: string | null;
  valor: number | null;
  situacao: string | null;
  ator: NfeAtor;
  xml: string | null;
  expense_id: string | null;
  cte_id: string | null;
  versao: number | null;
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function invokeFocus(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("focus-nfe", { body });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  if (!data?.ok) {
    const msg = typeof data?.data === "object" ? data.data?.mensagem : null;
    throw new Error(msg || `Falha na consulta (código ${data?.status})`);
  }
  return data.data;
}

/** Extrai do XML os dados que definem o ator (destinatário/transportadora). */
export function readNfeXmlInfo(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const q = (sel: string) => doc.getElementsByTagName(sel)[0];
  const txt = (parent: Element | undefined, tag: string) => parent?.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
  const ide = q("ide");
  const dest = q("dest");
  const transp = q("transporta");
  return {
    numero: txt(ide, "nNF"),
    serie: txt(ide, "serie"),
    destinatario_cnpj: digits(txt(dest, "CNPJ") || txt(dest, "CPF")),
    transportadora_cnpj: digits(txt(transp, "CNPJ") || txt(transp, "CPF")),
  };
}

/**
 * Sincroniza as notas recebidas na SEFAZ (consulta incremental por versão) para cada
 * estabelecimento e baixa o XML das notas novas para definir o ator.
 */
export async function syncNfesRecebidas(establishments: { id: string; cnpj: string }[]) {
  let novas = 0;
  const erros: string[] = [];
  for (const est of establishments) {
    const cnpj = digits(est.cnpj);
    if (cnpj.length !== 14) continue;
    const { data: last } = await supabase
      .from("nfes_recebidas" as any)
      .select("versao")
      .eq("establishment_id", est.id)
      .order("versao", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    let versao: number | undefined = (last as any)?.versao ?? undefined;
    for (let page = 0; page < 30; page++) {
      let list: any;
      try { list = await invokeFocus({ action: "nfes_recebidas", cnpj, ...(versao ? { versao } : {}) }); }
      catch (e: any) { erros.push(`${cnpj}: ${e.message}`); break; }
      const items: any[] = Array.isArray(list) ? list : [];
      if (!items.length) break;
      // A SEFAZ devolve a mesma chave mais de uma vez (resumo e nota completa): mantém a versão mais recente.
      const byKey = new Map<string, any>();
      for (const i of items) {
        const k = digits(i.chave_nfe);
        if (k.length !== 44) continue;
        const prev = byKey.get(k);
        if (!prev || Number(i.versao) > Number(prev.versao)) byKey.set(k, i);
      }
      const rows = [...byKey.entries()].map(([k, i]) => ({
        establishment_id: est.id,
        chave: k,
        data_emissao: i.data_emissao || null,
        emitente_nome: i.nome_emitente || null,
        emitente_cnpj: digits(i.documento_emitente) || null,
        destinatario_cnpj: digits(i.cnpj_destinatario || i.cpf_destinatario) || null,
        ator: digits(i.cnpj_destinatario) === cnpj ? "destinatario" : "transportadora",
        valor: Number(i.valor_total) || 0,
        situacao: String(i.situacao || "autorizada").toLowerCase(),
        numero: String(Number(k.slice(25, 34))),
        serie: String(Number(k.slice(22, 25))),
        versao: Number(i.versao) || null,
      }));
      if (rows.length) {
        const { error } = await supabase.from("nfes_recebidas" as any).upsert(rows as any, { onConflict: "tenant_id,chave" });
        if (error) throw new Error(error.message);
        novas += rows.length;
      }
      const maxV = Math.max(...items.map((i) => Number(i.versao) || 0));
      if (!maxV || maxV === versao || items.length < 50) break;
      versao = maxV;
    }

  }
  if (!novas && erros.length === establishments.length && erros.length) throw new Error(erros[0]);
  return novas;
}

/** Baixa em segundo plano o XML das notas ainda sem XML (leitura; não consome o plano). */
export async function fillMissingNfeXml(establishments: { id: string; cnpj: string }[]) {
  for (const est of establishments) {
    const cnpj = digits(est.cnpj);
    if (cnpj.length !== 14) continue;
    // Baixa XML das notas ainda sem XML (leitura; não consome autorizações do plano).
    const { data: pend } = await supabase
      .from("nfes_recebidas" as any)
      .select("id, chave")
      .eq("establishment_id", est.id)
      .is("xml", null)
      .limit(40);
    const pendList = (pend as any[]) || [];
    await Promise.all([0, 1, 2, 3, 4].map(async (w) => { for (let idx = w; idx < pendList.length; idx += 5) { const p = pendList[idx];
      try {
        const xml = await invokeFocus({ action: "nfe_por_chave", chave: p.chave, cnpj });
        if (typeof xml !== "string") continue;
        const info = readNfeXmlInfo(xml);
        const ator: NfeAtor = info.destinatario_cnpj === cnpj
          ? "destinatario"
          : info.transportadora_cnpj === cnpj ? "transportadora" : "destinatario";
        if (!info.destinatario_cnpj) delete (info as any).destinatario_cnpj;
        await supabase.from("nfes_recebidas" as any).update({ xml, ator, ...info } as any).eq("id", p.id);
      } catch {
        /* nota sem XML completo disponível ainda */
      }
    } }));
  }
}

export async function ensureNfeXml(n: NfeRecebida, cnpj: string): Promise<string> {
  if (n.xml) return n.xml;
  const xml = await invokeFocus({ action: "nfe_por_chave", chave: n.chave, cnpj: digits(cnpj) });
  if (typeof xml !== "string") throw new Error("A SEFAZ ainda não disponibilizou o XML completo desta nota.");
  await supabase.from("nfes_recebidas" as any).update({ xml, ...readNfeXmlInfo(xml) } as any).eq("id", n.id);
  return xml;
}

export async function fetchCtesRecebidas(cnpj: string) {
  const list = await invokeFocus({ action: "ctes_recebidas", cnpj: digits(cnpj) });
  return (Array.isArray(list) ? list : []) as any[];
}

export async function fetchCteRecebidoXml(chave: string, cnpj: string) {
  const xml = await invokeFocus({ action: "cte_por_chave", chave, cnpj: digits(cnpj) });
  return typeof xml === "string" ? xml : null;
}

export async function fetchNfePdf(chave: string, cnpj: string): Promise<Blob> {
  const data = await invokeFocus({ action: "nfe_pdf_por_chave", chave, cnpj: digits(cnpj) });
  const b64 = data?.pdf_base64;
  if (!b64) throw new Error("DANFE indisponível");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: "application/pdf" });
}
