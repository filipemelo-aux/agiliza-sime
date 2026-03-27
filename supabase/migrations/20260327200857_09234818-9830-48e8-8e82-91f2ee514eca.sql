
-- Fix trigger: despesas - use AT TIME ZONE to correctly extract local date
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_despesa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES (
        'saida', 'despesas', NEW.id,
        COALESCE(NEW.valor_pago, NEW.valor_total),
        COALESCE((NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date, CURRENT_DATE),
        NEW.descricao
      );
    END IF;
  END IF;

  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix trigger: contas a pagar - use AT TIME ZONE to correctly extract local date
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'contas_pagar' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES (
        'saida', 'contas_pagar', NEW.id,
        COALESCE(NEW.paid_amount, NEW.amount),
        (NEW.paid_at AT TIME ZONE 'America/Sao_Paulo')::date,
        NEW.description
      );
    END IF;
  END IF;

  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'contas_pagar' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix validation trigger: use AT TIME ZONE for paid_at comparison
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

  RETURN NEW;
END;
$function$;
