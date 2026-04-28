
CREATE TABLE IF NOT EXISTS public.credit_card_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.fiscal_establishments(id),
  card_name TEXT NOT NULL,
  reference_label TEXT,
  due_date DATE NOT NULL,
  closing_date DATE,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta',
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  ofx_file_name TEXT,
  ofx_account_id TEXT,
  ofx_bank_name TEXT,
  observacoes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.credit_card_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.credit_card_invoices(id) ON DELETE CASCADE,
  posted_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  fitid TEXT,
  plano_contas_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  centro_custo TEXT,
  favorecido_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  favorecido_nome TEXT,
  observacoes TEXT,
  ignored BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cc_invoice_items_invoice ON public.credit_card_invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cc_invoices_due ON public.credit_card_invoices(due_date) WHERE deleted_at IS NULL;

ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cc_invoices_select_all_authenticated"
  ON public.credit_card_invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "cc_invoices_insert_admin_mod_op"
  ON public.credit_card_invoices FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'operador')
  );

CREATE POLICY "cc_invoices_update_admin_mod"
  ON public.credit_card_invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "cc_invoices_delete_admin"
  ON public.credit_card_invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cc_invoice_items_select_all_authenticated"
  ON public.credit_card_invoice_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "cc_invoice_items_insert_admin_mod_op"
  ON public.credit_card_invoice_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'moderator') OR
    public.has_role(auth.uid(), 'operador')
  );

CREATE POLICY "cc_invoice_items_update_admin_mod"
  ON public.credit_card_invoice_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "cc_invoice_items_delete_admin_mod"
  ON public.credit_card_invoice_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE TRIGGER trg_cc_invoices_updated
  BEFORE UPDATE ON public.credit_card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_cc_invoice_items_updated
  BEFORE UPDATE ON public.credit_card_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
