CREATE TABLE public.establishment_secrets (
  establishment_id uuid PRIMARY KEY REFERENCES public.fiscal_establishments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  focus_nfe_token_production text,
  focus_nfe_token_homologation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.establishment_secrets TO service_role;
ALTER TABLE public.establishment_secrets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_establishment_secrets_updated BEFORE UPDATE ON public.establishment_secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tenant_secrets ADD COLUMN IF NOT EXISTS focus_nfe_token_master text;

ALTER TABLE public.fiscal_certificates
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS titular text,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz,
  ADD COLUMN IF NOT EXISTS focus_sync_status text,
  ADD COLUMN IF NOT EXISTS focus_sync_message text,
  ADD COLUMN IF NOT EXISTS focus_synced_at timestamptz;