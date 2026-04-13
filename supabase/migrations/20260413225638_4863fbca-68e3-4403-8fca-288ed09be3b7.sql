
-- Add sequential number column to faturas_recebimento
ALTER TABLE public.faturas_recebimento
ADD COLUMN numero SERIAL;

-- Backfill existing rows in creation order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.faturas_recebimento
)
UPDATE public.faturas_recebimento f
SET numero = r.rn
FROM ranked r
WHERE f.id = r.id;

-- Ensure uniqueness
ALTER TABLE public.faturas_recebimento
ADD CONSTRAINT faturas_recebimento_numero_unique UNIQUE (numero);
