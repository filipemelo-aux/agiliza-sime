
-- Drop trigger on financial_transactions (if exists)
DROP TRIGGER IF EXISTS trg_bank_balance ON public.financial_transactions;

-- Drop the validate_transaction_unit trigger (if exists)
DROP TRIGGER IF EXISTS trg_validate_transaction_unit ON public.financial_transactions;

-- Drop functions
DROP FUNCTION IF EXISTS public.trg_update_bank_balance() CASCADE;
DROP FUNCTION IF EXISTS public.recalc_bank_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.validate_transaction_unit() CASCADE;

-- Drop tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS public.bank_account_units CASCADE;
DROP TABLE IF EXISTS public.financial_transactions CASCADE;
DROP TABLE IF EXISTS public.bank_accounts CASCADE;

-- Remove conta_bancaria_id columns from other tables
ALTER TABLE public.expenses DROP COLUMN IF EXISTS conta_bancaria_id;
ALTER TABLE public.accounts_receivable DROP COLUMN IF EXISTS conta_bancaria_id;
