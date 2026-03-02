
-- The problem: all existing policies are RESTRICTIVE (AND logic).
-- Even with new moderator PERMISSIVE policies, the RESTRICTIVE admin policies
-- MUST ALL pass, which fails for moderators.
-- Fix: Convert admin policies to PERMISSIVE on tables that moderators need access to.

-- harvest_jobs: drop restrictive admin ALL, recreate as permissive per-operation
DROP POLICY IF EXISTS "Admins can manage harvest_jobs" ON public.harvest_jobs;
DROP POLICY IF EXISTS "Moderators can view all harvest_jobs" ON public.harvest_jobs;
CREATE POLICY "Admins can select harvest_jobs" ON public.harvest_jobs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert harvest_jobs" ON public.harvest_jobs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update harvest_jobs" ON public.harvest_jobs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete harvest_jobs" ON public.harvest_jobs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can view harvest_jobs" ON public.harvest_jobs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- harvest_assignments
DROP POLICY IF EXISTS "Admins can manage harvest_assignments" ON public.harvest_assignments;
DROP POLICY IF EXISTS "Users can view own harvest_assignments" ON public.harvest_assignments;
DROP POLICY IF EXISTS "Moderators can view all harvest_assignments" ON public.harvest_assignments;
CREATE POLICY "Admins can select harvest_assignments" ON public.harvest_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert harvest_assignments" ON public.harvest_assignments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update harvest_assignments" ON public.harvest_assignments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete harvest_assignments" ON public.harvest_assignments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can view harvest_assignments" ON public.harvest_assignments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Users can view own harvest_assignments" ON public.harvest_assignments FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- freight_applications
DROP POLICY IF EXISTS "Admins can view all freight applications" ON public.freight_applications;
DROP POLICY IF EXISTS "Admins can update freight applications" ON public.freight_applications;
DROP POLICY IF EXISTS "Users can view own applications" ON public.freight_applications;
DROP POLICY IF EXISTS "Users can insert own applications" ON public.freight_applications;
DROP POLICY IF EXISTS "Users can update own applications for loading proof" ON public.freight_applications;
DROP POLICY IF EXISTS "Moderators can view all freight applications" ON public.freight_applications;
CREATE POLICY "Admins can view freight_applications" ON public.freight_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update freight_applications" ON public.freight_applications FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can view freight_applications" ON public.freight_applications FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Users can view own freight_applications" ON public.freight_applications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own freight_applications" ON public.freight_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own freight_applications" ON public.freight_applications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- freights
DROP POLICY IF EXISTS "Admins can view all freights" ON public.freights;
DROP POLICY IF EXISTS "Admins can insert freights" ON public.freights;
DROP POLICY IF EXISTS "Admins can update freights" ON public.freights;
DROP POLICY IF EXISTS "Admins can delete freights" ON public.freights;
DROP POLICY IF EXISTS "Anyone can view available freights" ON public.freights;
DROP POLICY IF EXISTS "Moderators can view all freights" ON public.freights;
CREATE POLICY "Admins can select freights" ON public.freights FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert freights" ON public.freights FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update freights" ON public.freights FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete freights" ON public.freights FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view available freights" ON public.freights FOR SELECT TO authenticated USING (status = 'available'::freight_status);
CREATE POLICY "Moderators can view freights" ON public.freights FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Moderators can view all profiles" ON public.profiles;
CREATE POLICY "Admins can select profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update profiles" ON public.profiles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select profiles" ON public.profiles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- vehicles
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can view own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can insert own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can update own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Users can delete own vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Moderators can view all vehicles" ON public.vehicles;
CREATE POLICY "Admins can select vehicles" ON public.vehicles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select vehicles" ON public.vehicles FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Users can view own vehicles" ON public.vehicles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vehicles" ON public.vehicles FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ctes
DROP POLICY IF EXISTS "Admins can manage ctes" ON public.ctes;
DROP POLICY IF EXISTS "Moderators can view ctes" ON public.ctes;
CREATE POLICY "Admins can select ctes" ON public.ctes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert ctes" ON public.ctes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update ctes" ON public.ctes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete ctes" ON public.ctes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select ctes" ON public.ctes FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- mdfe
DROP POLICY IF EXISTS "Admins can manage mdfe" ON public.mdfe;
DROP POLICY IF EXISTS "Moderators can view mdfe" ON public.mdfe;
CREATE POLICY "Admins can select mdfe" ON public.mdfe FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert mdfe" ON public.mdfe FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update mdfe" ON public.mdfe FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete mdfe" ON public.mdfe FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select mdfe" ON public.mdfe FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- cargas
DROP POLICY IF EXISTS "Admins can manage cargas" ON public.cargas;
DROP POLICY IF EXISTS "Moderators can view cargas" ON public.cargas;
CREATE POLICY "Admins can select cargas" ON public.cargas FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert cargas" ON public.cargas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update cargas" ON public.cargas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cargas" ON public.cargas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select cargas" ON public.cargas FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- quotations
DROP POLICY IF EXISTS "Admins can manage quotations" ON public.quotations;
DROP POLICY IF EXISTS "Moderators can view quotations" ON public.quotations;
CREATE POLICY "Admins can select quotations" ON public.quotations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert quotations" ON public.quotations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update quotations" ON public.quotations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete quotations" ON public.quotations FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select quotations" ON public.quotations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- fiscal_settings
DROP POLICY IF EXISTS "Admins can manage fiscal_settings" ON public.fiscal_settings;
DROP POLICY IF EXISTS "Moderators can view fiscal_settings" ON public.fiscal_settings;
CREATE POLICY "Admins can select fiscal_settings" ON public.fiscal_settings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert fiscal_settings" ON public.fiscal_settings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update fiscal_settings" ON public.fiscal_settings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete fiscal_settings" ON public.fiscal_settings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select fiscal_settings" ON public.fiscal_settings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- Also fix remaining restrictive tables: fiscal_logs, fiscal_queue, fiscal_certificates, 
-- fiscal_establishments, contingency_events, driver_services, driver_documents, notifications, trailers
-- These keep existing behavior but as PERMISSIVE

-- fiscal_logs
DROP POLICY IF EXISTS "Admins can manage fiscal_logs" ON public.fiscal_logs;
CREATE POLICY "Admins can select fiscal_logs" ON public.fiscal_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert fiscal_logs" ON public.fiscal_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update fiscal_logs" ON public.fiscal_logs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete fiscal_logs" ON public.fiscal_logs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- fiscal_queue
DROP POLICY IF EXISTS "Admins can manage fiscal_queue" ON public.fiscal_queue;
CREATE POLICY "Admins can select fiscal_queue" ON public.fiscal_queue FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert fiscal_queue" ON public.fiscal_queue FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update fiscal_queue" ON public.fiscal_queue FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete fiscal_queue" ON public.fiscal_queue FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- fiscal_certificates
DROP POLICY IF EXISTS "Admins can manage fiscal_certificates" ON public.fiscal_certificates;
CREATE POLICY "Admins can select fiscal_certificates" ON public.fiscal_certificates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert fiscal_certificates" ON public.fiscal_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update fiscal_certificates" ON public.fiscal_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete fiscal_certificates" ON public.fiscal_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- fiscal_establishments
DROP POLICY IF EXISTS "Admins can manage establishments" ON public.fiscal_establishments;
DROP POLICY IF EXISTS "Users can view establishments" ON public.fiscal_establishments;
CREATE POLICY "Admins can select establishments" ON public.fiscal_establishments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert establishments" ON public.fiscal_establishments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update establishments" ON public.fiscal_establishments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete establishments" ON public.fiscal_establishments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view establishments" ON public.fiscal_establishments FOR SELECT TO authenticated USING (true);

-- establishment_certificates
DROP POLICY IF EXISTS "Admins can manage establishment_certificates" ON public.establishment_certificates;
DROP POLICY IF EXISTS "Users can view establishment_certificates" ON public.establishment_certificates;
CREATE POLICY "Admins can select establishment_certificates" ON public.establishment_certificates FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert establishment_certificates" ON public.establishment_certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update establishment_certificates" ON public.establishment_certificates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete establishment_certificates" ON public.establishment_certificates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view establishment_certificates" ON public.establishment_certificates FOR SELECT TO authenticated USING (true);

-- contingency_events
DROP POLICY IF EXISTS "Admins can manage contingency_events" ON public.contingency_events;
CREATE POLICY "Admins can select contingency_events" ON public.contingency_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert contingency_events" ON public.contingency_events FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update contingency_events" ON public.contingency_events FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete contingency_events" ON public.contingency_events FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- driver_services
DROP POLICY IF EXISTS "Admins can manage driver_services" ON public.driver_services;
DROP POLICY IF EXISTS "Users can view own driver_services" ON public.driver_services;
CREATE POLICY "Admins can select driver_services" ON public.driver_services FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert driver_services" ON public.driver_services FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update driver_services" ON public.driver_services FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete driver_services" ON public.driver_services FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own driver_services" ON public.driver_services FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- driver_documents
DROP POLICY IF EXISTS "Admins can view all driver documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Admins can insert driver documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Admins can update driver documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Admins can delete driver documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Users can view own documents" ON public.driver_documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON public.driver_documents;
CREATE POLICY "Admins can select driver_documents" ON public.driver_documents FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert driver_documents" ON public.driver_documents FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update driver_documents" ON public.driver_documents FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete driver_documents" ON public.driver_documents FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own driver_documents" ON public.driver_documents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own driver_documents" ON public.driver_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- trailers
DROP POLICY IF EXISTS "Admins can view all trailers" ON public.trailers;
DROP POLICY IF EXISTS "Admins can insert trailers" ON public.trailers;
DROP POLICY IF EXISTS "Admins can update all trailers" ON public.trailers;
DROP POLICY IF EXISTS "Admins can delete all trailers" ON public.trailers;
DROP POLICY IF EXISTS "Users can view own trailers" ON public.trailers;
DROP POLICY IF EXISTS "Users can insert own trailers" ON public.trailers;
DROP POLICY IF EXISTS "Users can update own trailers" ON public.trailers;
DROP POLICY IF EXISTS "Users can delete own trailers" ON public.trailers;
CREATE POLICY "Admins can select trailers" ON public.trailers FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert trailers" ON public.trailers FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update trailers" ON public.trailers FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete trailers" ON public.trailers FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own trailers" ON public.trailers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM vehicles v WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()));
CREATE POLICY "Users can insert own trailers" ON public.trailers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM vehicles v WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()));
CREATE POLICY "Users can update own trailers" ON public.trailers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM vehicles v WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()));
CREATE POLICY "Users can delete own trailers" ON public.trailers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM vehicles v WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()));

-- user_roles - already fixed as permissive in previous migration
