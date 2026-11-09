ALTER TABLE public.driver_portal_settings ADD COLUMN reimbursement_accounts jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.validate_portal_reason_accounts() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE entry record;
BEGIN
 IF jsonb_typeof(NEW.reimbursement_accounts) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Planos de contas dos motivos inválidos'; END IF;
 FOR entry IN SELECT key, value FROM jsonb_each_text(NEW.reimbursement_accounts) LOOP
  IF NOT NEW.reimbursement_reasons ? entry.key THEN RAISE EXCEPTION 'Motivo não cadastrado: %', entry.key; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id::text = entry.value AND a.tenant_id = NEW.tenant_id AND a.ativo AND a.tipo = 'despesa' AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.conta_pai_id = a.id AND c.tenant_id = NEW.tenant_id)) THEN
   RAISE EXCEPTION 'Escolha uma conta de despesa ativa e sem subcontas para o motivo %', entry.key;
  END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_portal_reason_accounts BEFORE INSERT OR UPDATE ON public.driver_portal_settings FOR EACH ROW EXECUTE FUNCTION public.validate_portal_reason_accounts();