
CREATE TYPE public.fatura_status AS ENUM ('aberta', 'faturada', 'cancelada');

CREATE TABLE public.faturas_recebimento (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.profiles(id) NOT NULL,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  status fatura_status NOT NULL DEFAULT 'aberta',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.faturas_recebimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read faturas"
  ON public.faturas_recebimento FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert faturas"
  ON public.faturas_recebimento FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update faturas"
  ON public.faturas_recebimento FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Tabela de vínculo N:N entre faturas e previsões
CREATE TABLE public.fatura_previsoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fatura_id UUID REFERENCES public.faturas_recebimento(id) ON DELETE CASCADE NOT NULL,
  previsao_id UUID REFERENCES public.previsoes_recebimento(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (fatura_id, previsao_id)
);

ALTER TABLE public.fatura_previsoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fatura_previsoes"
  ON public.fatura_previsoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert fatura_previsoes"
  ON public.fatura_previsoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete fatura_previsoes"
  ON public.fatura_previsoes FOR DELETE TO authenticated USING (true);
