/**
 * Tributos de Folha — cálculo automático de descontos legais (Brasil, competência 2026).
 *
 * FONTES OFICIAIS
 *  • INSS: Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (vigência a partir de jan/2026)
 *    Tabela progressiva por faixa — empregado / doméstico / avulso.
 *      até        R$ 1.621,00  → 7,5%
 *      até        R$ 2.902,84  → 9%
 *      até        R$ 4.354,27  → 12%
 *      até        R$ 8.475,55  → 14%   (teto: contribuição máxima R$ 951,63)
 *  • IRRF: Tabela de Incidência Mensal da Receita Federal a partir de jan/2026
 *    (Lei 15.191/2025) + Tabela de Redução Mensal (Lei 15.270/2025 — "Reforma da Renda",
 *    que zera o IR até R$ 5.000,00 brutos e reduz linearmente até R$ 7.350,00).
 *    Dedução por dependente: R$ 189,59 | Desconto simplificado mensal: R$ 607,20.
 *
 * REGRAS APLICADAS
 *  • Somente colaboradores CLT sofrem INSS/IRRF em folha. PJ e freelancer não
 *    (PJ emite nota; eventual retenção é tratada fora da folha).
 *  • Base do IRRF = salário bruto − INSS − (dependentes × 189,59), comparada com
 *    o modelo do desconto simplificado (bruto − 607,20). Aplica-se a MENOR base
 *    (mais vantajosa ao trabalhador), conforme faculta a legislação.
 *  • Sobre o imposto apurado aplica-se o redutor mensal da Lei 15.270/2025.
 *  • Motoristas (rodotrem) e administrativos seguem exatamente as mesmas regras
 *    legais — não há tabela específica por função. Diárias/ajuda de custo e
 *    verbas indenizatórias não integram a base e por isso não entram aqui.
 */

export const INSS_FAIXAS_2026 = [
  { ate: 1621.0, aliquota: 0.075 },
  { ate: 2902.84, aliquota: 0.09 },
  { ate: 4354.27, aliquota: 0.12 },
  { ate: 8475.55, aliquota: 0.14 },
];

export const INSS_TETO_SALARIO_2026 = 8475.55;

export const IRRF_FAIXAS_2026 = [
  { ate: 2428.8, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
];

export const IRRF_DEDUCAO_DEPENDENTE_2026 = 189.59;
export const IRRF_DESCONTO_SIMPLIFICADO_2026 = 607.2;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** INSS progressivo por faixas (empregado CLT). */
export function calcularINSS(salarioBruto: number): number {
  if (!salarioBruto || salarioBruto <= 0) return 0;
  const base = Math.min(salarioBruto, INSS_TETO_SALARIO_2026);
  let anterior = 0;
  let total = 0;
  for (const faixa of INSS_FAIXAS_2026) {
    if (base > anterior) {
      const trecho = Math.min(base, faixa.ate) - anterior;
      total += trecho * faixa.aliquota;
    }
    anterior = faixa.ate;
  }
  return round2(total);
}

/** Redutor mensal do IR — Lei 15.270/2025 (Reforma da Renda). */
export function calcularRedutorIR(rendimentoTributavel: number, impostoDevido: number): number {
  if (rendimentoTributavel <= 5000) return impostoDevido;
  if (rendimentoTributavel >= 7350) return 0;
  const reducao = 978.62 - 0.133145 * rendimentoTributavel;
  return Math.max(0, Math.min(impostoDevido, round2(reducao)));
}

export type IRRFDetalhe = {
  base: number;
  aliquota: number;
  impostoBruto: number;
  redutor: number;
  imposto: number;
  modelo: "completo" | "simplificado";
};

/** IRRF mensal com escolha automática entre desconto legal e simplificado + redutor. */
export function calcularIRRF(
  salarioBruto: number,
  inss: number,
  dependentes = 0
): IRRFDetalhe {
  const baseCompleta = Math.max(0, salarioBruto - inss - dependentes * IRRF_DEDUCAO_DEPENDENTE_2026);
  const baseSimplificada = Math.max(0, salarioBruto - IRRF_DESCONTO_SIMPLIFICADO_2026);
  const modelo: IRRFDetalhe["modelo"] =
    baseSimplificada < baseCompleta ? "simplificado" : "completo";
  const base = round2(Math.min(baseCompleta, baseSimplificada));

  const faixa = IRRF_FAIXAS_2026.find((f) => base <= f.ate)!;
  const impostoBruto = round2(Math.max(0, base * faixa.aliquota - faixa.deducao));
  const comRedutor = calcularRedutorIR(salarioBruto, impostoBruto);
  const redutor = round2(impostoBruto - comRedutor);

  return {
    base,
    aliquota: faixa.aliquota,
    impostoBruto,
    redutor,
    imposto: round2(comRedutor),
    modelo,
  };
}

export type DescontoLegalCalculado = {
  colaborador_id: string;
  nome: string;
  regime: string;
  salarioBruto: number;
  dependentes: number;
  inss: number;
  irrf: number;
  irrfDetalhe: IRRFDetalhe;
  liquido: number;
  motivoIsencao?: string;
};

/** Calcula INSS + IRRF de um colaborador para a competência. */
export function calcularDescontosLegais(params: {
  colaborador_id: string;
  nome: string;
  salarioBruto: number | null;
  regime?: string | null;
  dependentes?: number;
}): DescontoLegalCalculado {
  const { colaborador_id, nome } = params;
  const dependentes = params.dependentes ?? 0;
  const salarioBruto = Number(params.salarioBruto || 0);
  const regime = params.regime || "clt";

  const zero: IRRFDetalhe = {
    base: 0,
    aliquota: 0,
    impostoBruto: 0,
    redutor: 0,
    imposto: 0,
    modelo: "completo",
  };

  if (regime !== "clt") {
    return {
      colaborador_id,
      nome,
      regime,
      salarioBruto,
      dependentes,
      inss: 0,
      irrf: 0,
      irrfDetalhe: zero,
      liquido: salarioBruto,
      motivoIsencao: "Regime não CLT — sem retenção em folha",
    };
  }
  if (salarioBruto <= 0) {
    return {
      colaborador_id,
      nome,
      regime,
      salarioBruto,
      dependentes,
      inss: 0,
      irrf: 0,
      irrfDetalhe: zero,
      liquido: 0,
      motivoIsencao: "Salário não cadastrado",
    };
  }

  const inss = calcularINSS(salarioBruto);
  const irrfDetalhe = calcularIRRF(salarioBruto, inss, dependentes);
  return {
    colaborador_id,
    nome,
    regime,
    salarioBruto,
    dependentes,
    inss,
    irrf: irrfDetalhe.imposto,
    irrfDetalhe,
    liquido: round2(salarioBruto - inss - irrfDetalhe.imposto),
  };
}
