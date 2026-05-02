
-- 1. Restrict freights SELECT to internal staff only (admin/moderator/operador)
-- This is an internal CRM, not a public marketplace.
DROP POLICY IF EXISTS "Anyone can view available freights" ON public.freights;

-- 2. Add admin/moderator role enforcement to fiscal counter functions
CREATE OR REPLACE FUNCTION public.next_cte_number(_establishment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar números fiscais';
  END IF;

  UPDATE fiscal_establishments
  SET ultimo_numero_cte = ultimo_numero_cte + 1, updated_at = now()
  WHERE id = _establishment_id
  RETURNING ultimo_numero_cte INTO next_num;
  
  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_cte_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar números fiscais';
  END IF;

  UPDATE fiscal_settings
  SET ultimo_numero_cte = ultimo_numero_cte + 1, updated_at = now()
  WHERE id = (SELECT id FROM fiscal_settings LIMIT 1)
  RETURNING ultimo_numero_cte INTO next_num;
  
  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_mdfe_number(_establishment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar números fiscais';
  END IF;

  UPDATE fiscal_establishments
  SET ultimo_numero_mdfe = ultimo_numero_mdfe + 1, updated_at = now()
  WHERE id = _establishment_id
  RETURNING ultimo_numero_mdfe INTO next_num;
  
  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_mdfe_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar números fiscais';
  END IF;

  UPDATE fiscal_settings
  SET ultimo_numero_mdfe = ultimo_numero_mdfe + 1, updated_at = now()
  WHERE id = (SELECT id FROM fiscal_settings LIMIT 1)
  RETURNING ultimo_numero_mdfe INTO next_num;
  
  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_cte_servico_number(_establishment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem gerar números fiscais';
  END IF;

  UPDATE fiscal_establishments
  SET ultimo_numero_cte_servico = ultimo_numero_cte_servico + 1, updated_at = now()
  WHERE id = _establishment_id
  RETURNING ultimo_numero_cte_servico INTO next_num;

  RETURN next_num;
END;
$function$;
