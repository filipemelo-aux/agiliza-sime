
-- Add client_id column to harvest_jobs to reference the contracting client
ALTER TABLE public.harvest_jobs ADD COLUMN client_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
