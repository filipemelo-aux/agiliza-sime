CREATE OR REPLACE FUNCTION public.merge_duplicate_profiles(_keep uuid, _drop uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k public.profiles;
  d public.profiles;
  r record;
  updated jsonb := '[]'::jsonb;
  n int;
  cats text[];
BEGIN
  SELECT * INTO k FROM public.profiles WHERE id = _keep;
  SELECT * INTO d FROM public.profiles WHERE id = _drop;
  IF k.id IS NULL OR d.id IS NULL THEN
    RAISE EXCEPTION 'perfil nao encontrado';
  END IF;

  -- repoint every uuid column in public schema that points to the dropped profile
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.data_type = 'uuid'
      AND NOT (c.table_name = 'profiles' AND c.column_name IN ('id','user_id'))
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.table_name, r.column_name, r.column_name)
      USING _keep, _drop;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      updated := updated || jsonb_build_object('table', r.table_name, 'column', r.column_name, 'rows', n, 'ref', 'profile_id');
    END IF;

    IF d.user_id IS NOT NULL AND k.user_id IS NOT NULL AND d.user_id <> k.user_id THEN
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.table_name, r.column_name, r.column_name)
        USING k.user_id, d.user_id;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        updated := updated || jsonb_build_object('table', r.table_name, 'column', r.column_name, 'rows', n, 'ref', 'user_id');
      END IF;
    END IF;
  END LOOP;

  -- merge categories into subcategorias (categories_extra)
  SELECT array_agg(DISTINCT c) INTO cats
  FROM unnest(
    coalesce(k.categories_extra, '{}') || coalesce(d.categories_extra, '{}') || ARRAY[d.category]
  ) AS c
  WHERE c IS NOT NULL AND c <> '' AND c <> k.category;

  UPDATE public.profiles SET
    categories_extra = coalesce(cats, '{}'),
    razao_social = coalesce(nullif(razao_social,''), d.razao_social),
    nome_fantasia = coalesce(nullif(nome_fantasia,''), d.nome_fantasia),
    cnpj = coalesce(nullif(cnpj,''), d.cnpj),
    email = coalesce(nullif(email,''), d.email),
    phone = coalesce(nullif(phone,''), d.phone),
    address_street = coalesce(nullif(address_street,''), d.address_street),
    address_number = coalesce(nullif(address_number,''), d.address_number),
    address_complement = coalesce(nullif(address_complement,''), d.address_complement),
    address_neighborhood = coalesce(nullif(address_neighborhood,''), d.address_neighborhood),
    address_city = coalesce(nullif(address_city,''), d.address_city),
    address_state = coalesce(nullif(address_state,''), d.address_state),
    address_zip = coalesce(nullif(address_zip,''), d.address_zip),
    inscricao_estadual = coalesce(nullif(inscricao_estadual,''), d.inscricao_estadual),
    bank_name = coalesce(nullif(bank_name,''), d.bank_name),
    bank_agency = coalesce(nullif(bank_agency,''), d.bank_agency),
    bank_account = coalesce(nullif(bank_account,''), d.bank_account),
    bank_account_type = coalesce(nullif(bank_account_type,''), d.bank_account_type),
    pix_key = coalesce(nullif(pix_key,''), d.pix_key),
    pix_key_type = coalesce(nullif(pix_key_type,''), d.pix_key_type),
    notes = coalesce(nullif(notes,''), d.notes),
    is_owner = coalesce(k.is_owner,false) OR coalesce(d.is_owner,false),
    is_employee = coalesce(k.is_employee,false) OR coalesce(d.is_employee,false),
    is_colaborador_rh = coalesce(k.is_colaborador_rh,false) OR coalesce(d.is_colaborador_rh,false),
    updated_at = now()
  WHERE id = _keep;

  DELETE FROM public.profiles WHERE id = _drop;

  RETURN jsonb_build_object('keep', _keep, 'dropped', _drop, 'categories_extra', coalesce(cats,'{}'), 'updates', updated);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_profiles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_duplicate_profiles(uuid, uuid) TO service_role;