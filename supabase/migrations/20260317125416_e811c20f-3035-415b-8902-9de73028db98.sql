
-- 1. Categories for financial entries (both receivable and payable)
CREATE TABLE public.financial_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('receivable', 'payable')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select financial_categories" ON public.financial_categories FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert financial_categories" ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update financial_categories" ON public.financial_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete financial_categories" ON public.financial_categories FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select financial_categories" ON public.financial_categories FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert financial_categories" ON public.financial_categories FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update financial_categories" ON public.financial_categories FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- 2. Financial invoices (faturas grouping CTEs)
CREATE TABLE public.financial_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number SERIAL,
  debtor_id UUID REFERENCES public.profiles(id),
  debtor_name TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'aberta',
  due_date DATE,
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select financial_invoices" ON public.financial_invoices FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert financial_invoices" ON public.financial_invoices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update financial_invoices" ON public.financial_invoices FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete financial_invoices" ON public.financial_invoices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select financial_invoices" ON public.financial_invoices FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert financial_invoices" ON public.financial_invoices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update financial_invoices" ON public.financial_invoices FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- 3. Financial invoice items (CTEs in an invoice)
CREATE TABLE public.financial_invoice_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.financial_invoices(id) ON DELETE CASCADE,
  cte_id UUID NOT NULL REFERENCES public.ctes(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select financial_invoice_items" ON public.financial_invoice_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert financial_invoice_items" ON public.financial_invoice_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update financial_invoice_items" ON public.financial_invoice_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete financial_invoice_items" ON public.financial_invoice_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select financial_invoice_items" ON public.financial_invoice_items FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert financial_invoice_items" ON public.financial_invoice_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));

-- 4. Accounts receivable (contas a receber)
CREATE TABLE public.accounts_receivable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.financial_categories(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_amount NUMERIC,
  debtor_name TEXT,
  debtor_id UUID REFERENCES public.profiles(id),
  cte_id UUID REFERENCES public.ctes(id),
  invoice_id UUID REFERENCES public.financial_invoices(id),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select accounts_receivable" ON public.accounts_receivable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert accounts_receivable" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update accounts_receivable" ON public.accounts_receivable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete accounts_receivable" ON public.accounts_receivable FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select accounts_receivable" ON public.accounts_receivable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert accounts_receivable" ON public.accounts_receivable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update accounts_receivable" ON public.accounts_receivable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- 5. Accounts payable (contas a pagar)
CREATE TABLE public.accounts_payable (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.financial_categories(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  paid_at TIMESTAMP WITH TIME ZONE,
  paid_amount NUMERIC,
  creditor_name TEXT,
  creditor_id UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select accounts_payable" ON public.accounts_payable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert accounts_payable" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update accounts_payable" ON public.accounts_payable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete accounts_payable" ON public.accounts_payable FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select accounts_payable" ON public.accounts_payable FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert accounts_payable" ON public.accounts_payable FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update accounts_payable" ON public.accounts_payable FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_receivable;
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts_payable;
