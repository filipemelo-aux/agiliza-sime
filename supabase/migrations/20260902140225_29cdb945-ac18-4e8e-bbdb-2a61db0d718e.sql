UPDATE public.bank_reconciliation_items
SET status = 'pendente', matched_movimentacao_id = NULL
WHERE id IN ('bb25c807-3e5e-495e-8865-2b36e1c43a1d','a9056676-eacf-457b-863e-89a67fa27fbb')
  AND status = 'conciliado'
  AND matched_movimentacao_id IS NULL;