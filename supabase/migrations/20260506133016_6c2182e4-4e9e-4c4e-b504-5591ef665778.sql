CREATE OR REPLACE FUNCTION public.fn_force_cte_previsao_data_emissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_data_emissao date;
BEGIN
  IF NEW.origem_tipo = 'cte' THEN
    SELECT (c.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date
      INTO v_data_emissao
    FROM public.ctes c
    WHERE c.id = NEW.origem_id
      AND c.data_emissao IS NOT NULL;

    IF v_data_emissao IS NOT NULL THEN
      NEW.data_prevista := v_data_emissao;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_cte_previsao_data_emissao ON public.previsoes_recebimento;
CREATE TRIGGER trg_force_cte_previsao_data_emissao
BEFORE INSERT OR UPDATE OF origem_tipo, origem_id, data_prevista
ON public.previsoes_recebimento
FOR EACH ROW
EXECUTE FUNCTION public.fn_force_cte_previsao_data_emissao();

CREATE OR REPLACE FUNCTION public.fn_sync_cte_previsoes_on_data_emissao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.data_emissao IS NOT NULL AND NEW.data_emissao IS DISTINCT FROM OLD.data_emissao THEN
    UPDATE public.previsoes_recebimento
       SET data_prevista = (NEW.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date
     WHERE origem_tipo = 'cte'
       AND origem_id = NEW.id
       AND data_prevista IS DISTINCT FROM (NEW.data_emissao AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cte_previsoes_on_data_emissao ON public.ctes;
CREATE TRIGGER trg_sync_cte_previsoes_on_data_emissao
AFTER UPDATE OF data_emissao
ON public.ctes
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_cte_previsoes_on_data_emissao();