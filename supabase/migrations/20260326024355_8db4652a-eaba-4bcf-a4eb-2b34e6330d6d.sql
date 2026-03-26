
-- Add unidade_id to expenses for unit traceability
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.fiscal_establishments(id);
