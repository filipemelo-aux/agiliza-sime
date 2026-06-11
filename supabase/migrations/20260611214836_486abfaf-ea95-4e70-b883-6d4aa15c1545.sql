ALTER TABLE public.previsoes_recebimento
ADD COLUMN IF NOT EXISTS veiculo_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_previsoes_recebimento_veiculo_id ON public.previsoes_recebimento(veiculo_id);
COMMENT ON COLUMN public.previsoes_recebimento.veiculo_id IS 'Veículo atribuído à receita prevista — usado no painel de Métricas por Veículo para somar receitas de colheita por placa.';