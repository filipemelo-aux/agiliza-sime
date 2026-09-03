CREATE OR REPLACE FUNCTION public.reconcile_bank_item_with_expenses(
  _reconciliation_item_id uuid,
  _allocations jsonb,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item public.bank_reconciliation_items%ROWTYPE;
  v_allocation jsonb;
  v_expense_id uuid;
  v_installment_id uuid;
  v_amount numeric;
  v_expected numeric;
  v_allocated numeric := 0;
  v_paid numeric;
  v_total numeric;
  v_remaining numeric;
  v_payment_id uuid;
  v_movement_id uuid;
  v_first_movement_id uuid;
  v_linked_count integer := 0;
  v_deleted_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado para conciliação bancária';
  END IF;

  IF _allocations IS NULL OR jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos uma conta para vincular';
  END IF;

  SELECT * INTO v_item
  FROM public.bank_reconciliation_items
  WHERE id = _reconciliation_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Lançamento bancário não encontrado';
  END IF;
  IF v_item.status = 'conciliado' THEN
    RAISE EXCEPTION 'Este lançamento bancário já foi conciliado';
  END IF;
  IF v_item.tipo <> 'saida' THEN
    RAISE EXCEPTION 'A vinculação múltipla desta operação está disponível para débitos';
  END IF;

  v_expected := round(abs(v_item.amount)::numeric, 2);

  FOR v_allocation IN SELECT value FROM jsonb_array_elements(_allocations)
  LOOP
    v_expense_id := NULLIF(v_allocation->>'expense_id', '')::uuid;
    v_installment_id := NULLIF(v_allocation->>'installment_id', '')::uuid;
    v_amount := round(COALESCE((v_allocation->>'amount')::numeric, 0), 2);

    IF v_expense_id IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Rateio inválido: informe conta e valor maior que zero';
    END IF;

    SELECT e.valor_total, e.deleted_at INTO v_total, v_deleted_at
    FROM public.expenses e
    WHERE e.id = v_expense_id
    FOR UPDATE;

    IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A conta selecionada não está disponível';
    END IF;

    IF v_installment_id IS NOT NULL THEN
      SELECT i.valor, COALESCE(SUM(p.valor), 0)
        INTO v_total, v_paid
      FROM public.expense_installments i
      LEFT JOIN public.expense_payments p ON p.installment_id = i.id
      WHERE i.id = v_installment_id AND i.expense_id = v_expense_id
      GROUP BY i.id, i.valor;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela selecionada não pertence à conta';
      END IF;
    ELSE
      SELECT e.valor_total, COALESCE(SUM(p.valor), 0)
        INTO v_total, v_paid
      FROM public.expenses e
      LEFT JOIN public.expense_payments p ON p.expense_id = e.id
      WHERE e.id = v_expense_id
      GROUP BY e.id, e.valor_total;
    END IF;

    v_remaining := round(GREATEST(0, v_total - v_paid), 2);
    IF v_remaining <= 0.005 OR v_amount > v_remaining + 0.005 THEN
      RAISE EXCEPTION 'O valor informado excede o saldo disponível da conta selecionada';
    END IF;

    INSERT INTO public.expense_payments (
      expense_id, valor, forma_pagamento, data_pagamento, observacoes,
      created_by, juros, installment_id
    ) VALUES (
      v_expense_id, v_amount, 'transferencia', v_item.transaction_date,
      'Pagamento via conciliação bancária com rateio', COALESCE(_user_id, auth.uid()), 0, v_installment_id
    ) RETURNING id INTO v_payment_id;

    SELECT id INTO v_movement_id
    FROM public.movimentacoes_bancarias
    WHERE origem = 'pagamento_despesa' AND origem_id = v_payment_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_movement_id IS NULL THEN
      RAISE EXCEPTION 'Não foi possível criar a movimentação de caixa do pagamento';
    END IF;

    INSERT INTO public.bank_reconciliation_item_links (reconciliation_item_id, movimentacao_id)
    VALUES (_reconciliation_item_id, v_movement_id)
    ON CONFLICT (reconciliation_item_id, movimentacao_id) DO NOTHING;

    IF v_first_movement_id IS NULL THEN
      v_first_movement_id := v_movement_id;
    END IF;
    v_allocated := round(v_allocated + v_amount, 2);
    v_linked_count := v_linked_count + 1;
  END LOOP;

  IF abs(v_allocated - v_expected) > 0.005 THEN
    RAISE EXCEPTION 'O rateio (%) deve totalizar exatamente o débito (%)', v_allocated, v_expected;
  END IF;

  UPDATE public.bank_reconciliation_items
  SET status = 'conciliado', matched_movimentacao_id = v_first_movement_id
  WHERE id = _reconciliation_item_id AND status <> 'conciliado';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O lançamento bancário foi alterado por outra operação';
  END IF;

  RETURN jsonb_build_object(
    'reconciliation_item_id', _reconciliation_item_id,
    'matched_movimentacao_id', v_first_movement_id,
    'linked_count', v_linked_count,
    'allocated_amount', v_allocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_bank_item_with_expenses(uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_bank_item_with_expenses(uuid, jsonb, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_item_with_expenses(uuid, jsonb, uuid) TO authenticated;