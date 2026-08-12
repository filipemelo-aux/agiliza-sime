ALTER TABLE public.freight_contracts
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS numero_cheque text;