const SAME_STATE_PREFIX = "5";
const INTERSTATE_PREFIX = "6";

/**
 * CFOP do CT-e pela rota. Quando a prestação começa em UF diferente da UF do emitente,
 * a SEFAZ exige 5932/6932 (prestação iniciada em outra UF), independente da finalidade.
 */
export function resolveCteCfop(
  ufOrigem: string,
  ufDestino: string,
  currentCfop: string,
  tipoServico: number,
  ufEmitente?: string | null,
): string | null {
  const origem = ufOrigem.trim().toUpperCase();
  const destino = ufDestino.trim().toUpperCase();
  if (origem.length !== 2 || destino.length !== 2) return null;

  const prefix = origem === destino ? SAME_STATE_PREFIX : INTERSTATE_PREFIX;
  const emitente = (ufEmitente ?? "").trim().toUpperCase();
  if (emitente.length === 2 && emitente !== origem) return `${prefix}932`;
  const suffix = tipoServico === 1
    ? "360"
    : /^(5|6)352$/.test(currentCfop)
      ? "352"
      : "353";

  return `${prefix}${suffix}`;
}
