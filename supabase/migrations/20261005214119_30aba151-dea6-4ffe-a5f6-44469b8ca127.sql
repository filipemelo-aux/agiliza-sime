ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS nfe_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nfe_sync_start_hour smallint NOT NULL DEFAULT 8 CHECK (nfe_sync_start_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS nfe_sync_interval_hours smallint NOT NULL DEFAULT 2 CHECK (nfe_sync_interval_hours BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS nfe_last_auto_sync_at timestamptz;