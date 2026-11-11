CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_folha_id uuid;
  v_status text;
BEGIN
  v_folha_id := COALESCE(NEW.folha_id, OLD.folha_id);
  SELECT status::text INTO v_status FROM public.folhas_pagamento WHERE id = v_folha_id;
  IF v_status = 'confirmada' THEN
    -- Permite apenas renomear o colaborador (sincronização com o cadastro)
    IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'colaborador_nome' - 'updated_at') = (to_jsonb(OLD) - 'colaborador_nome' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Itens de folha confirmada não podem ser alterados. Reabra a folha antes.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_profile_name_to_records()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' OR NEW.full_name IS NOT DISTINCT FROM OLD.full_name THEN
    RETURN NEW;
  END IF;
  UPDATE public.expenses SET favorecido_nome = NEW.full_name
    WHERE favorecido_id = NEW.id AND favorecido_nome IS DISTINCT FROM NEW.full_name;
  UPDATE public.expenses SET reembolso_colaborador_nome = NEW.full_name
    WHERE reembolso_colaborador_id = NEW.id AND reembolso_colaborador_nome IS DISTINCT FROM NEW.full_name;
  UPDATE public.credit_card_invoice_items SET favorecido_nome = NEW.full_name
    WHERE favorecido_id = NEW.id AND favorecido_nome IS DISTINCT FROM NEW.full_name;
  UPDATE public.folhas_pagamento_itens SET colaborador_nome = NEW.full_name
    WHERE colaborador_id = NEW.id AND colaborador_nome IS DISTINCT FROM NEW.full_name;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_profile_name_to_records ON public.profiles;
CREATE TRIGGER trg_sync_profile_name_to_records
AFTER UPDATE OF full_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_profile_name_to_records();