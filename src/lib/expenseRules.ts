/** Regras de edição de despesas do Contas a Pagar. */

/** Reembolso enviado pelo portal do motorista e recusado pelo escritório: não pode mais ser editado. */
export function isRejectedPortalExpense(item: unknown): boolean {
  return (item as { portal_status?: string } | null | undefined)?.portal_status === "rejeitado";
}

export function canApprovePortalExpense(item: unknown): boolean {
  const expense = item as {
    portal_status?: string;
    portal_revisado_em?: string | null;
    plano_contas_id?: string | null;
    favorecido_id?: string | null;
    favorecido_nome?: string | null;
    descricao?: string | null;
  } | null | undefined;
  return expense?.portal_status === "em_analise" && Boolean(
    expense.portal_revisado_em && expense.plano_contas_id && expense.favorecido_id &&
    expense.favorecido_nome?.trim() && expense.descricao?.trim()
  );
}
