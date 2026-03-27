
CREATE TYPE public.previsao_origem_tipo AS ENUM ('cte', 'colheita');
CREATE TYPE public.previsao_status AS ENUM ('pendente', 'faturado');

CREATE TABLE public.previsoes_recebimento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem_tipo previsao_origem_tipo NOT NULL,
  origem_id UUID NOT NULL,
  cliente_id UUID REFERENCES public.profiles(id) NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  data_prevista DATE NOT NULL,
  status previsao_status NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.previsoes_recebimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read previsoes"
  ON public.previsoes_recebimento FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert previsoes"
  ON public.previsoes_recebimento FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update previsoes"
  ON public.previsoes_recebimento FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
