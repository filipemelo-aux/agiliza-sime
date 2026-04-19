-- Trigger: bloquear edição de folhas confirmadas (somente status pode ser revertido administrativamente via UPDATE direto no banco)
CREATE OR REPLACE FUNCTION public.bloquear_edicao_folha_confirmada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'confirmada' THEN
    -- Permitir apenas alteração de observacoes (campo informativo)
    IF NEW.mes_referencia IS DISTINCT FROM OLD.mes_referencia
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
$$;

DROP TRIGGER IF EXISTS trg_bloquear_edicao_folha_confirmada ON public.folhas_pagamento;
CREATE TRIGGER trg_bloquear_edicao_folha_confirmada
BEFORE UPDATE ON public.folhas_pagamento
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_edicao_folha_confirmada();

-- Bloquear DELETE de folhas confirmadas
CREATE OR REPLACE FUNCTION public.bloquear_delete_folha_confirmada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'confirmada' THEN
    RAISE EXCEPTION 'Folha confirmada não pode ser excluída.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_delete_folha_confirmada ON public.folhas_pagamento;
CREATE TRIGGER trg_bloquear_delete_folha_confirmada
BEFORE DELETE ON public.folhas_pagamento
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_delete_folha_confirmada();

-- Bloquear edição/exclusão de itens de folha confirmada
CREATE OR REPLACE FUNCTION public.bloquear_edicao_itens_folha_confirmada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_folha_id uuid;
BEGIN
  v_folha_id := COALESCE(NEW.folha_id, OLD.folha_id);
  SELECT status INTO v_status FROM public.folhas_pagamento WHERE id = v_folha_id;

  IF v_status = 'confirmada' THEN
    -- Permitir apenas vincular expense_id durante a própria confirmação (UPDATE)
    IF TG_OP = 'UPDATE' THEN
      IF NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
         OR NEW.salario_base IS DISTINCT FROM OLD.salario_base
         OR NEW.adiantamentos IS DISTINCT FROM OLD.adiantamentos
         OR NEW.descontos IS DISTINCT FROM OLD.descontos
         OR NEW.comissoes IS DISTINCT FROM OLD.comissoes
         OR NEW.liquido IS DISTINCT FROM OLD.liquido THEN
        RAISE EXCEPTION 'Itens de folha confirmada não podem ser recalculados.';
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Itens de folha confirmada não podem ser excluídos.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_edicao_itens_folha_confirmada ON public.folhas_pagamento_itens;
CREATE TRIGGER trg_bloquear_edicao_itens_folha_confirmada
BEFORE UPDATE OR DELETE ON public.folhas_pagamento_itens
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_edicao_itens_folha_confirmada();