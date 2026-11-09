CREATE TABLE public.driver_portal_settings (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
 reimbursement_reasons jsonb NOT NULL DEFAULT '["Alimentação","Pedágio","Borracharia","Hospedagem","Lavagem","Peças","Outros"]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_portal_settings TO authenticated;
GRANT ALL ON public.driver_portal_settings TO service_role;
ALTER TABLE public.driver_portal_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.driver_portal_settings AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY admin_manage ON public.driver_portal_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.validate_driver_portal_reasons() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF jsonb_typeof(NEW.reimbursement_reasons) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Lista de motivos inválida'; END IF;
 IF jsonb_array_length(NEW.reimbursement_reasons) = 0 OR jsonb_array_length(NEW.reimbursement_reasons) > 100 THEN RAISE EXCEPTION 'Informe ao menos um motivo (máximo 100)'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.reimbursement_reasons) AS e(value) WHERE jsonb_typeof(value) <> 'string' OR length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'Motivo inválido (máximo 80 caracteres)'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements_text(NEW.reimbursement_reasons)) <> (SELECT count(DISTINCT lower(btrim(value))) FROM jsonb_array_elements_text(NEW.reimbursement_reasons) AS e(value)) THEN RAISE EXCEPTION 'Há motivos repetidos'; END IF;
 NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER validate_driver_portal_reasons BEFORE INSERT OR UPDATE ON public.driver_portal_settings FOR EACH ROW EXECUTE FUNCTION public.validate_driver_portal_reasons();