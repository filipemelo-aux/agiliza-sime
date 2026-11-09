ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS portal_revisado_em timestamptz;
CREATE OR REPLACE FUNCTION public.mark_portal_expense_review() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.portal_status = 'em_analise' AND NEW.portal_status = 'em_analise' THEN
    IF NEW.plano_contas_id IS NOT NULL AND NEW.favorecido_id IS NOT NULL AND NULLIF(btrim(NEW.favorecido_nome), '') IS NOT NULL AND NULLIF(btrim(NEW.descricao), '') IS NOT NULL THEN
      NEW.portal_revisado_em := now();
    ELSE
      NEW.portal_revisado_em := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mark_portal_expense_review BEFORE UPDATE OF plano_contas_id, favorecido_id, favorecido_nome, descricao ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.mark_portal_expense_review();
CREATE OR REPLACE FUNCTION public.validate_portal_expense_approval() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.portal_status = 'aprovado' AND OLD.portal_status IS DISTINCT FROM NEW.portal_status THEN
    IF OLD.portal_revisado_em IS NULL OR NEW.plano_contas_id IS NULL OR NEW.favorecido_id IS NULL OR NULLIF(btrim(NEW.favorecido_nome), '') IS NULL OR NULLIF(btrim(NEW.descricao), '') IS NULL THEN
      RAISE EXCEPTION 'Antes de aprovar o reembolso, edite e salve o plano de contas, a descrição da despesa e o favorecido cadastrado.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_portal_expense_approval BEFORE UPDATE OF portal_status ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.validate_portal_expense_approval();