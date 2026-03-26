ALTER TABLE public.financial_transactions
DROP CONSTRAINT IF EXISTS financial_transactions_origem_check;

ALTER TABLE public.financial_transactions
ADD CONSTRAINT financial_transactions_origem_check
CHECK (
  origem = ANY (
    ARRAY[
      'conta_pagar'::text,
      'conta_receber'::text,
      'manual'::text,
      'ajuste'::text,
      'colheita_pagamento'::text
    ]
  )
);