CREATE OR REPLACE FUNCTION public.fn_set_tenant_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  IF NEW.tenant_id IS NULL AND (SELECT count(*) FROM public.tenants) = 1 THEN
    NEW.tenant_id := (SELECT id FROM public.tenants LIMIT 1);
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id não definido para %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $f$;
REVOKE EXECUTE ON FUNCTION public.fn_set_tenant_id() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
  sime uuid := (SELECT id FROM public.tenants WHERE cnpj='23662751000179');
  excluded text[] := ARRAY['tenants','tenant_members','tenant_secrets','tenant_certificates','superadmin_support_context','rate_limit_entries','security_audit_log','user_roles'];
BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema='public' AND table_type='BASE TABLE' AND NOT (table_name = ANY(excluded))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)', r.table_name);
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', r.table_name);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', r.table_name, sime);
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', r.table_name);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', r.table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', 'idx_'||r.table_name||'_tenant', r.table_name);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant_id ON public.%I', r.table_name);
    EXECUTE format('CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_set_tenant_id()', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation" ON public.%I', r.table_name);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated, anon USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id())', r.table_name);
  END LOOP;
END $$;