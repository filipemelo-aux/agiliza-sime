CREATE OR REPLACE FUNCTION public.fn_recalculate_expense_payment_state(_expense_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric;
  v_due date;
  v_paid numeric;
  v_last timestamptz;
  v_status expense_status;
  v_unallocated numeric;
  v_inst record;
  v_explicit numeric;
  v_allocated numeric;
BEGIN
  SELECT valor_total, data_vencimento INTO v_total, v_due
  FROM public.expenses WHERE id = _expense_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(valor), 0), MAX(data_pagamento)
    INTO v_paid, v_last
  FROM public.expense_payments
  WHERE expense_id = _expense_id;

  SELECT COALESCE(SUM(valor), 0) INTO v_unallocated
  FROM public.expense_payments
  WHERE expense_id = _expense_id AND installment_id IS NULL;

  FOR v_inst IN
    SELECT id, valor
    FROM public.expense_installments
    WHERE expense_id = _expense_id
    ORDER BY numero_parcela NULLS LAST, id
  LOOP
    SELECT COALESCE(SUM(valor), 0) INTO v_explicit
    FROM public.expense_payments
    WHERE installment_id = v_inst.id;

    v_allocated := LEAST(
      GREATEST(COALESCE(v_unallocated, 0), 0),
      GREATEST(COALESCE(v_inst.valor, 0) - COALESCE(v_explicit, 0), 0)
    );

    UPDATE public.expense_installments
    SET status = CASE
      WHEN COALESCE(v_explicit, 0) + COALESCE(v_allocated, 0) >= COALESCE(v_inst.valor, 0) - 0.01
           AND COALESCE(v_inst.valor, 0) > 0
        THEN 'pago'
      ELSE 'pendente'
    END
    WHERE id = v_inst.id;

    v_unallocated := GREATEST(COALESCE(v_unallocated, 0) - COALESCE(v_allocated, 0), 0);
  END LOOP;

  IF v_paid > 0 AND v_paid >= COALESCE(v_total, 0) - 0.01 THEN
    v_status := 'pago';
  ELSIF v_paid > 0 THEN
    v_status := 'parcial';
  ELSIF v_due IS NOT NULL AND v_due < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    v_status := 'atrasado';
  ELSE
    v_status := 'pendente';
  END IF;

  UPDATE public.expenses
  SET valor_pago = v_paid,
      status = v_status,
      data_pagamento = CASE WHEN v_paid > 0 THEN v_last ELSE NULL END,
      updated_at = now()
  WHERE id = _expense_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_recalculate_expense_payment_state(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_sync_expense_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.fn_recalculate_expense_payment_state(COALESCE(NEW.expense_id, OLD.expense_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_expense_from_payments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_expense_from_payments ON public.expense_payments;
CREATE TRIGGER trg_sync_expense_from_payments
AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_expense_from_payments();

DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT e.id
    FROM public.expenses e
    JOIN public.expense_payments p ON p.expense_id = e.id
    WHERE e.deleted_at IS NULL
  LOOP
    PERFORM public.fn_recalculate_expense_payment_state(v_id);
  END LOOP;
END;
$$;