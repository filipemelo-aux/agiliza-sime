
-- Create chart_of_accounts table
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  conta_pai_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  nivel integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  empresa_id uuid REFERENCES public.fiscal_establishments(id) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

-- Enable RLS
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can select chart_of_accounts" ON public.chart_of_accounts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert chart_of_accounts" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update chart_of_accounts" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete chart_of_accounts" ON public.chart_of_accounts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select chart_of_accounts" ON public.chart_of_accounts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert chart_of_accounts" ON public.chart_of_accounts FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update chart_of_accounts" ON public.chart_of_accounts FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete chart_of_accounts" ON public.chart_of_accounts FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- Add plano_contas_id to financial_categories for future linking
ALTER TABLE public.financial_categories ADD COLUMN IF NOT EXISTS plano_contas_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
