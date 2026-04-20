-- =============================================================
-- INTEGRIDADE DA FOLHA DE PAGAMENTO (Prompt 9)
-- =============================================================

-- 1) Uma despesa não pode entrar em duas folhas
--    Cria índice único parcial sobre cada elemento dos arrays de IDs
--    referenciados em folhas_pagamento_itens.salario_expense_ids e
--    adiantamento_expense_ids, ignorando itens de folhas canceladas.

CREATE OR REPLACE FUNCTION public.fn_check_expense_uniqueness_in_folhas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dup_expense uuid;
BEGIN
  -- Coleta todos os expense_ids do novo registro (salário + adiantamento)
  WITH novos AS (
    SELECT unnest(COALESCE(NEW.salario_expense_ids, ARRAY[]::uuid[]))      AS expense_id
    UNION
    SELECT unnest(COALESCE(NEW.adiantamento_expense_ids, ARRAY[]::uuid[])) AS expense_id
  ),
  conflitos AS (
    SELECT n.expense_id
    FROM novos n
    WHERE EXISTS (
      SELECT 1
      FROM public.folhas_pagamento_itens i
      JOIN public.folhas_pagamento f ON f.id = i.folha_id
      WHERE i.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND f.status <> 'cancelada'
        AND (n.expense_id = ANY(i.salario_expense_ids)
          OR n.expense_id = ANY(i.adiantamento_expense_ids))
    )
  )
  SELECT expense_id INTO v_dup_expense FROM conflitos LIMIT 1;

  IF v_dup_expense IS NOT NULL THEN
    RAISE EXCEPTION 'Despesa % já está vinculada a outra folha de pagamento ativa.', v_dup_expense
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_expense_uniqueness_folha ON public.folhas_pagamento_itens;
CREATE TRIGGER trg_check_expense_uniqueness_folha
BEFORE INSERT OR UPDATE OF salario_expense_ids, adiantamento_expense_ids
ON public.folhas_pagamento_itens
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_expense_uniqueness_in_folhas();

-- 2) Uma comissão não pode ser paga duas vezes
--    Garantir que comissão com status 'enviado_folha' ou 'pago' NÃO possa ser
--    revinculada a outra folha enquanto já estiver vinculada.

CREATE OR REPLACE FUNCTION public.fn_check_comissao_dupla_folha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se está sendo vinculada a uma folha (folha_pagamento_id passou de NULL para algo)
  IF NEW.folha_pagamento_id IS NOT NULL
     AND (OLD.folha_pagamento_id IS NULL OR OLD.folha_pagamento_id <> NEW.folha_pagamento_id) THEN
    -- Bloqueia se a comissão já estava em outra folha não cancelada
    IF OLD.folha_pagamento_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.folhas_pagamento
        WHERE id = OLD.folha_pagamento_id AND status <> 'cancelada'
      ) THEN
        RAISE EXCEPTION 'Comissão % já está vinculada à folha % (status ativo).', NEW.id, OLD.folha_pagamento_id
          USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
    -- Bloqueia se status já é 'pago'
    IF OLD.status = 'pago' THEN
      RAISE EXCEPTION 'Comissão % já foi paga e não pode ser revinculada.', NEW.id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_comissao_dupla_folha ON public.comissoes;
CREATE TRIGGER trg_check_comissao_dupla_folha
BEFORE UPDATE ON public.comissoes
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_comissao_dupla_folha();

-- 3) Complemento salarial não pode ser duplicado
--    Cada folha pode gerar no máximo 1 despesa de complemento por colaborador.
--    Critério: descrição inicia com 'Complemento salarial — ' + colaborador
--    e folha referenciada nas observações. Para garantir unicidade real,
--    usamos índice único parcial sobre (favorecido_id, descricao) onde a
--    descrição começa com 'Complemento salarial — ' (case sensitive).
--    Como folhas distintas têm descrições distintas (incluem período), isso
--    impede que UMA mesma folha gere dois complementos para o mesmo colaborador.

CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_complemento_unico
ON public.expenses (favorecido_id, descricao)
WHERE deleted_at IS NULL
  AND descricao LIKE 'Complemento salarial — %';

COMMENT ON INDEX public.uq_expenses_complemento_unico IS
  'Garante que cada colaborador receba apenas UM complemento salarial por folha (descrição contém o período da folha).';
