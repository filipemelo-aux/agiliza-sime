
-- Tabela de certificados digitais
CREATE TABLE public.fiscal_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  caminho_storage TEXT NOT NULL,
  senha_criptografada TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Relação N:N entre estabelecimentos e certificados
CREATE TABLE public.establishment_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  establishment_id UUID NOT NULL REFERENCES public.fiscal_establishments(id) ON DELETE CASCADE,
  certificate_id UUID NOT NULL REFERENCES public.fiscal_certificates(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(establishment_id, certificate_id)
);

-- RLS fiscal_certificates
ALTER TABLE public.fiscal_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage fiscal_certificates"
  ON public.fiscal_certificates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS establishment_certificates
ALTER TABLE public.establishment_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage establishment_certificates"
  ON public.establishment_certificates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view establishment_certificates"
  ON public.establishment_certificates FOR SELECT
  USING (true);

-- Bucket privado para certificados (se não existir)
INSERT INTO storage.buckets (id, name, public)
VALUES ('fiscal-certificates', 'fiscal-certificates', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: apenas admins podem gerenciar certificados
CREATE POLICY "Admins can upload certificates"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'fiscal-certificates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can read certificates"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'fiscal-certificates' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete certificates"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'fiscal-certificates' AND has_role(auth.uid(), 'admin'::app_role));
