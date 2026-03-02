
-- Add moderator SELECT policies to key tables used by the dashboard

-- harvest_jobs
CREATE POLICY "Moderators can view all harvest_jobs"
ON public.harvest_jobs FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- harvest_assignments
CREATE POLICY "Moderators can view all harvest_assignments"
ON public.harvest_assignments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- freight_applications
CREATE POLICY "Moderators can view all freight applications"
ON public.freight_applications FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- freights
CREATE POLICY "Moderators can view all freights"
ON public.freights FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- profiles (moderator needs to see profiles for dashboard)
CREATE POLICY "Moderators can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- vehicles
CREATE POLICY "Moderators can view all vehicles"
ON public.vehicles FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- notifications (already has own-user policy, but moderator needs admin-level for bell)
-- Already OK - moderator sees own notifications

-- ctes
CREATE POLICY "Moderators can view ctes"
ON public.ctes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- mdfe
CREATE POLICY "Moderators can view mdfe"
ON public.mdfe FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- cargas
CREATE POLICY "Moderators can view cargas"
ON public.cargas FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- quotations
CREATE POLICY "Moderators can view quotations"
ON public.quotations FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_establishments (already has public SELECT, OK)
-- fiscal_settings
CREATE POLICY "Moderators can view fiscal_settings"
ON public.fiscal_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'moderator'::app_role));
