ALTER TABLE public.faturas_recebimento ADD COLUMN IF NOT EXISTS forma_pagamento text;

CREATE TABLE public.remessas_cnab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  config_id uuid NOT NULL REFERENCES public.cobranca_configs(id),
  nsa integer NOT NULL,
  nome_arquivo text NOT NULL,
  conteudo text NOT NULL,
  qtd_titulos integer NOT NULL DEFAULT 0,
  valor_total numeric(14,2) NOT NULL DEFAULT 0,
  fatura_ids uuid[] NOT NULL DEFAULT '{}',
  fatura_numeros integer[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.remessas_cnab TO authenticated;
GRANT ALL ON public.remessas_cnab TO service_role;
ALTER TABLE public.remessas_cnab ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.remessas_cnab FOR EACH ROW EXECUTE FUNCTION public.fn_set_tenant_id();
CREATE INDEX remessas_cnab_tenant_created_idx ON public.remessas_cnab (tenant_id, created_at DESC);
CREATE POLICY "tenant_isolation" ON public.remessas_cnab AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Staff read remessas" ON public.remessas_cnab FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));
CREATE POLICY "Staff insert remessas" ON public.remessas_cnab FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));