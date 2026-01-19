-- Create policy for admin users to upload files to loading-orders bucket
CREATE POLICY "Admin users can upload loading orders" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'loading-orders' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create policy for admin users to read files from loading-orders bucket
CREATE POLICY "Admin users can read loading orders" 
ON storage.objects 
FOR SELECT 
TO authenticated
USING (
  bucket_id = 'loading-orders' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create policy for drivers to read their own loading orders
CREATE POLICY "Drivers can read their own loading orders" 
ON storage.objects 
FOR SELECT 
TO authenticated
USING (
  bucket_id = 'loading-orders' 
  AND EXISTS (
    SELECT 1 FROM public.freight_applications 
    WHERE user_id = auth.uid() 
    AND loading_order_url = name
  )
);