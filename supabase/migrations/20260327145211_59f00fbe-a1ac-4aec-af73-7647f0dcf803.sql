
-- Add columns to track payment details for future banking module
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS forma_recebimento TEXT,
  ADD COLUMN IF NOT EXISTS valor_recebido NUMERIC DEFAULT 0;

-- Ensure consistency: recebido must have valor_recebido > 0
CREATE OR REPLACE FUNCTION public.validar_conta_receber_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- data_recebimento only when recebido
  IF NEW.data_recebimento IS NOT NULL AND NEW.status <> 'recebido' THEN
    RAISE EXCEPTION 'data_recebimento só pode ser preenchida quando status = recebido';
  END IF;

  -- recebido requires data_recebimento
  IF NEW.status = 'recebido' AND NEW.data_recebimento IS NULL THEN
    RAISE EXCEPTION 'status recebido exige data_recebimento preenchida';
  END IF;

  -- recebido requires valor_recebido > 0
  IF NEW.status = 'recebido' AND (NEW.valor_recebido IS NULL OR NEW.valor_recebido <= 0) THEN
    RAISE EXCEPTION 'status recebido exige valor_recebido maior que zero';
  END IF;

  -- forma_recebimento required when recebido
  IF NEW.status = 'recebido' AND (NEW.forma_recebimento IS NULL OR NEW.forma_recebimento = '') THEN
    RAISE EXCEPTION 'status recebido exige forma_recebimento informada';
  END IF;

  RETURN NEW;
END;
$$;
