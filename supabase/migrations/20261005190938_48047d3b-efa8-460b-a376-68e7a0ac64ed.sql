CREATE TABLE public.nfes_recebidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id(),
  establishment_id uuid REFERENCES public.fiscal_establishments(id) ON DELETE CASCADE,
  chave text NOT NULL,
  numero text, serie text,
  data_emissao timestamptz,
  emitente_nome text, emitente_cnpj text,
  destinatario_cnpj text, transportadora_cnpj text,
  valor numeric DEFAULT 0,
  situacao text DEFAULT 'autorizada',
  ator text NOT NULL DEFAULT 'destinatario',
  xml text,
  expense_id uuid, cte_id uuid,
  versao bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, chave)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfes_recebidas TO authenticated;
GRANT ALL ON public.nfes_recebidas TO service_role;
ALTER TABLE public.nfes_recebidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.nfes_recebidas AS RESTRICTIVE FOR ALL TO authenticated, anon USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "Staff read nfes_recebidas" ON public.nfes_recebidas FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'operador') OR has_role(auth.uid(),'consultor'));
CREATE POLICY "Staff write nfes_recebidas" ON public.nfes_recebidas FOR ALL TO authenticated USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'operador')) WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator') OR has_role(auth.uid(),'operador'));
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON public.nfes_recebidas FOR EACH ROW EXECUTE FUNCTION public.fn_set_tenant_id();
CREATE TRIGGER trg_nfes_recebidas_updated BEFORE UPDATE ON public.nfes_recebidas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();