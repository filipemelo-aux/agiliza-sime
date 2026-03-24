
-- Add maintenance-specific columns to expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS tipo_manutencao text,
  ADD COLUMN IF NOT EXISTS km_atual numeric,
  ADD COLUMN IF NOT EXISTS tempo_parado text,
  ADD COLUMN IF NOT EXISTS proxima_manutencao_km numeric,
  ADD COLUMN IF NOT EXISTS fornecedor_mecanica text;

-- Create maintenance items table
CREATE TABLE public.expense_maintenance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'peca',
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_maintenance_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can select expense_maintenance_items" ON public.expense_maintenance_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert expense_maintenance_items" ON public.expense_maintenance_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update expense_maintenance_items" ON public.expense_maintenance_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete expense_maintenance_items" ON public.expense_maintenance_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can select expense_maintenance_items" ON public.expense_maintenance_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert expense_maintenance_items" ON public.expense_maintenance_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update expense_maintenance_items" ON public.expense_maintenance_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete expense_maintenance_items" ON public.expense_maintenance_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
