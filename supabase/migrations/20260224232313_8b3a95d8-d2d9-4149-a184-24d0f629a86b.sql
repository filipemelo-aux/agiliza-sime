
-- Expedidor fields
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_nome text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_cnpj text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_ie text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_endereco text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_municipio_ibge text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS expedidor_uf text;

-- Recebedor fields
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_nome text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_cnpj text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_ie text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_endereco text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_municipio_ibge text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS recebedor_uf text;

-- Tomador completo (além do tomador_id já existente)
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_tipo integer DEFAULT 3;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_nome text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_cnpj text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_ie text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_endereco text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_municipio_ibge text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tomador_uf text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS ind_ie_toma integer DEFAULT 1;

-- Tipo CT-e e serviço
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tp_cte integer DEFAULT 0;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS tp_serv integer DEFAULT 0;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS modal text DEFAULT '01';
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS retira integer DEFAULT 1;

-- Valores adicionais
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS valor_receber numeric DEFAULT 0;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS valor_total_tributos numeric DEFAULT 0;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS valor_carga_averb numeric;

-- Documentos referenciados e carga
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS chaves_nfe_ref text[];
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS componentes_frete jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS info_quantidade jsonb DEFAULT '[]'::jsonb;

-- Município de envio (pode ser diferente da origem)
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS municipio_envio_ibge text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS municipio_envio_nome text;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS uf_envio text;
