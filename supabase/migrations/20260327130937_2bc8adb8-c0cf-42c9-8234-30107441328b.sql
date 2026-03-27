
-- Adicionar campos de parcelamento na fatura
ALTER TABLE public.faturas_recebimento
  ADD COLUMN num_parcelas INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN intervalo_dias INTEGER NOT NULL DEFAULT 30;

-- Função que gera contas_receber ao faturar
CREATE OR REPLACE FUNCTION public.gerar_contas_receber_fatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  valor_parcela NUMERIC;
  valor_ultima NUMERIC;
  vencimento DATE;
  i INTEGER;
BEGIN
  -- Só gerar quando status = 'faturada'
  IF NEW.status <> 'faturada' THEN
    RETURN NEW;
  END IF;

  -- Evitar duplicidade: não gerar se já existem títulos para esta fatura
  IF EXISTS (SELECT 1 FROM contas_receber WHERE fatura_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Calcular valor de cada parcela (truncado em 2 casas)
  valor_parcela := TRUNC(NEW.valor_total / NEW.num_parcelas, 2);
  -- Última parcela absorve a diferença de arredondamento
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
$$;

-- Trigger na inserção e atualização de status para 'faturada'
CREATE TRIGGER trg_gerar_contas_receber
  AFTER INSERT OR UPDATE OF status ON public.faturas_recebimento
  FOR EACH ROW
  WHEN (NEW.status = 'faturada')
  EXECUTE FUNCTION public.gerar_contas_receber_fatura();
