CREATE OR REPLACE FUNCTION public.fn_block_total_below_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_paid numeric;
BEGIN
  IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
    SELECT COALESCE(SUM(valor + COALESCE(desconto,0)),0) INTO v_paid FROM public.expense_payments WHERE expense_id = NEW.id;
    IF v_paid > 0 AND COALESCE(NEW.valor_total,0) < v_paid - 0.01 THEN
      RAISE EXCEPTION 'O valor total não pode ser menor que o já pago (R$ %). Estorne um pagamento antes.', to_char(v_paid,'FM999G999G990D00');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_total_below_paid ON public.expenses;
CREATE TRIGGER trg_block_total_below_paid BEFORE UPDATE OF valor_total ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.fn_block_total_below_paid();