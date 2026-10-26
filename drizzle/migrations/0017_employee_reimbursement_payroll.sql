ALTER TABLE public.expenses ADD COLUMN is_reembolso boolean NOT NULL DEFAULT false, ADD COLUMN reembolso_colaborador_id uuid REFERENCES public.profiles(id), ADD COLUMN reembolso_colaborador_nome text, ADD COLUMN reembolso_folha_item_id uuid REFERENCES public.folhas_pagamento_itens(id) ON DELETE SET NULL;
ALTER TABLE public.folhas_pagamento_itens ADD COLUMN reembolsos numeric NOT NULL DEFAULT 0, ADD COLUMN reembolso_expense_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.expense_payments ADD COLUMN reembolso_folha_item_id uuid REFERENCES public.folhas_pagamento_itens(id);
ALTER TABLE public.expenses ADD CONSTRAINT expense_reembolso_employee CHECK (NOT is_reembolso OR reembolso_colaborador_id IS NOT NULL);
CREATE INDEX expenses_pending_reimbursement ON public.expenses(reembolso_colaborador_id, data_competencia) WHERE is_reembolso AND deleted_at IS NULL;
CREATE OR REPLACE FUNCTION public.guard_reimbursement_expense() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.is_reembolso THEN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=NEW.reembolso_colaborador_id AND p.tenant_id=NEW.tenant_id AND (p.category IN ('motorista','colaborador') OR p.is_colaborador_rh)) THEN RAISE EXCEPTION 'Selecione um motorista/colaborador da empresa para o reembolso.'; END IF;
  SELECT full_name INTO NEW.reembolso_colaborador_nome FROM public.profiles WHERE id=NEW.reembolso_colaborador_id;
 END IF;
 IF TG_OP='UPDATE' AND OLD.is_reembolso AND (OLD.reembolso_folha_item_id IS NOT NULL OR OLD.valor_pago>0) AND (NEW.is_reembolso IS DISTINCT FROM OLD.is_reembolso OR NEW.reembolso_colaborador_id IS DISTINCT FROM OLD.reembolso_colaborador_id OR NEW.valor_total IS DISTINCT FROM OLD.valor_total OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN RAISE EXCEPTION 'Reembolso vinculado à folha ou com pagamento não pode ser alterado/excluído. Remova da folha ou estorne primeiro.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_guard_reimbursement_expense BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_reimbursement_expense();
CREATE OR REPLACE FUNCTION public.reserve_payroll_reimbursements() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.expenses; total numeric:=0; eid uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.reembolso_expense_ids IS NOT DISTINCT FROM OLD.reembolso_expense_ids AND NEW.reembolsos IS NOT DISTINCT FROM OLD.reembolsos THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.reembolso_expense_ids<>'{}' THEN RAISE EXCEPTION 'Remova o colaborador da folha para alterar a seleção de reembolsos.'; END IF;
 IF cardinality(NEW.reembolso_expense_ids)<>(SELECT count(DISTINCT x) FROM unnest(NEW.reembolso_expense_ids) x) THEN RAISE EXCEPTION 'Reembolso repetido na folha.'; END IF;
 FOR eid IN SELECT x FROM unnest(NEW.reembolso_expense_ids) x ORDER BY x LOOP
  SELECT * INTO e FROM public.expenses WHERE id=eid FOR UPDATE;
  IF NOT FOUND OR NOT e.is_reembolso OR e.tenant_id<>NEW.tenant_id OR e.reembolso_colaborador_id<>NEW.colaborador_id OR e.deleted_at IS NOT NULL OR e.status::text IN ('pago','cancelado') OR e.reembolso_folha_item_id IS NOT NULL THEN RAISE EXCEPTION 'Reembolso indisponível: já pago, reservado ou de outro colaborador.'; END IF;
  total:=total+greatest(e.valor_total-coalesce(e.valor_pago,0),0);
  UPDATE public.expenses SET reembolso_folha_item_id=NEW.id WHERE id=eid;
 END LOOP;
 IF abs(total-NEW.reembolsos)>0.009 THEN RAISE EXCEPTION 'Saldo dos reembolsos mudou. Atualize a prévia da folha.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_reserve_payroll_reimbursements AFTER INSERT OR UPDATE OF reembolso_expense_ids,reembolsos ON public.folhas_pagamento_itens FOR EACH ROW EXECUTE FUNCTION public.reserve_payroll_reimbursements();
CREATE OR REPLACE FUNCTION public.guard_reimbursement_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e public.expenses;
BEGIN
 SELECT * INTO e FROM public.expenses WHERE id=NEW.expense_id FOR UPDATE;
 IF e.reembolso_folha_item_id IS NOT NULL AND NEW.reembolso_folha_item_id IS DISTINCT FROM e.reembolso_folha_item_id THEN RAISE EXCEPTION 'Reembolso reservado na folha. Efetue o pagamento pelo RH.'; END IF;
 IF NEW.reembolso_folha_item_id IS NOT NULL AND coalesce(current_setting('app.payroll_reimbursement',true),'')<>'allowed' THEN RAISE EXCEPTION 'Pagamento de reembolso da folha exige a operação do RH.'; END IF;
 IF EXISTS (SELECT 1 FROM public.folhas_pagamento_itens i WHERE i.expense_id=e.id AND i.reembolsos>0) AND coalesce(current_setting('app.payroll_reimbursement',true),'')<>'allowed' THEN RAISE EXCEPTION 'Esta folha inclui reembolsos. Pague pelo RH para liquidar todos os créditos.'; END IF;
 IF e.is_reembolso AND NEW.forma_pagamento='cartao_credito' THEN RAISE EXCEPTION 'Reembolso deve ser pago ao colaborador, não lançado como compra no cartão.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_guard_reimbursement_payment BEFORE INSERT OR UPDATE ON public.expense_payments FOR EACH ROW EXECUTE FUNCTION public.guard_reimbursement_payment();
CREATE OR REPLACE FUNCTION public.pay_payroll_item_with_reimbursements(_item_id uuid,_date date,_method text) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i public.folhas_pagamento_itens; f public.folhas_pagamento; e public.expenses; eid uuid; amount numeric; total numeric:=0; batch uuid:=gen_random_uuid();
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso operacional necessário.'; END IF;
 SELECT * INTO i FROM public.folhas_pagamento_itens WHERE id=_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado na folha.'; END IF;
 SELECT * INTO f FROM public.folhas_pagamento WHERE id=i.folha_id;
 IF f.status::text<>'confirmada' THEN RAISE EXCEPTION 'Confirme a folha antes do pagamento.'; END IF;
 IF _method NOT IN ('pix','transferencia','ted','dinheiro','cheque','boleto','cartao_debito') OR _date IS NULL THEN RAISE EXCEPTION 'Informe data e forma de pagamento válidas.'; END IF;
 PERFORM set_config('app.payroll_reimbursement','allowed',true);
 FOR eid IN SELECT x FROM unnest(array_remove(array_prepend(i.expense_id,i.reembolso_expense_ids),NULL)) x ORDER BY x LOOP
  SELECT * INTO e FROM public.expenses WHERE id=eid FOR UPDATE;
  IF NOT FOUND OR e.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Despesa da folha indisponível.'; END IF;
  IF e.is_reembolso AND (e.reembolso_folha_item_id IS DISTINCT FROM i.id OR e.reembolso_colaborador_id<>i.colaborador_id) THEN RAISE EXCEPTION 'Vínculo de reembolso inválido.'; END IF;
  amount:=round(greatest(e.valor_total-coalesce(e.valor_pago,0),0),2);
  IF amount>0 THEN
   INSERT INTO public.expense_payments(expense_id,valor,forma_pagamento,data_pagamento,created_by,lote_id,skip_cashflow,reembolso_folha_item_id,observacoes) VALUES(e.id,amount,_method,(_date::text||' 12:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',auth.uid(),batch,true,i.id,'Pagamento da folha e reembolsos — '||i.colaborador_nome);
   total:=total+amount;
  END IF;
 END LOOP;
 IF total>0 THEN INSERT INTO public.movimentacoes_bancarias(tipo,origem,origem_id,valor,data_movimentacao,descricao,lote_id,empresa_id,plano_contas_id) VALUES('saida','pagamento_agrupado',batch,total,_date,'Folha e reembolsos — '||i.colaborador_nome,batch,f.empresa_id,(SELECT plano_contas_id FROM public.expenses WHERE id=i.expense_id)); END IF;
 PERFORM set_config('app.payroll_reimbursement','',true);
 RETURN CASE WHEN total>0 THEN 1 ELSE 0 END;
END $$;
REVOKE ALL ON FUNCTION public.pay_payroll_item_with_reimbursements(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pay_payroll_item_with_reimbursements(uuid,date,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.release_cancelled_payroll_reimbursements() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status::text='cancelada' THEN UPDATE public.expenses SET reembolso_folha_item_id=NULL WHERE reembolso_folha_item_id IN (SELECT id FROM public.folhas_pagamento_itens WHERE folha_id=NEW.id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER release_cancelled_payroll_reimbursements AFTER UPDATE OF status ON public.folhas_pagamento FOR EACH ROW EXECUTE FUNCTION public.release_cancelled_payroll_reimbursements();
CREATE OR REPLACE FUNCTION public.guard_payroll_reimbursement_reopen() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status::text='confirmada' AND NEW.status::text='em_aberto' AND EXISTS(SELECT 1 FROM public.expenses e JOIN public.folhas_pagamento_itens i ON i.id=e.reembolso_folha_item_id WHERE i.folha_id=OLD.id AND e.valor_pago>0) THEN RAISE EXCEPTION 'Estorne os pagamentos dos reembolsos antes de reabrir a folha.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_guard_payroll_reimbursement_reopen BEFORE UPDATE OF status ON public.folhas_pagamento FOR EACH ROW EXECUTE FUNCTION public.guard_payroll_reimbursement_reopen();