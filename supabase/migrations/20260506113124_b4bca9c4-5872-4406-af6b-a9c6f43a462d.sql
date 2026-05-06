ALTER TABLE public.movimentacoes_bancarias DROP CONSTRAINT IF EXISTS movimentacoes_bancarias_origem_check;
ALTER TABLE public.movimentacoes_bancarias ADD CONSTRAINT movimentacoes_bancarias_origem_check
  CHECK (origem = ANY (ARRAY['contas_pagar','contas_receber','despesas','colheitas','pagamento_despesa','recebimento_conta_receber','manual']));