CREATE OR REPLACE FUNCTION public.bloquear_edicao_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'confirmada' THEN
    IF NEW.status = 'em_aberto' THEN
      IF EXISTS (
        SELECT 1
        FROM public.folhas_pagamento_itens i
        JOIN public.expenses e ON e.id = i.expense_id
        WHERE i.folha_id = OLD.id
          AND e.deleted_at IS NULL
          AND (COALESCE(e.valor_pago, 0) > 0 OR e.status::text IN ('pago', 'parcial'))
      ) THEN
        RAISE EXCEPTION 'Folha possui pagamentos efetivos. Estorne os pagamentos antes de reabrir.';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Folha confirmada não pode ser editada diretamente. Reabra a folha antes.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_folha_id uuid;
  v_status text;
BEGIN
  v_folha_id := COALESCE(NEW.folha_id, OLD.folha_id);
  SELECT status::text INTO v_status
  FROM public.folhas_pagamento
  WHERE id = v_folha_id;

  IF v_status = 'confirmada' THEN
    RAISE EXCEPTION 'Itens de folha confirmada não podem ser alterados. Reabra a folha antes.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;