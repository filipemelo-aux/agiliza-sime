ALTER TABLE public.fuelings
  ADD COLUMN oleo_litros numeric DEFAULT 0,
  ADD COLUMN oleo_valor_litro numeric DEFAULT 0,
  ADD COLUMN oleo_valor_total numeric DEFAULT 0;