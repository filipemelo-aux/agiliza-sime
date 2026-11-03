/**
 * Define qual CT-e será clonado a partir da seleção da listagem.
 *
 * Regras:
 * - nada selecionado -> nada pode ser clonado;
 * - um selecionado -> ele é o original (vale para Produção e Serviço);
 * - vários selecionados -> o último clicado, mantendo o botão disponível em vez de apagá-lo.
 */
export function resolveCloneSource<T extends { id: string }>(
  rows: T[],
  selected: Set<string>,
  lastPickedId: string | null,
): T | null {
  const arr = rows.filter((r) => selected.has(r.id));
  if (arr.length === 0) return null;
  return arr.find((r) => r.id === lastPickedId) ?? arr[arr.length - 1];
}
