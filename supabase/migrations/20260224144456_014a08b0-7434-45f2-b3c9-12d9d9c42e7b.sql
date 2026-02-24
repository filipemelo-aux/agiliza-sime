
-- Link existing mdfe records to the first establishment if null
UPDATE public.mdfe
SET establishment_id = (SELECT id FROM public.fiscal_establishments ORDER BY type ASC LIMIT 1)
WHERE establishment_id IS NULL
  AND EXISTS (SELECT 1 FROM public.fiscal_establishments);

-- Make establishment_id NOT NULL
ALTER TABLE public.mdfe ALTER COLUMN establishment_id SET NOT NULL;

-- Add FK if not exists (it already exists as mdfe_establishment_id_fkey)
