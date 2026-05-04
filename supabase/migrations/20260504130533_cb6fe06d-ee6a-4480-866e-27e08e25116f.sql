
CREATE OR REPLACE FUNCTION public.fn_sync_fatura_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fatura_id uuid;
  v_total int;
  v_recebidas int;
BEGIN
  v_fatura_id := COALESCE(NEW.fatura_id, OLD.fatura_id);
  IF v_fatura_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'recebido')
    INTO v_total, v_recebidas
  FROM contas_receber
  WHERE fatura_id = v_fatura_id;

  IF v_total > 0 AND v_recebidas = v_total THEN
    UPDATE faturas_recebimento SET status = 'paga'::fatura_status WHERE id = v_fatura_id AND status <> 'paga'::fatura_status;
  ELSE
    UPDATE faturas_recebimento SET status = 'faturada'::fatura_status WHERE id = v_fatura_id AND status = 'paga'::fatura_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_fatura_status ON public.contas_receber;
CREATE TRIGGER trg_sync_fatura_status
AFTER INSERT OR UPDATE OR DELETE ON public.contas_receber
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_fatura_status();

UPDATE faturas_recebimento f SET status = 'paga'::fatura_status
WHERE status = 'faturada'::fatura_status
  AND EXISTS (SELECT 1 FROM contas_receber WHERE fatura_id = f.id)
  AND NOT EXISTS (SELECT 1 FROM contas_receber WHERE fatura_id = f.id AND status <> 'recebido');
