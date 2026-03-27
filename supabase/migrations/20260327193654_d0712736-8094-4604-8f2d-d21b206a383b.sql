
-- 1. Trigger function for expenses → movimentacoes_bancarias
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Status changed to pago: create movement if not exists
  IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES ('saida', 'despesas', NEW.id, COALESCE(NEW.valor_pago, NEW.valor_total), COALESCE(NEW.data_pagamento::date, CURRENT_DATE), NEW.descricao);
    END IF;
  END IF;

  -- Status reverted from pago: remove movement
  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Attach trigger to expenses
DROP TRIGGER IF EXISTS trg_movimentacao_despesa ON expenses;
CREATE TRIGGER trg_movimentacao_despesa
  AFTER UPDATE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION gerar_movimentacao_despesa();

-- 2. Trigger function for harvest_payments → movimentacoes_bancarias
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_colheita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _farm_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT farm_name INTO _farm_name FROM harvest_jobs WHERE id = NEW.harvest_job_id;
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'colheitas' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES (
        'saida',
        'colheitas',
        NEW.id,
        NEW.total_amount,
        NEW.period_end,
        'Pagamento colheita - ' || COALESCE(_farm_name, '') || ' (' || to_char(NEW.period_start, 'DD/MM/YYYY') || ' a ' || to_char(NEW.period_end, 'DD/MM/YYYY') || ')'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'colheitas' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- Attach trigger to harvest_payments
DROP TRIGGER IF EXISTS trg_movimentacao_colheita ON harvest_payments;
CREATE TRIGGER trg_movimentacao_colheita
  AFTER INSERT OR DELETE ON harvest_payments
  FOR EACH ROW
  EXECUTE FUNCTION gerar_movimentacao_colheita();

-- 3. Update validation trigger to skip strict source validation for despesas
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
      WHERE id = NEW.origem_id AND status = 'pago' AND paid_at::date = NEW.data_movimentacao
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

  -- despesas: no strict validation needed, trigger handles it

  RETURN NEW;
END;
$function$;
