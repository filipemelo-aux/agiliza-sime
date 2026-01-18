-- Add cargo_type field to vehicles table (cacamba or graneleiro)
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS cargo_type text;

-- Add trailer plate fields to vehicles table
-- These fields will store the plates of the trailers/implements depending on vehicle type
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS trailer_plate_1 text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS trailer_plate_2 text;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS trailer_plate_3 text;