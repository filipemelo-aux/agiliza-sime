ALTER TABLE public.acerto_movimentos ADD COLUMN valor_desconto numeric(14,2), ADD COLUMN parcelas_total integer;
ALTER TABLE public.acerto_movimentos ADD CONSTRAINT acerto_valor_desconto_positive CHECK (valor_desconto IS NULL OR valor_desconto > 0);
ALTER TABLE public.descontos_folha ADD COLUMN adiantamento_origem_id uuid REFERENCES public.expenses(id), ADD COLUMN parcela_numero integer, ADD COLUMN parcelas_total integer;
CREATE UNIQUE INDEX descontos_adiantamento_parcela_unique ON public.descontos_folha (tenant_id, adiantamento_origem_id, parcela_numero) WHERE adiantamento_origem_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.parcelar_vale_acerto(_colaborador_id uuid, _periodo_inicio date, _expense_id uuid, _parcelas integer) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE e public.expenses; v_total bigint; v_base bigint; v_resto bigint; v_valor numeric; v_data date; v_id uuid; i integer; v_tenant uuid := public.current_tenant_id();
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 IF extract(day from _periodo_inicio) NOT IN (1,16) THEN RAISE EXCEPTION 'Quinzena inválida'; END IF;
 SELECT * INTO e FROM public.expenses WHERE id=_expense_id AND tenant_id=v_tenant FOR UPDATE;
 IF NOT FOUND OR e.favorecido_id IS DISTINCT FROM _colaborador_id OR e.reembolso_colaborador_id IS NOT NULL THEN RAISE EXCEPTION 'Vale inválido para este motorista'; END IF;
 IF EXISTS (SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE it.colaborador_id=_colaborador_id AND f.data_inicio=_periodo_inicio AND f.status <> 'cancelada') THEN RAISE EXCEPTION 'Acerto já gerado'; END IF;
 IF EXISTS (SELECT 1 FROM public.acerto_movimentos WHERE origem_tipo='expense' AND origem_id=_expense_id) OR EXISTS (SELECT 1 FROM public.descontos_folha WHERE adiantamento_origem_id=_expense_id) OR EXISTS (SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE _expense_id=ANY(it.adiantamento_expense_ids) AND f.status <> 'cancelada') THEN RAISE EXCEPTION 'Vale já utilizado ou parcelado'; END IF;
 v_total := round(e.valor_total*100)::bigint;
 IF _parcelas IS NULL OR _parcelas < 2 OR _parcelas > v_total THEN RAISE EXCEPTION 'Quantidade de parcelas inválida'; END IF;
 v_base := v_total / _parcelas; v_resto := v_total % _parcelas;
 v_valor := (v_base + CASE WHEN v_resto > 0 THEN 1 ELSE 0 END)::numeric/100;
 INSERT INTO public.acerto_movimentos(colaborador_id,periodo_inicio,natureza,origem_tipo,origem_id,valor_desconto,parcelas_total) VALUES(_colaborador_id,_periodo_inicio,'vale','expense',_expense_id,v_valor,_parcelas);
 v_data:=_periodo_inicio;
 FOR i IN 2.._parcelas LOOP
  v_data:= CASE WHEN extract(day from v_data)=1 THEN v_data+15 ELSE (date_trunc('month',v_data)+interval '1 month')::date END;
  v_valor:=(v_base+CASE WHEN i<=v_resto THEN 1 ELSE 0 END)::numeric/100;
  INSERT INTO public.descontos_folha(colaborador_id,tipo,valor,descricao,data_referencia,created_by,adiantamento_origem_id,parcela_numero,parcelas_total)
  VALUES(_colaborador_id,'adiantamento',v_valor,coalesce(e.descricao,'Vale / Adiantamento')||' — parcela '||i||'/'||_parcelas,v_data,auth.uid(),_expense_id,i,_parcelas);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.parcelar_vale_acerto(uuid,date,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcelar_vale_acerto(uuid,date,uuid,integer) TO authenticated, service_role;