
-- Add multi-unit support to bank_accounts
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS permitir_multiplas_unidades boolean NOT NULL DEFAULT false;

-- Junction table for bank account <-> establishment units
CREATE TABLE public.bank_account_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.fiscal_establishments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conta_bancaria_id, unidade_id)
);

-- Enable RLS
ALTER TABLE public.bank_account_units ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other tables - permissive for admin/moderator)
CREATE POLICY "Admins can manage bank_account_units"
  ON public.bank_account_units
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Moderators can manage bank_account_units"
  ON public.bank_account_units
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'moderator'))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'));
