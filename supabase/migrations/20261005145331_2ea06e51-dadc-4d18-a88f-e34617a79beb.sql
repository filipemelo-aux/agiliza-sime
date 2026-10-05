CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.tenant_id FROM public.superadmin_support_context s
      WHERE s.user_id = auth.uid() AND public.has_role(auth.uid(),'superadmin')),
    (SELECT m.tenant_id FROM public.tenant_members m
       JOIN public.tenants t ON t.id = m.tenant_id AND t.status = 'active'
      WHERE m.user_id = auth.uid())
  )
$$;