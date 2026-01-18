-- Drop the old public policy
DROP POLICY IF EXISTS "Anyone can view available freights" ON public.freights;

-- Create new policy requiring authentication to view available freights
CREATE POLICY "Authenticated users can view available freights"
ON public.freights
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND status = 'available'::freight_status
);

-- Also allow admins to view ALL freights (including non-available)
CREATE POLICY "Admins can view all freights"
ON public.freights
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));