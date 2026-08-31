CREATE TABLE IF NOT EXISTS public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.fiscal_establishments(id),
  nome text NOT NULL,
  banco text,
  agencia text,
  conta text,
  tipo text NOT NULL DEFAULT 'corrente',
  saldo_inicial numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contas_bancarias TO authenticated;
GRANT ALL ON public.contas_bancarias TO service_role;

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view contas_bancarias"
  ON public.contas_bancarias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/Moderators manage contas_bancarias"
  ON public.contas_bancarias FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE TRIGGER trg_contas_bancarias_updated_at
  BEFORE UPDATE ON public.contas_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.expense_payments ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id);
ALTER TABLE public.receivable_payments ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid REFERENCES public.contas_bancarias(id);

ALTER TABLE public.movimentacoes_bancarias ALTER COLUMN empresa_id DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_resolve_movimentacao_empresa_conta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa uuid;
  v_conta uuid;
BEGIN
  IF NEW.origem = 'despesas' THEN
    SELECT empresa_id INTO v_empresa FROM expenses WHERE id = NEW.origem_id;

  ELSIF NEW.origem = 'pagamento_despesa' THEN
    SELECT e.empresa_id, ep.conta_bancaria_id INTO v_empresa, v_conta
    FROM expense_payments ep JOIN expenses e ON e.id = ep.expense_id
    WHERE ep.id = NEW.origem_id;

  ELSIF NEW.origem = 'pagamento_agrupado' THEN
    SELECT e.empresa_id, ep.conta_bancaria_id INTO v_empresa, v_conta
    FROM expense_payments ep JOIN expenses e ON e.id = ep.expense_id
    WHERE ep.lote_id = COALESCE(NEW.lote_id, NEW.origem_id)
    LIMIT 1;

  ELSIF NEW.origem = 'contas_receber' THEN
    SELECT empresa_id INTO v_empresa FROM contas_receber WHERE id = NEW.origem_id;

  ELSIF NEW.origem = 'recebimento_conta_receber' THEN
    SELECT cr.empresa_id, rp.conta_bancaria_id INTO v_empresa, v_conta
    FROM receivable_payments rp JOIN contas_receber cr ON cr.id = rp.conta_receber_id
    WHERE rp.id = NEW.origem_id;
  END IF;

  IF NEW.empresa_id IS NULL THEN
    NEW.empresa_id := COALESCE(v_empresa, (SELECT id FROM fiscal_establishments WHERE type = 'matriz' AND active LIMIT 1));
  END IF;

  IF NEW.conta_bancaria_id IS NULL THEN
    NEW.conta_bancaria_id := v_conta;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_resolve_movimentacao_empresa_conta() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_resolve_movimentacao_empresa_conta ON public.movimentacoes_bancarias;
CREATE TRIGGER trg_resolve_movimentacao_empresa_conta
  BEFORE INSERT ON public.movimentacoes_bancarias
  FOR EACH ROW EXECUTE FUNCTION public.fn_resolve_movimentacao_empresa_conta();

CREATE INDEX IF NOT EXISTS idx_movimentacoes_conta_bancaria ON public.movimentacoes_bancarias(conta_bancaria_id);