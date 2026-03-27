
-- Garantir que uma previsão só pode estar em uma única fatura
-- Remover constraint antiga N:N e adicionar UNIQUE apenas no previsao_id
ALTER TABLE public.fatura_previsoes DROP CONSTRAINT IF EXISTS fatura_previsoes_fatura_id_previsao_id_key;
ALTER TABLE public.fatura_previsoes ADD CONSTRAINT fatura_previsoes_previsao_id_key UNIQUE (previsao_id);

-- Trigger: ao vincular previsão a uma fatura, atualizar status para 'faturado'
CREATE OR REPLACE FUNCTION public.on_fatura_previsao_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE previsoes_recebimento
  SET status = 'faturado'
  WHERE id = NEW.previsao_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fatura_previsao_insert
  AFTER INSERT ON public.fatura_previsoes
  FOR EACH ROW
  EXECUTE FUNCTION public.on_fatura_previsao_insert();

-- Ao desvincular, voltar status para 'pendente'
CREATE OR REPLACE FUNCTION public.on_fatura_previsao_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE previsoes_recebimento
  SET status = 'pendente'
  WHERE id = OLD.previsao_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_fatura_previsao_delete
  AFTER DELETE ON public.fatura_previsoes
  FOR EACH ROW
  EXECUTE FUNCTION public.on_fatura_previsao_delete();
