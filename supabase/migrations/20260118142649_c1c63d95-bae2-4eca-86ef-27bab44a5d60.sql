-- Create enum for vehicle types
CREATE TYPE public.vehicle_type AS ENUM ('truck', 'bitruck', 'carreta', 'carreta_ls', 'rodotrem', 'bitrem', 'treminhao');

-- Create enum for freight status
CREATE TYPE public.freight_status AS ENUM ('available', 'in_progress', 'completed', 'cancelled');

-- Create enum for document status
CREATE TYPE public.document_status AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- Create profiles table for drivers
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    cnh_number TEXT NOT NULL,
    cnh_category TEXT NOT NULL,
    cnh_expiry DATE NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create vehicles table
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    plate TEXT NOT NULL UNIQUE,
    renavam TEXT NOT NULL,
    vehicle_type vehicle_type NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    antt_number TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create trailers table (carretas)
CREATE TABLE public.trailers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    plate TEXT NOT NULL UNIQUE,
    renavam TEXT NOT NULL,
    trailer_type TEXT NOT NULL,
    capacity_kg NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create freights table
CREATE TABLE public.freights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_city TEXT NOT NULL,
    origin_state TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    destination_state TEXT NOT NULL,
    cargo_type TEXT NOT NULL,
    weight_kg NUMERIC NOT NULL,
    value_brl NUMERIC NOT NULL,
    distance_km NUMERIC,
    required_vehicle_type vehicle_type,
    pickup_date DATE NOT NULL,
    delivery_date DATE,
    status freight_status DEFAULT 'available' NOT NULL,
    description TEXT,
    company_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create freight applications table
CREATE TABLE public.freight_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    freight_id UUID REFERENCES public.freights(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(freight_id, user_id)
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.freight_applications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);

-- Vehicles policies
CREATE POLICY "Users can view own vehicles"
    ON public.vehicles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicles"
    ON public.vehicles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicles"
    ON public.vehicles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicles"
    ON public.vehicles FOR DELETE
    USING (auth.uid() = user_id);

-- Trailers policies
CREATE POLICY "Users can view own trailers"
    ON public.trailers FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.vehicles v 
        WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert own trailers"
    ON public.trailers FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.vehicles v 
        WHERE v.id = vehicle_id AND v.user_id = auth.uid()
    ));

CREATE POLICY "Users can update own trailers"
    ON public.trailers FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.vehicles v 
        WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete own trailers"
    ON public.trailers FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.vehicles v 
        WHERE v.id = trailers.vehicle_id AND v.user_id = auth.uid()
    ));

-- Freights policies (public read for available freights)
CREATE POLICY "Anyone can view available freights"
    ON public.freights FOR SELECT
    USING (status = 'available');

-- Freight applications policies
CREATE POLICY "Users can view own applications"
    ON public.freight_applications FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
    ON public.freight_applications FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at
    BEFORE UPDATE ON public.vehicles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_freights_updated_at
    BEFORE UPDATE ON public.freights
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();