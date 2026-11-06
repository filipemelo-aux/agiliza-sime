CREATE TABLE public.cobranca_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  empresa_id uuid REFERENCES public.fiscal_establishments(id),
  nome text NOT NULL DEFAULT 'Sicoob',
  banco_codigo text NOT NULL DEFAULT '756',
  banco_nome text NOT NULL DEFAULT 'SICOOB',
  beneficiario_nome text NOT NULL,
  beneficiario_cnpj text NOT NULL,
  agencia text NOT NULL,
  agencia_dv text NOT NULL DEFAULT '',
  conta text NOT NULL,
  conta_dv text NOT NULL DEFAULT '',
  codigo_beneficiario text NOT NULL,
  carteira text NOT NULL DEFAULT '1',
  modalidade text NOT NULL DEFAULT '01',
  especie_titulo text NOT NULL DEFAULT '04',
  aceite text NOT NULL DEFAULT 'N',
  juros_codigo text NOT NULL DEFAULT '2',
  juros_percentual numeric(7,2) NOT NULL DEFAULT 2,
  multa_codigo text NOT NULL DEFAULT '2',
  multa_percentual numeric(7,2) NOT NULL DEFAULT 2,
  protesto_codigo text NOT NULL DEFAULT '1',
  protesto_dias integer NOT NULL DEFAULT 7,
  baixa_codigo text NOT NULL DEFAULT '0',
  baixa_dias integer,
  ultimo_nosso_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_nosso_numero >= 0),
  ultimo_nsa integer NOT NULL DEFAULT 0 CHECK (ultimo_nsa >= 0),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cobranca_configs TO authenticated;
GRANT ALL ON public.cobranca_configs TO service_role;
ALTER TABLE public.cobranca_configs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.cobranca_configs FOR EACH ROW EXECUTE FUNCTION public.fn_set_tenant_id();
CREATE TRIGGER trg_cobranca_configs_updated BEFORE UPDATE ON public.cobranca_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "tenant_isolation" ON public.cobranca_configs AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Staff read cobranca" ON public.cobranca_configs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Admins manage cobranca" ON public.cobranca_configs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE TABLE public.boleto_titulos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  config_id uuid NOT NULL REFERENCES public.cobranca_configs(id),
  conta_receber_id uuid NOT NULL REFERENCES public.contas_receber(id) ON DELETE CASCADE,
  nosso_numero bigint NOT NULL,
  nosso_numero_dv smallint NOT NULL,
  primeira_remessa_nsa integer NOT NULL,
  ultima_remessa_nsa integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, nosso_numero),
  UNIQUE (conta_receber_id)
);
GRANT SELECT ON public.boleto_titulos TO authenticated;
GRANT ALL ON public.boleto_titulos TO service_role;
ALTER TABLE public.boleto_titulos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.boleto_titulos AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Staff read boletos" ON public.boleto_titulos FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));

-- Reserva atomicamente NSA e nossos números. Parcela já registrada reaproveita o mesmo nosso número (nunca repete nem pula).
CREATE OR REPLACE FUNCTION public.reservar_remessa_cnab(_config_id uuid, _conta_receber_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cfg public.cobranca_configs%ROWTYPE;
  _nsa integer; _cr uuid; _nn bigint; _dv int; _s text; _w text := '319731973197319731973'; _t int; _i int;
  _out jsonb := '[]'::jsonb; _tenant uuid := public.current_tenant_id();
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) THEN
    RAISE EXCEPTION 'Sem permissão para gerar remessa';
  END IF;
  SELECT * INTO _cfg FROM public.cobranca_configs WHERE id = _config_id AND tenant_id = _tenant AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configuração de cobrança não encontrada'; END IF;
  IF coalesce(array_length(_conta_receber_ids,1),0) = 0 THEN RAISE EXCEPTION 'Nenhuma parcela selecionada'; END IF;
  _nsa := _cfg.ultimo_nsa + 1;
  _nn := _cfg.ultimo_nosso_numero;
  FOREACH _cr IN ARRAY _conta_receber_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.contas_receber WHERE id=_cr AND tenant_id=_tenant) THEN
      RAISE EXCEPTION 'Parcela % não encontrada', _cr;
    END IF;
    IF EXISTS (SELECT 1 FROM public.boleto_titulos WHERE conta_receber_id=_cr) THEN
      UPDATE public.boleto_titulos SET ultima_remessa_nsa=_nsa WHERE conta_receber_id=_cr;
    ELSE
      _nn := _nn + 1;
      _s := lpad(regexp_replace(_cfg.agencia,'\D','','g'),4,'0') || lpad(regexp_replace(_cfg.codigo_beneficiario,'\D','','g'),10,'0') || lpad(_nn::text,7,'0');
      _t := 0;
      FOR _i IN 1..21 LOOP _t := _t + substr(_s,_i,1)::int * substr(_w,_i,1)::int; END LOOP;
      _dv := CASE WHEN _t % 11 IN (0,1) THEN 0 ELSE 11 - _t % 11 END;
      INSERT INTO public.boleto_titulos(tenant_id, config_id, conta_receber_id, nosso_numero, nosso_numero_dv, primeira_remessa_nsa, ultima_remessa_nsa)
      VALUES (_tenant, _config_id, _cr, _nn, _dv, _nsa, _nsa);
      UPDATE public.contas_receber SET forma_recebimento='boleto' WHERE id=_cr;
    END IF;
    SELECT _out || jsonb_build_object('conta_receber_id', b.conta_receber_id, 'nosso_numero', b.nosso_numero, 'dv', b.nosso_numero_dv)
      INTO _out FROM public.boleto_titulos b WHERE b.conta_receber_id=_cr;
  END LOOP;
  UPDATE public.cobranca_configs SET ultimo_nsa=_nsa, ultimo_nosso_numero=_nn WHERE id=_config_id;
  RETURN jsonb_build_object('nsa', _nsa, 'titulos', _out);
END $$;
REVOKE ALL ON FUNCTION public.reservar_remessa_cnab(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_remessa_cnab(uuid, uuid[]) TO authenticated;