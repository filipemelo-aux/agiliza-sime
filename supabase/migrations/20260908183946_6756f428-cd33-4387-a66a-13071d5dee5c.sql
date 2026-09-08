UPDATE public.bank_reconciliations r
SET total_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = r.id),
    reconciled_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = r.id AND i.status IN ('conciliado','registrado'));