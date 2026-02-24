
-- Tabela de configurações fiscais
CREATE TABLE public.fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cnpj text NOT NULL,
  inscricao_estadual text NOT NULL,
  razao_social text NOT NULL,
  nome_fantasia text,
  regime_tributario text NOT NULL DEFAULT 'lucro_real',
  serie_cte integer NOT NULL DEFAULT 1,
  serie_mdfe integer NOT NULL DEFAULT 1,
  ultimo_numero_cte integer NOT NULL DEFAULT 0,
  ultimo_numero_mdfe integer NOT NULL DEFAULT 0,
  uf_emissao text NOT NULL DEFAULT 'SP',
  codigo_municipio_ibge text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_bairro text,
  endereco_municipio text,
  endereco_uf text,
  endereco_cep text,
  certificado_a1_path text,
  senha_certificado_encrypted text,
  ambiente text NOT NULL DEFAULT 'homologacao',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fiscal_settings" ON public.fiscal_settings
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de CT-e
CREATE TABLE public.ctes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer,
  serie integer NOT NULL DEFAULT 1,
  chave_acesso text,
  protocolo_autorizacao text,
  status text NOT NULL DEFAULT 'rascunho',
  tomador_id uuid REFERENCES public.profiles(id),
  remetente_nome text NOT NULL,
  remetente_cnpj text,
  remetente_ie text,
  remetente_endereco text,
  remetente_municipio_ibge text,
  remetente_uf text,
  destinatario_nome text NOT NULL,
  destinatario_cnpj text,
  destinatario_ie text,
  destinatario_endereco text,
  destinatario_municipio_ibge text,
  destinatario_uf text,
  valor_frete numeric NOT NULL DEFAULT 0,
  valor_carga numeric NOT NULL DEFAULT 0,
  base_calculo_icms numeric NOT NULL DEFAULT 0,
  aliquota_icms numeric NOT NULL DEFAULT 0,
  valor_icms numeric NOT NULL DEFAULT 0,
  cst_icms text NOT NULL DEFAULT '00',
  cfop text NOT NULL DEFAULT '6353',
  natureza_operacao text NOT NULL DEFAULT 'PRESTACAO DE SERVICO DE TRANSPORTE',
  municipio_origem_ibge text,
  municipio_origem_nome text,
  uf_origem text,
  municipio_destino_ibge text,
  municipio_destino_nome text,
  uf_destino text,
  placa_veiculo text,
  rntrc text,
  motorista_id uuid REFERENCES public.profiles(id),
  veiculo_id uuid REFERENCES public.vehicles(id),
  produto_predominante text,
  peso_bruto numeric,
  xml_enviado text,
  xml_autorizado text,
  motivo_rejeicao text,
  data_emissao timestamptz,
  data_autorizacao timestamptz,
  observacoes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ctes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ctes" ON public.ctes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de MDF-e
CREATE TABLE public.mdfe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero integer,
  serie integer NOT NULL DEFAULT 1,
  chave_acesso text,
  status text NOT NULL DEFAULT 'rascunho',
  placa_veiculo text NOT NULL,
  rntrc text,
  motorista_id uuid REFERENCES public.profiles(id),
  veiculo_id uuid REFERENCES public.vehicles(id),
  lista_ctes uuid[] DEFAULT '{}',
  uf_carregamento text,
  uf_descarregamento text,
  municipio_carregamento_ibge text,
  municipio_descarregamento_ibge text,
  protocolo_autorizacao text,
  protocolo_encerramento text,
  xml_enviado text,
  xml_autorizado text,
  data_emissao timestamptz,
  data_encerramento timestamptz,
  data_autorizacao timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mdfe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mdfe" ON public.mdfe
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Tabela de log fiscal
CREATE TABLE public.fiscal_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fiscal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fiscal_logs" ON public.fiscal_logs
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Função para incrementar número do CT-e atomicamente
CREATE OR REPLACE FUNCTION public.next_cte_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  UPDATE fiscal_settings
  SET ultimo_numero_cte = ultimo_numero_cte + 1, updated_at = now()
  WHERE id = (SELECT id FROM fiscal_settings LIMIT 1)
  RETURNING ultimo_numero_cte INTO next_num;
  
  RETURN next_num;
END;
$$;

-- Função para incrementar número do MDF-e atomicamente
CREATE OR REPLACE FUNCTION public.next_mdfe_number()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  UPDATE fiscal_settings
  SET ultimo_numero_mdfe = ultimo_numero_mdfe + 1, updated_at = now()
  WHERE id = (SELECT id FROM fiscal_settings LIMIT 1)
  RETURNING ultimo_numero_mdfe INTO next_num;
  
  RETURN next_num;
END;
$$;
