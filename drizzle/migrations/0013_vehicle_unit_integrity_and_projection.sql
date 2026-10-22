CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_normalized_plate_unique ON public.vehicles(tenant_id,upper(trim(plate)));
DROP INDEX IF EXISTS public.vehicles_plate_unique_idx;
CREATE OR REPLACE FUNCTION public.guard_vehicle_unit_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF (NEW.unit_category IS DISTINCT FROM OLD.unit_category OR (NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.is_active=false)) AND EXISTS(SELECT 1 FROM public.vehicle_assignments a WHERE a.tenant_id=OLD.tenant_id AND a.ended_at IS NULL AND (a.vehicle_id=OLD.id OR OLD.id=ANY(a.implement_ids))) THEN RAISE EXCEPTION 'Desengate a placa em Vinculações antes de mudar a categoria ou desativar o veículo.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_vehicle_unit_assignment BEFORE UPDATE OF unit_category,is_active ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_unit_assignment();
CREATE OR REPLACE FUNCTION public.refresh_vehicle_unit_projection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.plate IS DISTINCT FROM OLD.plate OR NEW.renavam IS DISTINCT FROM OLD.renavam THEN
 UPDATE public.vehicle_assignments SET notes=notes WHERE tenant_id=NEW.tenant_id AND ended_at IS NULL AND NEW.id=ANY(implement_ids);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refresh_vehicle_unit_projection AFTER UPDATE OF plate,renavam ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.refresh_vehicle_unit_projection();