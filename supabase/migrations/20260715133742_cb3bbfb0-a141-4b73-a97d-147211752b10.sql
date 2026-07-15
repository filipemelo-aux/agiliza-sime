ALTER TABLE public.credit_card_invoice_items
  ADD COLUMN IF NOT EXISTS parcela_atual smallint,
  ADD COLUMN IF NOT EXISTS parcela_total smallint;