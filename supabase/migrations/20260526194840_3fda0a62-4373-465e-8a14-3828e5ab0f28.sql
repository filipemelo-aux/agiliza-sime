
CREATE OR REPLACE FUNCTION public.fn_cleanup_payable_on_contract_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.accounts_payable_id IS NOT NULL THEN
    UPDATE public.expenses
       SET deleted_at = now()
     WHERE id = OLD.accounts_payable_id
       AND deleted_at IS NULL
       AND status IN ('pendente','atrasado');
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_payable_on_contract_delete ON public.freight_contracts;
CREATE TRIGGER trg_cleanup_payable_on_contract_delete
BEFORE DELETE ON public.freight_contracts
FOR EACH ROW
EXECUTE FUNCTION public.fn_cleanup_payable_on_contract_delete();
