
-- Add unidade_id to financial_transactions for traceability
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.fiscal_establishments(id);
