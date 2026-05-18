ALTER TABLE public.expense_payments
ADD COLUMN IF NOT EXISTS installment_id uuid REFERENCES public.expense_installments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_payments_installment_id
ON public.expense_payments(installment_id)
WHERE installment_id IS NOT NULL;