-- Vinculações: uma única vinculação viva por veículo, atualizada no lugar.
-- O início e o término do conjunto deixam de ser registrados.

DROP TRIGGER IF EXISTS validate_vehicle_assignment ON public.vehicle_assignments;
DROP TRIGGER IF EXISTS project_vehicle_assignment ON public.vehicle_assignments;
DROP TRIGGER IF EXISTS guard_vehicle_unit_assignment ON public.vehicles;
DROP TRIGGER IF EXISTS refresh_vehicle_unit_projection ON public.vehicles;

DROP FUNCTION IF EXISTS public.validate_vehicle_assignment();
DROP FUNCTION IF EXISTS public.project_vehicle_assignment();
DROP FUNCTION IF EXISTS public.guard_vehicle_unit_assignment();
DROP FUNCTION IF EXISTS public.refresh_vehicle_unit_projection();
DROP FUNCTION IF EXISTS public.save_vehicle_assignment(uuid, uuid, uuid[], uuid, text);
DROP FUNCTION IF EXISTS public.end_vehicle_assignment(uuid);

DELETE FROM public.vehicle_assignments WHERE ended_at IS NOT NULL;

DROP INDEX IF EXISTS assignments_active_vehicle;
DROP INDEX IF EXISTS assignments_active_driver;

CREATE UNIQUE INDEX assignments_vehicle ON public.vehicle_assignments (tenant_id, vehicle_id);
CREATE UNIQUE INDEX assignments_driver ON public.vehicle_assignments (tenant_id, driver_profile_id) WHERE driver_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_vehicle_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c text; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,0));
 IF TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id) THEN RAISE EXCEPTION 'Esta vinculação pertence a outra placa. Atualize a lista.'; END IF;
 SELECT unit_category INTO c FROM public.vehicles WHERE id=NEW.vehicle_id AND tenant_id=NEW.tenant_id AND is_active IS DISTINCT FROM false;
 IF c IS NULL OR c IN ('semirreboque','dolly','reboque') THEN RAISE EXCEPTION 'Selecione uma unidade de tração ativa da empresa.'; END IF;
 IF cardinality(NEW.implement_ids)>3 THEN RAISE EXCEPTION 'Permitidos até três implementos por conjunto.'; END IF;
 IF c IN ('utilitario','passeio') AND cardinality(NEW.implement_ids)>0 THEN RAISE EXCEPTION 'Veículos leves não recebem implementos.'; END IF;
 SELECT count(DISTINCT x) INTO n FROM unnest(NEW.implement_ids)x;
 IF n<>cardinality(NEW.implement_ids) THEN RAISE EXCEPTION 'Não repita placas na composição.'; END IF;
 SELECT count(*) INTO n FROM public.vehicles WHERE id=ANY(NEW.implement_ids) AND tenant_id=NEW.tenant_id AND unit_category IN ('semirreboque','dolly','reboque') AND is_active IS DISTINCT FROM false;
 IF n<>cardinality(NEW.implement_ids) THEN RAISE EXCEPTION 'Selecione somente implementos ativos cadastrados na empresa.'; END IF;
 IF NEW.driver_profile_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=NEW.driver_profile_id AND tenant_id=NEW.tenant_id AND (category IN ('motorista','colaborador') OR categories_extra && ARRAY['motorista','colaborador'])) THEN RAISE EXCEPTION 'Motorista/colaborador inválido para esta empresa.'; END IF;
 IF EXISTS(SELECT 1 FROM public.vehicle_assignments WHERE tenant_id=NEW.tenant_id AND id<>NEW.id AND implement_ids && NEW.implement_ids) THEN RAISE EXCEPTION 'Uma placa já está em outro conjunto. Retire dela antes de vincular.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.project_vehicle_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE d uuid; plates text[]; renavams text[]; r public.vehicle_assignments;
BEGIN
 r := CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 SELECT coalesce(user_id,id) INTO d FROM public.profiles WHERE id=r.driver_profile_id AND tenant_id=r.tenant_id;
 SELECT array_agg(v.plate ORDER BY x.ordinality), array_agg(v.renavam ORDER BY x.ordinality) INTO plates, renavams FROM unnest(r.implement_ids) WITH ORDINALITY x(id,ordinality) JOIN public.vehicles v ON v.id=x.id AND v.tenant_id=r.tenant_id;
 UPDATE public.vehicles SET driver_id=d, trailer_plate_1=plates[1], trailer_plate_2=plates[2], trailer_plate_3=plates[3], trailer_renavam_1=renavams[1], trailer_renavam_2=renavams[2], trailer_renavam_3=renavams[3] WHERE id=r.vehicle_id AND tenant_id=r.tenant_id;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_vehicle_unit_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF (NEW.unit_category IS DISTINCT FROM OLD.unit_category OR (NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active=false)) AND EXISTS(SELECT 1 FROM public.vehicle_assignments a WHERE a.tenant_id=OLD.tenant_id AND (a.vehicle_id=OLD.id OR OLD.id=ANY(a.implement_ids))) THEN RAISE EXCEPTION 'Esta placa está em uma vinculação. Ajuste a vinculação antes de mudar a categoria ou desativar o veículo.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.refresh_vehicle_unit_projection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NEW.plate IS DISTINCT FROM OLD.plate OR NEW.renavam IS DISTINCT FROM OLD.renavam THEN
 UPDATE public.vehicle_assignments SET notes=notes WHERE tenant_id=NEW.tenant_id AND NEW.id=ANY(implement_ids);
 END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.save_vehicle_assignment(_vehicle_id uuid, _driver_profile_id uuid DEFAULT NULL::uuid, _implement_ids uuid[] DEFAULT '{}'::uuid[], _previous_id uuid DEFAULT NULL::uuid, _notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t uuid := public.current_tenant_id(); result uuid;
BEGIN
 IF t IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Sem permissão para alterar vinculações.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,0));
 IF _previous_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.vehicle_assignments WHERE id=_previous_id AND tenant_id=t AND vehicle_id=_vehicle_id) THEN RAISE EXCEPTION 'Vinculação já alterada. Atualize a lista.'; END IF;
 UPDATE public.vehicle_assignments SET driver_profile_id=_driver_profile_id, implement_ids=coalesce(_implement_ids,'{}'), notes=nullif(trim(_notes),'')
  WHERE tenant_id=t AND vehicle_id=_vehicle_id RETURNING id INTO result;
 IF result IS NULL THEN
  INSERT INTO public.vehicle_assignments(tenant_id,vehicle_id,driver_profile_id,implement_ids,created_by,notes) VALUES(t,_vehicle_id,_driver_profile_id,coalesce(_implement_ids,'{}'),auth.uid(),nullif(trim(_notes),'')) RETURNING id INTO result;
 END IF;
 RETURN result;
END $function$;

CREATE TRIGGER validate_vehicle_assignment BEFORE INSERT OR UPDATE ON public.vehicle_assignments FOR EACH ROW EXECUTE FUNCTION public.validate_vehicle_assignment();
CREATE TRIGGER project_vehicle_assignment AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_assignments FOR EACH ROW EXECUTE FUNCTION public.project_vehicle_assignment();
CREATE TRIGGER guard_vehicle_unit_assignment BEFORE UPDATE OF unit_category, is_active ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_unit_assignment();
CREATE TRIGGER refresh_vehicle_unit_projection AFTER UPDATE OF plate, renavam ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.refresh_vehicle_unit_projection();

COMMENT ON COLUMN public.vehicle_assignments.started_at IS 'DEPRECATED: não é mais usado; a vinculação é única por veículo e atualizada no lugar.';
COMMENT ON COLUMN public.vehicle_assignments.ended_at IS 'DEPRECATED: não é mais usado; a vinculação é única por veículo e atualizada no lugar.';