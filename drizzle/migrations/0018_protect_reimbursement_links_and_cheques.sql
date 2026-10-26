CREATE OR REPLACE FUNCTION public.guard_reimbursement_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.is_reembolso AND (OLD.reembolso_folha_item_id IS NOT NULL OR OLD.valor_pago>0) THEN RAISE EXCEPTION 'Reembolso na folha ou pago não pode ser excluído.'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.reembolso_folha_item_id IS DISTINCT FROM OLD.reembolso_folha_item_id AND pg_trigger_depth()=1 THEN RAISE EXCEPTION 'Vínculo de reembolso é gerenciado pela folha.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aa_guard_reimbursement_link BEFORE UPDATE OF reembolso_folha_item_id OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.guard_reimbursement_link();
CREATE OR REPLACE FUNCTION public.guard_reimbursement_cheque() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE e public.expenses;
BEGIN
 IF NEW.expense_id IS NOT NULL THEN
  SELECT * INTO e FROM public.expenses WHERE id=NEW.expense_id FOR UPDATE;
  IF e.reembolso_folha_item_id IS NOT NULL THEN RAISE EXCEPTION 'Reembolso reservado na folha. Pague pelo RH.'; END IF;
  IF e.is_reembolso THEN NEW.favorecido_id:=e.reembolso_colaborador_id; NEW.favorecido_nome:=e.reembolso_colaborador_nome; END IF;
  IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens i WHERE i.expense_id=e.id AND i.reembolsos>0) THEN RAISE EXCEPTION 'Folha com reembolso deve ser paga pelo RH.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_guard_reimbursement_cheque BEFORE INSERT OR UPDATE ON public.cheques FOR EACH ROW EXECUTE FUNCTION public.guard_reimbursement_cheque();
CREATE OR REPLACE FUNCTION public.name_reimbursement_cash_movement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.expenses;
BEGIN
 SELECT * INTO e FROM public.expenses WHERE id=NEW.expense_id;
 IF e.is_reembolso AND NOT NEW.skip_cashflow THEN UPDATE public.movimentacoes_bancarias SET descricao='Reembolso — '||coalesce(e.reembolso_colaborador_nome,'Colaborador')||' — '||e.descricao WHERE origem='pagamento_despesa' AND origem_id=NEW.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_name_reimbursement_cash_movement AFTER INSERT ON public.expense_payments FOR EACH ROW EXECUTE FUNCTION public.name_reimbursement_cash_movement();