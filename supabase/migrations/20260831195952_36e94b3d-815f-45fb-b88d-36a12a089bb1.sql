ALTER TABLE public.faturas_recebimento ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.fiscal_establishments(id);
ALTER TABLE public.contas_receber ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.fiscal_establishments(id);
ALTER TABLE public.previsoes_recebimento ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.fiscal_establishments(id);
ALTER TABLE public.movimentacoes_bancarias ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.fiscal_establishments(id);

UPDATE public.faturas_recebimento SET empresa_id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a' WHERE empresa_id IS NULL;
UPDATE public.contas_receber SET empresa_id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a' WHERE empresa_id IS NULL;
UPDATE public.previsoes_recebimento SET empresa_id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a' WHERE empresa_id IS NULL;
UPDATE public.movimentacoes_bancarias SET empresa_id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a' WHERE empresa_id IS NULL;

ALTER TABLE public.faturas_recebimento ALTER COLUMN empresa_id SET DEFAULT 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';
ALTER TABLE public.contas_receber ALTER COLUMN empresa_id SET DEFAULT 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';
ALTER TABLE public.previsoes_recebimento ALTER COLUMN empresa_id SET DEFAULT 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';
ALTER TABLE public.movimentacoes_bancarias ALTER COLUMN empresa_id SET DEFAULT 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';

CREATE INDEX IF NOT EXISTS idx_faturas_recebimento_empresa ON public.faturas_recebimento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_empresa ON public.contas_receber(empresa_id);
CREATE INDEX IF NOT EXISTS idx_previsoes_recebimento_empresa ON public.previsoes_recebimento(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_bancarias_empresa ON public.movimentacoes_bancarias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_expenses_empresa ON public.expenses(empresa_id);