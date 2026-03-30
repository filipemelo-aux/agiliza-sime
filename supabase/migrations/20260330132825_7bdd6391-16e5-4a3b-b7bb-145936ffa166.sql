
-- Fix: don't delete movimentacao when status goes to atrasado if there's still valor_pago > 0
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- When valor_pago increases and there's money paid, create/update movimentacao
  IF COALESCE(NEW.valor_pago, 0) > 0 AND NEW.status IN ('pago', 'parcial', 'atrasado') THEN
    IF EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id) THEN
      UPDATE movimentacoes_bancarias
      SET valor = NEW.valor_pago,
          data_movimentacao = COALESCE((NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE),
          descricao = NEW.descricao
      WHERE origem = 'despesas' AND origem_id = NEW.id;
    ELSE
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES (
        'saida', 'despesas', NEW.id,
        NEW.valor_pago,
        COALESCE((NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE),
        NEW.descricao
      );
    END IF;
  END IF;

  -- Only delete movimentacao on true reversal (valor_pago back to 0 or status pendente with no payments)
  IF COALESCE(NEW.valor_pago, 0) = 0 AND NEW.status IN ('pendente', 'atrasado') 
     AND OLD.status IN ('pago', 'parcial') THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Also update validation to allow 'atrasado' status for despesas with payments
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

  IF NEW.origem = 'colheitas' THEN
    IF NOT EXISTS (
      SELECT 1 FROM harvest_payments WHERE id = NEW.origem_id
    ) THEN
      RAISE EXCEPTION 'Movimentação de colheitas exige registro válido em harvest_payments';
    END IF;
  END IF;

  -- For despesas: allow pago, parcial, or atrasado (if there's valor_pago > 0)
  IF NEW.origem = 'despesas' THEN
    IF NOT EXISTS (
      SELECT 1 FROM expenses
      WHERE id = NEW.origem_id 
        AND (status IN ('pago', 'parcial') OR (status = 'atrasado' AND valor_pago > 0))
    ) THEN
      RAISE EXCEPTION 'Movimentação de despesas exige conta com status pago, parcial ou atrasado com pagamentos';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
