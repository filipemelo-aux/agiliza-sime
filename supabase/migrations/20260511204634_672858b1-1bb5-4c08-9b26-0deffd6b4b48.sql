CREATE OR REPLACE FUNCTION public.gerar_movimentacao_pagamento_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _descricao text;
  _tipo text;
  _valor numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT descricao INTO _descricao FROM expenses WHERE id = NEW.expense_id;

    -- Negative payment = refund/adjustment -> entry; positive = exit
    IF NEW.valor < 0 THEN
      _tipo := 'entrada';
      _valor := ABS(NEW.valor);
    ELSE
      _tipo := 'saida';
      _valor := NEW.valor;
    END IF;

    -- Skip zero-value movements (CHECK constraint requires valor > 0)
    IF _valor > 0 THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES (
        _tipo,
        'pagamento_despesa',
        NEW.id,
        _valor,
        NEW.data_pagamento::date,
        COALESCE(_descricao, 'Pagamento de despesa')
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'pagamento_despesa' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;