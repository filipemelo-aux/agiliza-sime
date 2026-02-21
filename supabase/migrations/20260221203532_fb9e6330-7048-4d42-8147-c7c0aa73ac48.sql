
-- Add discounts columns to harvest_assignments
ALTER TABLE public.harvest_assignments 
  ADD COLUMN IF NOT EXISTS discounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_discounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS company_daily_value numeric DEFAULT NULL;
