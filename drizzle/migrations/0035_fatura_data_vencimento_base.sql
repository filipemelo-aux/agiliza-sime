alter table public.faturas_recebimento
  add column if not exists data_vencimento_base date;

comment on column public.faturas_recebimento.data_vencimento_base is
  'Data-base do vencimento das parcelas; quando nula, usa data_emissao (legado).';

create or replace function public.gerar_contas_receber_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  valor_parcela NUMERIC;
  valor_ultima NUMERIC;
  vencimento DATE;
  data_base DATE;
  i INTEGER;
  v_item JSONB;
BEGIN
  IF NEW.status <> 'faturada' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM contas_receber WHERE fatura_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  data_base := COALESCE(NEW.data_vencimento_base, NEW.data_emissao);

  IF NEW.parcelas_custom IS NOT NULL
     AND jsonb_typeof(NEW.parcelas_custom) = 'array'
     AND jsonb_array_length(NEW.parcelas_custom) > 0 THEN
    FOR v_item IN SELECT e FROM jsonb_array_elements(NEW.parcelas_custom) e LOOP
      INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento, empresa_id)
      VALUES (
        NEW.id,
        NEW.cliente_id,
        (v_item->>'valor')::numeric,
        COALESCE((v_item->>'data_vencimento')::date, data_base),
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
      vencimento := data_base;
    ELSE
      vencimento := data_base + (i * NEW.intervalo_dias);
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