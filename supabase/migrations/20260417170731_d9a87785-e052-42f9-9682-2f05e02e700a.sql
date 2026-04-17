ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_colaborador_rh boolean NOT NULL DEFAULT false;

-- Backfill: pessoas já marcadas como colaborador (categoria) devem ter o flag ativo
UPDATE public.profiles SET is_colaborador_rh = true WHERE category = 'colaborador';

CREATE INDEX IF NOT EXISTS idx_profiles_is_colaborador_rh ON public.profiles(is_colaborador_rh) WHERE is_colaborador_rh = true;