CREATE POLICY "staff reads driver portal files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'driver-portal'
  AND (storage.foldername(name))[1] = public.current_tenant_id()::text
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')));