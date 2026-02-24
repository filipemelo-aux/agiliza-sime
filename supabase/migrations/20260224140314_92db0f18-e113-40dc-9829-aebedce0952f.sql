
-- Add discharge proof fields to freight_applications
ALTER TABLE public.freight_applications 
  ADD COLUMN IF NOT EXISTS cte_number TEXT,
  ADD COLUMN IF NOT EXISTS discharge_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS discharge_proof_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS discharge_proof_sent_at TIMESTAMPTZ;

-- Create discharge-proofs storage bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('discharge-proofs', 'discharge-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for discharge-proofs bucket
CREATE POLICY "Users can upload discharge proofs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'discharge-proofs');

CREATE POLICY "Users can view own discharge proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'discharge-proofs');

CREATE POLICY "Admins can view all discharge proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'discharge-proofs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete discharge proofs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'discharge-proofs' AND public.has_role(auth.uid(), 'admin'));
