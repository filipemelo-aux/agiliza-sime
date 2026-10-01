ALTER TABLE public.fiscal_establishments ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_establishments_profile_id_uidx ON public.fiscal_establishments(profile_id) WHERE profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_establishment_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid;
BEGIN
  _pid := NEW.profile_id;
  IF _pid IS NULL THEN
    SELECT id INTO _pid FROM public.profiles
     WHERE regexp_replace(coalesce(cnpj,''),'\D','','g') = regexp_replace(NEW.cnpj,'\D','','g')
     ORDER BY created_at LIMIT 1;
  END IF;
  IF _pid IS NULL THEN
    INSERT INTO public.profiles (full_name, person_type, cnpj, category, categories_extra)
    VALUES (NEW.razao_social, 'cnpj', regexp_replace(NEW.cnpj,'\D','','g'), 'proprietario', '{}')
    RETURNING id INTO _pid;
  END IF;
  NEW.profile_id := _pid;

  UPDATE public.profiles p SET
    full_name = NEW.razao_social,
    razao_social = NEW.razao_social,
    nome_fantasia = coalesce(NEW.nome_fantasia, p.nome_fantasia),
    person_type = 'cnpj',
    cnpj = regexp_replace(NEW.cnpj,'\D','','g'),
    inscricao_estadual = coalesce(nullif(NEW.inscricao_estadual,''), p.inscricao_estadual),
    address_street = coalesce(nullif(NEW.endereco_logradouro,''), p.address_street),
    address_number = coalesce(nullif(NEW.endereco_numero,''), p.address_number),
    address_neighborhood = coalesce(nullif(NEW.endereco_bairro,''), p.address_neighborhood),
    address_city = coalesce(nullif(NEW.endereco_municipio,''), p.address_city),
    address_state = coalesce(nullif(NEW.endereco_uf,''), p.address_state),
    address_zip = coalesce(nullif(NEW.endereco_cep,''), p.address_zip),
    categories_extra = CASE
      WHEN p.category <> 'proprietario' AND NOT ('proprietario' = ANY(coalesce(p.categories_extra,'{}')))
      THEN array_append(coalesce(p.categories_extra,'{}'), 'proprietario') ELSE p.categories_extra END
  WHERE p.id = _pid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_establishment_profile ON public.fiscal_establishments;
CREATE TRIGGER trg_sync_establishment_profile
BEFORE INSERT OR UPDATE OF cnpj, razao_social, nome_fantasia, inscricao_estadual, endereco_logradouro, endereco_numero, endereco_bairro, endereco_municipio, endereco_uf, endereco_cep, profile_id
ON public.fiscal_establishments FOR EACH ROW EXECUTE FUNCTION public.fn_sync_establishment_profile();