
CREATE TABLE public.maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.vehicles(id),
  expense_id uuid REFERENCES public.expenses(id),
  data_manutencao date NOT NULL DEFAULT CURRENT_DATE,
  odometro numeric NOT NULL DEFAULT 0,
  tipo_manutencao text NOT NULL DEFAULT 'corretiva',
  descricao text NOT NULL DEFAULT '',
  custo_total numeric NOT NULL DEFAULT 0,
  fornecedor text,
  status text NOT NULL DEFAULT 'realizada',
  proxima_manutencao_km numeric,
  data_proxima_manutencao date,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.maintenances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select maintenances" ON public.maintenances FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert maintenances" ON public.maintenances FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update maintenances" ON public.maintenances FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete maintenances" ON public.maintenances FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select maintenances" ON public.maintenances FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert maintenances" ON public.maintenances FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update maintenances" ON public.maintenances FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete maintenances" ON public.maintenances FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));
