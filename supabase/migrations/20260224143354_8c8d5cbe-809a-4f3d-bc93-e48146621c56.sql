
-- First set any null establishment_id to the first available establishment
UPDATE public.ctes
SET establishment_id = (SELECT id FROM public.fiscal_establishments LIMIT 1)
WHERE establishment_id IS NULL
  AND EXISTS (SELECT 1 FROM public.fiscal_establishments);

-- Make establishment_id NOT NULL
ALTER TABLE public.ctes
  ALTER COLUMN establishment_id SET NOT NULL;
