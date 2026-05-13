
ALTER TABLE public.expense_payments
  ADD COLUMN IF NOT EXISTS skip_cashflow boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.gerar_movimentacao_pagamento_despesa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _descricao text;
  _tipo text;
  _valor numeric;
  _sum numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Skip per-payment cash flow when grouped (app creates one consolidated movement)
    IF NEW.skip_cashflow THEN
      RETURN NEW;
    END IF;

    SELECT descricao INTO _descricao FROM expenses WHERE id = NEW.expense_id;

    IF NEW.valor < 0 THEN
      _tipo := 'entrada';
      _valor := ABS(NEW.valor);
    ELSE
      _tipo := 'saida';
      _valor := NEW.valor;
    END IF;

    IF _valor > 0 THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao, lote_id)
      VALUES (
        _tipo,
        'pagamento_despesa',
        NEW.id,
        _valor,
        NEW.data_pagamento::date,
        COALESCE(_descricao, 'Pagamento de despesa'),
        NEW.lote_id
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.skip_cashflow AND OLD.lote_id IS NOT NULL THEN
      -- Recalc consolidated movement
      SELECT COALESCE(SUM(valor), 0) INTO _sum
      FROM expense_payments
      WHERE lote_id = OLD.lote_id AND skip_cashflow = true AND id <> OLD.id;

      IF _sum = 0 THEN
        DELETE FROM movimentacoes_bancarias
        WHERE origem = 'pagamento_agrupado' AND origem_id = OLD.lote_id;
      ELSE
        UPDATE movimentacoes_bancarias
        SET valor = ABS(_sum),
            tipo = CASE WHEN _sum < 0 THEN 'entrada' ELSE 'saida' END
        WHERE origem = 'pagamento_agrupado' AND origem_id = OLD.lote_id;
      END IF;
    ELSE
      DELETE FROM movimentacoes_bancarias WHERE origem = 'pagamento_despesa' AND origem_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validar_movimentacao_bancaria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.data_movimentacao IS NULL THEN
    RAISE EXCEPTION 'data_movimentacao é obrigatória para movimentações bancárias';
  END IF;
  IF NEW.origem IS NULL OR NEW.origem = '' THEN
    RAISE EXCEPTION 'origem é obrigatória para movimentações bancárias';
  END IF;
  IF NEW.origem_id IS NULL THEN
    RAISE EXCEPTION 'origem_id é obrigatório para movimentações bancárias';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RAISE EXCEPTION 'valor deve ser maior que zero';
  END IF;
  IF NEW.tipo IS NULL OR NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'tipo deve ser entrada ou saida';
  END IF;

  IF NEW.origem = 'manual' THEN RETURN NEW; END IF;

  IF NEW.origem = 'pagamento_agrupado' THEN
    IF NOT EXISTS (
      SELECT 1 FROM expense_payments
      WHERE lote_id = NEW.origem_id AND skip_cashflow = true
    ) THEN
      RAISE EXCEPTION 'Movimentação pagamento_agrupado exige pagamentos vinculados pelo lote_id';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.origem = 'contas_pagar' THEN
    IF NOT EXISTS (
      SELECT 1 FROM accounts_payable
      WHERE id = NEW.origem_id AND status = 'pago'
        AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_pagar exige conta com status pago e data_movimentacao igual a paid_at';
    END IF;
  END IF;

  IF NEW.origem = 'contas_receber' THEN
    IF NOT EXISTS (
      SELECT 1 FROM contas_receber
      WHERE id = NEW.origem_id AND status = 'recebido' AND data_recebimento = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_receber exige conta com status recebido e data_movimentacao igual a data_recebimento';
    END IF;
  END IF;

  IF NEW.origem = 'recebimento_conta_receber' THEN
    IF NOT EXISTS (SELECT 1 FROM receivable_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de recebimento_conta_receber exige registro válido em receivable_payments';
    END IF;
  END IF;

  IF NEW.origem = 'colheitas' THEN
    IF NOT EXISTS (SELECT 1 FROM harvest_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de colheitas exige registro válido em harvest_payments';
    END IF;
  END IF;

  IF NEW.origem = 'pagamento_despesa' THEN
    IF NOT EXISTS (SELECT 1 FROM expense_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de pagamento_despesa exige registro válido em expense_payments';
    END IF;
  END IF;

  IF NEW.origem = 'despesas' THEN
    IF NOT EXISTS (SELECT 1 FROM expenses WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de despesas exige registro válido em expenses';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
