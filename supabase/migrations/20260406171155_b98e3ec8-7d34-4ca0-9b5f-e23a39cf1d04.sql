ALTER TABLE public.quotations 
  ADD COLUMN forma_pagamento_frete text,
  ADD COLUMN prazo_pagamento text,
  ADD COLUMN adiantamento_percentual numeric;