CREATE UNIQUE INDEX IF NOT EXISTS fuelings_no_dup_idx
ON public.fuelings (
  veiculo_id, data_abastecimento, quantidade_litros, valor_total,
  COALESCE(posto_combustivel, '')
)
WHERE deleted_at IS NULL;