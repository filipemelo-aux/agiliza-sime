-- 1. LIMPEZA: remover folhas e despesas vinculadas
-- Apaga primeiro as expenses geradas por confirmação de folhas (vinculadas via folhas_pagamento_itens.expense_id)
DELETE FROM public.expenses
WHERE id IN (
  SELECT expense_id FROM public.folhas_pagamento_itens WHERE expense_id IS NOT NULL
);

-- Desvincula comissões/descontos das folhas que serão apagadas
UPDATE public.comissoes SET folha_pagamento_id = NULL, status = 'pendente' WHERE folha_pagamento_id IS NOT NULL;
UPDATE public.descontos_folha SET folha_pagamento_id = NULL WHERE folha_pagamento_id IS NOT NULL;

-- Apaga itens e folhas (precisa desabilitar triggers de imutabilidade temporariamente)
ALTER TABLE public.folhas_pagamento_itens DISABLE TRIGGER USER;
ALTER TABLE public.folhas_pagamento DISABLE TRIGGER USER;

DELETE FROM public.folhas_pagamento_itens;
DELETE FROM public.folhas_pagamento;

ALTER TABLE public.folhas_pagamento_itens ENABLE TRIGGER USER;
ALTER TABLE public.folhas_pagamento ENABLE TRIGGER USER;

-- 2. NOVOS CAMPOS em folhas_pagamento
ALTER TABLE public.folhas_pagamento
  ADD COLUMN IF NOT EXISTS data_inicio date,
  ADD COLUMN IF NOT EXISTS data_fim date,
  ADD COLUMN IF NOT EXISTS tipo_periodo text NOT NULL DEFAULT 'personalizado'
    CHECK (tipo_periodo IN ('primeira_quinzena','segunda_quinzena','personalizado','mensal'));

-- 3. NOVOS CAMPOS em folhas_pagamento_itens (snapshot das despesas consumidas)
ALTER TABLE public.folhas_pagamento_itens
  ADD COLUMN IF NOT EXISTS salario_expense_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS adiantamento_expense_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 4. Atualizar trigger de imutabilidade do header para considerar novos campos
CREATE OR REPLACE FUNCTION public.bloquear_edicao_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'confirmada' THEN
    IF NEW.mes_referencia IS DISTINCT FROM OLD.mes_referencia
       OR NEW.data_inicio IS DISTINCT FROM OLD.data_inicio
       OR NEW.data_fim IS DISTINCT FROM OLD.data_fim
       OR NEW.tipo_periodo IS DISTINCT FROM OLD.tipo_periodo
       OR NEW.data_emissao IS DISTINCT FROM OLD.data_emissao
       OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
       OR NEW.total_base IS DISTINCT FROM OLD.total_base
       OR NEW.total_adiantamentos IS DISTINCT FROM OLD.total_adiantamentos
       OR NEW.total_descontos IS DISTINCT FROM OLD.total_descontos
       OR NEW.total_comissoes IS DISTINCT FROM OLD.total_comissoes
       OR NEW.total_liquido IS DISTINCT FROM OLD.total_liquido
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Folha confirmada não pode ser alterada. Estorne os pagamentos no Contas a Pagar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. Atualizar trigger de imutabilidade dos itens para considerar snapshots
CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_folha_id uuid;
BEGIN
  v_folha_id := COALESCE(NEW.folha_id, OLD.folha_id);
  SELECT status INTO v_status FROM public.folhas_pagamento WHERE id = v_folha_id;

  IF v_status = 'confirmada' THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
         OR NEW.salario_base IS DISTINCT FROM OLD.salario_base
         OR NEW.adiantamentos IS DISTINCT FROM OLD.adiantamentos
         OR NEW.descontos IS DISTINCT FROM OLD.descontos
         OR NEW.comissoes IS DISTINCT FROM OLD.comissoes
         OR NEW.liquido IS DISTINCT FROM OLD.liquido
         OR NEW.salario_expense_ids IS DISTINCT FROM OLD.salario_expense_ids
         OR NEW.adiantamento_expense_ids IS DISTINCT FROM OLD.adiantamento_expense_ids THEN
        RAISE EXCEPTION 'Itens de folha confirmada não podem ser recalculados.';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Itens de folha confirmada não podem ser excluídos.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_folhas_pagamento_periodo
  ON public.folhas_pagamento (data_inicio, data_fim);