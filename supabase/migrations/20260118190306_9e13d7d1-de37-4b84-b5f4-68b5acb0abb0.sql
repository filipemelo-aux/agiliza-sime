-- Add banking information columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN bank_name text,
ADD COLUMN bank_agency text,
ADD COLUMN bank_account text,
ADD COLUMN bank_account_type text,
ADD COLUMN pix_key_type text,
ADD COLUMN pix_key text;