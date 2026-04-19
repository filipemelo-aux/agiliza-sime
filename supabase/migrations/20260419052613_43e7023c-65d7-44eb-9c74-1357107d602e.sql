-- Enums
DO $$ BEGIN
  CREATE TYPE public.folha_status AS ENUM ('em_aberto', 'confirmada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela cabeçalho
CREATE TABLE IF NOT EXISTS public.folhas_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  mes_referencia TEXT NOT NULL, -- formato YYYY-MM
  status public.folha_status NOT NULL DEFAULT 'em_aberto',
  data_emissao DATE NOT NULL,
  data_vencimento DATE NOT NULL,
  total_base NUMERIC NOT NULL DEFAULT 0,
  total_adiantamentos NUMERIC NOT NULL DEFAULT 0,
  total_descontos NUMERIC NOT NULL DEFAULT 0,
  total_comissoes NUMERIC NOT NULL DEFAULT 0,
  total_liquido NUMERIC NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_by UUID NOT NULL,
  confirmada_em TIMESTAMPTZ,
  confirmada_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folhas_pagamento_mes ON public.folhas_pagamento(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_folhas_pagamento_status ON public.folhas_pagamento(status);
CREATE INDEX IF NOT EXISTS idx_folhas_pagamento_empresa ON public.folhas_pagamento(empresa_id);

-- Tabela itens
CREATE TABLE IF NOT EXISTS public.folhas_pagamento_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folha_id UUID NOT NULL REFERENCES public.folhas_pagamento(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL,
  colaborador_nome TEXT NOT NULL,
  salario_base NUMERIC NOT NULL DEFAULT 0,
  adiantamentos NUMERIC NOT NULL DEFAULT 0,
  descontos NUMERIC NOT NULL DEFAULT 0,
  comissoes NUMERIC NOT NULL DEFAULT 0,
  liquido NUMERIC NOT NULL DEFAULT 0,
  comissao_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  desconto_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  expense_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (folha_id, colaborador_id)
);

CREATE INDEX IF NOT EXISTS idx_folha_itens_folha ON public.folhas_pagamento_itens(folha_id);
CREATE INDEX IF NOT EXISTS idx_folha_itens_colab ON public.folhas_pagamento_itens(colaborador_id);

-- updated_at triggers
CREATE TRIGGER trg_folhas_pagamento_updated
  BEFORE UPDATE ON public.folhas_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_folhas_pagamento_itens_updated
  BEFORE UPDATE ON public.folhas_pagamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.folhas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folhas_pagamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/mods select folhas"
  ON public.folhas_pagamento FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods insert folhas"
  ON public.folhas_pagamento FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods update folhas"
  ON public.folhas_pagamento FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods delete folhas"
  ON public.folhas_pagamento FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods select folha itens"
  ON public.folhas_pagamento_itens FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods insert folha itens"
  ON public.folhas_pagamento_itens FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods update folha itens"
  ON public.folhas_pagamento_itens FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins/mods delete folha itens"
  ON public.folhas_pagamento_itens FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));