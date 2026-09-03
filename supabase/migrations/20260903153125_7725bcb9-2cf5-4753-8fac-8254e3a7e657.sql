ALTER TABLE public.cheques
  ADD COLUMN IF NOT EXISTS plano_contas_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_pagamento date;

CREATE INDEX IF NOT EXISTS idx_cheques_plano_contas ON public.cheques(plano_contas_id);
CREATE INDEX IF NOT EXISTS idx_cheques_data_pagamento ON public.cheques(data_pagamento);