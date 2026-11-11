CREATE OR REPLACE FUNCTION public.remover_vale_parcelado_acerto(_colaborador_id uuid, _periodo_inicio date, _expense_id uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v public.acerto_movimentos;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 PERFORM 1 FROM public.expenses WHERE id=_expense_id AND tenant_id=public.current_tenant_id() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
 SELECT * INTO v FROM public.acerto_movimentos WHERE colaborador_id=_colaborador_id AND periodo_inicio=_periodo_inicio AND origem_tipo='expense' AND origem_id=_expense_id AND valor_desconto IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada'; END IF;
 IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE it.colaborador_id=_colaborador_id AND f.data_inicio=_periodo_inicio AND f.status <> 'cancelada') THEN RAISE EXCEPTION 'Acerto já gerado'; END IF;
 IF EXISTS(SELECT 1 FROM public.descontos_folha d WHERE d.adiantamento_origem_id=_expense_id AND d.tenant_id=public.current_tenant_id()
   AND (d.folha_pagamento_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.acerto_movimentos m WHERE m.origem_tipo='desconto' AND m.origem_id=d.id))) THEN
  RAISE EXCEPTION 'Outras parcelas deste vale já foram usadas em outros acertos; remova-as primeiro para refazer o parcelamento';
 END IF;
 DELETE FROM public.descontos_folha WHERE adiantamento_origem_id=_expense_id AND tenant_id=public.current_tenant_id();
 DELETE FROM public.acerto_movimentos WHERE id=v.id;
END; $function$;

CREATE OR REPLACE FUNCTION public.remover_plano_desconto_acerto(_colaborador_id uuid, _periodo_inicio date, _desconto_id uuid)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE d public.descontos_folha; t uuid:=public.current_tenant_id();
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 SELECT * INTO d FROM public.descontos_folha WHERE id=_desconto_id AND tenant_id=t FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Desconto não encontrado'; END IF;
 IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE it.colaborador_id=_colaborador_id AND f.data_inicio=_periodo_inicio AND f.status <> 'cancelada') THEN RAISE EXCEPTION 'Acerto já gerado'; END IF;
 DELETE FROM public.acerto_movimentos WHERE colaborador_id=_colaborador_id AND periodo_inicio=_periodo_inicio AND origem_tipo='desconto' AND origem_id=_desconto_id;
 -- Plano criado no acerto: se nenhuma parcela foi usada, desfaz o plano inteiro para poder ser refeito.
 IF d.plano_desconto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.descontos_folha x WHERE x.tenant_id=t AND x.plano_desconto_id=d.plano_desconto_id
   AND (x.folha_pagamento_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.acerto_movimentos m WHERE m.origem_tipo='desconto' AND m.origem_id=x.id))) THEN
  DELETE FROM public.descontos_folha WHERE tenant_id=t AND plano_desconto_id=d.plano_desconto_id;
 END IF;
 -- Parcela de vale: se nenhuma parcela do vale está em uso, libera o vale para novo parcelamento.
 IF d.adiantamento_origem_id IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.acerto_movimentos m WHERE m.origem_tipo='expense' AND m.origem_id=d.adiantamento_origem_id)
   AND NOT EXISTS(SELECT 1 FROM public.descontos_folha x WHERE x.tenant_id=t AND x.adiantamento_origem_id=d.adiantamento_origem_id
     AND (x.folha_pagamento_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.acerto_movimentos m WHERE m.origem_tipo='desconto' AND m.origem_id=x.id))) THEN
  DELETE FROM public.descontos_folha WHERE tenant_id=t AND adiantamento_origem_id=d.adiantamento_origem_id;
 END IF;
END; $function$;

GRANT EXECUTE ON FUNCTION public.remover_plano_desconto_acerto(uuid, date, uuid) TO authenticated;