ALTER TABLE public.ctes
  ADD COLUMN IF NOT EXISTS nfe_detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS outros_documentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reboque1_placa text,
  ADD COLUMN IF NOT EXISTS reboque2_placa text,
  ADD COLUMN IF NOT EXISTS contratado_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contratado_nome text,
  ADD COLUMN IF NOT EXISTS contratado_documento text,
  ADD COLUMN IF NOT EXISTS previsao_saida date,
  ADD COLUMN IF NOT EXISTS previsao_chegada date,
  ADD COLUMN IF NOT EXISTS lotacao boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pedido_numero text,
  ADD COLUMN IF NOT EXISTS valor_pedagio numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero_eixos integer;