CREATE TABLE public.check_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco_nome text NOT NULL,
  largura_folha_mm numeric NOT NULL DEFAULT 175,
  altura_folha_mm numeric NOT NULL DEFAULT 80,
  valor_numerico_x numeric NOT NULL DEFAULT 120,
  valor_numerico_y numeric NOT NULL DEFAULT 22,
  valor_extenso1_x numeric NOT NULL DEFAULT 20,
  valor_extenso1_y numeric NOT NULL DEFAULT 31,
  valor_extenso2_x numeric NOT NULL DEFAULT 12,
  valor_extenso2_y numeric NOT NULL DEFAULT 38,
  nominal_x numeric NOT NULL DEFAULT 20,
  nominal_y numeric NOT NULL DEFAULT 47,
  cidade_x numeric NOT NULL DEFAULT 60,
  cidade_y numeric NOT NULL DEFAULT 56,
  dia_x numeric NOT NULL DEFAULT 108,
  dia_y numeric NOT NULL DEFAULT 56,
  mes_x numeric NOT NULL DEFAULT 118,
  mes_y numeric NOT NULL DEFAULT 56,
  ano_x numeric NOT NULL DEFAULT 145,
  ano_y numeric NOT NULL DEFAULT 56,
  canhoto_valor_x numeric NOT NULL DEFAULT 8,
  canhoto_valor_y numeric NOT NULL DEFAULT 12,
  canhoto_data_x numeric NOT NULL DEFAULT 8,
  canhoto_data_y numeric NOT NULL DEFAULT 20,
  canhoto_nominal_x numeric NOT NULL DEFAULT 8,
  canhoto_nominal_y numeric NOT NULL DEFAULT 28,
  canhoto_historico_x numeric NOT NULL DEFAULT 8,
  canhoto_historico_y numeric NOT NULL DEFAULT 36,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_layouts TO authenticated;
GRANT ALL ON public.check_layouts TO service_role;

ALTER TABLE public.check_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view check layouts"
ON public.check_layouts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert check layouts"
ON public.check_layouts FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can update check layouts"
ON public.check_layouts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Admins can delete check layouts"
ON public.check_layouts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE TRIGGER update_check_layouts_updated_at
BEFORE UPDATE ON public.check_layouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.check_layouts (banco_nome) VALUES ('Sicoob (Padrão)');

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS numero_cheque text;