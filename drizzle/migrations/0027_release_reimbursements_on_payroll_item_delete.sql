CREATE OR REPLACE FUNCTION public.release_payroll_reimbursements_on_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.expenses SET reembolso_folha_item_id = NULL
  WHERE reembolso_folha_item_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS release_payroll_reimbursements_on_item_delete ON public.folhas_pagamento_itens;
CREATE TRIGGER release_payroll_reimbursements_on_item_delete
AFTER DELETE ON public.folhas_pagamento_itens
FOR EACH ROW EXECUTE FUNCTION public.release_payroll_reimbursements_on_item_delete();