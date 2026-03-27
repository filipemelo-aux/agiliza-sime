
ALTER TABLE public.previsoes_recebimento
  ADD CONSTRAINT previsoes_recebimento_origem_unique UNIQUE (origem_tipo, origem_id);
