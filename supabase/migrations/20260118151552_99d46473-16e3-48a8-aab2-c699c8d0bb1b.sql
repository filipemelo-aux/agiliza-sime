-- Add SELECT policy for admins to view all freight applications
CREATE POLICY "Admins can view all freight applications"
ON public.freight_applications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add UPDATE policy for admins to update freight application statuses
CREATE POLICY "Admins can update freight applications"
ON public.freight_applications
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));