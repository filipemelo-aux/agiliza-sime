-- Add loading_order_url column to freight_applications
ALTER TABLE public.freight_applications 
ADD COLUMN IF NOT EXISTS loading_order_url TEXT DEFAULT NULL;

-- Add loading_order_sent_at column to track when order was sent
ALTER TABLE public.freight_applications 
ADD COLUMN IF NOT EXISTS loading_order_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create storage bucket for loading orders (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('loading-orders', 'loading-orders', false)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload loading orders
CREATE POLICY "Admins can upload loading orders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'loading-orders' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to read all loading orders
CREATE POLICY "Admins can read loading orders"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'loading-orders' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow users to read their own loading orders
CREATE POLICY "Users can read own loading orders"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'loading-orders'
  AND EXISTS (
    SELECT 1 FROM public.freight_applications fa
    WHERE fa.user_id = auth.uid()
    AND fa.loading_order_url LIKE '%' || storage.objects.name
  )
);

-- Allow admins to delete loading orders
CREATE POLICY "Admins can delete loading orders"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'loading-orders' 
  AND public.has_role(auth.uid(), 'admin')
);