/** Situação de alienação/gravame lida da resposta salva de uma consulta ao Detran. */
export interface Alienacao { status: "alienado" | "livre"; texto: string }

const ALIEN = /aliena|gravame|financ|arrendamento|reserva de dom/i;
const LIVRE = /^(sem gravame|nenhuma informa|nada consta|sem restri|nao (ha|possui)|não (há|possui))/i;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function coletar(o: unknown, out: string[]) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { o.forEach((x) => coletar(x, out)); return; }
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (/gravame|aliena|restricao_venda|^restricoes$/i.test(k)) {
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
    const credor = alien.match(/informad[oa] por\s+(.+?)(?:\s+em\s+\d|[.;]|$)/i)?.[1];
    return { status: "alienado", texto: credor ? norm(credor) : alien };
  }
  return { status: "livre", texto: "Livre" };
}
