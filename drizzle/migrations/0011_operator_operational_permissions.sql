DO $migration$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_group_items','receivable_payments','fatura_previsoes','faturas_recebimento','contas_receber','previsoes_recebimento','freight_contracts'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='tenant_isolation' AND permissive='RESTRICTIVE') THEN
      RAISE EXCEPTION 'Missing tenant isolation on %',t;
    END IF;
    EXECUTE format('CREATE POLICY operational_staff_manage ON public.%I AS PERMISSIVE FOR ALL TO authenticated USING ((SELECT public.has_role(auth.uid(), ''admin'')) OR (SELECT public.has_role(auth.uid(), ''moderator'')) OR (SELECT public.has_role(auth.uid(), ''operador''))) WITH CHECK ((SELECT public.has_role(auth.uid(), ''admin'')) OR (SELECT public.has_role(auth.uid(), ''moderator'')) OR (SELECT public.has_role(auth.uid(), ''operador'')))',t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',t);
  END LOOP;
END
$migration$;
CREATE POLICY moderator_delete_accounts_payable ON public.accounts_payable FOR DELETE TO authenticated USING ((SELECT public.has_role(auth.uid(),'moderator')));
CREATE POLICY operator_read_fiscal_settings ON public.fiscal_settings FOR SELECT TO authenticated USING ((SELECT public.has_role(auth.uid(),'operador')));
CREATE OR REPLACE FUNCTION public.next_cte_number(_establishment_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso negado à numeração fiscal'; END IF;
 UPDATE public.fiscal_establishments SET ultimo_numero_cte=ultimo_numero_cte+1, updated_at=now() WHERE id=_establishment_id AND tenant_id=public.current_tenant_id() RETURNING ultimo_numero_cte INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'Agência não encontrada ou sem acesso'; END IF;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.next_cte_servico_number(_establishment_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso negado à numeração fiscal'; END IF;
 UPDATE public.fiscal_establishments SET ultimo_numero_cte_servico=ultimo_numero_cte_servico+1, updated_at=now() WHERE id=_establishment_id AND tenant_id=public.current_tenant_id() RETURNING ultimo_numero_cte_servico INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'Agência não encontrada ou sem acesso'; END IF;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.next_mdfe_number(_establishment_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso negado à numeração fiscal'; END IF;
 UPDATE public.fiscal_establishments SET ultimo_numero_mdfe=ultimo_numero_mdfe+1, updated_at=now() WHERE id=_establishment_id AND tenant_id=public.current_tenant_id() RETURNING ultimo_numero_mdfe INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'Agência não encontrada ou sem acesso'; END IF;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.next_cte_number() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso negado à numeração fiscal'; END IF;
 UPDATE public.fiscal_settings SET ultimo_numero_cte=ultimo_numero_cte+1, updated_at=now() WHERE id=(SELECT id FROM public.fiscal_settings WHERE tenant_id=public.current_tenant_id() ORDER BY id LIMIT 1) RETURNING ultimo_numero_cte INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'Configuração fiscal não encontrada'; END IF;
 RETURN n;
END $$;
CREATE OR REPLACE FUNCTION public.next_mdfe_number() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso negado à numeração fiscal'; END IF;
 UPDATE public.fiscal_settings SET ultimo_numero_mdfe=ultimo_numero_mdfe+1, updated_at=now() WHERE id=(SELECT id FROM public.fiscal_settings WHERE tenant_id=public.current_tenant_id() ORDER BY id LIMIT 1) RETURNING ultimo_numero_mdfe INTO n;
 IF n IS NULL THEN RAISE EXCEPTION 'Configuração fiscal não encontrada'; END IF;
 RETURN n;
END $$;
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.reconcile_bank_item_with_expenses(uuid,jsonb,uuid)'::regprocedure) INTO definition;
 definition := replace(definition, 'OR public.has_role(auth.uid(), ''moderator''::public.app_role)', 'OR public.has_role(auth.uid(), ''moderator''::public.app_role) OR public.has_role(auth.uid(), ''operador''::public.app_role)');
 definition := replace(definition, 'WHERE id = _reconciliation_item_id', 'WHERE id = _reconciliation_item_id AND tenant_id = public.current_tenant_id()');
 definition := replace(definition, 'WHERE e.id = v_expense_id', 'WHERE e.id = v_expense_id AND e.tenant_id = public.current_tenant_id()');
 definition := replace(definition, 'IF _allocations IS NULL', 'IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION ''Usuário do pagamento inválido''; END IF; IF _allocations IS NULL');
 IF definition NOT LIKE '%operador%' OR definition NOT LIKE '%tenant_id = public.current_tenant_id()%' THEN RAISE EXCEPTION 'Unexpected reconciliation function'; END IF;
 EXECUTE definition;
END
$migration$;