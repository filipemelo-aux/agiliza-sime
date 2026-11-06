CREATE OR REPLACE FUNCTION public.criar_planos_desconto_acerto(_colaborador_id uuid, _periodo_inicio date, _periodo_fim date, _planos jsonb) RETURNS SETOF public.descontos_folha LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE t uuid:=public.current_tenant_id(); p public.profiles; plano jsonb; pid uuid; tp public.desconto_folha_tipo; qtd integer; total bigint; base bigint; resto bigint; cents bigint; dt date; fim date; e integer; mensal boolean; i integer; descr text;
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=_colaborador_id AND tenant_id=t AND is_colaborador_rh=true FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador inválido'; END IF;
 mensal:=p.category::text IS DISTINCT FROM 'motorista'; e:=(public.get_rh_period_config()->>'firstEndDay')::integer;
 IF _periodo_inicio IS NULL OR _periodo_fim IS NULL OR (mensal AND extract(day FROM _periodo_inicio)<>1) OR (NOT mensal AND extract(day FROM _periodo_inicio) NOT IN(1,e+1)) THEN RAISE EXCEPTION 'Período inválido'; END IF;
 fim:=CASE WHEN mensal OR extract(day FROM _periodo_inicio)<>1 THEN (date_trunc('month',_periodo_inicio)+interval '1 month - 1 day')::date ELSE _periodo_inicio+e-1 END;
 IF fim<>_periodo_fim THEN RAISE EXCEPTION 'As configurações do período mudaram. Atualize a tela.'; END IF;
 IF jsonb_typeof(_planos) IS DISTINCT FROM 'array' OR jsonb_array_length(_planos) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Descontos inválidos'; END IF;
 FOR plano IN SELECT value FROM jsonb_array_elements(_planos) LOOP
  pid:=(plano->>'id')::uuid; tp:=(plano->>'tipo')::public.desconto_folha_tipo; qtd:=(plano->>'parcelas')::integer; descr:=btrim(plano->>'descricao');
  IF pid IS NULL OR tp IS NULL OR tp::text NOT IN('credito_trabalhador','multas','avaria','faltas','combustivel','outros') OR descr IS NULL OR length(descr) NOT BETWEEN 1 AND 255 OR qtd IS NULL OR qtd NOT BETWEEN 1 AND 120 OR qtd::numeric IS DISTINCT FROM (plano->>'parcelas')::numeric OR (plano->>'valor')::numeric IS NULL OR (plano->>'valor')::numeric<=0 OR (plano->>'valor')::numeric>99999999.99 OR round((plano->>'valor')::numeric,2)<>(plano->>'valor')::numeric THEN RAISE EXCEPTION 'Informe tipo, descrição, valor positivo e parcelas válidas'; END IF;
  total:=round((plano->>'valor')::numeric*100)::bigint;
  IF tp::text='credito_trabalhador' THEN total:=total*qtd; END IF;
  IF qtd>total THEN RAISE EXCEPTION 'Cada parcela deve ter ao menos um centavo'; END IF;
  base:=total/qtd; resto:=total%qtd; dt:=_periodo_inicio;
  IF EXISTS(SELECT 1 FROM public.descontos_folha WHERE tenant_id=t AND plano_desconto_id=pid) THEN
   IF (SELECT count(*) FROM public.descontos_folha WHERE tenant_id=t AND plano_desconto_id=pid AND colaborador_id=_colaborador_id AND tipo=tp AND parcelas_total=qtd AND descricao=descr)<>qtd OR (SELECT sum(valor)*100 FROM public.descontos_folha WHERE tenant_id=t AND plano_desconto_id=pid)<>total OR NOT EXISTS(SELECT 1 FROM public.descontos_folha WHERE tenant_id=t AND plano_desconto_id=pid AND parcela_numero=1 AND data_referencia=_periodo_inicio) THEN RAISE EXCEPTION 'Plano já utilizado com outros dados'; END IF;
   RETURN QUERY SELECT d.* FROM public.descontos_folha d WHERE d.tenant_id=t AND d.plano_desconto_id=pid AND d.parcela_numero=1;
   CONTINUE;
  END IF;
  FOR i IN 1..qtd LOOP
   IF EXISTS(SELECT 1 FROM public.folhas_pagamento_itens it JOIN public.folhas_pagamento f ON f.id=it.folha_id WHERE it.tenant_id=t AND it.colaborador_id=_colaborador_id AND f.data_inicio=dt AND f.status<>'cancelada') THEN RAISE EXCEPTION 'Já existe fechamento gerado em um dos períodos das parcelas'; END IF;
   cents:=base+CASE WHEN i<=resto THEN 1 ELSE 0 END;
   INSERT INTO public.descontos_folha(tenant_id,colaborador_id,tipo,valor,descricao,data_referencia,created_by,plano_desconto_id,parcela_numero,parcelas_total) VALUES(t,_colaborador_id,tp,cents::numeric/100,descr,dt,auth.uid(),pid,i,qtd);
   dt:=CASE WHEN mensal OR extract(day FROM dt)<>1 THEN (date_trunc('month',dt)+interval '1 month')::date ELSE dt+e END;
  END LOOP;
  RETURN QUERY SELECT d.* FROM public.descontos_folha d WHERE d.tenant_id=t AND d.plano_desconto_id=pid AND d.parcela_numero=1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.criar_planos_desconto_acerto(uuid,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.criar_planos_desconto_acerto(uuid,date,date,jsonb) TO authenticated,service_role;
DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.save_rh_period_config(jsonb)'::regprocedure) INTO def;
 def:=replace(def,'AND adiantamento_origem_id IS NOT NULL','AND (adiantamento_origem_id IS NOT NULL OR plano_desconto_id IS NOT NULL)'); EXECUTE def;
END $$;