
-- Fix: drop the existing constraints first, then re-add pointing to chart_of_accounts
ALTER TABLE accounts_receivable DROP CONSTRAINT IF EXISTS accounts_receivable_category_id_fkey;
ALTER TABLE accounts_receivable ADD CONSTRAINT accounts_receivable_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES chart_of_accounts(id);

ALTER TABLE accounts_payable DROP CONSTRAINT IF EXISTS accounts_payable_category_id_fkey;
ALTER TABLE accounts_payable ADD CONSTRAINT accounts_payable_category_id_fkey 
  FOREIGN KEY (category_id) REFERENCES chart_of_accounts(id);
