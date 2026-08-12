-- Separa coordenadas de cidade e data no layout de cheque.
-- A data impressa não inclui mais a palavra "de" (o cheque já a traz impressa).

ALTER TABLE public.check_layouts
  ADD COLUMN IF NOT EXISTS cidade_x numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cidade_y numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS data_x numeric NOT NULL DEFAULT 140,
  ADD COLUMN IF NOT EXISTS data_y numeric NOT NULL DEFAULT 50;

UPDATE public.check_layouts SET
  cidade_x = COALESCE(cidade_data_x, 100),
  cidade_y = COALESCE(cidade_data_y, 50),
  data_x = COALESCE(cidade_data_x, 100) + 40,
  data_y = COALESCE(cidade_data_y, 50)
WHERE cidade_data_x IS NOT NULL OR cidade_data_y IS NOT NULL;

ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS cidade_data_x;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS cidade_data_y;