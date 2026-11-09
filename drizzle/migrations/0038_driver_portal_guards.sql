CREATE OR REPLACE FUNCTION public.guard_portal_expense_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    IF NEW.reembolso_folha_item_id IS NOT NULL AND OLD.reembolso_folha_item_id IS DISTINCT FROM NEW.reembolso_folha_item_id
       AND NEW.portal_status IN ('em_analise','rejeitado') THEN
      RAISE EXCEPTION 'Reembolso enviado pelo portal ainda não foi aprovado';
    END IF;
    RETURN NEW;
  END IF;
  SELECT portal_status INTO st FROM public.expenses WHERE id = NEW.expense_id;
  IF st IN ('em_analise','rejeitado') THEN
    RAISE EXCEPTION 'Reembolso enviado pelo portal ainda não foi aprovado';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_portal_expense_folha BEFORE UPDATE OF reembolso_folha_item_id ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.guard_portal_expense_pending();
CREATE TRIGGER trg_guard_portal_expense_payment BEFORE INSERT ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.guard_portal_expense_pending();