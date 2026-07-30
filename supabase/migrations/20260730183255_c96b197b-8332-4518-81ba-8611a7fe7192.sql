CREATE OR REPLACE FUNCTION public.gerar_contas_receber_fatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- Parcelas definidas manualmente (valores/vencimentos)
  IF NEW.parcelas_custom IS NOT NULL
     AND jsonb_typeof(NEW.parcelas_custom) = 'array'
     AND jsonb_array_length(NEW.parcelas_custom) > 0 THEN
    FOR v_item IN SELECT e FROM jsonb_array_elements(NEW.parcelas_custom) e LOOP
      INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento)
      VALUES (
        NEW.id,
        NEW.cliente_id,
        (v_item->>'valor')::numeric,
        COALESCE((v_item->>'data_vencimento')::date, NEW.data_emissao),
        'aberto',
        NULL
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

    INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento)
    VALUES (
      NEW.id,
      NEW.cliente_id,
      CASE WHEN i = NEW.num_parcelas THEN valor_ultima ELSE valor_parcela END,
      vencimento,
      'aberto',
      NULL
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Corrige a fatura 302 (títulos gerados com divisão igual)
DELETE FROM contas_receber
WHERE fatura_id = '52428b8c-ce7b-4359-b890-7e99834eee67'
  AND status = 'aberto';

INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento)
SELECT f.id, f.cliente_id, (e->>'valor')::numeric,
       COALESCE((e->>'data_vencimento')::date, f.data_emissao), 'aberto', NULL
FROM faturas_recebimento f, jsonb_array_elements(f.parcelas_custom) e
WHERE f.id = '52428b8c-ce7b-4359-b890-7e99834eee67';