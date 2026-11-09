CREATE TABLE public.driver_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE,
  cpf text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id)
);
GRANT SELECT ON public.driver_portal_access TO authenticated;
GRANT ALL ON public.driver_portal_access TO service_role;
ALTER TABLE public.driver_portal_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver reads own access" ON public.driver_portal_access FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY "staff reads tenant access" ON public.driver_portal_access FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')));

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS portal_status text,
  ADD COLUMN IF NOT EXISTS portal_anexo_path text;