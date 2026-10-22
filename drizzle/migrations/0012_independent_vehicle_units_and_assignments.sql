ALTER TABLE public.vehicles ADD COLUMN unit_category text, ADD COLUMN chassis text, ADD COLUMN tare_kg numeric, ADD COLUMN capacity_kg numeric, ADD COLUMN registration_pending boolean NOT NULL DEFAULT false;
UPDATE public.vehicles SET unit_category = CASE WHEN vehicle_type::text IN ('carreta','carreta_ls','rodotrem','bitrem') THEN 'cavalo' WHEN vehicle_type::text IN ('truck','bitruck','treminhao') THEN 'rigido' ELSE vehicle_type::text END;
ALTER TABLE public.vehicles ALTER COLUMN unit_category SET DEFAULT 'rigido';
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_unit_category_valid CHECK (unit_category IN ('cavalo','rigido','semirreboque','dolly','reboque','utilitario','passeio'));
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_unit_weights_valid CHECK ((tare_kg IS NULL OR tare_kg >= 0) AND (capacity_kg IS NULL OR capacity_kg >= 0));
CREATE UNIQUE INDEX vehicles_tenant_plate_unique ON public.vehicles(tenant_id,plate);
INSERT INTO public.vehicles(user_id,tenant_id,plate,renavam,vehicle_type,brand,model,year,owner_id,fleet_type,unit_category,registration_pending)
SELECT DISTINCT ON (v.tenant_id,s.plate) v.user_id,v.tenant_id,s.plate,s.renavam,'carreta'::public.vehicle_type,'Não informado','Não informado',1900,v.owner_id,v.fleet_type,CASE WHEN v.vehicle_type::text='rodotrem' AND s.position=2 THEN 'dolly' WHEN v.vehicle_type::text='treminhao' THEN 'reboque' ELSE 'semirreboque' END,true
FROM public.vehicles v CROSS JOIN LATERAL (VALUES(1,v.trailer_plate_1,v.trailer_renavam_1),(2,v.trailer_plate_2,v.trailer_renavam_2),(3,v.trailer_plate_3,v.trailer_renavam_3))s(position,plate,renavam)
WHERE nullif(s.plate,'') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.vehicles existing WHERE existing.plate=s.plate) ORDER BY v.tenant_id,s.plate,v.created_at;
CREATE TABLE public.vehicle_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id), vehicle_id uuid NOT NULL REFERENCES public.vehicles(id), driver_profile_id uuid REFERENCES public.profiles(id), implement_ids uuid[] NOT NULL DEFAULT '{}', started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, created_by uuid, notes text
);
GRANT SELECT ON public.vehicle_assignments TO authenticated;
GRANT ALL ON public.vehicle_assignments TO service_role;
ALTER TABLE public.vehicle_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY assignments_tenant_isolation ON public.vehicle_assignments AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id=public.current_tenant_id()) WITH CHECK (tenant_id=public.current_tenant_id());
CREATE POLICY assignments_read ON public.vehicle_assignments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'consultor'));
CREATE UNIQUE INDEX assignments_active_vehicle ON public.vehicle_assignments(tenant_id,vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX assignments_active_driver ON public.vehicle_assignments(tenant_id,driver_profile_id) WHERE ended_at IS NULL AND driver_profile_id IS NOT NULL;
CREATE INDEX assignments_history ON public.vehicle_assignments(tenant_id,started_at DESC);
INSERT INTO public.vehicle_assignments(tenant_id,vehicle_id,driver_profile_id,implement_ids,started_at,created_by,notes)
SELECT v.tenant_id,v.id,(SELECT p.id FROM public.profiles p WHERE p.tenant_id=v.tenant_id AND (p.id=v.driver_id OR p.user_id=v.driver_id) ORDER BY (p.id=v.driver_id) DESC LIMIT 1),coalesce((SELECT array_agg(i.id ORDER BY s.position) FROM (VALUES(1,v.trailer_plate_1),(2,v.trailer_plate_2),(3,v.trailer_plate_3))s(position,plate) JOIN public.vehicles i ON i.tenant_id=v.tenant_id AND i.plate=s.plate),'{}'::uuid[]),v.created_at,v.user_id,'Migrado do cadastro anterior'
FROM public.vehicles v WHERE v.unit_category NOT IN ('semirreboque','dolly','reboque') AND (v.driver_id IS NOT NULL OR v.trailer_plate_1 IS NOT NULL OR v.trailer_plate_2 IS NOT NULL OR v.trailer_plate_3 IS NOT NULL);
CREATE OR REPLACE FUNCTION public.validate_vehicle_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c text; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,0));
 IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.driver_profile_id IS DISTINCT FROM OLD.driver_profile_id OR NEW.implement_ids IS DISTINCT FROM OLD.implement_ids OR NEW.started_at IS DISTINCT FROM OLD.started_at OR OLD.ended_at IS NOT NULL) THEN RAISE EXCEPTION 'Encerre a vinculação anterior antes de trocar o conjunto.'; END IF;
 IF NEW.ended_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT unit_category INTO c FROM public.vehicles WHERE id=NEW.vehicle_id AND tenant_id=NEW.tenant_id AND is_active IS DISTINCT FROM false;
 IF c IS NULL OR c IN ('semirreboque','dolly','reboque') THEN RAISE EXCEPTION 'Selecione uma unidade de tração ativa da empresa.'; END IF;
 IF cardinality(NEW.implement_ids)>3 THEN RAISE EXCEPTION 'Permitidos até três implementos por conjunto.'; END IF;
 IF c IN ('utilitario','passeio') AND cardinality(NEW.implement_ids)>0 THEN RAISE EXCEPTION 'Veículos leves não recebem implementos.'; END IF;
 SELECT count(DISTINCT x) INTO n FROM unnest(NEW.implement_ids)x;
 IF n<>cardinality(NEW.implement_ids) THEN RAISE EXCEPTION 'Não repita placas na composição.'; END IF;
 SELECT count(*) INTO n FROM public.vehicles WHERE id=ANY(NEW.implement_ids) AND tenant_id=NEW.tenant_id AND unit_category IN ('semirreboque','dolly','reboque') AND is_active IS DISTINCT FROM false;
 IF n<>cardinality(NEW.implement_ids) THEN RAISE EXCEPTION 'Selecione somente implementos ativos cadastrados na empresa.'; END IF;
 IF NEW.driver_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.driver_profile_id AND tenant_id=NEW.tenant_id AND (category IN ('motorista','colaborador') OR categories_extra && ARRAY['motorista','colaborador'])) THEN RAISE EXCEPTION 'Motorista/colaborador inválido para esta empresa.'; END IF;
 IF EXISTS(SELECT 1 FROM public.vehicle_assignments WHERE tenant_id=NEW.tenant_id AND ended_at IS NULL AND id<>NEW.id AND implement_ids && NEW.implement_ids) THEN RAISE EXCEPTION 'Uma placa já está vinculada a outro conjunto. Desengate antes de vincular.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_vehicle_assignment BEFORE INSERT OR UPDATE ON public.vehicle_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_assignment();
CREATE OR REPLACE FUNCTION public.project_vehicle_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d uuid; plates text[]; renavams text[];
BEGIN
 IF NEW.ended_at IS NULL THEN
 SELECT coalesce(user_id,id) INTO d FROM public.profiles WHERE id=NEW.driver_profile_id AND tenant_id=NEW.tenant_id;
 SELECT array_agg(v.plate ORDER BY x.ordinality),array_agg(v.renavam ORDER BY x.ordinality) INTO plates,renavams FROM unnest(NEW.implement_ids) WITH ORDINALITY x(id,ordinality) JOIN public.vehicles v ON v.id=x.id AND v.tenant_id=NEW.tenant_id;
 ELSE d:=NULL; plates:='{}'; renavams:='{}'; END IF;
 UPDATE public.vehicles SET driver_id=d,trailer_plate_1=plates[1],trailer_plate_2=plates[2],trailer_plate_3=plates[3],trailer_renavam_1=renavams[1],trailer_renavam_2=renavams[2],trailer_renavam_3=renavams[3] WHERE id=NEW.vehicle_id AND tenant_id=NEW.tenant_id;
 RETURN NEW;
END $$;
CREATE TRIGGER project_vehicle_assignment AFTER INSERT OR UPDATE ON public.vehicle_assignments FOR EACH ROW EXECUTE FUNCTION public.project_vehicle_assignment();
CREATE OR REPLACE FUNCTION public.save_vehicle_assignment(_vehicle_id uuid,_driver_profile_id uuid DEFAULT NULL,_implement_ids uuid[] DEFAULT '{}',_previous_id uuid DEFAULT NULL,_notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid:=public.current_tenant_id(); result uuid;
BEGIN
 IF t IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Sem permissão para alterar vinculações.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 IF _previous_id IS NOT NULL THEN
 UPDATE public.vehicle_assignments SET ended_at=now() WHERE id=_previous_id AND tenant_id=t AND ended_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vinculação já alterada. Atualize a lista.'; END IF;
 END IF;
 INSERT INTO public.vehicle_assignments(tenant_id,vehicle_id,driver_profile_id,implement_ids,created_by,notes) VALUES(t,_vehicle_id,_driver_profile_id,coalesce(_implement_ids,'{}'),auth.uid(),nullif(trim(_notes),'')) RETURNING id INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_vehicle_assignment(uuid,uuid,uuid[],uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_vehicle_assignment(uuid,uuid,uuid[],uuid,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.end_vehicle_assignment(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid:=public.current_tenant_id();
BEGIN
 IF t IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Sem permissão para alterar vinculações.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 UPDATE public.vehicle_assignments SET ended_at=now() WHERE id=_id AND tenant_id=t AND ended_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Vinculação já encerrada ou não encontrada.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.end_vehicle_assignment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_vehicle_assignment(uuid) TO authenticated,service_role;
COMMENT ON COLUMN public.vehicles.driver_id IS 'Compatibility projection of active vehicle_assignments; do not edit in plate registration.';
COMMENT ON COLUMN public.vehicles.trailer_plate_1 IS 'Compatibility projection of active vehicle_assignments implement_ids.';
COMMENT ON COLUMN public.vehicles.trailer_plate_2 IS 'Compatibility projection of active vehicle_assignments implement_ids.';
COMMENT ON COLUMN public.vehicles.trailer_plate_3 IS 'Compatibility projection of active vehicle_assignments implement_ids.';
COMMENT ON TABLE public.trailers IS 'DEPRECATED: independent implement plates live in vehicles; compositions live in vehicle_assignments.';