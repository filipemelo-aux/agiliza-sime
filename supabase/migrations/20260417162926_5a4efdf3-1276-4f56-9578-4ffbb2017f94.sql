ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.expense_payments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_payments;