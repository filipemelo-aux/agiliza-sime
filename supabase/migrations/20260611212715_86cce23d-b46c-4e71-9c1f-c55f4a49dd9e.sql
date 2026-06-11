
-- 1. FUELING RELEASE: handle both soft-delete and hard DELETE
CREATE OR REPLACE FUNCTION public.liberar_abastecimentos_ao_excluir_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE fuelings
      SET expense_id = NULL, status_faturamento = 'nao_faturado'
      WHERE expense_id = OLD.id;
    DELETE FROM movimentacoes_bancarias
      WHERE origem = 'despesas' AND origem_id = OLD.id;
    DELETE FROM movimentacoes_bancarias
      WHERE origem = 'pagamento_despesa'
        AND origem_id IN (SELECT id FROM expense_payments WHERE expense_id = OLD.id);
    RETURN OLD;
  END IF;

  -- UPDATE: soft-delete transition
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE fuelings
      SET expense_id = NULL, status_faturamento = 'nao_faturado'
      WHERE expense_id = NEW.id;
    -- Clean up cash flow movements tied to this expense and its payments
    DELETE FROM movimentacoes_bancarias
      WHERE origem = 'despesas' AND origem_id = NEW.id;
    DELETE FROM movimentacoes_bancarias
      WHERE origem = 'pagamento_despesa'
        AND origem_id IN (SELECT id FROM expense_payments WHERE expense_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

-- Add DELETE trigger (existing trigger only fires on UPDATE OF deleted_at)
DROP TRIGGER IF EXISTS trg_liberar_abastecimentos_delete_despesa ON public.expenses;
CREATE TRIGGER trg_liberar_abastecimentos_delete_despesa
BEFORE DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.liberar_abastecimentos_ao_excluir_despesa();

-- 2. CHECK constraint on movimentacoes_bancarias.origem
ALTER TABLE public.movimentacoes_bancarias
  DROP CONSTRAINT IF EXISTS movimentacoes_bancarias_origem_check;
ALTER TABLE public.movimentacoes_bancarias
  ADD CONSTRAINT movimentacoes_bancarias_origem_check
  CHECK (origem IN (
    'despesas','pagamento_despesa','pagamento_agrupado',
    'contas_pagar','contas_receber','recebimento_conta_receber',
    'colheitas','manual'
  ));

-- 3. FK: folhas_pagamento_itens.expense_id -> expenses(id) ON DELETE SET NULL
-- Clean any orphan refs first
UPDATE public.folhas_pagamento_itens i
  SET expense_id = NULL
  WHERE expense_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = i.expense_id);
ALTER TABLE public.folhas_pagamento_itens
  DROP CONSTRAINT IF EXISTS folhas_pagamento_itens_expense_id_fkey;
ALTER TABLE public.folhas_pagamento_itens
  ADD CONSTRAINT folhas_pagamento_itens_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;

-- 4. expenses.contrato_id: links to harvest_payments (used in code). Add FK SET NULL.
UPDATE public.expenses e
  SET contrato_id = NULL
  WHERE contrato_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.harvest_payments hp WHERE hp.id = e.contrato_id);
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_contrato_id_fkey;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_contrato_id_fkey
  FOREIGN KEY (contrato_id) REFERENCES public.harvest_payments(id) ON DELETE SET NULL;

-- 5. Drop obsolete columns (0 rows, no parent table for viagem_id; km_odometro duplicated by km_atual)
ALTER TABLE public.expenses DROP COLUMN IF EXISTS viagem_id;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS km_odometro;
