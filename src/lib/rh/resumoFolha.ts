export interface ResumoFolhaLinha {
  nome: string;
  tipo: string;
  inicio: string;
  fim: string;
  vencimento: string;
  situacao: string;
  chavePix?: string;
  base: number;
  comissoes: number;
  reembolsos: number;
  adiantamentos: number;
  descontos: number;
  liquido: number;
}

const campos = ["base", "comissoes", "reembolsos", "adiantamentos", "descontos", "liquido"] as const;

/** Dados cadastrais de pagamento somente para fechamentos ainda a pagar. */
export function chavePixResumoFolha(chave: string | null | undefined, pago: boolean, situacao: string): string | undefined {
  if (pago || situacao === "cancelada" || situacao === "paga") return undefined;
  return chave?.trim() || undefined;
}

/** Soma os valores já fechados, sem recalcular salário ou movimentos originais. */
export function totalizarResumoFolha(linhas: ResumoFolhaLinha[]) {
  const centavos = { base: 0, comissoes: 0, reembolsos: 0, adiantamentos: 0, descontos: 0, liquido: 0 };
  for (const linha of linhas) {
    for (const campo of campos) centavos[campo] += Math.round((Number(linha[campo]) || 0) * 100);
  }
  return Object.fromEntries(campos.map((campo) => [campo, centavos[campo] / 100])) as typeof centavos;
}