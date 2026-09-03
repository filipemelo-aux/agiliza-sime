CREATE TABLE public.bank_reconciliation_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_item_id uuid NOT NULL REFERENCES public.bank_reconciliation_items(id) ON DELETE CASCADE,
  movimentacao_id uuid NOT NULL REFERENCES public.movimentacoes_bancarias(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reconciliation_item_id, movimentacao_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_reconciliation_item_links TO authenticated;
GRANT ALL ON public.bank_reconciliation_item_links TO service_role;

ALTER TABLE public.bank_reconciliation_item_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/Moderators manage bank_reconciliation_item_links"
ON public.bank_reconciliation_item_links
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'moderator'::public.app_role));

INSERT INTO public.bank_reconciliation_item_links (reconciliation_item_id, movimentacao_id)
SELECT id, matched_movimentacao_id
FROM public.bank_reconciliation_items
WHERE matched_movimentacao_id IS NOT NULL
ON CONFLICT (reconciliation_item_id, movimentacao_id) DO NOTHING;