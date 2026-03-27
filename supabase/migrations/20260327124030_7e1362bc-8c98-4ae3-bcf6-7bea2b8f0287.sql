
-- Drop accounts_receivable table (depends on financial_invoices, chart_of_accounts, profiles, ctes)
DROP TABLE IF EXISTS public.accounts_receivable CASCADE;

-- Drop financial_invoice_items first (depends on financial_invoices and ctes)
DROP TABLE IF EXISTS public.financial_invoice_items CASCADE;

-- Drop financial_invoices table
DROP TABLE IF EXISTS public.financial_invoices CASCADE;
