
-- Add driver and owner linking to vehicles
ALTER TABLE public.vehicles
ADD COLUMN driver_id uuid,
ADD COLUMN owner_id uuid;

-- Create indexes for lookups
CREATE INDEX idx_vehicles_driver_id ON public.vehicles(driver_id);
CREATE INDEX idx_vehicles_owner_id ON public.vehicles(owner_id);
