UPDATE public.profiles
SET user_id = gen_random_uuid()
WHERE id = '85e2e5dd-86bb-4114-9bbb-13ec9fcdfdd9';

UPDATE public.fuel_orders fo
SET requester_name = p.full_name
FROM public.profiles p
WHERE p.user_id = fo.requester_user_id
  AND p.category = 'colaborador'
  AND fo.requester_name = 'SOMAFERTIL CAMINHOES LTDA';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique ON public.profiles (user_id);

CREATE POLICY "Operadores can select profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'operador'::app_role));

CREATE POLICY "Operadores can insert profiles"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'operador'::app_role));

CREATE POLICY "Operadores can update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'operador'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'operador'::app_role));