CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text NOT NULL UNIQUE,
  ie text, rntrc text,
  logradouro text, numero text, complemento text, bairro text, municipio text, uf text, cep text, codigo_municipio text,
  telefone text, email text,
  logo_url text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  focus_environment text NOT NULL DEFAULT 'homologation' CHECK (focus_environment IN ('production','homologation')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_secrets (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  focus_nfe_token_production text,
  focus_nfe_token_homologation text,
  certificate_password text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.tenant_secrets TO service_role;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tenant_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  titular text, cnpj_titular text,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_certificates TO authenticated;
GRANT ALL ON public.tenant_certificates TO service_role;
ALTER TABLE public.tenant_certificates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.superadmin_support_context (
  user_id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.superadmin_support_context TO service_role;
ALTER TABLE public.superadmin_support_context ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT s.tenant_id FROM public.superadmin_support_context s
      WHERE s.user_id = auth.uid() AND public.has_role(auth.uid(),'superadmin')),
    (SELECT m.tenant_id FROM public.tenant_members m WHERE m.user_id = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.set_support_tenant(_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'superadmin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.superadmin_support_context(user_id, tenant_id, updated_at)
  VALUES (auth.uid(), _tenant_id, now())
  ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, updated_at = now();
END $$;
REVOKE EXECUTE ON FUNCTION public.set_support_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_support_tenant(uuid) TO authenticated;

CREATE POLICY "tenant read own or superadmin" ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY "members read self or superadmin" ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'superadmin'));
CREATE POLICY "certs superadmin read" ON public.tenant_certificates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'));

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tenant_certs_updated BEFORE UPDATE ON public.tenant_certificates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH t AS (
  INSERT INTO public.tenants (razao_social, nome_fantasia, cnpj, status, focus_environment)
  VALUES ('SIME TRANSPORTE LTDA','SIME TRANSPORTES','23662751000179','active','production')
  RETURNING id
)
INSERT INTO public.tenant_members (tenant_id, user_id)
SELECT t.id, u.id FROM t, auth.users u;