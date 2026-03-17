
CREATE TABLE public.harvest_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  harvest_job_id UUID NOT NULL REFERENCES public.harvest_jobs(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.harvest_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select harvest_payments" ON public.harvest_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert harvest_payments" ON public.harvest_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update harvest_payments" ON public.harvest_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete harvest_payments" ON public.harvest_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can select harvest_payments" ON public.harvest_payments FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert harvest_payments" ON public.harvest_payments FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update harvest_payments" ON public.harvest_payments FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete harvest_payments" ON public.harvest_payments FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
