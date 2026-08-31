-- 1. Remover trigger duplicado em contas_receber (mantém trg_validar_conta_receber)
DROP TRIGGER IF EXISTS trg_validar_conta_receber_recebimento ON public.contas_receber;

-- 2. Função genérica de limpeza do extrato ao excluir registro de origem
CREATE OR REPLACE FUNCTION public.fn_cleanup_movimentacao_on_origin_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.movimentacoes_bancarias WHERE origem_id = OLD.id;
  RETURN OLD;
END;
$$;

-- 3. Triggers AFTER DELETE nas tabelas de origem
DROP TRIGGER IF EXISTS trg_cleanup_movimentacao_expenses ON public.expenses;
CREATE TRIGGER trg_cleanup_movimentacao_expenses
AFTER DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.fn_cleanup_movimentacao_on_origin_delete();

DROP TRIGGER IF EXISTS trg_cleanup_movimentacao_contas_receber ON public.contas_receber;
CREATE TRIGGER trg_cleanup_movimentacao_contas_receber
AFTER DELETE ON public.contas_receber
FOR EACH ROW EXECUTE FUNCTION public.fn_cleanup_movimentacao_on_origin_delete();

DROP TRIGGER IF EXISTS trg_cleanup_movimentacao_expense_payments ON public.expense_payments;
CREATE TRIGGER trg_cleanup_movimentacao_expense_payments
AFTER DELETE ON public.expense_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_cleanup_movimentacao_on_origin_delete();