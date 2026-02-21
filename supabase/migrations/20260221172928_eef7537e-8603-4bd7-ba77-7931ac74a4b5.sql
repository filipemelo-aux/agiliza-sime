
-- Allow admins to delete any vehicle
CREATE POLICY "Admins can delete all vehicles"
ON public.vehicles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update any vehicle
CREATE POLICY "Admins can update all vehicles"
ON public.vehicles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert vehicles
CREATE POLICY "Admins can insert vehicles"
ON public.vehicles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete any trailer
CREATE POLICY "Admins can delete all trailers"
ON public.trailers
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update all trailers
CREATE POLICY "Admins can update all trailers"
ON public.trailers
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert trailers
CREATE POLICY "Admins can insert trailers"
ON public.trailers
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert profiles
CREATE POLICY "Admins can insert profiles"
ON public.profiles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
