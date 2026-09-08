CREATE OR REPLACE FUNCTION public.fn_sync_reconciliation_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _rid uuid;
BEGIN
  _rid := COALESCE(NEW.reconciliation_id, OLD.reconciliation_id);
  UPDATE public.bank_reconciliations r
     SET total_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = _rid),
         reconciled_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = _rid AND i.status IN ('conciliado','registrado'))
   WHERE r.id = _rid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reconciliation_counters ON public.bank_reconciliation_items;
CREATE TRIGGER trg_sync_reconciliation_counters
AFTER INSERT OR UPDATE OR DELETE ON public.bank_reconciliation_items
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_reconciliation_counters();

UPDATE public.bank_reconciliations r
   SET total_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = r.id),
       reconciled_items = (SELECT count(*) FROM public.bank_reconciliation_items i WHERE i.reconciliation_id = r.id AND i.status IN ('conciliado','registrado'));