
-- 1. CT-e previsions inherit establishment
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
    WHERE origem_tipo = 'cte'
      AND origem_id = NEW.id;
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
    AND tomador_id IS NULL;

  RETURN NEW;
END;
$$;

-- 2. Fatura inherits empresa from linked previsao
CREATE OR REPLACE FUNCTION public.on_fatura_previsao_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
BEGIN
  UPDATE previsoes_recebimento
  SET status = 'faturado'
  WHERE id = NEW.previsao_id;

  SELECT empresa_id INTO v_empresa FROM previsoes_recebimento WHERE id = NEW.previsao_id;

  IF v_empresa IS NOT NULL THEN
    UPDATE faturas_recebimento f
    SET empresa_id = v_empresa
    WHERE f.id = NEW.fatura_id
      AND f.empresa_id IS DISTINCT FROM v_empresa;

    UPDATE contas_receber cr
    SET empresa_id = v_empresa
    WHERE cr.fatura_id = NEW.fatura_id
      AND cr.status <> 'recebido'
      AND cr.empresa_id IS DISTINCT FROM v_empresa;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. contas_receber inherit fatura empresa
CREATE OR REPLACE FUNCTION public.gerar_contas_receber_fatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  valor_parcela NUMERIC;
  valor_ultima NUMERIC;
  vencimento DATE;
  i INTEGER;
  v_item JSONB;
BEGIN
  IF NEW.status <> 'faturada' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM contas_receber WHERE fatura_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.parcelas_custom IS NOT NULL
     AND jsonb_typeof(NEW.parcelas_custom) = 'array'
     AND jsonb_array_length(NEW.parcelas_custom) > 0 THEN
    FOR v_item IN SELECT e FROM jsonb_array_elements(NEW.parcelas_custom) e LOOP
      INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento, empresa_id)
      VALUES (
        NEW.id,
        NEW.cliente_id,
        (v_item->>'valor')::numeric,
        COALESCE((v_item->>'data_vencimento')::date, NEW.data_emissao),
        'aberto',
        NULL,
        NEW.empresa_id
      );
    END LOOP;
    RETURN NEW;
  END IF;

  valor_parcela := TRUNC(NEW.valor_total / NEW.num_parcelas, 2);
  valor_ultima := NEW.valor_total - (valor_parcela * (NEW.num_parcelas - 1));

  FOR i IN 1..NEW.num_parcelas LOOP
    IF NEW.num_parcelas = 1 THEN
      vencimento := NEW.data_emissao;
    ELSE
      vencimento := NEW.data_emissao + (i * NEW.intervalo_dias);
    END IF;

    INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento, empresa_id)
    VALUES (
      NEW.id,
      NEW.cliente_id,
      CASE WHEN i = NEW.num_parcelas THEN valor_ultima ELSE valor_parcela END,
      vencimento,
      'aberto',
      NULL,
      NEW.empresa_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4. Backfill existing data
UPDATE public.previsoes_recebimento p
SET empresa_id = c.establishment_id
FROM public.ctes c
WHERE p.origem_tipo = 'cte'
  AND p.origem_id = c.id
  AND c.establishment_id IS NOT NULL
  AND p.empresa_id IS DISTINCT FROM c.establishment_id;

UPDATE public.faturas_recebimento f
SET empresa_id = sub.empresa_id
FROM (
  SELECT fp.fatura_id, MIN(p.empresa_id::text)::uuid AS empresa_id
  FROM public.fatura_previsoes fp
  JOIN public.previsoes_recebimento p ON p.id = fp.previsao_id
  GROUP BY fp.fatura_id
  HAVING COUNT(DISTINCT p.empresa_id) = 1
) sub
WHERE f.id = sub.fatura_id
  AND sub.empresa_id IS NOT NULL
  AND f.empresa_id IS DISTINCT FROM sub.empresa_id;

UPDATE public.contas_receber cr
SET empresa_id = f.empresa_id
FROM public.faturas_recebimento f
WHERE cr.fatura_id = f.id
  AND f.empresa_id IS NOT NULL
  AND cr.empresa_id IS DISTINCT FROM f.empresa_id;
