-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all vehicles
CREATE POLICY "Admins can view all vehicles"
ON public.vehicles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all trailers
CREATE POLICY "Admins can view all trailers"
ON public.trailers
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));