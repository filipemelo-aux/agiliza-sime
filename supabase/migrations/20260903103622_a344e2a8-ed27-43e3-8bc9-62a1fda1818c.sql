CREATE OR REPLACE FUNCTION public.fn_sync_expense_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_expense_id uuid;
  v_total numeric;
  v_venc date;
  v_pago numeric;
  v_last timestamptz;
  v_status expense_status;
BEGIN
  v_expense_id := COALESCE(NEW.expense_id, OLD.expense_id);
  IF v_expense_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT valor_total, data_vencimento INTO v_total, v_venc
  FROM public.expenses WHERE id = v_expense_id;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(valor), 0), MAX(data_pagamento)
    INTO v_pago, v_last
  FROM public.expense_payments
  WHERE expense_id = v_expense_id;

  IF v_pago > 0 AND v_pago >= COALESCE(v_total, 0) - 0.01 THEN
    v_status := 'pago';
  ELSIF v_pago > 0 THEN
    v_status := 'parcial';
  ELSIF v_venc IS NOT NULL AND v_venc < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    v_status := 'atrasado';
  ELSE
    v_status := 'pendente';
  END IF;

  UPDATE public.expenses SET
    valor_pago = v_pago,
    status = v_status,
    data_pagamento = CASE WHEN v_pago > 0 THEN v_last ELSE NULL END,
    updated_at = now()
  WHERE id = v_expense_id
    AND (COALESCE(valor_pago, 0) IS DISTINCT FROM v_pago
         OR status IS DISTINCT FROM v_status
         OR (v_pago > 0 AND data_pagamento IS DISTINCT FROM v_last)
         OR (v_pago = 0 AND data_pagamento IS NOT NULL));

  UPDATE public.expense_installments i SET
    status = CASE
      WHEN COALESCE(pag.total, 0) >= i.valor - 0.01 AND COALESCE(pag.total, 0) > 0 THEN 'pago'
      ELSE 'pendente'
    END
  FROM (
    SELECT ei.id AS installment_id,
           (SELECT COALESCE(SUM(p.valor), 0)
              FROM public.expense_payments p
             WHERE p.installment_id = ei.id) AS total
    FROM public.expense_installments ei
    WHERE ei.expense_id = v_expense_id
  ) pag
  WHERE i.id = pag.installment_id
    AND i.status IS DISTINCT FROM (
      CASE WHEN COALESCE(pag.total, 0) >= i.valor - 0.01 AND COALESCE(pag.total, 0) > 0
           THEN 'pago' ELSE 'pendente' END
    )
    AND EXISTS (SELECT 1 FROM public.expense_payments p2
                 WHERE p2.expense_id = v_expense_id AND p2.installment_id IS NOT NULL);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_expense_from_payments() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_expense_from_payments ON public.expense_payments;
CREATE TRIGGER trg_sync_expense_from_payments
AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_expense_from_payments();

WITH agg AS (
  SELECT e.id,
         COALESCE(SUM(p.valor), 0) AS pago,
         MAX(p.data_pagamento) AS ultimo
  FROM public.expenses e
  JOIN public.expense_payments p ON p.expense_id = e.id
  WHERE e.deleted_at IS NULL
  GROUP BY e.id
)
UPDATE public.expenses e SET
  valor_pago = agg.pago,
  status = CASE
    WHEN agg.pago > 0 AND agg.pago >= COALESCE(e.valor_total, 0) - 0.01 THEN 'pago'::expense_status
    WHEN agg.pago > 0 THEN 'parcial'::expense_status
    WHEN e.data_vencimento IS NOT NULL AND e.data_vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'atrasado'::expense_status
    ELSE 'pendente'::expense_status
  END,
  data_pagamento = CASE WHEN agg.pago > 0 THEN agg.ultimo ELSE e.data_pagamento END,
  updated_at = now()
FROM agg
WHERE e.id = agg.id
  AND (COALESCE(e.valor_pago, 0) IS DISTINCT FROM agg.pago
       OR e.status IN ('pendente'::expense_status, 'atrasado'::expense_status));