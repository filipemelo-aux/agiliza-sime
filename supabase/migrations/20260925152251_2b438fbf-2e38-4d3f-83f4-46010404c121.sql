CREATE INDEX IF NOT EXISTS idx_expenses_active_created ON public.expenses (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_active_status ON public.expenses (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_ativo ON public.chart_of_accounts (ativo);
CREATE INDEX IF NOT EXISTS idx_mov_bancarias_data ON public.movimentacoes_bancarias (data_movimentacao);