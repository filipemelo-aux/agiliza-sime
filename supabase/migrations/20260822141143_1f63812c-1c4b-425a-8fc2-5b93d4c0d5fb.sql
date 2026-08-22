UPDATE public.bank_reconciliation_items
SET status = 'pendente', matched_movimentacao_id = NULL
WHERE id IN ('baeb6033-2bba-437c-95eb-6b4d315cf8b7','ac6fa32a-ce7f-4651-8fff-209b1d6c121e');

UPDATE public.bank_reconciliations r
SET reconciled_items = (
  SELECT count(*) FROM public.bank_reconciliation_items i
  WHERE i.reconciliation_id = r.id AND i.status = 'conciliado'
);