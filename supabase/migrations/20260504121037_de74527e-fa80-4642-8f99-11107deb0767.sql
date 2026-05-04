-- Garante que ao excluir um CT-e, sua previsão de recebimento vinculada seja removida automaticamente
CREATE OR REPLACE FUNCTION public.fn_delete_previsao_on_cte_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM previsoes_recebimento
  WHERE origem_tipo = 'cte'
    AND origem_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_previsao_on_cte_delete ON public.ctes;
CREATE TRIGGER trg_delete_previsao_on_cte_delete
BEFORE DELETE ON public.ctes
FOR EACH ROW
EXECUTE FUNCTION public.fn_delete_previsao_on_cte_delete();