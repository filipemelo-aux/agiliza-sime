
ALTER TABLE public.financial_invoices 
  ADD COLUMN harvest_job_id uuid REFERENCES public.harvest_jobs(id) ON DELETE SET NULL,
  ADD COLUMN source_type text NOT NULL DEFAULT 'cte';
