CREATE TABLE public.transport_insurers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  nome text NOT NULL,
  cnpj text,
  apolice_numero text,
  responsavel text NOT NULL DEFAULT 'emitente',
  vigencia_fim date,
  observacoes text,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_insurers TO authenticated;
GRANT ALL ON public.transport_insurers TO service_role;
ALTER TABLE public.transport_insurers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_transport_insurers_tenant ON public.transport_insurers(tenant_id);
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.transport_insurers FOR EACH ROW EXECUTE FUNCTION public.fn_set_tenant_id();
CREATE TRIGGER trg_transport_insurers_updated BEFORE UPDATE ON public.transport_insurers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "tenant_isolation" ON public.transport_insurers AS RESTRICTIVE FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Staff read insurers" ON public.transport_insurers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'consultor'));
CREATE POLICY "Editors manage insurers" ON public.transport_insurers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador')) WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));