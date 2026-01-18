-- Drop the existing policy that requires authentication
DROP POLICY IF EXISTS "Authenticated users can view available freights" ON public.freights;

-- Create a new policy that allows anyone (including anonymous visitors) to view available freights
CREATE POLICY "Anyone can view available freights" 
ON public.freights 
FOR SELECT 
USING (status = 'available'::freight_status);