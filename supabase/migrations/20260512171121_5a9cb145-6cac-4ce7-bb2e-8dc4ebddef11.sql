-- Add lote_id to track batch payments
ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS lote_id uuid;
ALTER TABLE public.movimentacoes_bancarias ADD COLUMN IF NOT EXISTS lote_id uuid;

CREATE INDEX IF NOT EXISTS idx_expense_payments_lote_id ON public.expense_payments(lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movimentacoes_bancarias_lote_id ON public.movimentacoes_bancarias(lote_id) WHERE lote_id IS NOT NULL;

-- Update trigger to copy lote_id from expense_payments to movimentacoes_bancarias
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
BEGIN
  IF TG_OP = 'INSERT' THEN
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
    DELETE FROM movimentacoes_bancarias WHERE origem = 'pagamento_despesa' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;