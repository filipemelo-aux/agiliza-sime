-- Add RENAVAM columns for trailers
ALTER TABLE public.vehicles
ADD COLUMN trailer_renavam_1 text,
ADD COLUMN trailer_renavam_2 text,
ADD COLUMN trailer_renavam_3 text;