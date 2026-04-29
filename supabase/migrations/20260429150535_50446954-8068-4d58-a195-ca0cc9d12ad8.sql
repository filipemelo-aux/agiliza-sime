ALTER TABLE public.credit_card_invoices
ADD COLUMN IF NOT EXISTS bank_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;