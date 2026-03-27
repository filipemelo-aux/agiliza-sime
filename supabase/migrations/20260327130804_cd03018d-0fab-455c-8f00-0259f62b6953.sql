
CREATE TYPE public.conta_receber_status AS ENUM ('aberto', 'recebido', 'atrasado');

CREATE TABLE public.contas_receber (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fatura_id UUID REFERENCES public.faturas_recebimento(id) NOT NULL,
  cliente_id UUID REFERENCES public.profiles(id) NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  data_vencimento DATE NOT NULL,
  status conta_receber_status NOT NULL DEFAULT 'aberto',
  data_recebimento DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_receber ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contas_receber"
  ON public.contas_receber FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contas_receber"
  ON public.contas_receber FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contas_receber"
  ON public.contas_receber FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
