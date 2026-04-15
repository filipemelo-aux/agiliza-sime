
-- Table to store each OFX import session
CREATE TABLE public.bank_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  bank_name TEXT,
  account_id TEXT,
  period_start DATE,
  period_end DATE,
  total_items INTEGER NOT NULL DEFAULT 0,
  reconciled_items INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage reconciliations"
ON public.bank_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table to store each transaction line from the OFX
CREATE TABLE public.bank_reconciliation_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reconciliation_id UUID NOT NULL REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  fitid TEXT, -- OFX unique transaction ID
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'conciliado', 'registrado')),
  matched_movimentacao_id UUID REFERENCES public.movimentacoes_bancarias(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_reconciliation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage reconciliation items"
ON public.bank_reconciliation_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_reconciliation_items_reconciliation ON public.bank_reconciliation_items(reconciliation_id);
CREATE INDEX idx_reconciliation_items_status ON public.bank_reconciliation_items(status);
