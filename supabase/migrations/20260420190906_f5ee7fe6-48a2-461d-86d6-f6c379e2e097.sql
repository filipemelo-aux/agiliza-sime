-- 1) Apagar movimentações bancárias vinculadas a despesas de salário (pagamentos)
DELETE FROM public.movimentacoes_bancarias
WHERE origem = 'pagamento_despesa'
  AND origem_id IN (
    SELECT ep.id FROM public.expense_payments ep
    JOIN public.expenses e ON e.id = ep.expense_id
    WHERE e.plano_contas_id IS NOT NULL
      AND public.fn_is_salario_account(e.plano_contas_id)
  );

DELETE FROM public.movimentacoes_bancarias
WHERE origem = 'despesas'
  AND origem_id IN (
    SELECT id FROM public.expenses
    WHERE plano_contas_id IS NOT NULL
      AND public.fn_is_salario_account(plano_contas_id)
  );

-- 2) Apagar pagamentos das despesas de salário
DELETE FROM public.expense_payments
WHERE expense_id IN (
  SELECT id FROM public.expenses
  WHERE plano_contas_id IS NOT NULL
    AND public.fn_is_salario_account(plano_contas_id)
);

-- 3) Limpar referências nos itens de folha
UPDATE public.folhas_pagamento_itens
SET salario_expense_ids = ARRAY[]::uuid[],
    expense_id = NULL
WHERE expense_id IN (
  SELECT id FROM public.expenses
  WHERE plano_contas_id IS NOT NULL
    AND public.fn_is_salario_account(plano_contas_id)
)
OR EXISTS (
  SELECT 1 FROM unnest(COALESCE(salario_expense_ids, ARRAY[]::uuid[])) AS sid
  WHERE sid IN (
    SELECT id FROM public.expenses
    WHERE plano_contas_id IS NOT NULL
      AND public.fn_is_salario_account(plano_contas_id)
  )
);

-- 4) Apagar parcelas e itens fiscais dessas despesas
DELETE FROM public.expense_installments
WHERE expense_id IN (
  SELECT id FROM public.expenses
  WHERE plano_contas_id IS NOT NULL
    AND public.fn_is_salario_account(plano_contas_id)
);

DELETE FROM public.expense_items
WHERE expense_id IN (
  SELECT id FROM public.expenses
  WHERE plano_contas_id IS NOT NULL
    AND public.fn_is_salario_account(plano_contas_id)
);

-- 5) Apagar as despesas de salário em si
DELETE FROM public.expenses
WHERE plano_contas_id IS NOT NULL
  AND public.fn_is_salario_account(plano_contas_id);

-- 6) Recriar função de unicidade SEM referência a salario_expense_ids
CREATE OR REPLACE FUNCTION public.fn_check_expense_uniqueness_in_folhas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dup_expense uuid;
BEGIN
  WITH novos AS (
    SELECT unnest(COALESCE(NEW.adiantamento_expense_ids, ARRAY[]::uuid[])) AS expense_id
  ),
  conflitos AS (
    SELECT n.expense_id
    FROM novos n
    WHERE EXISTS (
      SELECT 1
      FROM public.folhas_pagamento_itens i
      JOIN public.folhas_pagamento f ON f.id = i.folha_id
      WHERE i.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND f.status <> 'cancelada'
        AND n.expense_id = ANY(i.adiantamento_expense_ids)
    )
  )
  SELECT expense_id INTO v_dup_expense FROM conflitos LIMIT 1;

  IF v_dup_expense IS NOT NULL THEN
    RAISE EXCEPTION 'Adiantamento % já está vinculado a outra folha de pagamento ativa.', v_dup_expense
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- 7) Recriar trigger de bloqueio de edição SEM referência a salario_expense_ids
CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_folha_id uuid;
BEGIN
  v_folha_id := COALESCE(NEW.folha_id, OLD.folha_id);
  SELECT status INTO v_status FROM public.folhas_pagamento WHERE id = v_folha_id;

  IF v_status = 'confirmada' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
         OR NEW.salario_base IS DISTINCT FROM OLD.salario_base
         OR NEW.adiantamentos IS DISTINCT FROM OLD.adiantamentos
         OR NEW.descontos IS DISTINCT FROM OLD.descontos
         OR NEW.comissoes IS DISTINCT FROM OLD.comissoes
         OR NEW.liquido IS DISTINCT FROM OLD.liquido
         OR NEW.adiantamento_expense_ids IS DISTINCT FROM OLD.adiantamento_expense_ids THEN
        RAISE EXCEPTION 'Itens de folha confirmada não podem ser recalculados.';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Itens de folha confirmada não podem ser excluídos.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 8) Drop dos triggers que dependem da coluna, depois drop da coluna, depois recriar triggers
DROP TRIGGER IF EXISTS trg_check_expense_uniqueness_folha ON public.folhas_pagamento_itens;
DROP TRIGGER IF EXISTS trg_bloquear_edicao_itens_folha_confirmada ON public.folhas_pagamento_itens;

ALTER TABLE public.folhas_pagamento_itens
  DROP COLUMN IF EXISTS salario_expense_ids;

CREATE TRIGGER trg_check_expense_uniqueness_folha
BEFORE INSERT OR UPDATE ON public.folhas_pagamento_itens
FOR EACH ROW EXECUTE FUNCTION public.fn_check_expense_uniqueness_in_folhas();

CREATE TRIGGER trg_bloquear_edicao_itens_folha_confirmada
BEFORE UPDATE OR DELETE ON public.folhas_pagamento_itens
FOR EACH ROW EXECUTE FUNCTION public.bloquear_edicao_itens_folha_confirmada();