
-- Add plano_contas_id to expenses table (denormalized for performance/reporting)
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS plano_contas_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- Backfill existing expenses with plano_contas_id from their linked category
UPDATE public.expenses e
SET plano_contas_id = fc.plano_contas_id
FROM public.financial_categories fc
WHERE e.categoria_financeira_id = fc.id
  AND fc.plano_contas_id IS NOT NULL
  AND e.plano_contas_id IS NULL;
