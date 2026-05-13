-- Backfill lote_id for expense_payments created together (batch operations)
-- Group by created_by + 10-second window, only when 2+ payments share the window
WITH ordered AS (
  SELECT id, created_by, created_at,
    EXTRACT(EPOCH FROM created_at)::bigint AS epoch_sec
  FROM expense_payments
  WHERE lote_id IS NULL AND created_by IS NOT NULL
),
windowed AS (
  SELECT id, created_by,
    -- bucket by 10-second windows aligned per user
    floor(epoch_sec / 10.0)::bigint AS bucket
  FROM ordered
),
buckets AS (
  SELECT created_by, bucket, COUNT(*) AS cnt, gen_random_uuid() AS new_lote_id
  FROM windowed
  GROUP BY created_by, bucket
  HAVING COUNT(*) >= 2
)
UPDATE expense_payments ep
SET lote_id = b.new_lote_id
FROM windowed w
JOIN buckets b ON b.created_by = w.created_by AND b.bucket = w.bucket
WHERE ep.id = w.id AND ep.lote_id IS NULL;

-- Propagate lote_id to existing movimentacoes_bancarias rows
UPDATE movimentacoes_bancarias mb
SET lote_id = ep.lote_id
FROM expense_payments ep
WHERE mb.origem = 'pagamento_despesa'
  AND mb.origem_id = ep.id
  AND mb.lote_id IS NULL
  AND ep.lote_id IS NOT NULL;