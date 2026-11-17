CREATE TABLE public.vehicle_debt_consultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  uf text NOT NULL,
  endpoint text,
  response jsonb NOT NULL DEFAULT '[]'::jsonb,
  importacao jsonb,
  price text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.vehicle_debt_consultas(vehicle_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_debt_consultas TO authenticated;
GRANT ALL ON public.vehicle_debt_consultas TO service_role;
ALTER TABLE public.vehicle_debt_consultas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.vehicle_debt_consultas FOR EACH ROW EXECUTE FUNCTION fn_set_tenant_id();
CREATE POLICY tenant_isolation ON public.vehicle_debt_consultas AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = (SELECT current_tenant_id())) WITH CHECK (tenant_id = (SELECT current_tenant_id()));
CREATE POLICY "Staff manage debt consultas" ON public.vehicle_debt_consultas FOR ALL TO authenticated
  USING ((SELECT has_role(auth.uid(),'admin')) OR (SELECT has_role(auth.uid(),'moderator')) OR (SELECT has_role(auth.uid(),'operador')))
  WITH CHECK ((SELECT has_role(auth.uid(),'admin')) OR (SELECT has_role(auth.uid(),'moderator')) OR (SELECT has_role(auth.uid(),'operador')));
CREATE POLICY "Consultor read debt consultas" ON public.vehicle_debt_consultas FOR SELECT TO authenticated USING ((SELECT has_role(auth.uid(),'consultor')));