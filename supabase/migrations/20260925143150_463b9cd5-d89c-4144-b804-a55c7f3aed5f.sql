CREATE TABLE public.page_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('hidden','maintenance','active')),
  user_id uuid NULL,
  message text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX page_access_rules_uniq ON public.page_access_rules (page_url, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_access_rules TO authenticated;
GRANT ALL ON public.page_access_rules TO service_role;
ALTER TABLE public.page_access_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read page rules" ON public.page_access_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage page rules" ON public.page_access_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE TRIGGER trg_page_access_rules_updated BEFORE UPDATE ON public.page_access_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();