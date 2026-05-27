-- Add total_parcelas column to preserve original installment total even when some installments are deleted
ALTER TABLE public.expense_installments
ADD COLUMN IF NOT EXISTS total_parcelas integer;

-- Backfill: for each expense, use MAX(numero_parcela) as the original total
UPDATE public.expense_installments ei
SET total_parcelas = sub.max_num
FROM (
  SELECT expense_id, MAX(numero_parcela) AS max_num
  FROM public.expense_installments
  GROUP BY expense_id
) sub
WHERE ei.expense_id = sub.expense_id
  AND ei.total_parcelas IS NULL;

-- Default for any future row that forgets to set it
ALTER TABLE public.expense_installments
ALTER COLUMN total_parcelas SET DEFAULT 1;