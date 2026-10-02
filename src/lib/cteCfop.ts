const SAME_STATE_PREFIX = "5";
const INTERSTATE_PREFIX = "6";

export function resolveCteCfop(
  ufOrigem: string,
  ufDestino: string,
  currentCfop: string,
  tipoServico: number,
): string | null {
  const origem = ufOrigem.trim().toUpperCase();
  const destino = ufDestino.trim().toUpperCase();
  if (origem.length !== 2 || destino.length !== 2) return null;

  const prefix = origem === destino ? SAME_STATE_PREFIX : INTERSTATE_PREFIX;
  const suffix = tipoServico === 1
    ? "360"
    : /^(5|6)352$/.test(currentCfop)
      ? "352"
      : "353";

  return `${prefix}${suffix}`;
}