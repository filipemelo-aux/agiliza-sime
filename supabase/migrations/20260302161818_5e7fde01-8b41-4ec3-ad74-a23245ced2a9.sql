
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('frete', 'colheita')),
  establishment_id uuid REFERENCES public.fiscal_establishments(id),
  client_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'rascunho',
  numero serial,
  
  -- Freight fields
  origem_cidade text,
  origem_uf text,
  destino_cidade text,
  destino_uf text,
  carga_id uuid REFERENCES public.cargas(id),
  produto text,
  peso_kg numeric,
  valor_frete numeric,
  
  -- Harvest fields
  previsao_inicio date,
  previsao_termino date,
  valor_mensal_por_caminhao numeric,
  quantidade_caminhoes integer DEFAULT 1,
  alimentacao_por_conta text DEFAULT 'contratada',
  combustivel_por_conta text DEFAULT 'contratada',
  valor_alimentacao_dia numeric,
  
  observacoes text,
  validade_dias integer DEFAULT 15,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage quotations"
  ON public.quotations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
