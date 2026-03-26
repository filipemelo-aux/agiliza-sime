
-- Add conta_bancaria_id to accounts_receivable
ALTER TABLE public.accounts_receivable 
  ADD COLUMN conta_bancaria_id uuid REFERENCES public.bank_accounts(id);

-- Add conta_bancaria_id to expenses (the payables table)
ALTER TABLE public.expenses
  ADD COLUMN conta_bancaria_id uuid REFERENCES public.bank_accounts(id);
