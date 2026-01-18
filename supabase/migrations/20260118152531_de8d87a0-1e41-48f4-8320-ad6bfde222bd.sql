-- Create admin-only table for sensitive driver documents
CREATE TABLE public.driver_documents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    cpf TEXT NOT NULL,
    cnh_number TEXT NOT NULL,
    cnh_category TEXT NOT NULL,
    cnh_expiry DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT check_cpf_format CHECK (cpf ~ '^[0-9]{11}$' OR cpf ~ '^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$'),
    CONSTRAINT check_cnh_format CHECK (cnh_number ~ '^[0-9]{9,11}$'),
    CONSTRAINT check_cnh_category CHECK (cnh_category IN ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'))
);

-- Enable RLS
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

-- Only admins can view all documents
CREATE POLICY "Admins can view all driver documents"
ON public.driver_documents
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert documents
CREATE POLICY "Admins can insert driver documents"
ON public.driver_documents
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update documents
CREATE POLICY "Admins can update driver documents"
ON public.driver_documents
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete documents
CREATE POLICY "Admins can delete driver documents"
ON public.driver_documents
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Users can insert their own documents during registration
CREATE POLICY "Users can insert own documents"
ON public.driver_documents
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Migrate existing data from profiles to driver_documents
INSERT INTO public.driver_documents (user_id, cpf, cnh_number, cnh_category, cnh_expiry)
SELECT user_id, cpf, cnh_number, cnh_category, cnh_expiry
FROM public.profiles
WHERE cpf IS NOT NULL AND cnh_number IS NOT NULL;

-- Create a function for users to check if they have documents on file (without seeing values)
CREATE OR REPLACE FUNCTION public.user_has_documents()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.driver_documents
    WHERE user_id = auth.uid()
  )
$$;

-- Create a function for users to see MASKED versions of their own documents
CREATE OR REPLACE FUNCTION public.get_my_masked_documents()
RETURNS TABLE (
    cpf_masked TEXT,
    cnh_masked TEXT,
    cnh_category TEXT,
    cnh_expiry DATE,
    has_valid_cnh BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    '***.' || SUBSTRING(cpf FROM 4 FOR 3) || '.***-' || RIGHT(cpf, 2) AS cpf_masked,
    '***' || RIGHT(cnh_number, 4) AS cnh_masked,
    cnh_category,
    cnh_expiry,
    cnh_expiry > CURRENT_DATE AS has_valid_cnh
  FROM public.driver_documents
  WHERE user_id = auth.uid()
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_driver_documents_updated_at
BEFORE UPDATE ON public.driver_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Now drop sensitive columns from profiles table
-- First drop the constraints
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_cpf_format;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_cnh_format;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_cnh_category;

-- Then drop the columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cpf;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cnh_number;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cnh_category;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS cnh_expiry;