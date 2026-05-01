-- Add tipo_talao to ctes table to differentiate fiscal CT-e (producao) from internal CT-e (servico)
ALTER TABLE public.ctes
  ADD COLUMN IF NOT EXISTS tipo_talao text NOT NULL DEFAULT 'producao',
  ADD COLUMN IF NOT EXISTS numero_interno integer,
  ADD COLUMN IF NOT EXISTS data_carregamento date,
  ADD COLUMN IF NOT EXISTS valor_tonelada numeric;

ALTER TABLE public.ctes
  ADD CONSTRAINT ctes_tipo_talao_check CHECK (tipo_talao IN ('producao', 'servico'));

-- Internal counter for "servico" tickets (per-establishment, independent from fiscal numbering)
ALTER TABLE public.fiscal_establishments
  ADD COLUMN IF NOT EXISTS ultimo_numero_cte_servico integer NOT NULL DEFAULT 0;

-- RPC for next internal CT-e service number
CREATE OR REPLACE FUNCTION public.next_cte_servico_number(_establishment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num integer;
BEGIN
  UPDATE fiscal_establishments
  SET ultimo_numero_cte_servico = ultimo_numero_cte_servico + 1, updated_at = now()
  WHERE id = _establishment_id
  RETURNING ultimo_numero_cte_servico INTO next_num;

  RETURN next_num;
END;
$$;