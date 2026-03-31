ALTER TABLE public.fuelings
  ADD COLUMN arla_litros numeric DEFAULT 0,
  ADD COLUMN arla_valor_litro numeric DEFAULT 0,
  ADD COLUMN arla_valor_total numeric DEFAULT 0,
  ADD COLUMN fornecedor_id uuid REFERENCES public.profiles(id);