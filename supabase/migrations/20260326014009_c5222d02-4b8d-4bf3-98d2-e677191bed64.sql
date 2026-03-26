
-- Create financial_transactions table
CREATE TABLE public.financial_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conta_bancaria_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  valor NUMERIC NOT NULL DEFAULT 0,
  data_movimentacao DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT NOT NULL,
  categoria_financeira_id UUID REFERENCES public.chart_of_accounts(id),
  plano_contas_id UUID REFERENCES public.chart_of_accounts(id),
  origem TEXT NOT NULL DEFAULT 'manual' CHECK (origem IN ('conta_pagar', 'conta_receber', 'manual', 'ajuste')),
  origem_id UUID,
  status TEXT NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado', 'pendente')),
  observacoes TEXT,
  empresa_id UUID NOT NULL REFERENCES public.fiscal_establishments(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin
CREATE POLICY "Admin full access on financial_transactions"
  ON public.financial_transactions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policies for moderator
CREATE POLICY "Moderator full access on financial_transactions"
  ON public.financial_transactions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));

-- Trigger for updated_at
CREATE TRIGGER update_financial_transactions_updated_at
  BEFORE UPDATE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to recalculate bank account balance
CREATE OR REPLACE FUNCTION public.recalc_bank_balance(_conta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _saldo numeric;
BEGIN
  SELECT COALESCE(ba.saldo_inicial, 0) +
    COALESCE((
      SELECT SUM(CASE WHEN ft.tipo = 'entrada' THEN ft.valor ELSE -ft.valor END)
      FROM financial_transactions ft
      WHERE ft.conta_bancaria_id = _conta_id AND ft.status = 'confirmado'
    ), 0)
  INTO _saldo
  FROM bank_accounts ba
  WHERE ba.id = _conta_id;

  UPDATE bank_accounts SET saldo_atual = _saldo WHERE id = _conta_id;
END;
$$;

-- Trigger to auto-update balance on transaction changes
CREATE OR REPLACE FUNCTION public.trg_update_bank_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_bank_balance(OLD.conta_bancaria_id);
    RETURN OLD;
  END IF;
  PERFORM recalc_bank_balance(NEW.conta_bancaria_id);
  IF TG_OP = 'UPDATE' AND OLD.conta_bancaria_id IS DISTINCT FROM NEW.conta_bancaria_id THEN
    PERFORM recalc_bank_balance(OLD.conta_bancaria_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_financial_transactions_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_update_bank_balance();
