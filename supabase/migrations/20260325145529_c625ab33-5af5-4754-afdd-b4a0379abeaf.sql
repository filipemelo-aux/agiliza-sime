
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS departamento text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS data_admissao date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS salario numeric;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_employee boolean NOT NULL DEFAULT false;

-- Mark existing drivers with frota própria vehicles as employees
UPDATE public.profiles p
SET is_employee = true
WHERE p.category = 'motorista'
  AND EXISTS (
    SELECT 1 FROM public.vehicles v
    WHERE v.driver_id = p.user_id
      AND v.fleet_type = 'propria'
  );
