// Números de NF-e referenciados por um CT-e, para listagens e impressões.
// Fonte: detalhe salvo (nfe_detalhes) e, quando falta o número, a própria chave
// de acesso — a posição 26 a 34 da chave é o número da NF-e.

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Número da NF-e embutido na chave de acesso (44 dígitos). */
export function numeroNfeDaChave(chave: unknown): string {
  const k = digits(chave);
  return k.length === 44 ? k.slice(25, 34).replace(/^0+/, "") : "";
}

export function cteNfeNumeros(cte: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const n = String(v ?? "").replace(/^0+/, "").trim();
    if (n && !out.includes(n)) out.push(n);
  };
  if (!cte) return out;

  const details = Array.isArray(cte.nfe_detalhes) ? (cte.nfe_detalhes as any[]) : [];
  details.forEach((d) => add(d?.numero || numeroNfeDaChave(d?.chave)));

  const keys = Array.isArray(cte.chaves_nfe_ref) ? (cte.chaves_nfe_ref as unknown[]) : [];
  keys.forEach((k) => add(numeroNfeDaChave(k)));

  return out;
}

/** Converte o texto digitado ("123, 456") em lista de números normalizados. */
export function parseNfeNumeros(texto: string): string[] {
  const out: string[] = [];
  String(texto || "").split(/[,;\s]+/).forEach((p) => {
    const n = digits(p).replace(/^0+/, "");
    if (n && !out.includes(n)) out.push(n);
  });
  return out;
}

/**
 * Aplica os números informados no formulário aos documentos do CT-e,
 * preservando chaves/detalhes já existentes dos números mantidos.
 */
export function aplicarNfeNumeros(
  base: { nfe_detalhes?: unknown; chaves_nfe_ref?: unknown },
  numeros: string[],
): { nfe_detalhes: any[]; chaves_nfe_ref: string[] } {
  const keep = new Set(numeros);
  const details = (Array.isArray(base.nfe_detalhes) ? (base.nfe_detalhes as any[]) : [])
    .filter((d) => keep.has(String(d?.numero || numeroNfeDaChave(d?.chave)).replace(/^0+/, "")));
  const keys = (Array.isArray(base.chaves_nfe_ref) ? (base.chaves_nfe_ref as string[]) : [])
    .filter((k) => keep.has(numeroNfeDaChave(k)));
  const covered = new Set(cteNfeNumeros({ nfe_detalhes: details, chaves_nfe_ref: keys }));
  numeros.forEach((n) => { if (!covered.has(n)) details.push({ numero: n }); });
  return { nfe_detalhes: details, chaves_nfe_ref: keys };
}
