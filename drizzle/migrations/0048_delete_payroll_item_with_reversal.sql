CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_folha_id uuid; v_status text;
BEGIN
 v_folha_id:=COALESCE(NEW.folha_id,OLD.folha_id);
 SELECT status::text INTO v_status FROM public.folhas_pagamento WHERE id=v_folha_id;
 IF v_status='confirmada' THEN
  IF TG_OP='DELETE' AND current_setting('app.delete_payroll_item',true)=OLD.id::text AND OLD.tenant_id=public.current_tenant_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'colaborador_nome'-'updated_at')=(to_jsonb(OLD)-'colaborador_nome'-'updated_at') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Itens de folha confirmada não podem ser alterados. Reabra a folha antes.';
 END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE OR REPLACE FUNCTION public.bloquear_edicao_folha_confirmada() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.status='confirmada' THEN
  IF current_setting('app.delete_payroll_folha',true)=OLD.id::text AND OLD.tenant_id=public.current_tenant_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) AND (to_jsonb(NEW)-'total_base'-'total_adiantamentos'-'total_descontos'-'total_comissoes'-'total_liquido'-'updated_at')=(to_jsonb(OLD)-'total_base'-'total_adiantamentos'-'total_descontos'-'total_comissoes'-'total_liquido'-'updated_at') THEN RETURN NEW; END IF;
  IF NEW.status='em_aberto' THEN
   IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens i JOIN public.expenses e ON e.id=i.expense_id WHERE i.folha_id=OLD.id AND e.deleted_at IS NULL AND (COALESCE(e.valor_pago,0)>0 OR e.status::text IN ('pago','parcial'))) THEN RAISE EXCEPTION 'Folha possui pagamentos efetivos. Estorne os pagamentos antes de reabrir.'; END IF;
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Folha confirmada não pode ser editada diretamente. Reabra a folha antes.';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.delete_payroll_item_with_reversal(_item_id uuid,_execute boolean DEFAULT false,_expected_payment_ids uuid[] DEFAULT '{}'::uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.folhas_pagamento_itens; f public.folhas_pagamento; ids uuid[]; payment_ids uuid[]; details jsonb; amount numeric; remaining integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso operacional necessário.'; END IF;
 SELECT * INTO i FROM public.folhas_pagamento_itens WHERE id=_item_id AND tenant_id=public.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado nesta empresa.'; END IF;
 SELECT * INTO f FROM public.folhas_pagamento WHERE id=i.folha_id AND tenant_id=i.tenant_id FOR UPDATE;
 IF NOT FOUND OR f.status::text='cancelada' THEN RAISE EXCEPTION 'Folha indisponível para exclusão.'; END IF;
 ids:=array_remove(array_prepend(i.expense_id,coalesce(i.reembolso_expense_ids,'{}'::uuid[])),NULL);
 PERFORM id FROM public.expenses WHERE id=ANY(ids) AND tenant_id=i.tenant_id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.expenses WHERE id=ANY(ids) AND tenant_id IS DISTINCT FROM i.tenant_id) THEN RAISE EXCEPTION 'Despesa de outra empresa.'; END IF;
 PERFORM id FROM public.expense_payments WHERE tenant_id=i.tenant_id AND (expense_id=i.expense_id OR reembolso_folha_item_id=i.id) ORDER BY id FOR UPDATE;
 SELECT coalesce(array_agg(p.id ORDER BY p.id),'{}'::uuid[]),coalesce(sum(p.valor),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'descricao',e.descricao,'valor',p.valor,'data',p.data_pagamento,'forma',p.forma_pagamento,'reembolso',e.is_reembolso) ORDER BY p.data_pagamento,p.id),'[]'::jsonb) INTO payment_ids,amount,details FROM public.expense_payments p JOIN public.expenses e ON e.id=p.expense_id WHERE p.tenant_id=i.tenant_id AND (p.expense_id=i.expense_id OR p.reembolso_folha_item_id=i.id);
 IF NOT _execute THEN RETURN jsonb_build_object('item_id',i.id,'colaborador',i.colaborador_nome,'pagamentos',details,'total',amount); END IF;
 IF payment_ids IS DISTINCT FROM ARRAY(SELECT x FROM unnest(coalesce(_expected_payment_ids,'{}'::uuid[])) x ORDER BY x) THEN RAISE EXCEPTION 'Os pagamentos foram alterados. Abra novamente a confirmação antes de excluir.'; END IF;
 DELETE FROM public.expense_payments WHERE id=ANY(payment_ids) AND tenant_id=i.tenant_id;
 IF i.expense_id IS NOT NULL THEN
  UPDATE public.expenses SET valor_pago=0,data_pagamento=NULL,status='pendente',deleted_at=coalesce(deleted_at,now()) WHERE id=i.expense_id AND tenant_id=i.tenant_id;
 END IF;
 UPDATE public.comissoes SET status='pendente',folha_pagamento_id=NULL WHERE id=ANY(coalesce(i.comissao_ids,'{}'::uuid[])) AND folha_pagamento_id=f.id AND tenant_id=i.tenant_id;
 UPDATE public.descontos_folha SET folha_pagamento_id=NULL WHERE id=ANY(coalesce(i.desconto_ids,'{}'::uuid[])) AND folha_pagamento_id=f.id AND tenant_id=i.tenant_id;
 PERFORM set_config('app.delete_payroll_item',i.id::text,true);
 DELETE FROM public.folhas_pagamento_itens WHERE id=i.id AND tenant_id=i.tenant_id;
 SELECT count(*) INTO remaining FROM public.folhas_pagamento_itens WHERE folha_id=f.id;
 IF remaining=0 THEN
  UPDATE public.folhas_pagamento SET status='em_aberto' WHERE id=f.id;
  DELETE FROM public.folhas_pagamento WHERE id=f.id AND tenant_id=i.tenant_id;
 ELSE
  PERFORM set_config('app.delete_payroll_folha',f.id::text,true);
  UPDATE public.folhas_pagamento SET total_base=t.base,total_adiantamentos=t.adiant,total_descontos=t.descontos,total_comissoes=t.comissoes,total_liquido=t.liquido FROM (SELECT coalesce(sum(salario_base),0) base,coalesce(sum(adiantamentos),0) adiant,coalesce(sum(descontos),0) descontos,coalesce(sum(comissoes),0) comissoes,coalesce(sum(liquido),0) liquido FROM public.folhas_pagamento_itens WHERE folha_id=f.id) t WHERE id=f.id;
 END IF;
 PERFORM set_config('app.delete_payroll_item','',true); PERFORM set_config('app.delete_payroll_folha','',true);
 RETURN jsonb_build_object('item_id',i.id,'colaborador',i.colaborador_nome,'pagamentos',details,'total',amount,'excluido',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_payroll_item_with_reversal(uuid,boolean,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_payroll_item_with_reversal(uuid,boolean,uuid[]) TO authenticated,service_role;