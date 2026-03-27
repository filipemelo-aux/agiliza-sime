
-- 1. Add data_lancamento to contas_receber (default from created_at)
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows
UPDATE public.contas_receber SET data_lancamento = created_at::date WHERE data_lancamento = CURRENT_DATE AND created_at::date <> CURRENT_DATE;

-- 2. Add data_lancamento to accounts_payable
ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE;

-- Backfill existing rows
UPDATE public.accounts_payable SET data_lancamento = created_at::date WHERE data_lancamento = CURRENT_DATE AND created_at::date <> CURRENT_DATE;

-- 3. Validation trigger for accounts_payable: data_pagamento (paid_at) only when status = 'pago'
CREATE OR REPLACE FUNCTION public.validar_conta_pagar_pagamento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- paid_at only when pago
  IF NEW.paid_at IS NOT NULL AND NEW.status <> 'pago' THEN
    RAISE EXCEPTION 'paid_at só pode ser preenchida quando status = pago';
  END IF;

  -- pago requires paid_at
  IF NEW.status = 'pago' AND NEW.paid_at IS NULL THEN
    RAISE EXCEPTION 'status pago exige paid_at preenchida';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_conta_pagar ON public.accounts_payable;
CREATE TRIGGER trg_validar_conta_pagar
  BEFORE INSERT OR UPDATE ON public.accounts_payable
  FOR EACH ROW EXECUTE FUNCTION public.validar_conta_pagar_pagamento();

-- 4. Ensure contas_receber trigger exists
DROP TRIGGER IF EXISTS trg_validar_conta_receber ON public.contas_receber;
CREATE TRIGGER trg_validar_conta_receber
  BEFORE INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION public.validar_conta_receber_recebimento();
