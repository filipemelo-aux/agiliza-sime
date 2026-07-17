
-- Trigger: resolve plano_contas_id no INSERT em movimentacoes_bancarias
-- Bloqueia lançamentos sem classificação contábil.

CREATE OR REPLACE FUNCTION public.fn_resolve_movimentacao_plano_contas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano uuid;
  v_origem_tipo text;
  v_default_frete uuid;
  v_default_colheita uuid;
BEGIN
  IF NEW.plano_contas_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.origem = 'despesas' THEN
    SELECT plano_contas_id INTO v_plano FROM public.expenses WHERE id = NEW.origem_id;

  ELSIF NEW.origem = 'pagamento_despesa' THEN
    SELECT e.plano_contas_id INTO v_plano
    FROM public.expense_payments ep
    JOIN public.expenses e ON e.id = ep.expense_id
    WHERE ep.id = NEW.origem_id;

  ELSIF NEW.origem = 'pagamento_agrupado' THEN
    SELECT e.plano_contas_id INTO v_plano
    FROM public.expense_payments ep
    JOIN public.expenses e ON e.id = ep.expense_id
    WHERE ep.lote_id = COALESCE(NEW.lote_id, NEW.origem_id)
      AND e.plano_contas_id IS NOT NULL
    LIMIT 1;

  ELSIF NEW.origem = 'contas_pagar' THEN
    SELECT category_id INTO v_plano FROM public.accounts_payable WHERE id = NEW.origem_id;

  ELSIF NEW.origem IN ('contas_receber', 'recebimento_conta_receber') THEN
    SELECT id INTO v_default_frete FROM public.chart_of_accounts WHERE codigo = '1.1.01' AND tipo = 'receita' LIMIT 1;
    SELECT id INTO v_default_colheita FROM public.chart_of_accounts WHERE codigo = '1.1.02' AND tipo = 'receita' LIMIT 1;

    IF NEW.origem = 'contas_receber' THEN
      SELECT p.origem_tipo::text INTO v_origem_tipo
      FROM public.contas_receber cr
      JOIN public.fatura_previsoes fp ON fp.fatura_id = cr.fatura_id
      JOIN public.previsoes_recebimento p ON p.id = fp.previsao_id
      WHERE cr.id = NEW.origem_id
      LIMIT 1;
    ELSE
      SELECT p.origem_tipo::text INTO v_origem_tipo
      FROM public.receivable_payments rp
      JOIN public.contas_receber cr ON cr.id = rp.conta_receber_id
      JOIN public.fatura_previsoes fp ON fp.fatura_id = cr.fatura_id
      JOIN public.previsoes_recebimento p ON p.id = fp.previsao_id
      WHERE rp.id = NEW.origem_id
      LIMIT 1;
    END IF;

    IF v_origem_tipo = 'colheita' THEN
      v_plano := v_default_colheita;
    ELSE
      v_plano := v_default_frete;
    END IF;

  ELSIF NEW.origem = 'colheitas' THEN
    SELECT id INTO v_plano FROM public.chart_of_accounts WHERE codigo = '1.1.02' AND tipo = 'receita' LIMIT 1;
  END IF;

  NEW.plano_contas_id := v_plano;

  IF NEW.plano_contas_id IS NULL THEN
    RAISE EXCEPTION 'Movimentação sem classificação: informe o plano de contas antes de registrar a % (origem: %). Classifique a despesa/receita de origem ou selecione uma conta no lançamento manual.',
      NEW.tipo, NEW.origem
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_movimentacao_plano_contas ON public.movimentacoes_bancarias;
CREATE TRIGGER trg_resolve_movimentacao_plano_contas
BEFORE INSERT ON public.movimentacoes_bancarias
FOR EACH ROW EXECUTE FUNCTION public.fn_resolve_movimentacao_plano_contas();
