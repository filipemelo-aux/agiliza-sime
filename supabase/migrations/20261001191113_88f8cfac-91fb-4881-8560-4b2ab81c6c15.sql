ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS gerar_previsao boolean NOT NULL DEFAULT true;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS composicao_frete jsonb;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS frete_minimo jsonb;

CREATE OR REPLACE FUNCTION public.fn_sync_cte_previsao_recebimento()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_cliente_id uuid;
  v_data_prevista date;
BEGIN
  IF COALESCE(NEW.valor_frete, 0) = 0 OR NEW.gerar_previsao = false THEN
    DELETE FROM public.previsoes_recebimento
    WHERE origem_tipo = 'cte' AND origem_id = NEW.id AND status <> 'faturado';
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

  UPDATE public.ctes SET tomador_id = v_cliente_id
  WHERE id = NEW.id AND tomador_id IS DISTINCT FROM v_cliente_id;

  RETURN NEW;
END;
$function$;