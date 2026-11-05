CREATE OR REPLACE FUNCTION public.fn_check_comissao_dupla_folha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.folha_pagamento_id IS NOT NULL
     AND (OLD.folha_pagamento_id IS NULL OR OLD.folha_pagamento_id <> NEW.folha_pagamento_id) THEN
    IF OLD.folha_pagamento_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.folhas_pagamento
        WHERE id = OLD.folha_pagamento_id AND status <> 'cancelada'
      ) THEN
        RAISE EXCEPTION 'Comissão % já está vinculada à folha % (status ativo).', NEW.id, OLD.folha_pagamento_id
          USING ERRCODE = 'unique_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.folhas_pagamento_itens i
        JOIN public.expenses e ON e.id = i.expense_id
        WHERE i.folha_id = OLD.folha_pagamento_id AND e.valor_pago > 0
      ) THEN
        RAISE EXCEPTION 'Comissão % já foi paga e não pode ser revinculada.', NEW.id
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;