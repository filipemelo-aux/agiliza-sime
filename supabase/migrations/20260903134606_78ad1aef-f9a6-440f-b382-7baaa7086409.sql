CREATE TABLE IF NOT EXISTS public.cheques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.fiscal_establishments(id),
  numero_cheque text,
  banco_nome text,
  layout_id uuid REFERENCES public.check_layouts(id) ON DELETE SET NULL,
  conta_bancaria_id uuid REFERENCES public.contas_bancarias(id) ON DELETE SET NULL,
  valor numeric NOT NULL DEFAULT 0,
  favorecido_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  favorecido_nome text NOT NULL DEFAULT '',
  data_emissao date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  data_vencimento date,
  predatado boolean NOT NULL DEFAULT false,
  cruzado boolean NOT NULL DEFAULT true,
  cidade text,
  historico text,
  observacoes text,
  vinculo_tipo text NOT NULL DEFAULT 'movimentacao',
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  freight_contract_id uuid REFERENCES public.freight_contracts(id) ON DELETE SET NULL,
  movimentacao_id uuid REFERENCES public.movimentacoes_bancarias(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'emitido',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cheques_vinculo_tipo_check CHECK (vinculo_tipo IN ('conta_pagar','contrato_frete','movimentacao','avulso')),
  CONSTRAINT cheques_status_check CHECK (status IN ('emitido','compensado','cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cheques TO authenticated;
GRANT ALL ON public.cheques TO service_role;

ALTER TABLE public.cheques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view cheques" ON public.cheques;
CREATE POLICY "Authenticated can view cheques"
  ON public.cheques FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins/Moderators manage cheques" ON public.cheques;
CREATE POLICY "Admins/Moderators manage cheques"
  ON public.cheques FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

DROP TRIGGER IF EXISTS trg_cheques_updated_at ON public.cheques;
CREATE TRIGGER trg_cheques_updated_at
  BEFORE UPDATE ON public.cheques
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_cheques_data_emissao ON public.cheques(data_emissao);
CREATE INDEX IF NOT EXISTS idx_cheques_expense ON public.cheques(expense_id);
CREATE INDEX IF NOT EXISTS idx_cheques_contract ON public.cheques(freight_contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cheques_expense_numero ON public.cheques(expense_id, numero_cheque) WHERE expense_id IS NOT NULL AND numero_cheque IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cheques_contract_numero ON public.cheques(freight_contract_id, numero_cheque) WHERE freight_contract_id IS NOT NULL AND numero_cheque IS NOT NULL;

-- Backfill: cheques já registrados em despesas
INSERT INTO public.cheques (empresa_id, numero_cheque, valor, favorecido_id, favorecido_nome, data_emissao, data_vencimento, historico, vinculo_tipo, expense_id, status, created_by)
SELECT e.empresa_id, e.numero_cheque, e.valor_total, e.favorecido_id,
       COALESCE(e.favorecido_nome, ''), e.data_emissao, e.data_vencimento, e.descricao,
       'conta_pagar', e.id,
       CASE WHEN e.status = 'pago' THEN 'compensado' ELSE 'emitido' END,
       e.created_by
FROM public.expenses e
WHERE e.numero_cheque IS NOT NULL AND btrim(e.numero_cheque) <> '' AND e.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- Backfill: cheques de contratos de frete sem despesa vinculada já migrada
INSERT INTO public.cheques (numero_cheque, valor, favorecido_id, favorecido_nome, data_emissao, historico, vinculo_tipo, freight_contract_id, expense_id, status, created_by)
SELECT fc.numero_cheque, fc.valor_total, fc.contratado_id, COALESCE(fc.contratado_nome, ''), fc.data_contrato,
       'Contrato de frete nº ' || fc.numero, 'contrato_frete', fc.id, fc.expense_id, 'emitido', fc.created_by
FROM public.freight_contracts fc
WHERE fc.numero_cheque IS NOT NULL AND btrim(fc.numero_cheque) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.cheques c
    WHERE c.numero_cheque = fc.numero_cheque
      AND (c.expense_id = fc.expense_id OR c.freight_contract_id = fc.id)
  )
ON CONFLICT DO NOTHING;

UPDATE public.cheques c
SET empresa_id = public.fn_empresa_unificada_id()
WHERE c.empresa_id IS NULL;