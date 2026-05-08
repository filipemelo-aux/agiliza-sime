CREATE OR REPLACE FUNCTION public.validate_receivable_payment_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Permite recebimento com valor excedido (juros/acréscimos), apenas valida que o título existe
  IF NOT EXISTS (SELECT 1 FROM contas_receber WHERE id = NEW.conta_receber_id) THEN
    RAISE EXCEPTION 'Conta a receber não encontrada';
  END IF;
  RETURN NEW;
END;
$function$;