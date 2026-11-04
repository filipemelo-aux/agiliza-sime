CREATE TABLE public.acerto_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id(),
  colaborador_id uuid NOT NULL,
  periodo_inicio date NOT NULL,
  natureza text NOT NULL CHECK (natureza IN ('comissao','reembolso','vale','desconto')),
  origem_tipo text NOT NULL CHECK (origem_tipo IN ('comissao','expense','desconto')),
  origem_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, origem_tipo, origem_id)
);
CREATE INDEX acerto_movimentos_colab_idx ON public.acerto_movimentos (colaborador_id, periodo_inicio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acerto_movimentos TO authenticated;
GRANT ALL ON public.acerto_movimentos TO service_role;
ALTER TABLE public.acerto_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON public.acerto_movimentos AS RESTRICTIVE FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id()) WITH CHECK (tenant_id = public.current_tenant_id());
CREATE POLICY "staff_all" ON public.acerto_movimentos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator') OR public.has_role(auth.uid(),'operador'));