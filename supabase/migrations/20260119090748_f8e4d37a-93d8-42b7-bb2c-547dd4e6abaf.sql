-- Remove duplicate/old storage policies
DROP POLICY IF EXISTS "Admin users can upload loading orders" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can read loading orders" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can read their own loading orders" ON storage.objects;

-- Keep only the policies using has_role function (these already exist and are correct):
-- "Admins can upload loading orders" - INSERT
-- "Admins can read loading orders" - SELECT  
-- "Admins can delete loading orders" - DELETE
-- "Users can read own loading orders" - SELECT

-- Add UPDATE policy for admins (in case file needs to be replaced)
CREATE POLICY "Admins can update loading orders" 
ON storage.objects 
FOR UPDATE 
TO authenticated
USING (bucket_id = 'loading-orders' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'loading-orders' AND public.has_role(auth.uid(), 'admin'));