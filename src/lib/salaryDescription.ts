// Compute automatic salary description based on the same rules used in
// ExpenseFormDialog. Uses the payment date (dates emissão+vencimento normally;
// here we accept a single reference date — usually data_pagamento — as both,
// since on liquidation the "emissão" and "vencimento" already refer to the
// reference period).
//
// Rules:
// - Motorista:
//     dia 16-30 → "Comissão 01 a 15 (mês atual)."
//     dia 01-15 → "Comissão 16 a (último dia) (mês anterior)."
// - Colaborador (não motorista):
//     dia 01-15 → "Folha (mês atual) ref (mês anterior)"

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function isSalaryAccountName(nome: string | null | undefined): boolean {
  const n = (nome || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return n.includes("salario") || n.includes("folha");
}

export interface SalaryDescriptionInput {
  isSalaryAccount: boolean;
  favorecidoCategory: string | null | undefined; // 'motorista' | 'colaborador' | ...
  dataEmissao: string | null | undefined; // YYYY-MM-DD
  dataVencimento: string | null | undefined; // YYYY-MM-DD
}

export function computeSalaryDescription(input: SalaryDescriptionInput): string | null {
  const { isSalaryAccount, favorecidoCategory, dataEmissao, dataVencimento } = input;
  if (!isSalaryAccount) return null;
  if (!favorecidoCategory || !dataEmissao || !dataVencimento) return null;

  const dE = parseISO(dataEmissao);
  const dV = parseISO(dataVencimento);
  const dayE = dE.getDate();
  const dayV = dV.getDate();
  const inFirstHalf = dayE >= 1 && dayE <= 15 && dayV >= 1 && dayV <= 15;
  const inSecondHalf = dayE >= 16 && dayV >= 16;

  const currentMonthName = MONTHS[dE.getMonth()];
  const prevDate = new Date(dE.getFullYear(), dE.getMonth() - 1, 1);
  const prevMonthName = MONTHS[prevDate.getMonth()];
  const prevLastDay = new Date(dE.getFullYear(), dE.getMonth(), 0).getDate();

  if (favorecidoCategory === "motorista") {
    if (inSecondHalf) return `Comissão 01 a 15 (${currentMonthName}).`;
    if (inFirstHalf) return `Comissão 16 a ${prevLastDay} (${prevMonthName}).`;
  } else if (favorecidoCategory === "colaborador") {
    if (inFirstHalf) return `Folha ${currentMonthName} ref ${prevMonthName}`;
  }
  return null;
}
