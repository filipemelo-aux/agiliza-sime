-- Add admin and moderator RLS policies to expense_installments (only operador had access)
CREATE POLICY "Admins can select expense_installments"
ON public.expense_installments FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert expense_installments"
ON public.expense_installments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update expense_installments"
ON public.expense_installments FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete expense_installments"
ON public.expense_installments FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can select expense_installments"
ON public.expense_installments FOR SELECT
USING (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators can insert expense_installments"
ON public.expense_installments FOR INSERT
WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators can update expense_installments"
ON public.expense_installments FOR UPDATE
USING (has_role(auth.uid(), 'moderator'::app_role));

CREATE POLICY "Moderators can delete expense_installments"
ON public.expense_installments FOR DELETE
USING (has_role(auth.uid(), 'moderator'::app_role));