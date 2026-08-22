-- 1) Soft-delete da despesa residual duplicada (folha de origem inexistente)
UPDATE public.expenses
SET deleted_at = now()
WHERE id = 'f2ef3537-b154-4cf9-b9cb-2026a3656029' AND deleted_at IS NULL;

-- 2) Bloquear exclusão de folha que ainda tenha despesas ativas vinculadas
CREATE OR REPLACE FUNCTION public.bloquear_delete_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativas int;
BEGIN
  IF OLD.status = 'confirmada' THEN
    RAISE EXCEPTION 'Folha confirmada não pode ser excluída.';
  END IF;

  SELECT count(*) INTO v_ativas
  FROM public.folhas_pagamento_itens i
  JOIN public.expenses e ON e.id = i.expense_id
  WHERE i.folha_id = OLD.id AND e.deleted_at IS NULL;

  IF v_ativas > 0 THEN
    RAISE EXCEPTION 'Esta folha possui % conta(s) a pagar ativa(s) geradas por ela. Estorne/exclua essas contas antes de excluir a folha.', v_ativas;
  END IF;

  RETURN OLD;
END;
$$;