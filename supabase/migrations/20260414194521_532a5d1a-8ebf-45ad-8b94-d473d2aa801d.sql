
-- Replace the trigger function to be a no-op (harvest payments now go through expenses)
CREATE OR REPLACE FUNCTION public.gerar_movimentacao_colheita()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Harvest payments now flow through the expenses system (Contas a Pagar -> quitação).
  -- Bank movements are created by the expense_payments trigger instead.
  -- This trigger is kept as a no-op to avoid breaking the trigger reference.
  
  IF TG_OP = 'DELETE' THEN
    -- Still clean up any legacy movements on delete
    DELETE FROM movimentacoes_bancarias WHERE origem = 'colheitas' AND origem_id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- Clean up existing duplicate 'colheitas' bank movements
-- These were created by the old trigger and are now duplicated by expense_payments movements
DELETE FROM movimentacoes_bancarias WHERE origem = 'colheitas';
