CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  OR (_role = 'admin' AND EXISTS (
        SELECT 1 FROM public.superadmin_support_context s
        JOIN public.user_roles r ON r.user_id = s.user_id AND r.role = 'superadmin'
        WHERE s.user_id = _user_id AND s.tenant_id IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.my_support_tenant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.tenant_id FROM public.superadmin_support_context s
  WHERE s.user_id = auth.uid() AND public.has_role(auth.uid(),'superadmin')
$$;
REVOKE EXECUTE ON FUNCTION public.my_support_tenant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_support_tenant() TO authenticated;