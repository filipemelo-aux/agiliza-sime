CREATE OR REPLACE FUNCTION public.fn_recalculate_expense_payment_state(_expense_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
 v_total numeric; v_due date; v_paid numeric; v_last timestamptz; v_status expense_status;
 v_unallocated numeric; v_inst record; v_explicit numeric; v_allocated numeric;
BEGIN
 SELECT valor_total,data_vencimento INTO v_total,v_due FROM public.expenses WHERE id=_expense_id AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT COALESCE(SUM(valor-COALESCE(juros,0)+COALESCE(desconto,0)),0),MAX(data_pagamento) INTO v_paid,v_last FROM public.expense_payments WHERE expense_id=_expense_id;
 SELECT COALESCE(SUM(valor-COALESCE(juros,0)+COALESCE(desconto,0)),0) INTO v_unallocated FROM public.expense_payments WHERE expense_id=_expense_id AND installment_id IS NULL;
 FOR v_inst IN SELECT id,valor FROM public.expense_installments WHERE expense_id=_expense_id AND status<>'cancelado' ORDER BY numero_parcela NULLS LAST,id LOOP
  SELECT COALESCE(SUM(valor-COALESCE(juros,0)+COALESCE(desconto,0)),0) INTO v_explicit FROM public.expense_payments WHERE installment_id=v_inst.id;
  v_allocated:=LEAST(GREATEST(v_unallocated,0),GREATEST(v_inst.valor-v_explicit,0));
  UPDATE public.expense_installments SET status=CASE WHEN v_explicit+v_allocated>=v_inst.valor AND v_inst.valor>0 THEN 'pago' ELSE 'pendente' END WHERE id=v_inst.id;
  v_unallocated:=v_unallocated-v_allocated;
 END LOOP;
 IF v_paid>0 AND v_paid>=COALESCE(v_total,0) THEN v_status:='pago';
 ELSIF v_paid>0 THEN v_status:='parcial';
 ELSIF v_due IS NOT NULL AND v_due<(now() AT TIME ZONE 'America/Sao_Paulo')::date THEN v_status:='atrasado';
 ELSE v_status:='pendente'; END IF;
 UPDATE public.expenses SET valor_pago=v_paid,status=v_status,data_pagamento=CASE WHEN v_paid>0 THEN v_last ELSE NULL END,updated_at=now() WHERE id=_expense_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.fn_block_total_below_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_paid numeric;
BEGIN
 IF NEW.valor_total IS DISTINCT FROM OLD.valor_total THEN
  SELECT COALESCE(SUM(valor-COALESCE(juros,0)+COALESCE(desconto,0)),0) INTO v_paid FROM public.expense_payments WHERE expense_id=NEW.id;
  IF v_paid>0 AND COALESCE(NEW.valor_total,0)<v_paid-0.01 THEN RAISE EXCEPTION 'O valor total não pode ser menor que o já pago (R$ %). Estorne um pagamento antes.',to_char(v_paid,'FM999G999G990D00'); END IF;
 END IF;
 RETURN NEW;
END;
$function$;