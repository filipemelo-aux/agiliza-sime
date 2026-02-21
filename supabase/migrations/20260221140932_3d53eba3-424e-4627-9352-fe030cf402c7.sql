
-- Fase 1: Adicionar campos de tipo de pessoa ao profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS person_type TEXT DEFAULT 'cpf';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nome_fantasia TEXT;

-- Tabela de serviços vinculados ao motorista (admin define)
CREATE TABLE public.driver_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('fretes', 'colheita')),
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, service_type)
);

ALTER TABLE public.driver_services ENABLE ROW LEVEL SECURITY;

-- Admin pode gerenciar todos os serviços
CREATE POLICY "Admins can manage driver_services"
ON public.driver_services
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Motoristas podem ver seus próprios serviços vinculados
CREATE POLICY "Users can view own driver_services"
ON public.driver_services
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
