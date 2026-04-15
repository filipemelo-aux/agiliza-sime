ALTER TABLE public.movimentacoes_bancarias
ADD COLUMN plano_contas_id UUID REFERENCES public.chart_of_accounts(id) DEFAULT NULL;