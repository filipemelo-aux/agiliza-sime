/** Situação de alienação/gravame lida da resposta salva de uma consulta ao Detran. */
export interface Alienacao { status: "alienado" | "intencao_venda" | "livre"; texto: string }

const ALIEN = /aliena|gravame|financ|arrendamento|reserva de dom/i;
const LIVRE = /^(sem gravame|nenhuma informa|nada consta|sem restri|nao (ha|possui)|não (há|possui))/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function coletar(o: unknown, out: string[]) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { o.forEach((x) => coletar(x, out)); return; }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (/gravame|aliena|restricao_venda|^restricoes$|impediment/i.test(k)) {
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) if (typeof x === "string" && x.trim()) out.push(norm(x));
    }
    if (v && typeof v === "object") coletar(v, out);
  }
}

/** null = a consulta não trouxe informação de gravame (ex.: SEFAZ-GO). */
export function extrairAlienacao(response: unknown): Alienacao | null {
  const textos: string[] = [];
  coletar(response, textos);
  if (!textos.length) return null;
  const alien = textos.find((t) => ALIEN.test(t) && !LIVRE.test(t));
  if (alien) {
    const credor = alien.match(/informad[oa] por\s+(.+?)(?:\s+em\s+\d|[.;]|$)/i)?.[1]
      ?? alien.match(/em favor d[eoa]\s+(.+?)(?:\s*\(|[.;]|$)/i)?.[1];
    return { status: "alienado", texto: credor ? norm(credor) : alien };
  }
  const venda = textos.find((t) => /inten[cç][aã]o\s+(de\s+)?venda/i.test(t));
  if (venda) {
    const para = venda.match(/venda\s+para\s+(.+?)(?:\s+registrad|[.;]|$)/i)?.[1];
    return { status: "intencao_venda", texto: para ? norm(para) : "" };
  }
  return { status: "livre", texto: "Livre" };
}
