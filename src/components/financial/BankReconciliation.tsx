import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SummaryCard } from "@/components/SummaryCard";
import { toast } from "sonner";
import { parseOfx, type OfxTransaction } from "@/lib/ofxParser";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Link2, Plus, ArrowDownCircle, Loader2, CheckSquare, History, Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ManualCashFlowDialog } from "./ManualCashFlowDialog";
import { ExpenseFormDialog } from "./ExpenseFormDialog";

type MatchPrecision = "exato" | "proximo";

function daysDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000));
}

interface OfxItem extends OfxTransaction {
  id: string;
  dbItemId?: string;
  status: "pendente" | "conciliado" | "registrado";
  matchedMovId: string | null;
  matchedMovDesc: string | null;
  matchedMovDate: string | null;
  matchedMovOrigem: string | null;
  matchedMovValor: number | null;
  matchedMovPrecision: MatchPrecision | null;
  matchedPayableId: string | null;
  matchedPayableDesc: string | null;
  matchedPayableDue: string | null;
  matchedPayableValor: number | null;
  matchedPayablePrecision: MatchPrecision | null;
  matchedPayableExpenseId: string | null;
  matchedPayableIsInstallment: boolean;
  matchedPayableInstallmentId: string | null;
}

interface MatchCandidate {
  id: string;
  descricao: string | null;
  data_movimentacao: string;
  valor: number;
  origem: string;
  isPayable?: boolean;
  payableDueDate?: string;
  expenseId?: string;
  isInstallment?: boolean;
  installmentId?: string;
}

interface ReconciliationSummary {
  id: string;
  file_name: string;
  bank_name: string | null;
  created_at: string;
  total_items: number;
  reconciled_items: number;
}

export function BankReconciliation() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { matrizId } = useUnifiedCompany();
  const [items, setItems] = useState<OfxItem[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [reconciliationId, setReconciliationId] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [history, setHistory] = useState<ReconciliationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load chart of accounts
  useEffect(() => {
    if (matrizId) {
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("empresa_id", matrizId).eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
    }
  }, [matrizId]);

  // Load reconciliation history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("bank_reconciliations")
      .select("id, file_name, bank_name, created_at, total_items, reconciled_items")
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory((data as ReconciliationSummary[]) || []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Resume a saved reconciliation
  const resumeReconciliation = useCallback(async (rec: ReconciliationSummary) => {
    setLoading(true);
    try {
      const { data: dbItems } = await supabase
        .from("bank_reconciliation_items")
        .select("*")
        .eq("reconciliation_id", rec.id)
        .order("transaction_date");

      if (!dbItems || dbItems.length === 0) {
        toast.error("Nenhum item encontrado para esta conciliação");
        setLoading(false);
        return;
      }

      // Re-run matching for pending items
      const dates = dbItems.map((i) => i.transaction_date).sort();
      const d0 = new Date(dates[0] + "T00:00:00"); d0.setDate(d0.getDate() - 5);
      const d1 = new Date(dates[dates.length - 1] + "T00:00:00"); d1.setDate(d1.getDate() + 5);
      const minDate = d0.toISOString().slice(0, 10);
      const maxDate = d1.toISOString().slice(0, 10);

      const [{ data: existingMovs }, { data: pendingExpenses }, { data: pendingInstallments }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem")
          .gte("data_movimentacao", minDate)
          .lte("data_movimentacao", maxDate),
        supabase
          .from("expenses")
          .select("id, valor_total, valor_pago, descricao, data_vencimento, data_emissao, status")
          .in("status", ["pendente", "atrasado"])
          .is("deleted_at", null),
        supabase
          .from("expense_installments")
          .select("id, expense_id, valor, data_vencimento, status, numero_parcela")
          .eq("status", "pendente"),
      ]);

      const movs = existingMovs || [];
      // Build unified payables list: installments first, then expenses without installments
      const instRows = (pendingInstallments || []) as any[];
      const expRows = (pendingExpenses || []) as any[];
      const expWithInst = new Set(instRows.map((i: any) => i.expense_id));
      const payables: { id: string; expenseId: string; amount: number; description: string; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows) {
        const exp = expRows.find((e: any) => e.id === inst.expense_id);
        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
          referenceDate: inst.data_vencimento || null,
          isInstallment: true,
          installmentId: inst.id,
          numeroParcela: inst.numero_parcela,
        });
      }
      for (const exp of expRows) {
        if (expWithInst.has(exp.id)) continue;
        const saldo = Number(exp.valor_total) - Number(exp.valor_pago || 0);
        payables.push({
          id: `exp_${exp.id}`,
          expenseId: exp.id,
          amount: saldo,
          description: exp.descricao,
          referenceDate: exp.data_vencimento || exp.data_emissao || null,
          isInstallment: false,
        });
      }

      const usedMovIds = new Set<string>();
      const usedPayableIds = new Set<string>();

      const ofxItems: OfxItem[] = dbItems.map((dbItem) => {
        const absVal = Math.abs(Number(dbItem.amount));
        const tipo = dbItem.tipo as "entrada" | "saida";
        const status = dbItem.status as "pendente" | "conciliado" | "registrado";

        let matchedMovId: string | null = dbItem.matched_movimentacao_id || null;
        let matchedMovDesc: string | null = null;
        let matchedMovDate: string | null = null;
        let matchedMovOrigem: string | null = null;
        let matchedMovValor: number | null = null;
        let matchedMovPrecision: MatchPrecision | null = null;
        let matchedPayableId: string | null = null;
        let matchedPayableDesc: string | null = null;
        let matchedPayableDue: string | null = null;
        let matchedPayableValor: number | null = null;
        let matchedPayableExpenseId: string | null = null;
        let matchedPayableIsInstallment = false;
        let matchedPayableInstallmentId: string | null = null;
        let matchedPayablePrecision: MatchPrecision | null = null;
        const txDate = dbItem.transaction_date;

        if (status === "pendente") {
          // Buscar no fluxo de caixa (entrada e saída) — valor idêntico + data idêntica ou próxima (±5 dias)
          const candidates = movs.filter(
            (m) =>
              !usedMovIds.has(m.id) &&
              Math.abs(Number(m.valor) - absVal) < 0.01 &&
              daysDiff(txDate, m.data_movimentacao) <= 5 &&
              ((tipo === "saida" && m.origem !== "contas_receber") ||
               (tipo === "entrada" && m.origem !== "pagamento_despesa" && m.origem !== "despesas" && m.origem !== "contas_pagar"))
          );
          // Prefer exact date, then closest
          const exact = candidates.find((m) => m.data_movimentacao === txDate);
          const match = exact || candidates.sort((a, b) => daysDiff(txDate, a.data_movimentacao) - daysDiff(txDate, b.data_movimentacao))[0];
          if (match) {
            usedMovIds.add(match.id);
            matchedMovId = match.id;
            matchedMovDesc = match.descricao;
            matchedMovDate = match.data_movimentacao;
            matchedMovOrigem = match.origem;
            matchedMovValor = Math.abs(Number(match.valor));
            matchedMovPrecision = match.data_movimentacao === txDate ? "exato" : "proximo";
          }

          // Saída: buscar também em contas a pagar pendentes — valor idêntico + data referência idêntica ou próxima
          if (tipo === "saida") {
            // First try with date constraint
            let pCandidates = payables.filter(
              (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01 && p.referenceDate && daysDiff(txDate, p.referenceDate) <= 5
            );
            // If no date match, try value-only match
            if (pCandidates.length === 0) {
              pCandidates = payables.filter(
                (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01
              );
            }
            const pExact = pCandidates.find((p) => p.referenceDate === txDate);
            const pm = pExact || (pCandidates.length > 0 ? (pCandidates[0].referenceDate ? pCandidates.sort((a, b) => daysDiff(txDate, a.referenceDate || "9999-12-31") - daysDiff(txDate, b.referenceDate || "9999-12-31"))[0] : pCandidates[0]) : undefined);
            if (pm) {
              usedPayableIds.add(pm.id);
              matchedPayableId = pm.id;
              matchedPayableDesc = pm.description;
              matchedPayableDue = pm.referenceDate;
              matchedPayableValor = pm.amount;
              matchedPayableExpenseId = pm.expenseId;
              matchedPayableIsInstallment = pm.isInstallment;
              matchedPayableInstallmentId = pm.installmentId || null;
              matchedPayablePrecision = pm.referenceDate && pm.referenceDate === txDate ? "exato" : "proximo";
            }
          }
        } else if (matchedMovId) {
          const mov = movs.find((m) => m.id === matchedMovId);
          if (mov) {
            matchedMovDesc = mov.descricao;
            matchedMovDate = mov.data_movimentacao;
            matchedMovOrigem = mov.origem;
            matchedMovValor = Math.abs(Number(mov.valor));
            matchedMovPrecision = mov.data_movimentacao === txDate ? "exato" : "proximo";
          }
        }

        return {
          fitid: dbItem.fitid || "",
          date: txDate,
          amount: tipo === "saida" ? -absVal : absVal,
          description: dbItem.description || "",
          tipo,
          id: crypto.randomUUID(),
          dbItemId: dbItem.id,
          status,
          matchedMovId,
          matchedMovDesc,
          matchedMovDate,
          matchedMovOrigem,
          matchedMovValor,
          matchedMovPrecision,
          matchedPayableId,
          matchedPayableDesc,
          matchedPayableDue,
          matchedPayableValor,
          matchedPayablePrecision,
          matchedPayableExpenseId,
          matchedPayableIsInstallment,
          matchedPayableInstallmentId,
        };
      });

      setReconciliationId(rec.id);
      setItems(ofxItems);
      setFileName(rec.file_name);
    } catch (err: any) {
      toast.error("Erro ao carregar conciliação: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete a reconciliation
  const deleteReconciliation = useCallback(async (id: string) => {
    await supabase.from("bank_reconciliation_items").delete().eq("reconciliation_id", id);
    await supabase.from("bank_reconciliations").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (reconciliationId === id) {
      setItems([]);
      setReconciliationId(null);
      setFileName("");
    }
    toast.success("Conciliação removida");
  }, [reconciliationId]);

  // Confirm match dialog
  const [confirmItem, setConfirmItem] = useState<OfxItem | null>(null);
  const [confirmMatch, setConfirmMatch] = useState<MatchCandidate | null>(null);

  // Manual registration dialogs
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [manualMovDialogOpen, setManualMovDialogOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<OfxItem | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectableItems = useMemo(() =>
    items.filter((i) => i.status === "pendente" && (i.matchedMovId || i.matchedPayableId)),
    [items]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === selectableItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableItems.map((i) => i.id)));
    }
  }, [selectedIds.size, selectableItems]);

  const updateReconciliationCount = useCallback(async () => {
    if (!reconciliationId) return;
    const conciliados = items.filter((i) => i.status === "conciliado" || i.status === "registrado").length;
    await supabase
      .from("bank_reconciliations")
      .update({ reconciled_items: conciliados })
      .eq("id", reconciliationId);
  }, [reconciliationId, items]);

  const handleBatchConciliate = useCallback(async () => {
    if (selectedIds.size === 0 || !reconciliationId) return;
    setLoading(true);
    try {
      const selected = items.filter((i) => selectedIds.has(i.id));
      for (const item of selected) {
        if (item.matchedPayableId && !item.matchedMovId) {
          await supabase
            .from("accounts_payable")
            .update({ status: "pago", paid_amount: item.matchedPayableValor || Math.abs(item.amount), paid_at: `${item.date}T12:00:00` })
            .eq("id", item.matchedPayableId);
        }
        const updateFilter = item.dbItemId
          ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: item.matchedMovId || null }).eq("id", item.dbItemId)
          : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: item.matchedMovId || null }).eq("reconciliation_id", reconciliationId).eq("fitid", item.fitid || "").eq("status", "pendente");
        await updateFilter;
      }
      setItems((prev) =>
        prev.map((i) => selectedIds.has(i.id) ? { ...i, status: "conciliado" } : i)
      );
      toast.success(`${selectedIds.size} transação(ões) conciliada(s)`);
      setSelectedIds(new Set());
      setTimeout(updateReconciliationCount, 500);
    } catch (err: any) {
      toast.error("Erro na conciliação em lote: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, [selectedIds, items, reconciliationId, updateReconciliationCount]);

  const totals = useMemo(() => {
    const total = items.length;
    const conciliados = items.filter((i) => i.status === "conciliado").length;
    const registrados = items.filter((i) => i.status === "registrado").length;
    const pendentes = items.filter((i) => i.status === "pendente").length;
    return { total, conciliados, registrados, pendentes };
  }, [items]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      const text = await file.text();
      const parsed = parseOfx(text);

      if (parsed.transactions.length === 0) {
        toast.error("Nenhuma transação encontrada no arquivo OFX");
        setLoading(false);
        return;
      }

      // Save reconciliation header
      const { data: rec, error: recErr } = await supabase
        .from("bank_reconciliations")
        .insert({
          file_name: file.name,
          bank_name: parsed.bankName,
          account_id: parsed.accountId,
          total_items: parsed.transactions.length,
          created_by: user?.id || "",
        })
        .select("id")
        .single();

      if (recErr) throw recErr;

      // Fetch existing movimentações for matching
      const dates = parsed.transactions.map((t) => t.date).sort();
      const d0 = new Date(dates[0] + "T00:00:00"); d0.setDate(d0.getDate() - 5);
      const d1 = new Date(dates[dates.length - 1] + "T00:00:00"); d1.setDate(d1.getDate() + 5);
      const minDate = d0.toISOString().slice(0, 10);
      const maxDate = d1.toISOString().slice(0, 10);

      const [{ data: existingMovs }, { data: pendingExpenses2 }, { data: pendingInstallments2 }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem")
          .gte("data_movimentacao", minDate)
          .lte("data_movimentacao", maxDate),
        supabase
          .from("expenses")
          .select("id, valor_total, valor_pago, descricao, data_vencimento, data_emissao, status")
          .in("status", ["pendente", "atrasado"])
          .is("deleted_at", null),
        supabase
          .from("expense_installments")
          .select("id, expense_id, valor, data_vencimento, status, numero_parcela")
          .eq("status", "pendente"),
      ]);

      const movs = (existingMovs || []) as MatchCandidate[];
      const instRows2 = (pendingInstallments2 || []) as any[];
      const expRows2 = (pendingExpenses2 || []) as any[];
      const expWithInst2 = new Set(instRows2.map((i: any) => i.expense_id));
      const payables: { id: string; expenseId: string; amount: number; description: string; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows2) {
        const exp = expRows2.find((e: any) => e.id === inst.expense_id);
        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
          referenceDate: inst.data_vencimento || null,
          isInstallment: true,
          installmentId: inst.id,
          numeroParcela: inst.numero_parcela,
        });
      }
      for (const exp of expRows2) {
        if (expWithInst2.has(exp.id)) continue;
        const saldo = Number(exp.valor_total) - Number(exp.valor_pago || 0);
        payables.push({
          id: `exp_${exp.id}`,
          expenseId: exp.id,
          amount: saldo,
          description: exp.descricao,
          referenceDate: exp.data_vencimento || exp.data_emissao || null,
          isInstallment: false,
        });
      }

      const usedMovIds = new Set<string>();
      const usedPayableIds = new Set<string>();
      const ofxItems: OfxItem[] = parsed.transactions.map((tx) => {
        const absVal = Math.abs(tx.amount);
        const txDate = tx.date;
        let matchedMov: typeof movs[0] | undefined;
        let matchedMovPrecision: MatchPrecision | null = null;
        let payableMatch: typeof payables[0] | null = null;
        let matchedPayablePrecision: MatchPrecision | null = null;

        if (tx.tipo === "saida") {
          // Débito: buscar no fluxo de caixa — valor idêntico + data ±5 dias
          const candidates = movs.filter(
            (m) => !usedMovIds.has(m.id) && Math.abs(Number(m.valor) - absVal) < 0.01 && daysDiff(txDate, m.data_movimentacao) <= 5 && m.origem !== "contas_receber"
          );
          const exact = candidates.find((m) => m.data_movimentacao === txDate);
          matchedMov = exact || candidates.sort((a, b) => daysDiff(txDate, a.data_movimentacao) - daysDiff(txDate, b.data_movimentacao))[0];
          if (matchedMov) {
            usedMovIds.add(matchedMov.id);
            matchedMovPrecision = matchedMov.data_movimentacao === txDate ? "exato" : "proximo";
          }

          // E também em contas a pagar pendentes — valor idêntico + data referência ±5 dias ou só valor
          let pCandidates = payables.filter(
            (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01 && p.referenceDate && daysDiff(txDate, p.referenceDate) <= 5
          );
          if (pCandidates.length === 0) {
            pCandidates = payables.filter(
              (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01
            );
          }
          const pExact = pCandidates.find((p) => p.referenceDate === txDate);
          const pm = pExact || (pCandidates.length > 0 ? (pCandidates[0].referenceDate ? pCandidates.sort((a, b) => daysDiff(txDate, a.referenceDate || "9999-12-31") - daysDiff(txDate, b.referenceDate || "9999-12-31"))[0] : pCandidates[0]) : undefined);
          if (pm) {
            payableMatch = pm;
            usedPayableIds.add(pm.id);
            matchedPayablePrecision = pm.referenceDate && pm.referenceDate === txDate ? "exato" : "proximo";
          }
        } else {
          // Crédito: buscar no fluxo de caixa
          const candidates = movs.filter(
            (m) => !usedMovIds.has(m.id) && Math.abs(Number(m.valor) - absVal) < 0.01 && daysDiff(txDate, m.data_movimentacao) <= 5 && m.origem !== "pagamento_despesa" && m.origem !== "despesas" && m.origem !== "contas_pagar"
          );
          const exact = candidates.find((m) => m.data_movimentacao === txDate);
          matchedMov = exact || candidates.sort((a, b) => daysDiff(txDate, a.data_movimentacao) - daysDiff(txDate, b.data_movimentacao))[0];
          if (matchedMov) {
            usedMovIds.add(matchedMov.id);
            matchedMovPrecision = matchedMov.data_movimentacao === txDate ? "exato" : "proximo";
          }
        }

        return {
          ...tx,
          id: crypto.randomUUID(),
          status: "pendente" as const,
          matchedMovId: matchedMov?.id || null,
          matchedMovDesc: matchedMov?.descricao || null,
          matchedMovDate: matchedMov?.data_movimentacao || null,
          matchedMovOrigem: matchedMov?.origem || null,
          matchedMovValor: matchedMov ? Math.abs(Number(matchedMov.valor)) : null,
          matchedMovPrecision,
          matchedPayableId: payableMatch?.id || null,
          matchedPayableDesc: payableMatch?.description || null,
          matchedPayableDue: payableMatch?.referenceDate || null,
          matchedPayableValor: payableMatch ? payableMatch.amount : null,
          matchedPayablePrecision,
          matchedPayableExpenseId: payableMatch?.expenseId || null,
          matchedPayableIsInstallment: payableMatch?.isInstallment || false,
          matchedPayableInstallmentId: payableMatch?.installmentId || null,
        };
      });

      // Save items to DB
      const { data: insertedItems } = await supabase.from("bank_reconciliation_items").insert(
        ofxItems.map((item) => ({
          reconciliation_id: rec.id,
          transaction_date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          tipo: item.tipo,
          fitid: item.fitid || null,
          status: "pendente",
          matched_movimentacao_id: null,
        }))
      ).select("id");

      // Assign DB ids to items
      if (insertedItems) {
        ofxItems.forEach((item, i) => {
          if (insertedItems[i]) item.dbItemId = insertedItems[i].id;
        });
      }

      setReconciliationId(rec.id);
      setItems(ofxItems);
      setFileName(file.name);
      loadHistory();
      toast.success(`${ofxItems.length} transações importadas`);
    } catch (err: any) {
      toast.error("Erro ao importar OFX: " + (err.message || ""));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }, [user, loadHistory]);

  const handleConfirmMatch = useCallback(async () => {
    if (!confirmItem || !confirmMatch || !reconciliationId) return;

    try {
      if (confirmMatch.isPayable && confirmMatch.expenseId) {
        const dataPagISO = confirmItem.date;
        const valorPag = confirmMatch.valor;

        // Insert expense_payment record
        await supabase.from("expense_payments" as any).insert({
          expense_id: confirmMatch.expenseId,
          valor: valorPag,
          forma_pagamento: "transferencia",
          data_pagamento: dataPagISO,
          observacoes: "Pagamento via conciliação bancária (OFX)",
          created_by: user?.id,
          juros: 0,
        } as any);

        if (confirmMatch.isInstallment && confirmMatch.installmentId) {
          // Update installment status
          await supabase.from("expense_installments").update({ status: "pago" } as any).eq("id", confirmMatch.installmentId);

          // Recalculate expense totals
          const { data: allInst } = await supabase.from("expense_installments").select("valor, status").eq("expense_id", confirmMatch.expenseId);
          const totalPagoNow = ((allInst as any) || []).filter((i: any) => i.status === "pago").reduce((s: number, i: any) => s + Number(i.valor), 0);
          const allPaid = ((allInst as any) || []).every((i: any) => i.status === "pago");

          await supabase.from("expenses").update({
            valor_pago: totalPagoNow,
            status: allPaid ? "pago" : "parcial",
            forma_pagamento: "transferencia",
            data_pagamento: dataPagISO,
          } as any).eq("id", confirmMatch.expenseId);
        } else {
          // Regular expense: update directly
          const { data: expData } = await supabase.from("expenses").select("valor_total, valor_pago").eq("id", confirmMatch.expenseId).single();
          const novoValorPago = Number(expData?.valor_pago || 0) + valorPag;
          const valorTotal = Number(expData?.valor_total || 0);
          const novoStatus = novoValorPago >= valorTotal ? "pago" : "parcial";

          await supabase.from("expenses").update({
            valor_pago: novoValorPago,
            status: novoStatus,
            forma_pagamento: "transferencia",
            data_pagamento: dataPagISO,
          } as any).eq("id", confirmMatch.expenseId);
        }
      }

      const updateFilter = confirmItem.dbItemId
        ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: confirmMatch.isPayable ? null : confirmMatch.id }).eq("id", confirmItem.dbItemId)
        : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: confirmMatch.isPayable ? null : confirmMatch.id }).eq("reconciliation_id", reconciliationId).eq("fitid", confirmItem.fitid || "").eq("status", "pendente");
      await updateFilter;

      setItems((prev) =>
        prev.map((i) =>
          i.id === confirmItem.id ? { ...i, status: "conciliado" } : i
        )
      );
      toast.success(confirmMatch.isPayable ? "Conta paga e conciliada com sucesso" : "Transação conciliada com sucesso");
      setTimeout(updateReconciliationCount, 500);
    } catch (err: any) {
      toast.error("Erro ao conciliar: " + (err.message || ""));
    }
    setConfirmItem(null);
    setConfirmMatch(null);
  }, [confirmItem, confirmMatch, reconciliationId, updateReconciliationCount, user]);

  const openConfirm = useCallback((item: OfxItem) => {
    if (item.matchedMovId) {
      setConfirmItem(item);
      setConfirmMatch({
        id: item.matchedMovId,
        descricao: item.matchedMovDesc,
        data_movimentacao: item.matchedMovDate || item.date,
        valor: Math.abs(item.amount),
        origem: item.matchedMovOrigem || "",
      });
    } else if (item.matchedPayableId) {
      setConfirmItem(item);
      setConfirmMatch({
        id: item.matchedPayableId,
        descricao: item.matchedPayableDesc,
        data_movimentacao: item.matchedPayableDue || item.date,
        valor: item.matchedPayableValor || Math.abs(item.amount),
        origem: "contas_pagar_pendente",
        isPayable: true,
        payableDueDate: item.matchedPayableDue || undefined,
        expenseId: item.matchedPayableExpenseId || undefined,
        isInstallment: item.matchedPayableIsInstallment,
        installmentId: item.matchedPayableInstallmentId || undefined,
      });
    }
  }, []);

  const openConfirmPayable = useCallback((item: OfxItem) => {
    if (item.matchedPayableId) {
      setConfirmItem(item);
      setConfirmMatch({
        id: item.matchedPayableId,
        descricao: item.matchedPayableDesc,
        data_movimentacao: item.matchedPayableDue || item.date,
        valor: item.matchedPayableValor || Math.abs(item.amount),
        origem: "contas_pagar_pendente",
        isPayable: true,
        payableDueDate: item.matchedPayableDue || undefined,
        expenseId: item.matchedPayableExpenseId || undefined,
        isInstallment: item.matchedPayableIsInstallment,
        installmentId: item.matchedPayableInstallmentId || undefined,
      });
    }
  }, []);

  const handleNewExpense = (item: OfxItem) => {
    setActiveItem(item);
    setExpenseDialogOpen(true);
  };

  const handleNewMovement = (item: OfxItem) => {
    setActiveItem(item);
    setManualMovDialogOpen(true);
  };

  const markAsRegistered = useCallback(
    (itemId: string) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== itemId) return i;
          // Update in DB
          if (i.dbItemId) {
            supabase.from("bank_reconciliation_items").update({ status: "registrado" }).eq("id", i.dbItemId).then();
          } else if (reconciliationId) {
            supabase.from("bank_reconciliation_items").update({ status: "registrado" }).eq("reconciliation_id", reconciliationId).eq("fitid", i.fitid || "").eq("status", "pendente").then();
          }
          return { ...i, status: "registrado" as const };
        })
      );
      setTimeout(updateReconciliationCount, 500);
    },
    [reconciliationId, updateReconciliationCount]
  );

  const onExpenseSaved = () => {
    if (activeItem) markAsRegistered(activeItem.id);
    setExpenseDialogOpen(false);
    setActiveItem(null);
    toast.success("Despesa registrada e transação marcada");
  };

  const onMovementSaved = () => {
    if (activeItem) markAsRegistered(activeItem.id);
    setManualMovDialogOpen(false);
    setActiveItem(null);
    toast.success("Movimentação registrada e transação marcada");
  };

  const goBack = () => {
    setItems([]);
    setReconciliationId(null);
    setFileName("");
    setSelectedIds(new Set());
    loadHistory();
  };

  // Empty state: show history + upload
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">Conciliação Bancária</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">Importar Extrato OFX</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Selecione um arquivo OFX do seu banco para comparar com as movimentações já registradas no sistema
              </p>
            </div>
            <label>
              <input
                type="file"
                accept=".ofx,.qfx"
                className="hidden"
                onChange={handleFileUpload}
                disabled={loading}
              />
              <Button asChild variant="default" size="sm" disabled={loading} className="gap-2 cursor-pointer">
                <span>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {loading ? "Importando..." : "Selecionar Arquivo OFX"}
                </span>
              </Button>
            </label>
          </CardContent>
        </Card>

        {/* History */}
        {!loadingHistory && history.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Importações Anteriores
              </p>
              <div className="divide-y divide-border">
                {history.map((rec) => {
                  const pending = rec.total_items - rec.reconciled_items;
                  return (
                    <div key={rec.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{rec.file_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDateBR(rec.created_at.slice(0, 10))} · {rec.bank_name || "Banco"} · {rec.total_items} transações
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {pending > 0 ? (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">{pending} pendente(s)</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Completa</Badge>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => resumeReconciliation(rec)} disabled={loading}>
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSpreadsheet className="h-3 w-3" />}
                          {pending > 0 ? "Continuar" : "Visualizar"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => deleteReconciliation(rec.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
        {loadingHistory && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Conciliação Bancária</h1>
          <p className="text-xs text-muted-foreground">{fileName}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={goBack}>
            <History className="h-3.5 w-3.5" /> Histórico
          </Button>
          <label>
            <input
              type="file"
              accept=".ofx,.qfx"
              className="hidden"
              onChange={handleFileUpload}
              disabled={loading}
            />
            <Button asChild variant="outline" size="sm" disabled={loading} className="gap-1 cursor-pointer">
              <span>
                <Upload className="h-3.5 w-3.5" /> Novo Extrato
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard icon={FileSpreadsheet} label="Total" value={totals.total} />
        <SummaryCard icon={CheckCircle2} label="Conciliados" value={totals.conciliados} valueColor="green" />
        <SummaryCard icon={Plus} label="Registrados" value={totals.registrados} valueColor="primary" />
        <SummaryCard icon={AlertCircle} label="Pendentes" value={totals.pendentes} valueColor={totals.pendentes > 0 ? "red" : "green"} />
      </div>

      {/* Batch action bar */}
      {selectableItems.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Checkbox
            checked={selectedIds.size === selectableItems.length && selectableItems.length > 0}
            onCheckedChange={toggleSelectAll}
            className="h-4 w-4"
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Selecionar todas com correspondência"}
          </span>
          {selectedIds.size > 0 && (
            <Button size="sm" variant="default" className="h-7 text-xs gap-1 ml-auto" onClick={handleBatchConciliate} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckSquare className="h-3 w-3" />}
              Conciliar {selectedIds.size} em lote
            </Button>
          )}
        </div>
      )}

      {/* Items */}
      <Card>
        <CardContent className="p-0">
          <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider">
            Transações do Extrato ({items.length})
          </p>

          {isMobile ? (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {item.status === "pendente" && (item.matchedMovId || item.matchedPayableId) && (
                      <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="h-4 w-4 shrink-0" />
                    )}
                    <Badge
                      variant={item.tipo === "entrada" ? "default" : "destructive"}
                      className={cn("text-[10px] shrink-0", item.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
                    >
                      {item.tipo === "entrada" ? "Crédito" : "Débito"}
                    </Badge>
                    <span className={cn("text-sm font-mono font-bold", item.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                      {formatCurrency(Math.abs(item.amount))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDateBR(item.date)}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="text-xs text-foreground truncate">{item.description}</p>
                  {item.matchedMovId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedMovDesc}
                      date={item.matchedMovDate}
                      valor={item.matchedMovValor}
                      origem={translateOrigem(item.matchedMovOrigem)}
                      precision={item.matchedMovPrecision}
                    />
                  )}
                  {item.matchedPayableId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedPayableDesc}
                      date={item.matchedPayableDue}
                      valor={item.matchedPayableValor}
                      origem="Conta a Pagar (pendente)"
                      variant="blue"
                      label="Conta a Pagar encontrada"
                      precision={item.matchedPayablePrecision}
                    />
                  )}
                  <ItemActions
                    item={item}
                    onConfirmMatch={() => openConfirm(item)}
                    onConfirmPayable={() => openConfirmPayable(item)}
                    onNewExpense={() => handleNewExpense(item)}
                    onNewMovement={() => handleNewMovement(item)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="px-4 py-2.5 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.status === "pendente" && (item.matchedMovId || item.matchedPayableId) && (
                      <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} className="h-4 w-4 shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateBR(item.date)}</span>
                    <Badge
                      variant={item.tipo === "entrada" ? "default" : "destructive"}
                      className={cn("text-[10px] h-5", item.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
                    >
                      {item.tipo === "entrada" ? "Crédito" : "Débito"}
                    </Badge>
                    <span className={cn("text-xs font-mono font-bold", item.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                      {formatCurrency(Math.abs(item.amount))}
                    </span>
                    <StatusBadge status={item.status} />
                    <div className="ml-auto">
                      <ItemActions
                        item={item}
                        onConfirmMatch={() => openConfirm(item)}
                        onConfirmPayable={() => openConfirmPayable(item)}
                        onNewExpense={() => handleNewExpense(item)}
                        onNewMovement={() => handleNewMovement(item)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-foreground">{item.description}</p>
                  {item.matchedMovId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedMovDesc}
                      date={item.matchedMovDate}
                      valor={item.matchedMovValor}
                      origem={translateOrigem(item.matchedMovOrigem)}
                      precision={item.matchedMovPrecision}
                    />
                  )}
                  {item.matchedPayableId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedPayableDesc}
                      date={item.matchedPayableDue}
                      valor={item.matchedPayableValor}
                      origem="Conta a Pagar (pendente)"
                      variant="blue"
                      label="Conta a Pagar encontrada"
                      precision={item.matchedPayablePrecision}
                    />
                  )}
                  {item.status === "conciliado" && (
                    <span className="text-green-600 text-[11px]">✓ Conciliado</span>
                  )}
                  {item.status === "registrado" && (
                    <span className="text-blue-600 text-[11px]">✓ Registrado</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm match dialog */}
      <AlertDialog open={!!confirmItem} onOpenChange={(o) => { if (!o) { setConfirmItem(null); setConfirmMatch(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Conciliação</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{confirmMatch?.isPayable
                ? "O sistema encontrou uma conta a pagar pendente com o mesmo valor. Ao confirmar, a conta será quitada com a data do extrato."
                : "O sistema encontrou uma movimentação com o mesmo valor:"}</p>
              <div className="bg-muted rounded-md p-3 space-y-2 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Extrato Bancário</p>
                  <p>{confirmItem?.description}</p>
                  <p className="text-xs text-muted-foreground">{confirmItem && formatDateBR(confirmItem.date)} · {confirmItem && formatCurrency(Math.abs(confirmItem.amount))}</p>
                </div>
                <div className="border-t pt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    {confirmMatch?.isPayable ? "Conta a Pagar Pendente" : "Movimentação no Sistema"}
                  </p>
                  <p>{confirmMatch?.descricao || "Sem descrição"}</p>
                  <p className="text-xs text-muted-foreground">
                    {confirmMatch?.isPayable ? "Venc: " : ""}{confirmMatch && formatDateBR(confirmMatch.data_movimentacao)} · {confirmMatch && formatCurrency(confirmMatch.valor)}
                    {!confirmMatch?.isPayable && <> · {translateOrigem(confirmMatch?.origem || null)}</>}
                  </p>
                </div>
              </div>
              <p>{confirmMatch?.isPayable
                ? "Deseja confirmar o pagamento e conciliar esta transação?"
                : "Deseja confirmar que se trata da mesma transação?"}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMatch}>Confirmar Conciliação</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual movement dialog */}
      <ManualCashFlowDialog
        open={manualMovDialogOpen}
        onOpenChange={(o) => { setManualMovDialogOpen(o); if (!o) setActiveItem(null); }}
        onSaved={onMovementSaved}
      />

      {/* Expense dialog */}
      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={(o) => { setExpenseDialogOpen(o); if (!o) setActiveItem(null); }}
        onSaved={onExpenseSaved}
        expense={null}
        empresaId={matrizId}
        chartAccounts={chartAccounts}
      />
    </div>
  );
}

function translateOrigem(origem: string | null): string {
  const map: Record<string, string> = {
    pagamento_despesa: "Pagamento de Despesa",
    despesas: "Despesa",
    contas_pagar: "Contas a Pagar",
    contas_pagar_pendente: "Conta a Pagar (pendente)",
    contas_receber: "Contas a Receber",
    manual: "Lançamento Manual",
    colheita: "Colheita",
    abastecimento: "Abastecimento",
    faturamento: "Faturamento",
  };
  return map[origem || ""] || origem || "Outro";
}

function MatchBox({ desc, date, valor, origem, variant = "amber", label = "Correspondência encontrada", precision }: {
  desc: string | null; date: string | null; valor: number | null; origem: string;
  variant?: "amber" | "blue"; label?: string; precision?: MatchPrecision | null;
}) {
  const isProximo = precision === "proximo";
  const colors = variant === "blue"
    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600"
    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600";
  const finalLabel = isProximo ? `${label} (data próxima)` : label;
  return (
    <div className={cn("border rounded px-2 py-1.5 space-y-0.5", colors.split(" ").slice(0, 4).join(" "), isProximo && "border-dashed")}>
      <span className={cn("flex items-center gap-1 font-medium text-[11px]", colors.split(" ").slice(4).join(" "))}>
        <Link2 className="h-3 w-3 shrink-0" /> {finalLabel}
      </span>
      <div className="text-[10px] text-muted-foreground pl-4 space-y-0.5">
        <p><span className="font-medium">Desc:</span> {desc || "Sem descrição"}</p>
        <p><span className="font-medium">{variant === "blue" ? "Venc:" : "Data:"}</span> {formatDateBR(date || "")} · <span className="font-medium">Valor:</span> {valor != null ? formatCurrency(valor) : "—"} · <span className="font-medium">Origem:</span> {origem}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "conciliado")
    return <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Conciliado</Badge>;
  if (status === "registrado")
    return <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-600">Registrado</Badge>;
  return <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">Pendente</Badge>;
}

function ItemActions({
  item,
  onConfirmMatch,
  onConfirmPayable,
  onNewExpense,
  onNewMovement,
}: {
  item: OfxItem;
  onConfirmMatch: () => void;
  onConfirmPayable?: () => void;
  onNewExpense: () => void;
  onNewMovement: () => void;
}) {
  if (item.status !== "pendente") return null;

  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {item.matchedMovId && (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onConfirmMatch}>
          <CheckCircle2 className="h-3 w-3" /> Conciliar
        </Button>
      )}
      {item.matchedPayableId && (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-blue-300 text-blue-600 hover:bg-blue-50" onClick={onConfirmPayable || onConfirmMatch}>
          <CheckCircle2 className="h-3 w-3" /> Pagar e Conciliar
        </Button>
      )}
      {!item.matchedMovId && !item.matchedPayableId && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onNewExpense}>
            <Plus className="h-3 w-3" /> Despesa
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={onNewMovement}>
            <ArrowDownCircle className="h-3 w-3" /> Movimentação
          </Button>
        </>
      )}
    </div>
  );
}
