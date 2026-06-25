
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS categories_extra text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_profiles_categories_extra
  ON public.profiles USING GIN (categories_extra);
