CREATE INDEX IF NOT EXISTS idx_expenses_tenant_active_created_id ON public.expenses (tenant_id, created_at DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ctes_tenant_emissao_created ON public.ctes (tenant_id, data_emissao DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_payments_expense ON public.expense_payments (expense_id);
CREATE INDEX IF NOT EXISTS idx_fuelings_expense_active ON public.fuelings (expense_id) WHERE expense_id IS NOT NULL AND deleted_at IS NULL;
ANALYZE public.expenses; ANALYZE public.ctes; ANALYZE public.expense_payments; ANALYZE public.fuelings;