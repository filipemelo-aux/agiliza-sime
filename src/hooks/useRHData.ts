/**
 * useRHData — Observer/listener do RH
 *
 * Centraliza:
 *   1. Carregamento inicial de colaboradores + plano de contas + despesas do mês.
 *   2. Auto-detecção das contas padrão (Salários / Adiantamentos) se ainda não configuradas.
 *   3. Listener Postgres-changes para `expenses` e `expense_payments` — recarrega
 *      automaticamente quando o financeiro muda.
 *
 * O componente UI consome apenas o estado derivado, sem conhecer detalhes do Supabase.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchChartAccounts,
  fetchColaboradoresRH,
  type ChartAccount,
  type ColaboradorRH,
} from "@/services/rh/rhColaboradoresService";
import {
  fetchExpensesForColaboradores,
  type Expense,
} from "@/services/rh/rhFinancialService";
import {
  isAdiantAccountName,
  isFolhaAccountName,
  rhSettings,
} from "@/services/rh/rhSettings";

export function useRHData(month: string) {
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState<ColaboradorRH[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [realtimeActive, setRealtimeActive] = useState(false);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [colabs, accs] = await Promise.all([fetchColaboradoresRH(), fetchChartAccounts()]);
      if (cancelled) return;
      setColaboradores(colabs);
      setAccounts(accs);

      // Auto-detect contas padrão se ainda não configuradas (sem sobrescrever escolha do usuário)
      const cur = rhSettings.get();
      const patch: Partial<typeof cur> = {};
      if (!cur.folhaAccountId) {
        const found = accs.find((a) => a.tipo === "despesa" && isFolhaAccountName(a.nome));
        if (found) patch.folhaAccountId = found.id;
      }
      if (!cur.adiantamentoAccountId) {
        const found = accs.find((a) => a.tipo === "despesa" && isAdiantAccountName(a.nome));
        if (found) patch.adiantamentoAccountId = found.id;
      }
      if (Object.keys(patch).length > 0) rhSettings.patch(patch);

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload expenses when colaboradores or month change
  const reloadExpenses = useCallback(async () => {
    const ids = colaboradores.map((c) => c.id);
    const data = await fetchExpensesForColaboradores(ids, month);
    setExpenses(data);
  }, [colaboradores, month]);

  useEffect(() => {
    reloadExpenses();
  }, [reloadExpenses]);

  // Observer: Postgres changes on expenses / expense_payments
  useEffect(() => {
    if (colaboradores.length === 0) return;
    const colabSet = new Set(colaboradores.map((c) => c.id));

    const isRelevant = (row: any) =>
      !!row && row.favorecido_id && colabSet.has(row.favorecido_id);

    const channel = supabase
      .channel("rh-financial-listener")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => {
          if (isRelevant(payload.new) || isRelevant(payload.old)) reloadExpenses();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_payments" },
        () => reloadExpenses()
      )
      .subscribe((status) => setRealtimeActive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
      setRealtimeActive(false);
    };
  }, [colaboradores, reloadExpenses]);

  return {
    loading,
    colaboradores,
    accounts,
    expenses,
    realtimeActive,
    reload: reloadExpenses,
  };
}
