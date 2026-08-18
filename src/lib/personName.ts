/**
 * Padronização global do nome exibido de uma pessoa/empresa (profiles).
 * Ordem: Razão Social → Nome/Full name → Nome Fantasia.
 * Usar em TODA busca/exibição de fornecedor, favorecido, cliente etc.
 */
export interface PersonNameSource {
  full_name?: string | null;
  razao_social?: string | null;
  nome_fantasia?: string | null;
}

export function personDisplayName(p: PersonNameSource | null | undefined, fallback = ""): string {
  if (!p) return fallback;
  return (p.razao_social || p.full_name || p.nome_fantasia || fallback || "").trim();
}

/** Nome secundário (fantasia) quando diferente do principal — útil para exibir como subtítulo. */
export function personSecondaryName(p: PersonNameSource | null | undefined): string | null {
  if (!p) return null;
  const main = personDisplayName(p);
  const fantasia = (p.nome_fantasia || "").trim();
  return fantasia && fantasia !== main ? fantasia : null;
}
