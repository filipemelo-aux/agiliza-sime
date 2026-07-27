ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS centro_custo_default text;

COMMENT ON COLUMN public.chart_of_accounts.centro_custo_default IS
  'Centro de custo pré-definido (frota_propria|frota_terceiros|administrativo|operacional). Preenchido automaticamente ao classificar lançamentos com esta conta.';