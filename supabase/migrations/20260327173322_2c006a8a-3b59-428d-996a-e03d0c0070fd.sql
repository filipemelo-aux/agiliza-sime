
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_receber()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status <> 'recebido') THEN
    INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
    VALUES (
      'entrada',
      'contas_receber',
      NEW.id,
      COALESCE(NEW.valor_recebido, NEW.valor),
      NEW.data_recebimento,
      'Recebimento fatura ' || NEW.fatura_id::text
    );
  END IF;

  IF OLD.status = 'recebido' AND NEW.status <> 'recebido' THEN
    DELETE FROM movimentacoes_bancarias
    WHERE origem = 'contas_receber' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_movimentacao_conta_receber
  AFTER INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.gerar_movimentacao_conta_receber();
