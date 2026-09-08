
CREATE OR REPLACE FUNCTION public.fn_resolve_profile_for_cte_previsao(_cte public.ctes)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_doc text;
  v_profile_id uuid;
BEGIN
  -- Tipo de tomador é a fonte da verdade quando 0..3
  IF COALESCE(_cte.tomador_tipo, 4) BETWEEN 0 AND 3 THEN
    CASE _cte.tomador_tipo
      WHEN 0 THEN v_name := _cte.remetente_nome;    v_doc := _cte.remetente_cnpj;
      WHEN 1 THEN v_name := _cte.expedidor_nome;    v_doc := _cte.expedidor_cnpj;
      WHEN 2 THEN v_name := _cte.recebedor_nome;    v_doc := _cte.recebedor_cnpj;
      WHEN 3 THEN v_name := _cte.destinatario_nome; v_doc := _cte.destinatario_cnpj;
    END CASE;
  ELSE
    IF _cte.tomador_id IS NOT NULL THEN
      RETURN _cte.tomador_id;
    END IF;
    v_name := _cte.tomador_nome;
    v_doc := _cte.tomador_cnpj;
  END IF;

  IF NULLIF(regexp_replace(COALESCE(v_doc, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    SELECT p.id INTO v_profile_id
    FROM public.profiles p
    WHERE regexp_replace(COALESCE(p.cnpj, ''), '\D', '', 'g') = regexp_replace(v_doc, '\D', '', 'g')
    ORDER BY CASE WHEN p.category = 'cliente' THEN 0 ELSE 1 END, p.created_at DESC
    LIMIT 1;
  END IF;

  IF v_profile_id IS NULL AND NULLIF(btrim(COALESCE(v_name, '')), '') IS NOT NULL THEN
    SELECT p.id INTO v_profile_id
    FROM public.profiles p
    WHERE lower(public.fn_strip_accents(COALESCE(p.razao_social, ''))) = lower(public.fn_strip_accents(v_name))
       OR lower(public.fn_strip_accents(COALESCE(p.full_name, ''))) = lower(public.fn_strip_accents(v_name))
       OR lower(public.fn_strip_accents(COALESCE(p.nome_fantasia, ''))) = lower(public.fn_strip_accents(v_name))
    ORDER BY CASE WHEN p.category = 'cliente' THEN 0 ELSE 1 END, p.created_at DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_profile_id, _cte.tomador_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_profile_for_cte_previsao(public.ctes) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.fn_sync_cte_previsao_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_id uuid;
  v_data_prevista date;
BEGIN
  IF COALESCE(NEW.valor_frete, 0) = 0 THEN
    DELETE FROM public.previsoes_recebimento
    WHERE origem_tipo = 'cte' AND origem_id = NEW.id;
    RETURN NEW;
  END IF;

  v_cliente_id := public.fn_resolve_profile_for_cte_previsao(NEW);
  IF v_cliente_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_data_prevista := COALESCE((NEW.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE);

  INSERT INTO public.previsoes_recebimento (
    origem_tipo, origem_id, cliente_id, valor, data_prevista, status, empresa_id
  ) VALUES (
    'cte', NEW.id, v_cliente_id, NEW.valor_frete, v_data_prevista, 'pendente',
    COALESCE(NEW.establishment_id, (SELECT id FROM public.fiscal_establishments WHERE type = 'matriz' LIMIT 1))
  )
  ON CONFLICT (origem_id) WHERE origem_tipo = 'cte'
  DO UPDATE SET
    cliente_id = EXCLUDED.cliente_id,
    valor = EXCLUDED.valor,
    data_prevista = EXCLUDED.data_prevista,
    empresa_id = COALESCE(EXCLUDED.empresa_id, public.previsoes_recebimento.empresa_id),
    status = CASE
      WHEN public.previsoes_recebimento.status = 'faturado' THEN public.previsoes_recebimento.status
      ELSE EXCLUDED.status
    END;

  UPDATE public.ctes
  SET tomador_id = v_cliente_id
  WHERE id = NEW.id
    AND tomador_id IS DISTINCT FROM v_cliente_id;

  RETURN NEW;
END;
$$;
