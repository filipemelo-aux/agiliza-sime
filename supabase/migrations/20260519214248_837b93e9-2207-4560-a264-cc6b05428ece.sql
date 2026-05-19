
CREATE TABLE public.expense_group_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  original_expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (original_expense_id)
);

CREATE INDEX idx_egi_grupo ON public.expense_group_items(grupo_expense_id);
CREATE INDEX idx_egi_original ON public.expense_group_items(original_expense_id);

ALTER TABLE public.expense_group_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View expense groups"
ON public.expense_group_items FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR public.has_role(auth.uid(), 'operador'::app_role)
);

CREATE POLICY "Insert expense groups"
ON public.expense_group_items FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);

CREATE POLICY "Delete expense groups"
ON public.expense_group_items FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
);
