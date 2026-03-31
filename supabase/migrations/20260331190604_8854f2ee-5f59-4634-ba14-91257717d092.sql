CREATE OR REPLACE FUNCTION public.liberar_abastecimentos_ao_excluir_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When an expense is soft-deleted, release linked fuelings
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE fuelings
    SET expense_id = NULL,
        status_faturamento = 'nao_faturado'
    WHERE expense_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_liberar_abastecimentos_excluir_despesa
AFTER UPDATE OF deleted_at ON public.expenses
FOR EACH ROW
WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
EXECUTE FUNCTION public.liberar_abastecimentos_ao_excluir_despesa();