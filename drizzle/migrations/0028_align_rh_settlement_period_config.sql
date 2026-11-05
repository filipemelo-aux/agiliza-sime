CREATE OR REPLACE FUNCTION public.get_rh_period_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; e integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 SELECT value INTO c FROM public.rh_config WHERE key='acerto_period_config' AND tenant_id=public.current_tenant_id();
 IF c IS NOT NULL THEN RETURN c; END IF;
 SELECT (value->>'end_day')::integer INTO e FROM public.rh_config WHERE key='quinzena_1_range' AND tenant_id=public.current_tenant_id();
 RETURN jsonb_build_object('firstEndDay',coalesce(e,15),'firstPayDay',20,'secondPayDay',5);
END $$;
REVOKE ALL ON FUNCTION public.get_rh_period_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rh_period_config() TO authenticated;
CREATE OR REPLACE FUNCTION public.save_rh_period_config(_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e integer; p integer; s integer; t uuid:=public.current_tenant_id();
BEGIN
 IF auth.uid() IS NULL OR t IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN RAISE EXCEPTION 'Acesso não permitido'; END IF;
 IF jsonb_typeof(_config->'firstEndDay') IS DISTINCT FROM 'number' OR jsonb_typeof(_config->'firstPayDay') IS DISTINCT FROM 'number' OR jsonb_typeof(_config->'secondPayDay') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Configuração inválida'; END IF;
 e:=(_config->>'firstEndDay')::integer; p:=(_config->>'firstPayDay')::integer; s:=(_config->>'secondPayDay')::integer;
 IF e NOT BETWEEN 1 AND 27 OR p<=e OR p>28 OR s NOT BETWEEN 1 AND 28 OR e::numeric<>(_config->>'firstEndDay')::numeric OR p::numeric<>(_config->>'firstPayDay')::numeric OR s::numeric<>(_config->>'secondPayDay')::numeric THEN RAISE EXCEPTION 'Dias da configuração inválidos'; END IF;
 IF e <> (public.get_rh_period_config()->>'firstEndDay')::integer AND (EXISTS(SELECT 1 FROM public.acerto_movimentos WHERE tenant_id=t) OR EXISTS(SELECT 1 FROM public.descontos_folha WHERE tenant_id=t AND adiantamento_origem_id IS NOT NULL)) THEN RAISE EXCEPTION 'Não é possível alterar o limite das quinzenas enquanto houver movimentações ou parcelas vinculadas. Os prazos de pagamento podem ser alterados.'; END IF;
 UPDATE public.rh_config SET value=jsonb_build_object('firstEndDay',e,'firstPayDay',p,'secondPayDay',s),updated_at=now() WHERE key='acerto_period_config' AND tenant_id=t;
 IF NOT FOUND THEN INSERT INTO public.rh_config(key,value,description,tenant_id) VALUES('acerto_period_config',jsonb_build_object('firstEndDay',e,'firstPayDay',p,'secondPayDay',s),'Períodos e prazos de acerto quinzenal',t); END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_rh_period_config(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_rh_period_config(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.fn_infer_salario_competencia(_data_emissao date)
RETURNS date LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE c jsonb; e integer:=15; s integer:=5; d integer;
BEGIN
 IF _data_emissao IS NULL THEN RETURN NULL; END IF;
 SELECT value INTO c FROM public.rh_config WHERE key='acerto_period_config' AND tenant_id=public.current_tenant_id();
 IF c IS NULL THEN SELECT (value->>'end_day')::integer INTO e FROM public.rh_config WHERE key='quinzena_1_range' AND tenant_id=public.current_tenant_id(); ELSE e:=(c->>'firstEndDay')::integer; s:=(c->>'secondPayDay')::integer; END IF;
 e:=coalesce(e,15); d:=extract(day FROM _data_emissao)::integer;
 IF d<=s THEN RETURN (date_trunc('month',_data_emissao)-interval '1 month')::date+e; END IF;
 IF d>e THEN RETURN date_trunc('month',_data_emissao)::date; END IF;
 RETURN _data_emissao;
END $$;
COMMENT ON FUNCTION public.fn_infer_salario_competencia(date) IS 'Tenant-scoped settlement competence: prior second half through its next-month due day; current first half after its end; explicit competence remains preserved by the expense trigger.';
DO $$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('public.parcelar_vale_acerto(uuid,date,uuid,integer)'::regprocedure) INTO def;
 def:=replace(def,'v_tenant uuid := public.current_tenant_id();','v_tenant uuid := public.current_tenant_id(); v_end integer := (public.get_rh_period_config()->>''firstEndDay'')::integer;');
 def:=replace(def,'NOT IN (1,16)','NOT IN (1,v_end+1)');
 def:=replace(def,'THEN v_data+15 ELSE','THEN v_data+v_end ELSE');
 EXECUTE def;
END $$;