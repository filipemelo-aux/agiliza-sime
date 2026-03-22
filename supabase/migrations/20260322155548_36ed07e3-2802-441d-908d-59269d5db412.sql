
-- Criar bucket para PDFs assinados de ordens de abastecimento
INSERT INTO storage.buckets (id, name, public)
VALUES ('fuel-order-pdfs', 'fuel-order-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS para o bucket: admins e moderadores podem ler/escrever
CREATE POLICY "Admins can manage fuel-order-pdfs"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'fuel-order-pdfs' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  bucket_id = 'fuel-order-pdfs' AND
  public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Moderators can manage fuel-order-pdfs"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'fuel-order-pdfs' AND
  public.has_role(auth.uid(), 'moderator'::public.app_role)
)
WITH CHECK (
  bucket_id = 'fuel-order-pdfs' AND
  public.has_role(auth.uid(), 'moderator'::public.app_role)
);
