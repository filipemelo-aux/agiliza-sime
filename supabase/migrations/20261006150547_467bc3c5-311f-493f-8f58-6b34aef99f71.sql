DO $$
DECLARE
  r record;
  q text;
  c text;
  stmt text;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    q := r.qual; c := r.with_check;
    IF q IS NOT NULL THEN
      q := regexp_replace(q, '(?<!SELECT )has_role\(auth\.uid\(\), (''[a-z]+''::app_role)\)', '(SELECT has_role((SELECT auth.uid()), \1))', 'g');
      q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      q := regexp_replace(q, '(?<!SELECT )current_tenant_id\(\)', '(SELECT current_tenant_id())', 'g');
    END IF;
    IF c IS NOT NULL THEN
      c := regexp_replace(c, '(?<!SELECT )has_role\(auth\.uid\(\), (''[a-z]+''::app_role)\)', '(SELECT has_role((SELECT auth.uid()), \1))', 'g');
      c := regexp_replace(c, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
      c := regexp_replace(c, '(?<!SELECT )current_tenant_id\(\)', '(SELECT current_tenant_id())', 'g');
    END IF;
    IF q IS DISTINCT FROM r.qual OR c IS DISTINCT FROM r.with_check THEN
      stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
      IF q IS NOT NULL THEN stmt := stmt || ' USING (' || q || ')'; END IF;
      IF c IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || c || ')'; END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_tenant_created ON public.expenses(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expense_payments_tenant_data ON public.expense_payments(tenant_id, data_pagamento DESC);
CREATE INDEX IF NOT EXISTS idx_expense_payments_expense ON public.expense_payments(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_payments_installment ON public.expense_payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_expense_installments_expense ON public.expense_installments(expense_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_tenant_status ON public.contas_receber(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contas_receber_fatura ON public.contas_receber(fatura_id);
CREATE INDEX IF NOT EXISTS idx_receivable_payments_conta ON public.receivable_payments(conta_receber_id);
CREATE INDEX IF NOT EXISTS idx_faturas_recebimento_tenant ON public.faturas_recebimento(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fatura_previsoes_fatura ON public.fatura_previsoes(fatura_id);
CREATE INDEX IF NOT EXISTS idx_fatura_previsoes_previsao ON public.fatura_previsoes(previsao_id);
CREATE INDEX IF NOT EXISTS idx_previsoes_recebimento_tenant_status ON public.previsoes_recebimento(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cheques_tenant ON public.cheques(tenant_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tenant_data ON public.movimentacoes_bancarias(tenant_id, data_movimentacao);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_origem ON public.movimentacoes_bancarias(origem_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_tenant ON public.accounts_payable(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles(user_id, role);