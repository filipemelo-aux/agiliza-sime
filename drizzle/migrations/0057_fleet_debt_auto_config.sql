CREATE TABLE public.fleet_debt_auto_config (
  tenant_id uuid PRIMARY KEY DEFAULT public.current_tenant_id() REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  acting_user_id uuid,
  last_run_date date,
  last_run_summary jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.fleet_debt_auto_config TO authenticated;
GRANT ALL ON public.fleet_debt_auto_config TO service_role;
ALTER TABLE public.fleet_debt_auto_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public.fleet_debt_auto_config AS RESTRICTIVE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id())) WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY "read config" ON public.fleet_debt_auto_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert config" ON public.fleet_debt_auto_config FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin')) OR (SELECT public.has_role((SELECT auth.uid()), 'moderator')) OR (SELECT public.has_role((SELECT auth.uid()), 'operador')));
CREATE POLICY "update config" ON public.fleet_debt_auto_config FOR UPDATE TO authenticated
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin')) OR (SELECT public.has_role((SELECT auth.uid()), 'moderator')) OR (SELECT public.has_role((SELECT auth.uid()), 'operador')));