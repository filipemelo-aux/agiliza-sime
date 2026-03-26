
-- Trigger to validate unidade_id is linked to the bank account
CREATE OR REPLACE FUNCTION public.validate_transaction_unit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _allows_multi boolean;
  _owner_id uuid;
  _linked boolean;
BEGIN
  -- If no unidade_id, skip validation
  IF NEW.unidade_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get bank account info
  SELECT permitir_multiplas_unidades, empresa_id
  INTO _allows_multi, _owner_id
  FROM bank_accounts
  WHERE id = NEW.conta_bancaria_id;

  -- If account does not allow multiple units, unit must match owner
  IF NOT _allows_multi THEN
    IF NEW.unidade_id != _owner_id THEN
      RAISE EXCEPTION 'Unidade não vinculada a esta conta bancária (conta de unidade única)';
    END IF;
    RETURN NEW;
  END IF;

  -- If allows multiple units, check if any units are linked
  SELECT EXISTS (
    SELECT 1 FROM bank_account_units WHERE conta_bancaria_id = NEW.conta_bancaria_id
  ) INTO _linked;

  -- If no units linked, treat as global (allow any unit)
  IF NOT _linked THEN
    RETURN NEW;
  END IF;

  -- Check if the unit is in the linked units
  IF NOT EXISTS (
    SELECT 1 FROM bank_account_units
    WHERE conta_bancaria_id = NEW.conta_bancaria_id
      AND unidade_id = NEW.unidade_id
  ) THEN
    RAISE EXCEPTION 'Unidade não vinculada a esta conta bancária';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to financial_transactions
CREATE TRIGGER trg_validate_transaction_unit
  BEFORE INSERT OR UPDATE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_transaction_unit();
