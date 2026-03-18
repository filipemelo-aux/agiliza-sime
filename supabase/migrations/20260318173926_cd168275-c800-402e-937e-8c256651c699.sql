
-- Create payment_receipts table
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  person_name text NOT NULL,
  description text NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  harvest_job_id uuid REFERENCES public.harvest_jobs(id) ON DELETE SET NULL,
  harvest_payment_id uuid REFERENCES public.harvest_payments(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can select payment_receipts" ON public.payment_receipts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert payment_receipts" ON public.payment_receipts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update payment_receipts" ON public.payment_receipts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete payment_receipts" ON public.payment_receipts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can select payment_receipts" ON public.payment_receipts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert payment_receipts" ON public.payment_receipts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update payment_receipts" ON public.payment_receipts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete payment_receipts" ON public.payment_receipts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));

-- Storage bucket for receipt files
INSERT INTO storage.buckets (id, name, public) VALUES ('payment-receipts', 'payment-receipts', false);

-- Storage RLS policies
CREATE POLICY "Admins can upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete receipts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Moderators can upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can view receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete receipts" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'payment-receipts' AND has_role(auth.uid(), 'moderator'::app_role));
