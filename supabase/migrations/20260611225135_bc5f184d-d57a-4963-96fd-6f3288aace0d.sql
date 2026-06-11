ALTER TABLE public.credit_card_invoice_items
  ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cc_invoice_items_veiculo
  ON public.credit_card_invoice_items(veiculo_id)
  WHERE veiculo_id IS NOT NULL;