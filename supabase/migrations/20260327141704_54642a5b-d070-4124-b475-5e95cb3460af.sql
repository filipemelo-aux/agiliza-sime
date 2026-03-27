
-- 1. Previsão sem cliente: já tem NOT NULL no FK, reforçar com CHECK
ALTER TABLE public.previsoes_recebimento
  ADD CONSTRAINT chk_previsao_cliente_obrigatorio
  CHECK (cliente_id IS NOT NULL);

-- 2. Não permitir faturar previsão já faturada (validar no INSERT da fatura_previsoes)
CREATE OR REPLACE FUNCTION public.validar_previsao_nao_faturada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF (SELECT status FROM previsoes_recebimento WHERE id = NEW.previsao_id) = 'faturado' THEN
    RAISE EXCEPTION 'Previsão % já está faturada e não pode ser vinculada novamente.', NEW.previsao_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_previsao_nao_faturada
  BEFORE INSERT ON public.fatura_previsoes
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_previsao_nao_faturada();

-- 3. Conta a receber sem fatura: já tem FK NOT NULL, reforçar com CHECK
ALTER TABLE public.contas_receber
  ADD CONSTRAINT chk_conta_receber_fatura_obrigatoria
  CHECK (fatura_id IS NOT NULL);

-- 4 & 5. Validar consistência status/data_recebimento na contas_receber
CREATE OR REPLACE FUNCTION public.validar_conta_receber_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Não permitir data_recebimento sem status = recebido
  IF NEW.data_recebimento IS NOT NULL AND NEW.status <> 'recebido' THEN
    RAISE EXCEPTION 'data_recebimento só pode ser preenchida quando status = recebido';
  END IF;

  -- Não permitir status = recebido sem data_recebimento
  IF NEW.status = 'recebido' AND NEW.data_recebimento IS NULL THEN
    RAISE EXCEPTION 'status recebido exige data_recebimento preenchida';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_conta_receber_recebimento
  BEFORE INSERT OR UPDATE ON public.contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION public.validar_conta_receber_recebimento();
