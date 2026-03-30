
-- Fix: update movimentacoes_bancarias to use the correct date from expense_payments
UPDATE movimentacoes_bancarias mb
SET data_movimentacao = ep.data_pagamento::date
FROM expense_payments ep
WHERE mb.origem = 'pagamento_despesa'
  AND mb.origem_id = ep.id
  AND mb.data_movimentacao <> ep.data_pagamento::date;

-- Fix the trigger to use ::date directly instead of AT TIME ZONE conversion
-- Since data_pagamento stores the intended date at midnight UTC, just cast to date
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_pagamento_despesa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _descricao text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT descricao INTO _descricao FROM expenses WHERE id = NEW.expense_id;
    
    INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
    VALUES (
      'saida',
      'pagamento_despesa',
      NEW.id,
      NEW.valor,
      NEW.data_pagamento::date,
      COALESCE(_descricao, 'Pagamento de despesa')
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'pagamento_despesa' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;
