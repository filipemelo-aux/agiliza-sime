ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS is_saldo_frete boolean NOT NULL DEFAULT false;
ALTER TABLE public.ctes ADD COLUMN IF NOT EXISTS cte_origem_id uuid REFERENCES public.ctes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ctes_cte_origem_id ON public.ctes(cte_origem_id);