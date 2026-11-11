/** Data (yyyy-mm-dd) do 5º dia útil (seg–sex) do mês seguinte ao mês de `fim`. */
export function quintoDiaUtilMesSeguinte(fim: string): string {
  const [y, m] = fim.slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1, 12));
  let uteis = 0;
  for (;;) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && ++uteis === 5) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Período de mês completo (fechamento Administrativo/Operacional). */
export function isPeriodoMensal(inicio: string, fim: string): boolean {
  const [y, m, di] = inicio.split("-").map(Number);
  if (di !== 1) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return fim.slice(0, 10) === `${inicio.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

/** Último dia (inclusive) em que um vale/adiantamento ainda entra no fechamento: antes do 5º dia útil seguinte para mensais. */
export function limiteValesAcerto(inicio: string, fim: string): string {
  if (!isPeriodoMensal(inicio, fim)) return fim;
  const d = new Date(`${quintoDiaUtilMesSeguinte(fim)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
