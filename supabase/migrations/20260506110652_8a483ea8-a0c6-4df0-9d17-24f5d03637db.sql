
-- 1) Tabela de recebimentos parciais
CREATE TABLE public.receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id uuid NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  valor numeric NOT NULL CHECK (valor > 0),
  forma_recebimento text NOT NULL,
  data_recebimento date NOT NULL DEFAULT CURRENT_DATE,
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_receivable_payments_conta ON public.receivable_payments(conta_receber_id);

ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read receivable_payments"
  ON public.receivable_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins/Moderators insert receivable_payments"
  ON public.receivable_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

CREATE POLICY "Admins/Moderators update receivable_payments"
  ON public.receivable_payments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

CREATE POLICY "Admins/Moderators delete receivable_payments"
  ON public.receivable_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));

-- 2) Validar que soma dos recebimentos não ultrapassa o valor do título
CREATE OR REPLACE FUNCTION public.validate_receivable_payment_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_existing numeric;
  v_valor numeric;
BEGIN
  SELECT valor INTO v_valor FROM contas_receber WHERE id = NEW.conta_receber_id;
  IF v_valor IS NULL THEN
    RAISE EXCEPTION 'Conta a receber não encontrada';
  END IF;
  SELECT COALESCE(SUM(valor),0) INTO v_existing FROM receivable_payments
    WHERE conta_receber_id = NEW.conta_receber_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_existing + NEW.valor > v_valor + 0.01 THEN
    RAISE EXCEPTION 'Soma dos recebimentos (R$ %) excede o valor do título (R$ %)', round(v_existing+NEW.valor,2), round(v_valor,2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_receivable_payment
BEFORE INSERT OR UPDATE ON public.receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.validate_receivable_payment_total();

-- 3) Sincronizar status / valor_recebido na conta_receber
CREATE OR REPLACE FUNCTION public.sync_conta_receber_from_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_conta uuid;
  v_total numeric;
  v_valor numeric;
  v_last_data date;
  v_last_forma text;
BEGIN
  v_conta := COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);

  SELECT COALESCE(SUM(valor),0) INTO v_total FROM receivable_payments WHERE conta_receber_id = v_conta;
  SELECT valor INTO v_valor FROM contas_receber WHERE id = v_conta;

  SELECT data_recebimento, forma_recebimento INTO v_last_data, v_last_forma
  FROM receivable_payments WHERE conta_receber_id = v_conta
  ORDER BY data_recebimento DESC, created_at DESC LIMIT 1;

  IF v_total <= 0 THEN
    UPDATE contas_receber SET
      status = 'aberto'::conta_receber_status,
      valor_recebido = 0,
      data_recebimento = NULL,
      forma_recebimento = NULL
    WHERE id = v_conta;
  ELSIF v_total + 0.005 >= COALESCE(v_valor,0) THEN
    UPDATE contas_receber SET
      status = 'recebido'::conta_receber_status,
      valor_recebido = v_total,
      data_recebimento = v_last_data,
      forma_recebimento = v_last_forma
    WHERE id = v_conta;
  ELSE
    UPDATE contas_receber SET
      status = 'aberto'::conta_receber_status,
      valor_recebido = v_total,
      data_recebimento = NULL,
      forma_recebimento = NULL
    WHERE id = v_conta;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_conta_receber_payments
AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_conta_receber_from_payments();

-- 4) Atualizar validador da movimentação bancária para aceitar nova origem
CREATE OR REPLACE FUNCTION public.validar_movimentacao_bancaria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.data_movimentacao IS NULL THEN
    RAISE EXCEPTION 'data_movimentacao é obrigatória para movimentações bancárias';
  END IF;
  IF NEW.origem IS NULL OR NEW.origem = '' THEN
    RAISE EXCEPTION 'origem é obrigatória para movimentações bancárias';
  END IF;
  IF NEW.origem_id IS NULL THEN
    RAISE EXCEPTION 'origem_id é obrigatório para movimentações bancárias';
  END IF;
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RAISE EXCEPTION 'valor deve ser maior que zero';
  END IF;
  IF NEW.tipo IS NULL OR NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'tipo deve ser entrada ou saida';
  END IF;

  IF NEW.origem = 'manual' THEN RETURN NEW; END IF;

  IF NEW.origem = 'contas_pagar' THEN
    IF NOT EXISTS (
      SELECT 1 FROM accounts_payable
      WHERE id = NEW.origem_id AND status = 'pago'
        AND (paid_at AT TIME ZONE 'America/Sao_Paulo')::date = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_pagar exige conta com status pago e data_movimentacao igual a paid_at';
    END IF;
  END IF;

  IF NEW.origem = 'contas_receber' THEN
    IF NOT EXISTS (
      SELECT 1 FROM contas_receber
      WHERE id = NEW.origem_id AND status = 'recebido' AND data_recebimento = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_receber exige conta com status recebido e data_movimentacao igual a data_recebimento';
    END IF;
  END IF;

  IF NEW.origem = 'recebimento_conta_receber' THEN
    IF NOT EXISTS (SELECT 1 FROM receivable_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de recebimento_conta_receber exige registro válido em receivable_payments';
    END IF;
  END IF;

  IF NEW.origem = 'colheitas' THEN
    IF NOT EXISTS (SELECT 1 FROM harvest_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de colheitas exige registro válido em harvest_payments';
    END IF;
  END IF;

  IF NEW.origem = 'pagamento_despesa' THEN
    IF NOT EXISTS (SELECT 1 FROM expense_payments WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de pagamento_despesa exige registro válido em expense_payments';
    END IF;
  END IF;

  IF NEW.origem = 'despesas' THEN
    IF NOT EXISTS (SELECT 1 FROM expenses WHERE id = NEW.origem_id) THEN
      RAISE EXCEPTION 'Movimentação de despesas exige registro válido em expenses';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 5) Movimentação bancária por recebimento individual
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_recebimento_parcial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT 'Recebimento fatura ' || f.numero::text INTO _desc
    FROM contas_receber c JOIN faturas_recebimento f ON f.id = c.fatura_id
    WHERE c.id = NEW.conta_receber_id;
    INSERT INTO movimentacoes_bancarias(tipo, origem, origem_id, valor, data_movimentacao, descricao)
    VALUES ('entrada','recebimento_conta_receber', NEW.id, NEW.valor, NEW.data_recebimento, COALESCE(_desc,'Recebimento'));
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    UPDATE movimentacoes_bancarias
       SET valor = NEW.valor, data_movimentacao = NEW.data_recebimento
     WHERE origem='recebimento_conta_receber' AND origem_id = NEW.id;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem='recebimento_conta_receber' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_movimentacao_recebimento_parcial
AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.gerar_movimentacao_recebimento_parcial();

-- 6) Evitar dupla movimentação: o trigger antigo só insere se não houver receivable_payments
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_conta_receber()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status <> 'recebido') THEN
    -- Se já existem recebimentos parciais registrados, eles geram suas próprias movimentações
    IF EXISTS (SELECT 1 FROM receivable_payments WHERE conta_receber_id = NEW.id) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM movimentacoes_bancarias WHERE origem = 'contas_receber' AND origem_id = NEW.id) THEN
      INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
      VALUES ('entrada', 'contas_receber', NEW.id, COALESCE(NEW.valor_recebido, NEW.valor), NEW.data_recebimento, 'Recebimento fatura ' || NEW.fatura_id::text);
    END IF;
  END IF;

  IF OLD.status = 'recebido' AND NEW.status <> 'recebido' THEN
    DELETE FROM movimentacoes_bancarias WHERE origem = 'contas_receber' AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
