DO $$
DECLARE t text;
BEGIN
  -- Operador: acesso total a tudo exceto configurações do sistema
  FOREACH t IN ARRAY ARRAY['bank_reconciliation_item_links','bank_reconciliation_items','bank_reconciliations','check_layouts','cheque_expense_links','cheques','comissoes','contas_bancarias','descontos_folha','despesa_rateio_veiculos','folhas_pagamento','folhas_pagamento_itens','maintenances','mdfe','movimentacoes_bancarias','payment_receipts','rh_config','veiculo_alienacao_parcelas','veiculo_documentos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Operador full access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Operador full access" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''operador'')) WITH CHECK (public.has_role(auth.uid(), ''operador''))', t);
  END LOOP;

  -- Consultor: somente leitura em todo o sistema
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
             AND c.relname NOT IN ('rate_limit_entries','security_audit_log','smtp_settings','fiscal_certificates')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Consultor read only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Consultor read only" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''consultor''))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Consultor read storage" ON storage.objects;
CREATE POLICY "Consultor read storage" ON storage.objects FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'consultor'));
DROP POLICY IF EXISTS "Operador full storage" ON storage.objects;
CREATE POLICY "Operador full storage" ON storage.objects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'operador') AND bucket_id <> 'fiscal-certificates') WITH CHECK (public.has_role(auth.uid(), 'operador') AND bucket_id <> 'fiscal-certificates');