
-- Harvest Jobs (Serviços de Colheita)
CREATE TABLE public.harvest_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_name TEXT NOT NULL,
  location TEXT NOT NULL,
  harvest_period_start DATE NOT NULL,
  harvest_period_end DATE,
  total_third_party_vehicles INTEGER NOT NULL DEFAULT 1,
  monthly_value NUMERIC NOT NULL DEFAULT 0,
  payment_closing_day INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.harvest_jobs ENABLE ROW LEVEL SECURITY;

-- Harvest Assignments (Vinculação de motoristas)
CREATE TABLE public.harvest_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_job_id UUID NOT NULL REFERENCES public.harvest_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  daily_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(harvest_job_id, user_id)
);

ALTER TABLE public.harvest_assignments ENABLE ROW LEVEL SECURITY;

-- RLS for harvest_jobs
CREATE POLICY "Admins can manage harvest_jobs"
  ON public.harvest_jobs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Assigned drivers can view harvest_jobs"
  ON public.harvest_jobs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.harvest_assignments ha
      WHERE ha.harvest_job_id = harvest_jobs.id
      AND ha.user_id = auth.uid()
    )
  );

-- RLS for harvest_assignments
CREATE POLICY "Admins can manage harvest_assignments"
  ON public.harvest_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own harvest_assignments"
  ON public.harvest_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger for updated_at on harvest_jobs
CREATE TRIGGER update_harvest_jobs_updated_at
  BEFORE UPDATE ON public.harvest_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
