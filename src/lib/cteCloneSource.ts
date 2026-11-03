/**
 * Define qual CT-e será clonado a partir da seleção da listagem.
 *
 * Regras (iguais para os dois talões):
 * - nada selecionado -> nada pode ser clonado;
 * - exatamente um selecionado -> ele é o original (vale para Produção e Serviço);
 * - mais de um selecionado -> nada é clonado; o botão Clonar fica desativado
 *   até que a seleção tenha um único CT-e.
 */
export function resolveCloneSource<T extends { id: string }>(
  rows: T[],
  selected: Set<string>,
): T | null {
  const arr = rows.filter((r) => selected.has(r.id));
  return arr.length === 1 ? arr[0] : null;
}
