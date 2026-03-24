
-- Table for individual fueling records
CREATE TABLE public.fuelings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.fiscal_establishments(id),
  veiculo_id uuid NOT NULL REFERENCES public.vehicles(id),
  motorista_id uuid REFERENCES public.profiles(id),
  data_abastecimento date NOT NULL DEFAULT CURRENT_DATE,
  tipo_combustivel text NOT NULL DEFAULT 'diesel',
  quantidade_litros numeric NOT NULL DEFAULT 0,
  valor_por_litro numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  km_atual numeric,
  posto_combustivel text,
  forma_pagamento text NOT NULL DEFAULT 'prazo',
  status_faturamento text NOT NULL DEFAULT 'nao_faturado',
  expense_id uuid REFERENCES public.expenses(id),
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.fuelings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select fuelings" ON public.fuelings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert fuelings" ON public.fuelings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update fuelings" ON public.fuelings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete fuelings" ON public.fuelings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Moderators can select fuelings" ON public.fuelings FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert fuelings" ON public.fuelings FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update fuelings" ON public.fuelings FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete fuelings" ON public.fuelings FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));
