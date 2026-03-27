
-- Backfill: generate movements for existing paid accounts_payable
INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
SELECT 'saida', 'contas_pagar', id, COALESCE(paid_amount, amount), paid_at, description
FROM accounts_payable
WHERE status = 'pago' AND paid_at IS NOT NULL
ON CONFLICT (origem, origem_id) DO NOTHING;

-- Backfill: generate movements for existing received contas_receber
INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
SELECT 'entrada', 'contas_receber', id, COALESCE(valor_recebido, valor), data_recebimento, 'Recebimento fatura ' || fatura_id::text
FROM contas_receber
WHERE status = 'recebido' AND data_recebimento IS NOT NULL
ON CONFLICT (origem, origem_id) DO NOTHING;
