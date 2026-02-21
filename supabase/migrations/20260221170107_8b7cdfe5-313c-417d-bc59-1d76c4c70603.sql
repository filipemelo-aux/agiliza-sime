
-- Add address and email fields to profiles for clients and suppliers
ALTER TABLE public.profiles
ADD COLUMN email text,
ADD COLUMN address_street text,
ADD COLUMN address_number text,
ADD COLUMN address_complement text,
ADD COLUMN address_neighborhood text,
ADD COLUMN address_city text,
ADD COLUMN address_state text,
ADD COLUMN address_zip text,
ADD COLUMN notes text;
