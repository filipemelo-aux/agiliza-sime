
-- Add new columns to expenses table
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS xml_original text,
  ADD COLUMN IF NOT EXISTS documento_fiscal_importado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS viagem_id uuid,
  ADD COLUMN IF NOT EXISTS contrato_id uuid,
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj text,
  ADD COLUMN IF NOT EXISTS sefaz_status text DEFAULT 'nao_verificado';

-- Create expense_items table
CREATE TABLE public.expense_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  valor_total numeric NOT NULL DEFAULT 0,
  ncm text,
  cfop text,
  unidade text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for expense_items (same as expenses)
CREATE POLICY "Admins can select expense_items" ON public.expense_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert expense_items" ON public.expense_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update expense_items" ON public.expense_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete expense_items" ON public.expense_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Moderators can select expense_items" ON public.expense_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can insert expense_items" ON public.expense_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can update expense_items" ON public.expense_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
CREATE POLICY "Moderators can delete expense_items" ON public.expense_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'::app_role));
