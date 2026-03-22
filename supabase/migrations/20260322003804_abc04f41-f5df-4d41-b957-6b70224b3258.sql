DROP POLICY IF EXISTS "Admins can manage smtp_settings" ON public.smtp_settings;
DROP POLICY IF EXISTS "Moderators can view smtp_settings" ON public.smtp_settings;

CREATE POLICY "Admins and moderators can manage smtp_settings"
ON public.smtp_settings
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
);