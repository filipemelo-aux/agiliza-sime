/** Regras de edição de despesas do Contas a Pagar. */

/** Reembolso enviado pelo portal do motorista e recusado pelo escritório: não pode mais ser editado. */
export function isRejectedPortalExpense(item: unknown): boolean {
  return (item as { portal_status?: string } | null | undefined)?.portal_status === "rejeitado";
}
