DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns
           WHERE table_schema='public' AND column_name='tenant_id'
             AND table_name NOT IN ('tenant_members','tenant_certificates','tenant_secrets','superadmin_support_context')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id()', r.table_name);
  END LOOP;
END $$;