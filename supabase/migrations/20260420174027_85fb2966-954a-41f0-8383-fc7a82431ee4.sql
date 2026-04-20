-- Backfill: recalcular data_competencia para despesas de salário antigas
-- onde a competência ficou igual à data de emissão (criadas antes do trigger
-- fn_auto_competencia_salario estar ativo ou sem disparo).
UPDATE public.expenses
SET data_competencia = public.fn_infer_salario_competencia(data_emissao)
WHERE deleted_at IS NULL
  AND plano_contas_id IS NOT NULL
  AND public.fn_is_salario_account(plano_contas_id)
  AND data_emissao IS NOT NULL
  AND data_competencia = data_emissao
  AND public.fn_infer_salario_competencia(data_emissao) IS DISTINCT FROM data_emissao;

-- Garante que o trigger de auto-inferência está ativo em INSERT e UPDATE
DROP TRIGGER IF EXISTS trg_auto_competencia_salario ON public.expenses;
CREATE TRIGGER trg_auto_competencia_salario
BEFORE INSERT OR UPDATE OF data_emissao, plano_contas_id, data_competencia
ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_competencia_salario();