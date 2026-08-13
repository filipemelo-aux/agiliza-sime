CREATE TABLE public.despesa_rateio_veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE,
  card_item_id uuid REFERENCES public.credit_card_invoice_items(id) ON DELETE CASCADE,
  veiculo_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  valor_rateado numeric(14,2) NOT NULL DEFAULT 0,
  percentual numeric(7,4),
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT despesa_rateio_one_parent CHECK (
    (expense_id IS NOT NULL AND card_item_id IS NULL)
    OR (expense_id IS NULL AND card_item_id IS NOT NULL)
  )
);

CREATE INDEX idx_rateio_expense ON public.despesa_rateio_veiculos(expense_id);
CREATE INDEX idx_rateio_card_item ON public.despesa_rateio_veiculos(card_item_id);
CREATE INDEX idx_rateio_veiculo ON public.despesa_rateio_veiculos(veiculo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesa_rateio_veiculos TO authenticated;
GRANT ALL ON public.despesa_rateio_veiculos TO service_role;

ALTER TABLE public.despesa_rateio_veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rateio_select_auth" ON public.despesa_rateio_veiculos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rateio_insert_auth" ON public.despesa_rateio_veiculos
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "rateio_update_admin_mod_or_owner" ON public.despesa_rateio_veiculos
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR created_by = auth.uid());

CREATE POLICY "rateio_delete_admin_mod_or_owner" ON public.despesa_rateio_veiculos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator') OR created_by = auth.uid());

CREATE TRIGGER update_despesa_rateio_veiculos_updated_at
  BEFORE UPDATE ON public.despesa_rateio_veiculos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();