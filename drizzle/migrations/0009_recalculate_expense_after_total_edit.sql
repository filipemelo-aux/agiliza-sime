CREATE OR REPLACE FUNCTION public.fn_sync_expense_after_amount_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_recalculate_expense_payment_state(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_expense_after_amount_edit
AFTER UPDATE OF valor_total, data_vencimento ON public.expenses
FOR EACH ROW
WHEN (NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento)
EXECUTE FUNCTION public.fn_sync_expense_after_amount_edit();