CREATE TABLE public.cheque_expense_links (
  id uuid primary key default gen_random_uuid(),
  cheque_id uuid not null references public.cheques(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  valor numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (cheque_id, expense_id)
);
CREATE INDEX idx_cheque_expense_links_cheque ON public.cheque_expense_links(cheque_id);
CREATE INDEX idx_cheque_expense_links_expense ON public.cheque_expense_links(expense_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheque_expense_links TO authenticated;
GRANT ALL ON public.cheque_expense_links TO service_role;
ALTER TABLE public.cheque_expense_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view cheque links" ON public.cheque_expense_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/Moderators manage cheque links" ON public.cheque_expense_links FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'moderator'::app_role));
INSERT INTO public.cheque_expense_links (cheque_id, expense_id, valor)
SELECT c.id, c.expense_id, c.valor FROM public.cheques c WHERE c.expense_id IS NOT NULL
ON CONFLICT DO NOTHING;