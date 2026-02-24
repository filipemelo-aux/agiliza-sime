
CREATE TABLE public.cargas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  produto_predominante text NOT NULL,
  peso_bruto numeric NOT NULL DEFAULT 0,
  valor_carga numeric NOT NULL DEFAULT 0,
  valor_carga_averb numeric DEFAULT NULL,
  unidade text NOT NULL DEFAULT 'KG',
  remetente_nome text DEFAULT NULL,
  remetente_cnpj text DEFAULT NULL,
  destinatario_nome text DEFAULT NULL,
  destinatario_cnpj text DEFAULT NULL,
  municipio_origem_nome text DEFAULT NULL,
  uf_origem text DEFAULT NULL,
  municipio_destino_nome text DEFAULT NULL,
  uf_destino text DEFAULT NULL,
  chaves_nfe_ref text[] DEFAULT NULL,
  observacoes text DEFAULT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cargas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cargas" ON public.cargas
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
