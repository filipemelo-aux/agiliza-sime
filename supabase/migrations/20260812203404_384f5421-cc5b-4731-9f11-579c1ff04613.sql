ALTER TABLE public.check_layouts
  ADD COLUMN IF NOT EXISTS bom_para_x numeric NOT NULL DEFAULT 130,
  ADD COLUMN IF NOT EXISTS bom_para_y numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS canhoto_bom_para_x numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS canhoto_bom_para_y numeric NOT NULL DEFAULT 80;