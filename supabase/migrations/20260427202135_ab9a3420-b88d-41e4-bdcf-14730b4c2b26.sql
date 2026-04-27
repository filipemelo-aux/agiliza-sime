
-- Backfill matched_movimentacao_id para itens já conciliados sem vínculo
-- Algoritmo: greedy pela menor distância de data, garantindo movimento ainda livre.

DO $$
DECLARE
  rec RECORD;
  used_movs UUID[];
  chosen UUID;
BEGIN
  -- Inicializa com movimentos já vinculados em qualquer conciliação
  SELECT COALESCE(array_agg(matched_movimentacao_id), ARRAY[]::uuid[])
    INTO used_movs
  FROM bank_reconciliation_items
  WHERE matched_movimentacao_id IS NOT NULL;

  -- Para cada item conciliado sem vínculo, busca melhor candidato
  FOR rec IN
    SELECT id, transaction_date, amount, tipo
    FROM bank_reconciliation_items
    WHERE status IN ('conciliado','registrado')
      AND matched_movimentacao_id IS NULL
    ORDER BY transaction_date
  LOOP
    SELECT mb.id INTO chosen
    FROM movimentacoes_bancarias mb
    WHERE mb.tipo = rec.tipo
      AND ABS(mb.valor - rec.amount) < 0.01
      AND ABS(mb.data_movimentacao - rec.transaction_date) <= 5
      AND NOT (mb.id = ANY(used_movs))
    ORDER BY ABS(mb.data_movimentacao - rec.transaction_date) ASC, mb.data_movimentacao ASC
    LIMIT 1;

    IF chosen IS NOT NULL THEN
      UPDATE bank_reconciliation_items
        SET matched_movimentacao_id = chosen
        WHERE id = rec.id;
      used_movs := array_append(used_movs, chosen);
    END IF;
  END LOOP;
END $$;
