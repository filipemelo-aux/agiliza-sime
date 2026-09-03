CREATE OR REPLACE FUNCTION public.reconcile_bank_item_with_expenses(_reconciliation_item_id uuid, _allocations jsonb, _user_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.bank_reconciliation_items%ROWTYPE;
  v_allocation jsonb;
  v_expense_id uuid;
  v_installment_id uuid;
  v_amount numeric;
  v_only_link boolean;
  v_expected numeric;
  v_allocated numeric := 0;
  v_paid numeric;
  v_total numeric;
  v_remaining numeric;
  v_payment_id uuid;
  v_movement_id uuid;
  v_movement_valor numeric;
  v_first_movement_id uuid;
  v_linked_count integer := 0;
  v_deleted_at timestamptz;
  v_diff numeric := 0;
  v_juros numeric;
  v_desconto numeric;
  v_last_pay_idx integer := 0;
  v_i integer;
  v_exp_ids uuid[] := '{}';
  v_inst_ids uuid[] := '{}';
  v_amounts numeric[] := '{}';
  v_only_links boolean[] := '{}';
  v_mov_ids uuid[] := '{}';
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
    v_only_link := COALESCE((v_allocation->>'apenas_conciliar')::boolean, false);

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

    IF v_only_link THEN
      SELECT m.id, abs(m.valor)::numeric INTO v_movement_id, v_movement_valor
      FROM public.movimentacoes_bancarias m
      JOIN public.expense_payments p ON p.id = m.origem_id
      WHERE m.origem = 'pagamento_despesa'
        AND p.expense_id = v_expense_id
        AND (v_installment_id IS NULL OR p.installment_id = v_installment_id)
        AND abs(abs(m.valor)::numeric - v_amount) < 0.01
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_reconciliation_item_links l WHERE l.movimentacao_id = m.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.bank_reconciliation_items bi WHERE bi.matched_movimentacao_id = m.id
        )
      ORDER BY abs(abs(m.valor)::numeric - v_amount), m.created_at DESC
      LIMIT 1;

      IF v_movement_id IS NULL THEN
        RAISE EXCEPTION 'O pagamento parcial selecionado já foi conciliado ou não possui movimentação disponível';
      END IF;

      v_exp_ids := v_exp_ids || v_expense_id;
      v_inst_ids := v_inst_ids || v_installment_id;
      v_amounts := v_amounts || v_movement_valor;
      v_only_links := v_only_links || true;
      v_mov_ids := v_mov_ids || v_movement_id;
      CONTINUE;
    END IF;

    IF v_installment_id IS NOT NULL THEN
      SELECT i.valor, COALESCE(SUM(p.valor + COALESCE(p.desconto, 0)), 0)
        INTO v_total, v_paid
      FROM public.expense_installments i
      LEFT JOIN public.expense_payments p ON p.installment_id = i.id
      WHERE i.id = v_installment_id AND i.expense_id = v_expense_id
      GROUP BY i.id, i.valor;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Parcela selecionada não pertence à conta';
      END IF;
    ELSE
      SELECT e.valor_total, COALESCE(SUM(p.valor + COALESCE(p.desconto, 0)), 0)
        INTO v_total, v_paid
      FROM public.expenses e
      LEFT JOIN public.expense_payments p ON p.expense_id = e.id
      WHERE e.id = v_expense_id
      GROUP BY e.id, e.valor_total;
    END IF;

    v_remaining := round(GREATEST(0, v_total - v_paid), 2);
    IF v_remaining <= 0.005 THEN
      RAISE EXCEPTION 'A conta selecionada não possui saldo em aberto';
    END IF;

    v_exp_ids := v_exp_ids || v_expense_id;
    v_inst_ids := v_inst_ids || v_installment_id;
    v_amounts := v_amounts || v_remaining;
    v_only_links := v_only_links || false;
    v_mov_ids := v_mov_ids || NULL::uuid;
    v_last_pay_idx := array_length(v_amounts, 1);
  END LOOP;

  SELECT COALESCE(SUM(x), 0) INTO v_allocated FROM unnest(v_amounts) AS x;
  v_diff := round(v_expected - v_allocated, 2);

  IF abs(v_diff) > 0.005 AND v_last_pay_idx = 0 THEN
    RAISE EXCEPTION 'Não é possível ajustar a diferença de % pois todas as contas selecionadas já estão pagas', v_diff;
  END IF;

  FOR v_i IN 1 .. COALESCE(array_length(v_amounts, 1), 0) LOOP
    IF v_only_links[v_i] THEN
      INSERT INTO public.bank_reconciliation_item_links (reconciliation_item_id, movimentacao_id)
      VALUES (_reconciliation_item_id, v_mov_ids[v_i]);
      IF v_first_movement_id IS NULL THEN v_first_movement_id := v_mov_ids[v_i]; END IF;
      v_linked_count := v_linked_count + 1;
      CONTINUE;
    END IF;

    v_expense_id := v_exp_ids[v_i];
    v_installment_id := v_inst_ids[v_i];
    v_amount := v_amounts[v_i];
    v_juros := 0;
    v_desconto := 0;

    IF v_i = v_last_pay_idx AND abs(v_diff) > 0.005 THEN
      IF v_diff > 0 THEN
        v_juros := v_diff;
        v_amount := round(v_amount + v_diff, 2);
      ELSE
        v_desconto := LEAST(-v_diff, v_amount);
        v_amount := round(v_amount - v_desconto, 2);
      END IF;
    END IF;

    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'O desconto informado zera o valor pago da conta selecionada';
    END IF;

    INSERT INTO public.expense_payments (
      expense_id, valor, forma_pagamento, data_pagamento, observacoes,
      created_by, juros, desconto, installment_id
    ) VALUES (
      v_expense_id, v_amount, 'transferencia', v_item.transaction_date,
      'Pagamento via conciliação bancária com rateio'
        || CASE WHEN v_juros > 0 THEN ' (juros de ' || to_char(v_juros, 'FM999999990.00') || ')'
                WHEN v_desconto > 0 THEN ' (desconto de ' || to_char(v_desconto, 'FM999999990.00') || ')'
                ELSE '' END,
      COALESCE(_user_id, auth.uid()), v_juros, v_desconto, v_installment_id
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
    VALUES (_reconciliation_item_id, v_movement_id);

    IF v_first_movement_id IS NULL THEN v_first_movement_id := v_movement_id; END IF;
    v_linked_count := v_linked_count + 1;
  END LOOP;

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
    'allocated_amount', v_expected,
    'juros', GREATEST(v_diff, 0),
    'desconto', GREATEST(-v_diff, 0)
  );
END;
$function$;