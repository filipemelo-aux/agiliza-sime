CREATE OR REPLACE FUNCTION public.fn_sync_cheque_favorecido_from_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.favorecido_nome,'') IS DISTINCT FROM coalesce(OLD.favorecido_nome,'')
     OR NEW.favorecido_id IS DISTINCT FROM OLD.favorecido_id THEN
    UPDATE public.cheques
       SET favorecido_nome = coalesce(NEW.favorecido_nome, favorecido_nome),
           favorecido_id = NEW.favorecido_id,
           updated_at = now()
     WHERE expense_id = NEW.id;

    UPDATE public.cheques c
       SET favorecido_nome = coalesce(NEW.favorecido_nome, c.favorecido_nome),
           favorecido_id = NEW.favorecido_id,
           updated_at = now()
      FROM public.cheque_expense_links l
     WHERE l.cheque_id = c.id AND l.expense_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cheque_favorecido_expense ON public.expenses;
CREATE TRIGGER trg_sync_cheque_favorecido_expense
AFTER UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cheque_favorecido_from_expense();

CREATE OR REPLACE FUNCTION public.fn_sync_cheque_favorecido_from_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.contratado_nome,'') IS DISTINCT FROM coalesce(OLD.contratado_nome,'')
     OR NEW.contratado_id IS DISTINCT FROM OLD.contratado_id THEN
    UPDATE public.cheques
       SET favorecido_nome = coalesce(NEW.contratado_nome, favorecido_nome),
           favorecido_id = NEW.contratado_id,
           updated_at = now()
     WHERE freight_contract_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cheque_favorecido_contract ON public.freight_contracts;
CREATE TRIGGER trg_sync_cheque_favorecido_contract
AFTER UPDATE ON public.freight_contracts
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_cheque_favorecido_from_contract();