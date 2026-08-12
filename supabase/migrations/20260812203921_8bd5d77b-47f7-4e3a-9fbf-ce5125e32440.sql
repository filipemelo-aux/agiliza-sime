ALTER TABLE public.check_layouts
  ADD COLUMN IF NOT EXISTS canhoto_favorecido2_x numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canhoto_favorecido2_y numeric NOT NULL DEFAULT 0;