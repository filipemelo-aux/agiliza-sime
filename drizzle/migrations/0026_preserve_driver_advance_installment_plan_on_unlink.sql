CREATE OR REPLACE FUNCTION public.remover_vale_parcelado_acerto(_colaborador_id uuid,_periodo_inicio date,_expense_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v public.acerto_movimentos; e public.expenses;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 SELECT * INTO e FROM public.expenses WHERE id=_expense_id AND tenant_id=public.current_tenant_id() FOR UPDATE;
 SELECT * INTO v FROM public.acerto_movimentos WHERE colaborador_id=_colaborador_id AND periodo_inicio=_periodo_inicio AND origem_tipo='expense' AND origem_id=_expense_id AND valor_desconto IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
 IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE it.colaborador_id=_colaborador_id AND f.data_inicio=_periodo_inicio AND f.status <> 'cancelada') THEN RAISE EXCEPTION 'Acerto já gerado'; END IF;
 INSERT INTO public.descontos_folha(colaborador_id,tipo,valor,descricao,data_referencia,created_by,adiantamento_origem_id,parcela_numero,parcelas_total)
 VALUES(_colaborador_id,'adiantamento',v.valor_desconto,coalesce(e.descricao,'Vale / Adiantamento')||' — parcela 1/'||v.parcelas_total,_periodo_inicio,auth.uid(),_expense_id,1,v.parcelas_total);
 DELETE FROM public.acerto_movimentos WHERE id=v.id;
END; $$;
REVOKE ALL ON FUNCTION public.remover_vale_parcelado_acerto(uuid,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remover_vale_parcelado_acerto(uuid,date,uuid) TO authenticated,service_role;