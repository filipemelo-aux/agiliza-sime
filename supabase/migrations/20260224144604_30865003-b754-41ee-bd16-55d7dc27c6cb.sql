
ALTER TABLE public.fiscal_logs ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.fiscal_establishments(id);
ALTER TABLE public.fiscal_logs ADD COLUMN IF NOT EXISTS cnpj_emissor text;
