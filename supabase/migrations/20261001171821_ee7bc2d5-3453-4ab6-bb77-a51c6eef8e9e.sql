ALTER TABLE public.ctes
  ADD COLUMN IF NOT EXISTS ibs_cbs_cst text DEFAULT '000',
  ADD COLUMN IF NOT EXISTS ibs_cbs_class_trib text DEFAULT '000001',
  ADD COLUMN IF NOT EXISTS ibs_uf_aliquota numeric DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS ibs_uf_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_mun_aliquota numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_mun_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cbs_aliquota numeric DEFAULT 0.90,
  ADD COLUMN IF NOT EXISTS cbs_valor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ibs_cbs_base_calculo numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seguro_responsavel integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS seguradora_nome text,
  ADD COLUMN IF NOT EXISTS seguradora_cnpj text,
  ADD COLUMN IF NOT EXISTS apolice_numero text,
  ADD COLUMN IF NOT EXISTS averbacao_numero text;

ALTER TABLE public.fiscal_establishments
  ADD COLUMN IF NOT EXISTS seguradora_nome text,
  ADD COLUMN IF NOT EXISTS seguradora_cnpj text,
  ADD COLUMN IF NOT EXISTS apolice_numero text;