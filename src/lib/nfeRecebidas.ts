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
    const versao = (last as any)?.versao ?? undefined;
    const list = await invokeFocus({ action: "nfes_recebidas", cnpj, ...(versao ? { versao } : {}) });
    const items: any[] = Array.isArray(list) ? list : [];
    if (items.length) {
      const rows = items
        .filter((i) => digits(i.chave_nfe).length === 44)
        .map((i) => ({
          establishment_id: est.id,
          chave: digits(i.chave_nfe),
          data_emissao: i.data_emissao || null,
          emitente_nome: i.nome_emitente || null,
          emitente_cnpj: digits(i.documento_emitente) || null,
          valor: Number(i.valor_total) || 0,
          situacao: String(i.situacao || "autorizada").toLowerCase(),
          numero: digits(i.chave_nfe).length === 44 ? String(Number(digits(i.chave_nfe).slice(25, 34))) : null,
          serie: digits(i.chave_nfe).length === 44 ? String(Number(digits(i.chave_nfe).slice(22, 25))) : null,
          versao: Number(i.versao) || null,
        }));
      const { error } = await supabase.from("nfes_recebidas" as any).upsert(rows as any, { onConflict: "tenant_id,chave", ignoreDuplicates: false });
      if (error) throw new Error(error.message);
      novas += rows.length;
    }

    // Baixa XML das notas ainda sem XML (leitura; não consome autorizações do plano).
    const { data: pend } = await supabase
      .from("nfes_recebidas" as any)
      .select("id, chave")
      .eq("establishment_id", est.id)
      .is("xml", null)
      .limit(40);
    for (const p of (pend as any[]) || []) {
      try {
        const xml = await invokeFocus({ action: "nfe_por_chave", chave: p.chave, cnpj });
        if (typeof xml !== "string") continue;
        const info = readNfeXmlInfo(xml);
        const ator: NfeAtor = info.destinatario_cnpj === cnpj
          ? "destinatario"
          : info.transportadora_cnpj === cnpj ? "transportadora" : "destinatario";
        await supabase.from("nfes_recebidas" as any).update({ xml, ator, ...info } as any).eq("id", p.id);
      } catch {
        /* nota sem XML completo disponível ainda */
      }
    }
  }
  return novas;
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
