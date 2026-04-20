-- =============================================================
-- COMPETÊNCIA vs PAGAMENTO (Prompt 1 — refator folha)
-- =============================================================
-- Adiciona coluna data_competencia em expenses para desacoplar
-- o período de PRODUÇÃO (folha) da data financeira (emissão/pagamento).
-- Default = data_emissao para preservar histórico.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS data_competencia date;

-- Backfill: tudo que já existe usa data_emissao como competência
UPDATE public.expenses
SET data_competencia = data_emissao
WHERE data_competencia IS NULL;

-- A partir de agora, todo INSERT sem data_competencia herda data_emissao
CREATE OR REPLACE FUNCTION public.fn_default_data_competencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data_competencia IS NULL THEN
    NEW.data_competencia := NEW.data_emissao;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_data_competencia ON public.expenses;
CREATE TRIGGER trg_default_data_competencia
BEFORE INSERT OR UPDATE OF data_emissao, data_competencia
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_default_data_competencia();

-- Índice para acelerar buscas da folha por competência + favorecido
CREATE INDEX IF NOT EXISTS idx_expenses_competencia_favorecido
ON public.expenses (favorecido_id, data_competencia)
WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.expenses.data_competencia IS
  'Período de PRODUÇÃO ao qual a despesa pertence (folha de pagamento). Default = data_emissao.';
