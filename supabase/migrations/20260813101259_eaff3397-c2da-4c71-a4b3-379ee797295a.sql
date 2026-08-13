ALTER TABLE public.check_layouts
  ADD COLUMN IF NOT EXISTS cruzamento_x numeric NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS cruzamento_y numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS cruzamento_altura_mm numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS cruzamento_espaco_mm numeric NOT NULL DEFAULT 6;