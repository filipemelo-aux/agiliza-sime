/**
 * Origem e destino de um CT-e (regra única do sistema).
 *
 * - Se o CT-e tiver expedidor/recebedor informados, eles são a origem e o destino.
 * - Caso contrário, usa município/UF de origem e destino (ou remetente/destinatário).
 */

export interface CteRouteSource {
  expedidor_nome?: string | null;
  expedidor_uf?: string | null;
  recebedor_nome?: string | null;
  recebedor_uf?: string | null;
  remetente_nome?: string | null;
  remetente_uf?: string | null;
  destinatario_nome?: string | null;
  destinatario_uf?: string | null;
  municipio_origem_nome?: string | null;
  uf_origem?: string | null;
  municipio_destino_nome?: string | null;
  uf_destino?: string | null;
  [key: string]: any;
}

const clean = (v?: string | null) => String(v ?? "").trim();

const join = (nome: string, uf?: string | null) => {
  const u = clean(uf);
  return u ? `${nome} - ${u}` : nome;
};

/** Origem: expedidor quando existir; senão município de origem; senão remetente. */
export function cteOrigemLabel(c: CteRouteSource, withUf = true): string {
  const exp = clean(c.expedidor_nome);
  if (exp) return withUf ? join(exp, c.expedidor_uf) : exp;

  const mun = clean(c.municipio_origem_nome);
  if (mun) return withUf ? join(mun, c.uf_origem) : mun;

  const rem = clean(c.remetente_nome);
  if (rem) return withUf ? join(rem, c.remetente_uf) : rem;

  return clean(c.uf_origem);
}

/** Destino: recebedor quando existir; senão município de destino; senão destinatário. */
export function cteDestinoLabel(c: CteRouteSource, withUf = true): string {
  const rec = clean(c.recebedor_nome);
  if (rec) return withUf ? join(rec, c.recebedor_uf) : rec;

  const mun = clean(c.municipio_destino_nome);
  if (mun) return withUf ? join(mun, c.uf_destino) : mun;

  const dest = clean(c.destinatario_nome);
  if (dest) return withUf ? join(dest, c.destinatario_uf) : dest;

  return clean(c.uf_destino);
}

/** "Origem → Destino" pronto para exibição. */
export function cteRotaLabel(c: CteRouteSource, withUf = true): string {
  const o = cteOrigemLabel(c, withUf) || "—";
  const d = cteDestinoLabel(c, withUf) || "—";
  return `${o} → ${d}`;
}
