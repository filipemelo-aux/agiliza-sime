ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.fiscal_establishments ADD COLUMN IF NOT EXISTS descricao text;

CREATE OR REPLACE FUNCTION public.fn_title_case(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _t IS NULL OR btrim(_t) = '' THEN _t ELSE
    regexp_replace(
      regexp_replace(initcap(lower(btrim(_t))), '(\s)(De|Da|Do|Das|Dos|E)(?=\s)', '\1' || '', 'g'),
    '\s+', ' ', 'g') END
$$;

CREATE OR REPLACE FUNCTION public.fn_title_case(_t text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE w text; out text := ''; i int := 0;
BEGIN
  IF _t IS NULL OR btrim(_t) = '' THEN RETURN _t; END IF;
  FOREACH w IN ARRAY regexp_split_to_array(lower(btrim(_t)), '\s+') LOOP
    i := i + 1;
    IF i > 1 AND w IN ('de','da','do','das','dos','e') THEN out := out || ' ' || w;
    ELSIF w IN ('ltda','me','epp','eireli','s/a','sa') THEN out := out || CASE WHEN i>1 THEN ' ' ELSE '' END || CASE WHEN w='ltda' THEN 'Ltda' ELSE upper(w) END;
    ELSE out := out || CASE WHEN i>1 THEN ' ' ELSE '' END || initcap(w);
    END IF;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.fn_sync_establishment_profile()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _pid uuid;
BEGIN
  _pid := NEW.profile_id;
  IF _pid IS NULL THEN
    SELECT id INTO _pid FROM public.profiles
     WHERE regexp_replace(coalesce(cnpj,''),'\D','','g') = regexp_replace(NEW.cnpj,'\D','','g')
       AND (NEW.tenant_id IS NULL OR tenant_id = NEW.tenant_id)
     ORDER BY created_at LIMIT 1;
  END IF;
  IF _pid IS NULL THEN
    INSERT INTO public.profiles (user_id, full_name, person_type, cnpj, category, categories_extra, tenant_id)
    VALUES (gen_random_uuid(), public.fn_title_case(NEW.razao_social), 'cnpj', regexp_replace(NEW.cnpj,'\D','','g'), 'proprietario', '{}', NEW.tenant_id)
    RETURNING id INTO _pid;
  END IF;
  NEW.profile_id := _pid;

  UPDATE public.profiles p SET
    full_name = public.fn_title_case(NEW.razao_social),
    razao_social = public.fn_title_case(NEW.razao_social),
    nome_fantasia = coalesce(public.fn_title_case(nullif(NEW.nome_fantasia,'')), p.nome_fantasia),
    notes = NEW.descricao,
    person_type = 'cnpj',
    cnpj = regexp_replace(NEW.cnpj,'\D','','g'),
    inscricao_estadual = coalesce(nullif(NEW.inscricao_estadual,''), p.inscricao_estadual),
    address_street = coalesce(public.fn_title_case(nullif(NEW.endereco_logradouro,'')), p.address_street),
    address_number = coalesce(nullif(NEW.endereco_numero,''), p.address_number),
    address_neighborhood = coalesce(public.fn_title_case(nullif(NEW.endereco_bairro,'')), p.address_neighborhood),
    address_city = coalesce(public.fn_title_case(nullif(NEW.endereco_municipio,'')), p.address_city),
    address_state = coalesce(nullif(NEW.endereco_uf,''), p.address_state),
    address_zip = coalesce(nullif(NEW.endereco_cep,''), p.address_zip),
    categories_extra = CASE
      WHEN p.category <> 'proprietario' AND NOT ('proprietario' = ANY(coalesce(p.categories_extra,'{}')))
      THEN array_append(coalesce(p.categories_extra,'{}'), 'proprietario') ELSE p.categories_extra END
  WHERE p.id = _pid;
  RETURN NEW;
END $function$;

-- Espelho reverso: descrição editada em Pessoas volta ao estabelecimento/empresa
CREATE OR REPLACE FUNCTION public.fn_sync_profile_notes_to_establishment()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    UPDATE public.fiscal_establishments SET descricao = NEW.notes
     WHERE profile_id = NEW.id AND descricao IS DISTINCT FROM NEW.notes;
    UPDATE public.tenants t SET descricao = NEW.notes
      FROM public.fiscal_establishments e
     WHERE e.profile_id = NEW.id AND e.type = 'matriz' AND t.id = e.tenant_id AND t.descricao IS DISTINCT FROM NEW.notes;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profile_notes_to_establishment ON public.profiles;
CREATE TRIGGER trg_profile_notes_to_establishment AFTER UPDATE OF notes ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_profile_notes_to_establishment();