-- First, drop the constraint that was partially applied (CPF was added before failure)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_cpf_format;

-- Add CHECK constraint for CNH validation (9-11 digits to accommodate existing data)
ALTER TABLE public.profiles
ADD CONSTRAINT check_cnh_format 
CHECK (cnh_number ~ '^[0-9]{9,11}$');

-- Add CHECK constraints for CPF validation (11 digits, with or without formatting)
ALTER TABLE public.profiles
ADD CONSTRAINT check_cpf_format 
CHECK (cpf ~ '^[0-9]{11}$' OR cpf ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$');

-- Add CHECK constraint for CNH category (valid Brazilian categories)
ALTER TABLE public.profiles
ADD CONSTRAINT check_cnh_category 
CHECK (cnh_category IN ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'));

-- Add CHECK constraint for phone format (Brazilian phone: 10-11 digits, flexible)
ALTER TABLE public.profiles
ADD CONSTRAINT check_phone_format 
CHECK (phone ~ '^[0-9]{10,11}$' OR phone ~ '^\([0-9]{2}\)\s?[0-9]{4,5}-?[0-9]{4}$');

-- Add CHECK constraint for vehicle plate (old format ABC1234 or Mercosul ABC1D23)
ALTER TABLE public.vehicles
ADD CONSTRAINT check_plate_format 
CHECK (plate ~ '^[A-Z]{3}[0-9]{4}$' OR plate ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$');

-- Add CHECK constraint for vehicle year (reasonable range)
ALTER TABLE public.vehicles
ADD CONSTRAINT check_vehicle_year 
CHECK (year >= 1900 AND year <= EXTRACT(YEAR FROM CURRENT_DATE) + 1);

-- Add CHECK constraint for RENAVAM (11 digits)
ALTER TABLE public.vehicles
ADD CONSTRAINT check_renavam_format 
CHECK (renavam ~ '^[0-9]{11}$');

-- Add CHECK constraint for trailer plate
ALTER TABLE public.trailers
ADD CONSTRAINT check_trailer_plate_format 
CHECK (plate ~ '^[A-Z]{3}[0-9]{4}$' OR plate ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$');

-- Add CHECK constraint for trailer RENAVAM
ALTER TABLE public.trailers
ADD CONSTRAINT check_trailer_renavam_format 
CHECK (renavam ~ '^[0-9]{11}$');

-- Add CHECK constraint for trailer capacity (positive value)
ALTER TABLE public.trailers
ADD CONSTRAINT check_trailer_capacity 
CHECK (capacity_kg > 0);