-- Create storage bucket for proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('freight-proofs', 'freight-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for freight-proofs bucket
-- Admins can read all files
CREATE POLICY "Admins can read all freight proofs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'freight-proofs' AND has_role(auth.uid(), 'admin'::app_role));

-- Admins can upload files
CREATE POLICY "Admins can upload freight proofs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'freight-proofs' AND has_role(auth.uid(), 'admin'::app_role));

-- Drivers can upload their own loading proofs (path starts with their user_id)
CREATE POLICY "Drivers can upload their loading proofs"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'freight-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Drivers can read their own files
CREATE POLICY "Drivers can read their own freight proofs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'freight-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update freight_applications for loading proof
CREATE POLICY "Users can update own applications for loading proof"
ON public.freight_applications
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);