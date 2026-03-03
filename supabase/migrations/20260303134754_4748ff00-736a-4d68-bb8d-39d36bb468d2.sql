-- Add fleet_type column to vehicles
ALTER TABLE public.vehicles ADD COLUMN fleet_type text NOT NULL DEFAULT 'terceiros';

-- Mark vehicles owned by Sime Transporte as own fleet
UPDATE public.vehicles SET fleet_type = 'propria' WHERE owner_id = '469db0e8-7321-46b0-8f99-1a10435264a4';
