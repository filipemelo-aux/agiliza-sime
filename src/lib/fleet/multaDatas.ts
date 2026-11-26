// Separa data da infração e vencimento real do pagamento nos débitos gravados da consulta Detran.
const BR = /(\d{2})\/(\d{2})\/(\d{4})/;

/** Data/hora da ocorrência descrita no texto (“no dia 25/03/2025 às 16:53” ou prefixo “25/03/2025-UF”). */
export function dataInfracao(texto: string): string | null {
  const m = /no dia (\d{2}\/\d{2}\/\d{4})(?:\s*(?:às|as)?\s*(\d{2}:\d{2}))?/i.exec(texto) ?? /^(\d{2}\/\d{2}\/\d{4})-UF/i.exec(texto.replace(/^Auto\s+/i, ""));
  return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : null;
}

const autoDe = (d: { chave?: string; descricao?: string }) =>
  String(d.chave ?? "").replace(/^MULTA-/i, "") || (/Auto\s+(\S+)/i.exec(d.descricao ?? "")?.[1] ?? "");

function vencimentosDaResposta(response: unknown): { descricao: string; venc: string }[] {
  const out: { descricao: string; venc: string }[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const venc = String(o.data_vencimento ?? o.vencimento ?? "");
    if (BR.test(venc)) out.push({ descricao: JSON.stringify(o), venc: BR.exec(venc)![0] });
    Object.values(o).forEach(walk);
  };
  walk(response);
  return out;
}

const isoParaBR = (s: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? "")); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

export type DatasDebito = { infracao: string | null; vencimento: string | null };

/** Para multas: infração vem do texto; vencimento real vem da guia na resposta (por nº do auto). */
export function datasDebito(d: { tipo?: string; chave?: string; descricao?: string; vencimento?: string }, response: unknown): DatasDebito {
  const multa = /multa/i.test(d.tipo ?? "");
  if (!multa) return { infracao: null, vencimento: isoParaBR(d.vencimento) || null };
  const infracao = dataInfracao(d.descricao ?? "");
  const auto = autoDe(d);
  const achado = auto ? vencimentosDaResposta(response).find((x) => x.descricao.includes(auto)) : undefined;
  const vencGravado = isoParaBR(d.vencimento);
  // O vencimento gravado é descartado quando é só a data da infração.
  const vencimento = achado?.venc ?? (vencGravado && vencGravado !== infracao?.slice(0, 10) ? vencGravado : null);
  return { infracao, vencimento };
}
