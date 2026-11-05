export interface ResumoFolhaLinha {
  nome: string;
  tipo: string;
  inicio: string;
  fim: string;
  vencimento: string;
  situacao: string;
  chavePix?: ChavePixResumo;
  base: number;
  comissoes: number;
  reembolsos: number;
  adiantamentos: number;
  descontos: number;
  liquido: number;
}

const campos = ["base", "comissoes", "reembolsos", "adiantamentos", "descontos", "liquido"] as const;

export interface ChavePixResumo {
  /** chave limpa, sem espaços, traços ou pontos, pronta para copiar e colar */
  valor: string;
  /** CPF, CNPJ, Celular, E-mail ou Chave */
  tipo: string;
}

/** Limpa a chave Pix (sem espaços/traços/pontos) e identifica o tipo para exibição. */
export function formatarChavePix(chave: string): ChavePixResumo {
  const bruta = chave.trim();
  if (bruta.includes("@")) return { valor: bruta.replace(/\s+/g, ""), tipo: "E-mail" };
  const digitos = bruta.replace(/[\s.\-/()]+/g, "");
  if (/^\d{14}$/.test(digitos)) return { valor: digitos, tipo: "CNPJ" };
  if (/^\d{11}$/.test(digitos)) return { valor: digitos, tipo: digitos[2] === "9" ? "Celular" : "CPF" };
  if (/^\d{10}$/.test(digitos)) return { valor: digitos, tipo: "Telefone" };
  return { valor: digitos || bruta.replace(/\s+/g, ""), tipo: "Chave" };
}

/** Dados cadastrais de pagamento somente para fechamentos ainda a pagar. */
export function chavePixResumoFolha(chave: string | null | undefined, pago: boolean, situacao: string): ChavePixResumo | undefined {
  if (pago || situacao === "cancelada" || situacao === "paga") return undefined;
  const limpa = chave?.trim();
  return limpa ? formatarChavePix(limpa) : undefined;
}

/** Soma os valores já fechados, sem recalcular salário ou movimentos originais. */
export function totalizarResumoFolha(linhas: ResumoFolhaLinha[]) {
  const centavos = { base: 0, comissoes: 0, reembolsos: 0, adiantamentos: 0, descontos: 0, liquido: 0 };
  for (const linha of linhas) {
    for (const campo of campos) centavos[campo] += Math.round((Number(linha[campo]) || 0) * 100);
  }
  return Object.fromEntries(campos.map((campo) => [campo, centavos[campo] / 100])) as typeof centavos;
}