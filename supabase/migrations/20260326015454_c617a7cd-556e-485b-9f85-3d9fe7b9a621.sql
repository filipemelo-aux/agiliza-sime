-- Enable realtime for bank_accounts so balance updates are pushed to clients
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_accounts;