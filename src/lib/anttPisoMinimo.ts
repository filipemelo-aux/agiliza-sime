// Piso mínimo de frete ANTT — Resolução 5.867/2020, Anexo II.
// Coeficientes vigentes: Tabela A (Lotação) da Resolução nº 6.067, de 17/07/2025.
// Ao sair nova portaria/resolução, adicione uma nova versão em ANTT_TABELAS.

export const EIXOS_ANTT = [2, 3, 4, 5, 6, 7, 9] as const;

export interface AnttTipoCarga { value: string; label: string; ccd: (number | null)[]; cc: (number | null)[] }

const A_2025_07: AnttTipoCarga[] = [
  { value: "granel_solido", label: "Granel sólido", ccd: [3.705, 4.6875, 5.3526, 6.0301, 6.7408, 7.313, 8.242], cc: [426.61, 519.67, 565.14, 615.26, 663.07, 753.88, 808.17] },
  { value: "granel_liquido", label: "Granel líquido", ccd: [3.7622, 4.7615, 5.5685, 6.1801, 6.8811, 7.4723, 8.4114], cc: [433.79, 531.46, 607.41, 639.41, 684.54, 780.59, 837.65] },
  { value: "frigorificada", label: "Frigorificada ou aquecida", ccd: [4.3393, 5.4569, 6.3427, 7.1099, 7.897, 8.7884, 9.8648], cc: [486.21, 582.22, 662.76, 713.06, 754.06, 932.67, 993.46] },
  { value: "conteinerizada", label: "Conteinerizada", ccd: [null, 4.7626, 5.2867, 5.9579, 6.6621, 7.3528, 8.1922], cc: [null, 540.34, 547.03, 595.41, 641.42, 764.84, 794.47] },
  { value: "carga_geral", label: "Carga geral", ccd: [3.6735, 4.6502, 5.3306, 6.0112, 6.7301, 7.3085, 8.268], cc: [417.95, 509.43, 559.08, 610.08, 660.12, 752.64, 815.3] },
  { value: "neogranel", label: "Neogranel", ccd: [3.3436, 4.6495, 5.3428, 6.0021, 6.723, 7.3493, 8.2608], cc: [417.95, 509.23, 562.44, 607.56, 658.16, 763.86, 813.33] },
  { value: "perigosa_granel_solido", label: "Perigosa (granel sólido)", ccd: [4.4311, 5.4135, 6.1264, 6.8039, 7.5146, 8.1156, 9.0751], cc: [565.59, 658.64, 712.46, 762.59, 810.39, 909.14, 971.8] },
  { value: "perigosa_granel_liquido", label: "Perigosa (granel líquido)", ccd: [4.5003, 5.4995, 6.3232, 6.9348, 7.6358, 8.2559, 9.2254], cc: [584.61, 682.28, 766.58, 798.58, 843.71, 947.7, 1013.12] },
  { value: "perigosa_frigorificada", label: "Perigosa (frigorificada ou aquecida)", ccd: [4.9079, 6.0255, 6.9433, 7.7105, 8.4977, 9.4266, 10.5426], cc: [588.72, 684.73, 776.13, 826.43, 867.42, 1056.35, 1128.02] },
  { value: "perigosa_conteinerizada", label: "Perigosa (conteinerizada)", ccd: [null, 5.111, 5.6828, 6.354, 7.0582, 7.7778, 8.6476], cc: [null, 631.35, 646.39, 694.77, 740.78, 872.14, 910.14] },
  { value: "perigosa_carga_geral", label: "Perigosa (carga geral)", ccd: [4.0218, 4.9986, 5.7267, 6.4073, 7.1262, 7.7334, 8.7233], cc: [508.96, 600.44, 658.44, 709.44, 759.49, 859.94, 930.97] },
  { value: "granel_pressurizada", label: "Carga granel pressurizada", ccd: [null, null, null, null, 6.3124, 7.0865, 8.7009], cc: [null, null, null, null, 692.89, 758.14, 934.37] },
];

export const ANTT_TABELAS = [
  { value: "A_2025_07", label: "Tabela A — Lotação (Res. 6.067/2025)", tipos: A_2025_07 },
];

/** Fator do retorno vazio (Res. 5.867/2020): 0,92 × CCD × distância. */
export const FATOR_RETORNO_VAZIO = 0.92;

/** Mapeia o tipo de carga do CT-e para o tipo da tabela ANTT. */
export const TIPO_CARGA_TO_ANTT: Record<string, string> = {
  granel_solido: "granel_solido", granel_liquido: "granel_liquido", frigorificada: "frigorificada",
  conteinerizada: "conteinerizada", carga_geral: "carga_geral", neogranel: "neogranel", perigosa: "perigosa_carga_geral",
};

/** Eixos ANTT mais próximos (8 eixos usa a coluna de 9; acima de 9 também). */
export function eixosAntt(n: number | null | undefined): number | null {
  if (!n) return null;
  if (n >= 8) return 9;
  return Math.max(2, n);
}

export function calcPisoMinimo(params: { tabela: string; tipo: string; eixos: number | null; distanciaKm: number; retornoVazio: boolean }) {
  const t = ANTT_TABELAS.find((x) => x.value === params.tabela)?.tipos.find((x) => x.value === params.tipo);
  const e = eixosAntt(params.eixos);
  if (!t || !e || !params.distanciaKm) return null;
  const idx = EIXOS_ANTT.indexOf(e as any);
  const ccd = t.ccd[idx];
  const cc = t.cc[idx];
  if (ccd == null || cc == null) return null;
  const ida = params.distanciaKm * ccd + cc;
  const retorno = params.retornoVazio ? FATOR_RETORNO_VAZIO * ccd * params.distanciaKm : 0;
  return { ccd, cc, ida: round2(ida), retorno: round2(retorno), total: round2(ida + retorno) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
