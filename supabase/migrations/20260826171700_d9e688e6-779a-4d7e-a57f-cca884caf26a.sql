CREATE TYPE public.tipo_alienacao AS ENUM ('Financiamento','Consórcio','Contrato de Custódia','Outros');
CREATE TYPE public.tipo_documento_veiculo AS ENUM ('IPVA','Licenciamento','Multa','Seguro');
CREATE TYPE public.status_pagamento_documento AS ENUM ('A Vencer','Vencido','Pago');

ALTER TABLE public.vehicles
  ADD COLUMN alienado boolean NOT NULL DEFAULT false,
  ADD COLUMN tipo_alienacao public.tipo_alienacao,
  ADD COLUMN instituicao_financeira text,
  ADD COLUMN observacoes_alienacao text;

CREATE TABLE public.veiculo_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo_documento public.tipo_documento_veiculo NOT NULL,
  ano_exercicio integer NOT NULL,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  data_vencimento date NOT NULL,
  status_pagamento public.status_pagamento_documento NOT NULL DEFAULT 'A Vencer',
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculo_documentos TO authenticated;
GRANT ALL ON public.veiculo_documentos TO service_role;

ALTER TABLE public.veiculo_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver documentos de veiculos"
  ON public.veiculo_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados podem criar documentos de veiculos"
  ON public.veiculo_documentos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Autenticados podem editar documentos de veiculos"
  ON public.veiculo_documentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Autenticados podem excluir documentos de veiculos"
  ON public.veiculo_documentos FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_veiculo_documentos_veiculo ON public.veiculo_documentos(veiculo_id);

CREATE TRIGGER update_veiculo_documentos_updated_at
  BEFORE UPDATE ON public.veiculo_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();