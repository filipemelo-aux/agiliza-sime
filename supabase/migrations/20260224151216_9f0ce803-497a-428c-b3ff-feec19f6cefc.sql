
-- Adicionar campos de log estruturado à tabela fiscal_logs
ALTER TABLE public.fiscal_logs
  ADD COLUMN IF NOT EXISTS sefaz_code text,
  ADD COLUMN IF NOT EXISTS sefaz_message text,
  ADD COLUMN IF NOT EXISTS response_time_ms integer,
  ADD COLUMN IF NOT EXISTS sefaz_url text,
  ADD COLUMN IF NOT EXISTS ambiente text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS attempt integer,
  ADD COLUMN IF NOT EXISTS queue_job_id uuid;

-- Index para consultas por código SEFAZ
CREATE INDEX IF NOT EXISTS idx_fiscal_logs_sefaz_code ON public.fiscal_logs(sefaz_code) WHERE sefaz_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_logs_action ON public.fiscal_logs(action);
CREATE INDEX IF NOT EXISTS idx_fiscal_logs_created_at ON public.fiscal_logs(created_at DESC);
