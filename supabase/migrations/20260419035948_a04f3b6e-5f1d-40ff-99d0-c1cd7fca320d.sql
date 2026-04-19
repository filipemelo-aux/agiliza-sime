-- Estrutura para descontos de folha (preparação — regras serão implementadas depois)
CREATE TYPE public.desconto_folha_tipo AS ENUM (
  'adiantamento',
  'vale',
  'inss',
  'irrf',
  'faltas',
  'multas',
  'outros'
);

CREATE TABLE public.descontos_folha (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo public.desconto_folha_tipo NOT NULL DEFAULT 'outros',
  valor NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  descricao TEXT,
  data_referencia DATE NOT NULL,
  folha_pagamento_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

CREATE INDEX idx_descontos_folha_colaborador ON public.descontos_folha(colaborador_id);
CREATE INDEX idx_descontos_folha_data ON public.descontos_folha(data_referencia);
CREATE INDEX idx_descontos_folha_folha ON public.descontos_folha(folha_pagamento_id);

ALTER TABLE public.descontos_folha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/moderator full access on descontos_folha"
ON public.descontos_folha FOR ALL
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Colaborador can view own descontos"
ON public.descontos_folha FOR SELECT
USING (colaborador_id = auth.uid());

CREATE TRIGGER trg_descontos_folha_updated_at
BEFORE UPDATE ON public.descontos_folha
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();