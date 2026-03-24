
-- Create expense type enum
CREATE TYPE public.expense_type AS ENUM (
  'combustivel', 'manutencao', 'pedagio', 'multa', 
  'administrativo', 'frete_terceiro', 'imposto', 'outros'
);

-- Create cost center enum
CREATE TYPE public.cost_center AS ENUM (
  'frota_propria', 'frota_terceiros', 'administrativo', 'operacional'
);

-- Create expense status enum
CREATE TYPE public.expense_status AS ENUM (
  'pendente', 'pago', 'atrasado', 'parcial'
);

-- Create expense origin enum
CREATE TYPE public.expense_origin AS ENUM (
  'manual', 'xml', 'abastecimento', 'manutencao', 'importacao'
);

-- Create unified expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.fiscal_establishments(id),
  descricao TEXT NOT NULL,
  tipo_despesa public.expense_type NOT NULL DEFAULT 'outros',
  categoria_financeira_id UUID REFERENCES public.financial_categories(id),
  centro_custo public.cost_center NOT NULL DEFAULT 'operacional',
  valor_total NUMERIC NOT NULL DEFAULT 0,
  valor_pago NUMERIC NOT NULL DEFAULT 0,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE,
  status public.expense_status NOT NULL DEFAULT 'pendente',
  forma_pagamento TEXT,
  favorecido_nome TEXT,
  favorecido_id UUID REFERENCES public.profiles(id),
  documento_fiscal_numero TEXT,
  chave_nfe TEXT,
  origem public.expense_origin NOT NULL DEFAULT 'manual',
  observacoes TEXT,
  conta_financeira_id UUID,
  afeta_caixa BOOLEAN NOT NULL DEFAULT true,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Metadata fields for specific expense types
  veiculo_id UUID REFERENCES public.vehicles(id),
  veiculo_placa TEXT,
  motorista_id UUID REFERENCES public.profiles(id),
  litros NUMERIC,
  km_odometro NUMERIC,
  numero_multa TEXT,
  data_pagamento TIMESTAMP WITH TIME ZONE,
  comprovante_url TEXT
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can select expenses" ON public.expenses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select expenses" ON public.expenses FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));
