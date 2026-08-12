ALTER TABLE public.check_layouts RENAME COLUMN canhoto_nominal_x TO canhoto_favorecido_x;
ALTER TABLE public.check_layouts RENAME COLUMN canhoto_nominal_y TO canhoto_favorecido_y;
ALTER TABLE public.check_layouts RENAME COLUMN canhoto_historico_x TO canhoto_referente_x;
ALTER TABLE public.check_layouts RENAME COLUMN canhoto_historico_y TO canhoto_referente_y;

ALTER TABLE public.check_layouts ADD COLUMN IF NOT EXISTS cidade_data_x numeric NOT NULL DEFAULT 100;
ALTER TABLE public.check_layouts ADD COLUMN IF NOT EXISTS cidade_data_y numeric NOT NULL DEFAULT 50;

ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS cidade_x;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS cidade_y;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS dia_x;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS dia_y;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS mes_x;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS mes_y;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS ano_x;
ALTER TABLE public.check_layouts DROP COLUMN IF EXISTS ano_y;

UPDATE public.check_layouts SET
  largura_folha_mm = 210, altura_folha_mm = 75,
  valor_numerico_x = 165, valor_numerico_y = 12,
  valor_extenso1_x = 60, valor_extenso1_y = 22,
  valor_extenso2_x = 20, valor_extenso2_y = 29,
  nominal_x = 55, nominal_y = 35,
  cidade_data_x = 100, cidade_data_y = 50,
  canhoto_valor_x = 8, canhoto_valor_y = 12,
  canhoto_data_x = 8, canhoto_data_y = 20,
  canhoto_favorecido_x = 8, canhoto_favorecido_y = 28,
  canhoto_referente_x = 8, canhoto_referente_y = 36
WHERE banco_nome = 'Sicoob (Padrão)';