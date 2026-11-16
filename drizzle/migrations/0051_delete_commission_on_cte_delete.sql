CREATE OR REPLACE FUNCTION public.fn_delete_comissao_on_cte_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.comissoes WHERE origem = 'cte' AND referencia_id = OLD.id AND folha_pagamento_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Este CT-e tem comissão já incluída em folha de pagamento. Exclua o fechamento antes de excluir o CT-e.';
  END IF;
  DELETE FROM public.comissoes WHERE origem = 'cte' AND referencia_id = OLD.id;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_delete_comissao_on_cte_delete ON public.ctes;
CREATE TRIGGER trg_delete_comissao_on_cte_delete BEFORE DELETE ON public.ctes
FOR EACH ROW EXECUTE FUNCTION public.fn_delete_comissao_on_cte_delete();