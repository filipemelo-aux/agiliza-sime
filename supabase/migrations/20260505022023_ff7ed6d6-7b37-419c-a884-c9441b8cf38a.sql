CREATE UNIQUE INDEX IF NOT EXISTS ux_previsoes_recebimento_cte
  ON public.previsoes_recebimento (origem_id)
  WHERE origem_tipo = 'cte';