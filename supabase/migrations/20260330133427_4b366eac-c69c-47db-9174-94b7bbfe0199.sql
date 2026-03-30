
-- 1. Add 'pagamento_despesa' to the CHECK constraint on origem
ALTER TABLE movimentacoes_bancarias DROP CONSTRAINT movimentacoes_bancarias_origem_check;
ALTER TABLE movimentacoes_bancarias ADD CONSTRAINT movimentacoes_bancarias_origem_check 
  CHECK (origem = ANY (ARRAY['contas_pagar','contas_receber','despesas','colheitas','pagamento_despesa']));

-- 2. Create trigger function for expense_payments
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_pagamento_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _descricao text;
BEGIN
  -- Only on INSERT
  IF TG_OP = 'INSERT' THEN
    SELECT descricao INTO _descricao FROM expenses WHERE id = NEW.expense_id;
    
    INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
    VALUES (
      'saida',
      'pagamento_despesa',
      NEW.id,
      NEW.valor,
      (NEW.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date,
      COALESCE(_descricao, 'Pagamento de despesa')
    );
  END IF;

  -- On DELETE (reversal)
  IF TG_OP = 'DELETE' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'pagamento_despesa' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Create trigger on expense_payments
CREATE TRIGGER trg_movimentacao_pagamento_despesa
  AFTER INSERT OR DELETE ON expense_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_movimentacao_pagamento_despesa();

-- 4. Modify the expense trigger to NO LONGER create movimentacoes 
-- (since they're now handled per-payment via expense_payments trigger)
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_despesa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- This trigger now only handles cleanup for reversals
  -- Individual payment movimentacoes are created by trg_movimentacao_pagamento_despesa
  
  -- If status reverted to pendente with no payments, clean up any legacy 'despesas' movimentacoes
  IF COALESCE(NEW.valor_pago, 0) = 0 AND NEW.status IN ('pendente', 'atrasado') 
     AND OLD.status IN ('pago', 'parcial') THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Update validation to handle 'pagamento_despesa' origin
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

  IF NEW.origem = 'pagamento_despesa' THEN
    IF NOT EXISTS (
      SELECT 1 FROM expense_payments WHERE id = NEW.origem_id
    ) THEN
      RAISE EXCEPTION 'Movimentação de pagamento_despesa exige registro válido em expense_payments';
    END IF;
  END IF;

  -- Legacy 'despesas' origin - keep for backward compatibility
  IF NEW.origem = 'despesas' THEN
    IF NOT EXISTS (
      SELECT 1 FROM expenses WHERE id = NEW.origem_id
    ) THEN
      RAISE EXCEPTION 'Movimentação de despesas exige registro válido em expenses';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6. Delete old consolidated movimentacao for this expense
DELETE FROM movimentacoes_bancarias WHERE origem = 'despesas' AND origem_id = 'c2524883-1159-433d-8752-4c183e7ef087';

-- 7. Migrate existing payments to individual movimentacoes
INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
SELECT 
  'saida',
  'pagamento_despesa',
  ep.id,
  ep.valor,
  (ep.data_pagamento AT TIME ZONE 'America/Sao_Paulo')::date,
  COALESCE(e.descricao, 'Pagamento de despesa')
FROM expense_payments ep
JOIN expenses e ON e.id = ep.expense_id
WHERE NOT EXISTS (
  SELECT 1 FROM movimentacoes_bancarias mb 
  WHERE mb.origem = 'pagamento_despesa' AND mb.origem_id = ep.id
);

-- 8. Clean up old 'despesas' origin movimentacoes that now have per-payment records
DELETE FROM movimentacoes_bancarias m
WHERE m.origem = 'despesas' 
  AND EXISTS (
    SELECT 1 FROM expense_payments ep WHERE ep.expense_id = m.origem_id
  )
  AND EXISTS (
    SELECT 1 FROM movimentacoes_bancarias mb 
    JOIN expense_payments ep2 ON mb.origem_id = ep2.id AND mb.origem = 'pagamento_despesa'
    WHERE ep2.expense_id = m.origem_id
  );
