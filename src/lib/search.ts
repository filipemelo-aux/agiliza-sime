/** Busca sem acento: "redencao" encontra "Redenção" e vice-versa. */
export const foldText = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const matchesText = (value: unknown, term: unknown) => foldText(value).includes(foldText(term));

/**
 * Padrão para ILIKE no banco que ignora acentos: troca vogais e "c" por "_"
 * (curinga de 1 caractere), assim "redencao" casa com "Redenção".
 */
export const accentLike = (term: string) =>
  foldText(term).replace(/[%_]/g, "").replace(/[aeiouc]/g, "_");
