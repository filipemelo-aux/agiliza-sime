
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_pagar()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Only when status changes to 'pago'
  IF NEW.status = 'pago' AND (OLD.status IS NULL OR OLD.status <> 'pago') THEN
    INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
    VALUES (
      'saida',
      'contas_pagar',
      NEW.id,
      COALESCE(NEW.paid_amount, NEW.amount),
      NEW.paid_at,
      NEW.description
    );
  END IF;

  -- If status reverts from 'pago', remove the movement
  IF OLD.status = 'pago' AND NEW.status <> 'pago' THEN
    DELETE FROM movimentacoes_bancarias
    WHERE origem = 'contas_pagar' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_movimentacao_conta_pagar
  AFTER INSERT OR UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.gerar_movimentacao_conta_pagar();
