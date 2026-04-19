-- Enums para tipo, origem e status de comissão
CREATE TYPE public.comissao_tipo AS ENUM ('motorista', 'embarque');
CREATE TYPE public.comissao_origem AS ENUM ('cte', 'colheita');
CREATE TYPE public.comissao_status AS ENUM ('pendente', 'enviado_folha');

-- Tabela de comissões
CREATE TABLE public.comissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tipo public.comissao_tipo NOT NULL,
  origem public.comissao_origem NOT NULL,
  referencia_id UUID NOT NULL,
  valor_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  percentual NUMERIC(7, 4),
  valor_calculado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status public.comissao_status NOT NULL DEFAULT 'pendente',
  data_referencia DATE NOT NULL,
  folha_pagamento_id UUID,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  CONSTRAINT comissoes_unique_origem UNIQUE (colaborador_id, origem, referencia_id)
);

-- Índices para consultas frequentes
CREATE INDEX idx_comissoes_colaborador ON public.comissoes (colaborador_id);
CREATE INDEX idx_comissoes_status ON public.comissoes (status);
CREATE INDEX idx_comissoes_folha ON public.comissoes (folha_pagamento_id) WHERE folha_pagamento_id IS NOT NULL;
CREATE INDEX idx_comissoes_data_ref ON public.comissoes (data_referencia);
CREATE INDEX idx_comissoes_referencia ON public.comissoes (origem, referencia_id);

-- Trigger de updated_at
CREATE TRIGGER trg_comissoes_updated_at
BEFORE UPDATE ON public.comissoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.comissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/moderadores podem visualizar comissões"
ON public.comissoes
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins/moderadores podem inserir comissões"
ON public.comissoes
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  AND created_by = auth.uid()
);

CREATE POLICY "Admins/moderadores podem atualizar comissões"
ON public.comissoes
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'moderator')
);

CREATE POLICY "Admins/moderadores podem excluir comissões"
ON public.comissoes
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'moderator')
);