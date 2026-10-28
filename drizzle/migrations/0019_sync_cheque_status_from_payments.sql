CREATE OR REPLACE FUNCTION public.fn_sync_cheque_from_expense_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.forma_pagamento IS DISTINCT FROM 'cheque' THEN RETURN NEW; END IF;
    SELECT c.id INTO _cid FROM cheques c
     WHERE c.status = 'emitido'
       AND (c.expense_id = NEW.expense_id OR EXISTS (SELECT 1 FROM cheque_expense_links l WHERE l.cheque_id = c.id AND l.expense_id = NEW.expense_id))
     ORDER BY (abs(c.valor - NEW.valor) < 0.01) DESC, c.data_vencimento NULLS LAST, c.created_at
     LIMIT 1;
    IF _cid IS NOT NULL THEN
      UPDATE cheques SET status = 'compensado', data_pagamento = NEW.data_pagamento::date,
        conta_bancaria_id = COALESCE(NEW.conta_bancaria_id, conta_bancaria_id), updated_at = now()
       WHERE id = _cid;
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.forma_pagamento IS DISTINCT FROM 'cheque' THEN RETURN OLD; END IF;
    SELECT c.id INTO _cid FROM cheques c
     WHERE c.status = 'compensado' AND c.movimentacao_id IS NULL
       AND c.data_pagamento = OLD.data_pagamento::date
       AND (c.expense_id = OLD.expense_id OR EXISTS (SELECT 1 FROM cheque_expense_links l WHERE l.cheque_id = c.id AND l.expense_id = OLD.expense_id))
     ORDER BY (abs(c.valor - OLD.valor) < 0.01) DESC
     LIMIT 1;
    IF _cid IS NOT NULL THEN
      UPDATE cheques SET status = 'emitido', data_pagamento = NULL, updated_at = now() WHERE id = _cid;
    END IF;
    RETURN OLD;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sync_cheque_from_expense_payment ON public.expense_payments;
CREATE TRIGGER trg_sync_cheque_from_expense_payment
AFTER INSERT OR DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cheque_from_expense_payment();

-- Corrige cheques já quitados pela conta a pagar
UPDATE public.cheques c SET status = 'compensado', data_pagamento = p.data_pagamento::date, updated_at = now()
FROM public.expense_payments p
WHERE c.status = 'emitido' AND p.forma_pagamento = 'cheque' AND p.expense_id = c.expense_id
  AND abs(p.valor - c.valor) < 0.01;