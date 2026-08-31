-- 1. Migrar registros pendentes de accounts_payable para expenses (sem duplicar)
INSERT INTO public.expenses (
  empresa_id, unidade_id, descricao, plano_contas_id, centro_custo, tipo_despesa,
  valor_total, data_emissao, data_vencimento, data_competencia, status,
  favorecido_id, favorecido_nome, observacoes, created_by, origem
)
SELECT
  public.fn_empresa_unificada_id(),
  public.fn_empresa_unificada_id(),
  ap.description,
  ap.category_id,
  'operacional',
  'outros',
  ap.amount,
  COALESCE(ap.data_lancamento, ap.due_date, CURRENT_DATE),
  COALESCE(ap.due_date, CURRENT_DATE),
  COALESCE(ap.due_date, CURRENT_DATE),
  'pendente',
  ap.creditor_id,
  ap.creditor_name,
  ap.notes,
  ap.created_by,
  'manual'
FROM public.accounts_payable ap
WHERE ap.status <> 'Pago'
  AND NOT EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.descricao = ap.description AND e.valor_total = ap.amount
  );

-- 2. Desativar triggers legados da tabela accounts_payable (depreciada)
DROP TRIGGER IF EXISTS trg_movimentacao_conta_pagar ON public.accounts_payable;
DROP TRIGGER IF EXISTS trg_validar_conta_pagar ON public.accounts_payable;

-- 3. Marcar registros migrados como migrados (status informativo na tabela legada)
UPDATE public.accounts_payable SET notes = COALESCE(notes || ' ', '') || '[MIGRADO p/ expenses]' WHERE status <> 'Pago';