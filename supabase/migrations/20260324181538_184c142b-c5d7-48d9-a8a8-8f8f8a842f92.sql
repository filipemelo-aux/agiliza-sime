
CREATE TABLE public.expense_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  numero_parcela int NOT NULL DEFAULT 1,
  valor numeric NOT NULL DEFAULT 0,
  data_vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage installments of their expenses"
  ON public.expense_installments FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_installments.expense_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.expenses e WHERE e.id = expense_installments.expense_id)
  );
