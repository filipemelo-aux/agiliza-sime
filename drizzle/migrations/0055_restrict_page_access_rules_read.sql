DROP POLICY IF EXISTS "Authenticated read page rules" ON public.page_access_rules;
CREATE POLICY "Users read own or global page rules" ON public.page_access_rules
FOR SELECT TO authenticated
USING (user_id IS NULL OR user_id = (SELECT auth.uid()));