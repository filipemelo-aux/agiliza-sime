
-- Add category column to profiles for person classification
ALTER TABLE public.profiles 
ADD COLUMN category text NOT NULL DEFAULT 'motorista';

-- Add index for filtering by category
CREATE INDEX idx_profiles_category ON public.profiles(category);
