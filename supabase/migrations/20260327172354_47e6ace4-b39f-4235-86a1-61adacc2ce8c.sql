
CREATE TABLE public.movimentacoes_bancarias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  origem TEXT NOT NULL CHECK (origem IN ('contas_pagar', 'contas_receber')),
  origem_id UUID NOT NULL,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  data_movimentacao DATE NOT NULL,
  conta_bancaria_id UUID,
  descricao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.movimentacoes_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage movimentacoes"
  ON public.movimentacoes_bancarias
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
