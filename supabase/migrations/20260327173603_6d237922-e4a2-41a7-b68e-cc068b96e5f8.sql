
-- Update contas_pagar trigger to prevent duplicates
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_pagar()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Status changed to pago: create movement if not exists
  IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'contas_pagar' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES ('saida', 'contas_pagar', NEW.id, COALESCE(NEW.paid_amount, NEW.amount), NEW.paid_at, NEW.description);
    END IF;
  END IF;

  -- Status reverted from pago: remove movement
  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'contas_pagar' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update contas_receber trigger to prevent duplicates
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_receber()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status <> 'recebido') THEN
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'contas_receber' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES ('entrada', 'contas_receber', NEW.id, COALESCE(NEW.valor_recebido, NEW.valor), NEW.data_recebimento, 'Recebimento fatura ' || NEW.fatura_id::text);
    END IF;
  END IF;

  IF OLD.status = 'recebido' AND NEW.status <> 'recebido' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'contas_receber' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Add unique constraint to prevent duplicates at DB level
ALTER TABLE public.movimentacoes_bancarias ADD CONSTRAINT uq_movimentacao_origem UNIQUE (origem, origem_id);
