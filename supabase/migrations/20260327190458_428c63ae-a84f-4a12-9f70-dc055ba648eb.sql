
-- Expand the origem check constraint to include 'despesas'
ALTER TABLE public.movimentacoes_bancarias
  DROP CONSTRAINT movimentacoes_bancarias_origem_check;

ALTER TABLE public.movimentacoes_bancarias
  ADD CONSTRAINT movimentacoes_bancarias_origem_check
  CHECK (origem = ANY (ARRAY['contas_pagar'::text, 'contas_receber'::text, 'despesas'::text]));

-- Backfill: insert movements for existing paid expenses
INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
SELECT
  'saida',
  'despesas',
  e.id,
  COALESCE(e.valor_pago, e.valor_total),
  COALESCE(e.data_pagamento::date, CURRENT_DATE),
  e.descricao
FROM expenses e
WHERE e.status = 'pago'
  AND e.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM movimentacoes_bancarias mb
    WHERE mb.origem = 'despesas' AND mb.origem_id = e.id
  );
