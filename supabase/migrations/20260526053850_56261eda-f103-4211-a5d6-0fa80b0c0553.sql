ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS intervalo_revisao_km numeric,
  ADD COLUMN IF NOT EXISTS proxima_revisao_km numeric;