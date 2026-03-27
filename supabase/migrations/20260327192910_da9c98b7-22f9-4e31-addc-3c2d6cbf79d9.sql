
-- 1. Expand the origem check constraint to include 'colheitas'
ALTER TABLE public.movimentacoes_bancarias
  DROP CONSTRAINT movimentacoes_bancarias_origem_check;

ALTER TABLE public.movimentacoes_bancarias
  ADD CONSTRAINT movimentacoes_bancarias_origem_check
  CHECK (origem = ANY (ARRAY['contas_pagar'::text, 'contas_receber'::text, 'despesas'::text, 'colheitas'::text]));

-- 2. Update the validation trigger to allow 'colheitas' origin (skip strict source validation)
CREATE OR REPLACE FUNCTION public.validar_movimentacao_bancaria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.data_movimentacao IS NULL THEN
    RAISE EXCEPTION 'data_movimentacao é obrigatória para movimentações bancárias';
  END IF;

  IF NEW.origem IS NULL OR NEW.origem = '' THEN
    RAISE EXCEPTION 'origem é obrigatória para movimentações bancárias';
  END IF;

  IF NEW.origem_id IS NULL THEN
    RAISE EXCEPTION 'origem_id é obrigatório para movimentações bancárias';
  END IF;

  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RAISE EXCEPTION 'valor deve ser maior que zero';
  END IF;

  IF NEW.tipo IS NULL OR NEW.tipo NOT IN ('entrada', 'saida') THEN
    RAISE EXCEPTION 'tipo deve ser entrada ou saida';
  END IF;

  -- Validate contas_pagar
  IF NEW.origem = 'contas_pagar' THEN
    IF NOT EXISTS (
      SELECT 1 FROM accounts_payable
      WHERE id = NEW.origem_id AND status = 'pago' AND paid_at::date = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_pagar exige conta com status pago e data_movimentacao igual a paid_at';
    END IF;
  END IF;

  -- Validate contas_receber
  IF NEW.origem = 'contas_receber' THEN
    IF NOT EXISTS (
      SELECT 1 FROM contas_receber
      WHERE id = NEW.origem_id AND status = 'recebido' AND data_recebimento = NEW.data_movimentacao
    ) THEN
      RAISE EXCEPTION 'Movimentação de contas_receber exige conta com status recebido e data_movimentacao igual a data_recebimento';
    END IF;
  END IF;

  -- Validate colheitas: just check that the harvest_payment exists
  IF NEW.origem = 'colheitas' THEN
    IF NOT EXISTS (
      SELECT 1 FROM harvest_payments WHERE id = NEW.origem_id
    ) THEN
      RAISE EXCEPTION 'Movimentação de colheitas exige registro válido em harvest_payments';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Backfill: insert movements for all existing harvest_payments
INSERT INTO movimentacoes_bancarias (tipo, origem, origem_id, valor, data_movimentacao, descricao)
SELECT
  'saida',
  'colheitas',
  hp.id,
  hp.total_amount,
  hp.period_end,
  'Pagamento colheita - ' || hj.farm_name || ' (' || to_char(hp.period_start, 'DD/MM/YYYY') || ' a ' || to_char(hp.period_end, 'DD/MM/YYYY') || ')'
FROM harvest_payments hp
JOIN harvest_jobs hj ON hj.id = hp.harvest_job_id
WHERE NOT EXISTS (
  SELECT 1 FROM movimentacoes_bancarias mb
  WHERE mb.origem = 'colheitas' AND mb.origem_id = hp.id
);
