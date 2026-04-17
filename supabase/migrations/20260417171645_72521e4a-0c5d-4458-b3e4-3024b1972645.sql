-- 1) Backfill único: motoristas vinculados a veículos de Frota Própria viram colaboradores RH
-- Não sobrescreve quem já está com is_colaborador_rh = true
UPDATE public.profiles p
SET is_colaborador_rh = true
WHERE p.is_colaborador_rh = false
  AND EXISTS (
    SELECT 1
    FROM public.vehicles v
    WHERE v.driver_id = p.id
      AND v.fleet_type = 'propria'
  );

-- 2) Preparação para evolução futura: tipo de colaborador (CLT/PJ/Freelancer)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_colaborador_rh') THEN
    CREATE TYPE public.tipo_colaborador_rh AS ENUM ('clt', 'pj', 'freelancer');
  END IF;
END$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tipo_colaborador_rh public.tipo_colaborador_rh;

COMMENT ON COLUMN public.profiles.tipo_colaborador_rh IS
  'Tipo de vínculo do colaborador RH (CLT/PJ/Freelancer). Reservado para evolução futura — não usado pela UI atual.';