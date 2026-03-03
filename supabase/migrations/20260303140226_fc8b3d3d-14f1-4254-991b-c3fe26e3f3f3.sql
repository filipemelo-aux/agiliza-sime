
-- Drop existing moderator policies that may conflict, then recreate all

-- mdfe (already has select)
DROP POLICY IF EXISTS "Moderators can select mdfe" ON public.mdfe;

-- Now create all moderator write policies

-- profiles
CREATE POLICY "Moderators can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- vehicles
CREATE POLICY "Moderators can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- harvest_jobs
CREATE POLICY "Moderators can insert harvest_jobs" ON public.harvest_jobs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update harvest_jobs" ON public.harvest_jobs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete harvest_jobs" ON public.harvest_jobs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- harvest_assignments
CREATE POLICY "Moderators can insert harvest_assignments" ON public.harvest_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update harvest_assignments" ON public.harvest_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete harvest_assignments" ON public.harvest_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- freights
CREATE POLICY "Moderators can insert freights" ON public.freights FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update freights" ON public.freights FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete freights" ON public.freights FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- freight_applications
CREATE POLICY "Moderators can update freight_applications" ON public.freight_applications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- driver_services
CREATE POLICY "Moderators can select driver_services" ON public.driver_services FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert driver_services" ON public.driver_services FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update driver_services" ON public.driver_services FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete driver_services" ON public.driver_services FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- cargas
CREATE POLICY "Moderators can insert cargas" ON public.cargas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update cargas" ON public.cargas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete cargas" ON public.cargas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- quotations
CREATE POLICY "Moderators can insert quotations" ON public.quotations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update quotations" ON public.quotations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete quotations" ON public.quotations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- trailers
CREATE POLICY "Moderators can select trailers" ON public.trailers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert trailers" ON public.trailers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update trailers" ON public.trailers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete trailers" ON public.trailers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- ctes
CREATE POLICY "Moderators can insert ctes" ON public.ctes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update ctes" ON public.ctes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete ctes" ON public.ctes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- mdfe
CREATE POLICY "Moderators can select mdfe" ON public.mdfe FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert mdfe" ON public.mdfe FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update mdfe" ON public.mdfe FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete mdfe" ON public.mdfe FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_settings
CREATE POLICY "Moderators can insert fiscal_settings" ON public.fiscal_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update fiscal_settings" ON public.fiscal_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete fiscal_settings" ON public.fiscal_settings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_establishments
DROP POLICY IF EXISTS "Moderators can select establishments" ON public.fiscal_establishments;
CREATE POLICY "Moderators can select establishments" ON public.fiscal_establishments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert establishments" ON public.fiscal_establishments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update establishments" ON public.fiscal_establishments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete establishments" ON public.fiscal_establishments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_certificates
CREATE POLICY "Moderators can select fiscal_certificates" ON public.fiscal_certificates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert fiscal_certificates" ON public.fiscal_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update fiscal_certificates" ON public.fiscal_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete fiscal_certificates" ON public.fiscal_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- establishment_certificates
CREATE POLICY "Moderators can insert establishment_certificates" ON public.establishment_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update establishment_certificates" ON public.establishment_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete establishment_certificates" ON public.establishment_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_logs
CREATE POLICY "Moderators can select fiscal_logs" ON public.fiscal_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert fiscal_logs" ON public.fiscal_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_queue
CREATE POLICY "Moderators can select fiscal_queue" ON public.fiscal_queue FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert fiscal_queue" ON public.fiscal_queue FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update fiscal_queue" ON public.fiscal_queue FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- contingency_events
CREATE POLICY "Moderators can select contingency_events" ON public.contingency_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert contingency_events" ON public.contingency_events FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update contingency_events" ON public.contingency_events FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- driver_documents
CREATE POLICY "Moderators can select driver_documents" ON public.driver_documents FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert driver_documents" ON public.driver_documents FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update driver_documents" ON public.driver_documents FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
