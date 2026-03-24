
-- Payment history table for audit trail
CREATE TABLE public.expense_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento text NOT NULL DEFAULT 'pix',
  data_pagamento timestamptz NOT NULL DEFAULT now(),
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select expense_payments" ON public.expense_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert expense_payments" ON public.expense_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update expense_payments" ON public.expense_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete expense_payments" ON public.expense_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select expense_payments" ON public.expense_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert expense_payments" ON public.expense_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update expense_payments" ON public.expense_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete expense_payments" ON public.expense_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- Unique index on chave_nfe to prevent duplicate invoices (only non-null values)
CREATE UNIQUE INDEX idx_expenses_chave_nfe_unique ON public.expenses (chave_nfe) WHERE chave_nfe IS NOT NULL AND deleted_at IS NULL;
