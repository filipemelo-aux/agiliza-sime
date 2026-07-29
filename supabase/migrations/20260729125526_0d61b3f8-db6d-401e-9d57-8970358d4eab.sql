
-- 1. profiles_operador_blanket_select: remove operador blanket access to PII
DROP POLICY IF EXISTS "Operadores can select profiles" ON public.profiles;
DROP POLICY IF EXISTS "Operadores can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Operadores can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Operadores can insert profiles" ON public.profiles;

-- 2. descontos_folha_colaborador_self_select: fix mapping (colaborador_id refs profiles.id, not auth.uid())
DROP POLICY IF EXISTS "Colaborador can view own descontos" ON public.descontos_folha;
CREATE POLICY "Colaborador can view own descontos"
  ON public.descontos_folha
  FOR SELECT
  TO authenticated
  USING (
    colaborador_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- 3. rh_config_moderator_no_write: restrict rh_config reads to admin only (sensitive payroll config)
DROP POLICY IF EXISTS "Admin/Mod read rh_config" ON public.rh_config;
CREATE POLICY "Admins read rh_config"
  ON public.rh_config
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- 4. discharge_proofs_no_ownership_check: scope storage policies by folder = auth.uid()
DROP POLICY IF EXISTS "Users can upload discharge proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own discharge proofs" ON storage.objects;

CREATE POLICY "Users can upload own discharge proofs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'discharge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view own discharge proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'discharge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own discharge proofs"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'discharge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
