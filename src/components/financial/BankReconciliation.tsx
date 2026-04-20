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
import { formatCurrency, maskCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Link2, Plus, ArrowDownCircle, Loader2, CheckSquare, History, Trash2, Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
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
  status: "pendente" | "conciliado";
  matchedMovId: string | null;
  matchedMovDesc: string | null;
  matchedMovDate: string | null;
  matchedMovOrigem: string | null;
  matchedMovValor: number | null;
  matchedMovPrecision: MatchPrecision | null;
  matchedPayableId: string | null;
  matchedPayableDesc: string | null;
  matchedPayableFornecedor: string | null;
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
  tipo?: "entrada" | "saida";
  isPayable?: boolean;
  payableDueDate?: string;
  expenseId?: string;
  isInstallment?: boolean;
  installmentId?: string;
  fornecedor?: string | null;
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
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "conciliado">("todos");
  const [tipoFilter, setTipoFilter] = useState<"todos" | "debito" | "credito">("todos");

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

      const [{ data: existingMovs }, { data: pendingExpenses }, { data: pendingInstallments }, { data: alreadyMatched }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem")
          .gte("data_movimentacao", minDate)
          .lte("data_movimentacao", maxDate),
        supabase
          .from("expenses")
          .select("id, valor_total, valor_pago, descricao, favorecido_nome, data_vencimento, data_emissao, status")
          .in("status", ["pendente", "atrasado"])
          .is("deleted_at", null),
        supabase
          .from("expense_installments")
          .select("id, expense_id, valor, data_vencimento, status, numero_parcela")
          .eq("status", "pendente"),
        // Movimentações já vinculadas a outras conciliações (não devem ser candidatas)
        supabase
          .from("bank_reconciliation_items")
          .select("matched_movimentacao_id, reconciliation_id")
          .not("matched_movimentacao_id", "is", null),
      ]);

      const alreadyMatchedIds = new Set(
        (alreadyMatched || [])
          .filter((r: any) => r.reconciliation_id !== rec.id)
          .map((r: any) => r.matched_movimentacao_id)
          .filter(Boolean)
      );
      const movs = (existingMovs || []).filter((m: any) => !alreadyMatchedIds.has(m.id));
      // Build unified payables list: installments first, then expenses without installments
      const instRows = (pendingInstallments || []) as any[];
      const expRows = (pendingExpenses || []) as any[];
      const expWithInst = new Set(instRows.map((i: any) => i.expense_id));
      const payables: { id: string; expenseId: string; amount: number; description: string; fornecedor: string | null; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows) {
        const exp = expRows.find((e: any) => e.id === inst.expense_id);
        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
          fornecedor: exp?.favorecido_nome || null,
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
          fornecedor: exp.favorecido_nome || null,
          referenceDate: exp.data_vencimento || exp.data_emissao || null,
          isInstallment: false,
        });
      }

      // ── Two-pass optimal matching ──
      // 1) Build raw items with basic info
      const rawItems = dbItems.map((dbItem) => ({
        dbItem,
        absVal: Math.abs(Number(dbItem.amount)),
        tipo: dbItem.tipo as "entrada" | "saida",
        status: (dbItem.status === "registrado" ? "conciliado" : dbItem.status) as "pendente" | "conciliado",
        txDate: dbItem.transaction_date,
      }));

      // 2) For pending items, find ALL candidate matches and assign optimally (closest date wins)
      const usedMovIds = new Set<string>();
      const usedPayableIds = new Set<string>();

      // Helper: build pairs [itemIndex, candidateId, daysDiff] then greedily assign closest first
      type Pair = { idx: number; candId: string; dist: number };

      // ── Assign cash flow matches ──
      const movPairs: Pair[] = [];
      rawItems.forEach((raw, idx) => {
        if (raw.status !== "pendente") return;
        const candidates = movs.filter(
          (m) =>
            m.tipo === raw.tipo &&
            Math.abs(Number(m.valor) - raw.absVal) < 0.01 &&
            daysDiff(raw.txDate, m.data_movimentacao) <= 5
        );
        for (const c of candidates) {
          movPairs.push({ idx, candId: c.id, dist: daysDiff(raw.txDate, c.data_movimentacao) });
        }
      });
      movPairs.sort((a, b) => a.dist - b.dist);

      const assignedMovByIdx = new Map<number, string>();
      const usedMovCands = new Set<string>();
      const usedItemForMov = new Set<number>();
      for (const p of movPairs) {
        if (usedItemForMov.has(p.idx) || usedMovCands.has(p.candId)) continue;
        assignedMovByIdx.set(p.idx, p.candId);
        usedMovCands.add(p.candId);
        usedItemForMov.add(p.idx);
      }

      // ── Assign payable matches (saída only) ──
      const payPairs: Pair[] = [];
      rawItems.forEach((raw, idx) => {
        if (raw.status !== "pendente" || raw.tipo !== "saida") return;
        for (const p of payables) {
          if (Math.abs(p.amount - raw.absVal) >= 0.01) continue;
          const dist = p.referenceDate ? daysDiff(raw.txDate, p.referenceDate) : 9999;
          if (dist <= 5 || !p.referenceDate) {
            payPairs.push({ idx, candId: p.id, dist });
          }
        }
      });
      payPairs.sort((a, b) => a.dist - b.dist);

      const assignedPayByIdx = new Map<number, string>();
      const usedPayCands = new Set<string>();
      const usedItemForPay = new Set<number>();
      for (const p of payPairs) {
        if (usedItemForPay.has(p.idx) || usedPayCands.has(p.candId)) continue;
        assignedPayByIdx.set(p.idx, p.candId);
        usedPayCands.add(p.candId);
        usedItemForPay.add(p.idx);
      }

      // 3) Build final OfxItem list
      const ofxItems: OfxItem[] = rawItems.map((raw, idx) => {
        const { dbItem, absVal, tipo, status, txDate } = raw;

        let matchedMovId: string | null = dbItem.matched_movimentacao_id || null;
        let matchedMovDesc: string | null = null;
        let matchedMovDate: string | null = null;
        let matchedMovOrigem: string | null = null;
        let matchedMovValor: number | null = null;
        let matchedMovPrecision: MatchPrecision | null = null;
        let matchedPayableId: string | null = null;
        let matchedPayableDesc: string | null = null;
        let matchedPayableFornecedor: string | null = null;
        let matchedPayableDue: string | null = null;
        let matchedPayableValor: number | null = null;
        let matchedPayableExpenseId: string | null = null;
        let matchedPayableIsInstallment = false;
        let matchedPayableInstallmentId: string | null = null;
        let matchedPayablePrecision: MatchPrecision | null = null;

        if (status === "pendente") {
          // Cash flow match
          const movCandId = assignedMovByIdx.get(idx);
          if (movCandId) {
            const match = movs.find((m) => m.id === movCandId)!;
            matchedMovId = match.id;
            matchedMovDesc = match.descricao;
            matchedMovDate = match.data_movimentacao;
            matchedMovOrigem = match.origem;
            matchedMovValor = Math.abs(Number(match.valor));
            matchedMovPrecision = match.data_movimentacao === txDate ? "exato" : "proximo";
          }

          // Payable match
          const payCandId = assignedPayByIdx.get(idx);
          if (payCandId) {
            const pm = payables.find((p) => p.id === payCandId)!;
            matchedPayableId = pm.id;
            matchedPayableDesc = pm.description;
            matchedPayableFornecedor = pm.fornecedor || null;
            matchedPayableDue = pm.referenceDate;
            matchedPayableValor = pm.amount;
            matchedPayableExpenseId = pm.expenseId;
            matchedPayableIsInstallment = pm.isInstallment;
            matchedPayableInstallmentId = pm.installmentId || null;
            matchedPayablePrecision = pm.referenceDate && pm.referenceDate === txDate ? "exato" : "proximo";
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
          matchedPayableFornecedor,
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
    const conciliados = items.filter((i) => i.status === "conciliado").length;
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
    const pendentes = items.filter((i) => i.status === "pendente").length;
    return { total, conciliados, pendentes };
  }, [items]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (statusFilter !== "todos") {
      list = list.filter((i) => i.status === statusFilter);
    }
    if (tipoFilter !== "todos") {
      list = list.filter((i) => tipoFilter === "debito" ? i.tipo === "saida" : i.tipo === "entrada");
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter((i) =>
        i.description.toLowerCase().includes(q) ||
        formatCurrency(Math.abs(i.amount)).includes(q) ||
        i.date.includes(q)
      );
    }
    return list;
  }, [items, statusFilter, tipoFilter, searchText]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    try {
      // OFX files from Brazilian banks are often encoded in ISO-8859-1 / Windows-1252
      // Try to detect encoding from OFX header, fallback to latin1
      let text: string;
      const rawBytes = await file.arrayBuffer();
      const latin1Text = new TextDecoder("iso-8859-1").decode(rawBytes);
      const charsetMatch = latin1Text.match(/CHARSET:\s*(\d+|[A-Za-z0-9_-]+)/i);
      const charset = charsetMatch?.[1];
      if (charset === "UTF-8" || charset === "65001") {
        text = new TextDecoder("utf-8").decode(rawBytes);
      } else {
        // Default to latin1 for Brazilian banks (CHARSET:1252, CHARSET:ISO-8859-1, or unspecified)
        text = latin1Text;
      }
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

      const [{ data: existingMovs }, { data: pendingExpenses2 }, { data: pendingInstallments2 }, { data: alreadyMatched2 }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem")
          .gte("data_movimentacao", minDate)
          .lte("data_movimentacao", maxDate),
        supabase
          .from("expenses")
          .select("id, valor_total, valor_pago, descricao, favorecido_nome, data_vencimento, data_emissao, status")
          .in("status", ["pendente", "atrasado"])
          .is("deleted_at", null),
        supabase
          .from("expense_installments")
          .select("id, expense_id, valor, data_vencimento, status, numero_parcela")
          .eq("status", "pendente"),
        // Movimentações já vinculadas a outras conciliações
        supabase
          .from("bank_reconciliation_items")
          .select("matched_movimentacao_id")
          .not("matched_movimentacao_id", "is", null),
      ]);

      const alreadyMatchedIds2 = new Set(
        (alreadyMatched2 || []).map((r: any) => r.matched_movimentacao_id).filter(Boolean)
      );
      const movs = ((existingMovs || []) as MatchCandidate[]).filter((m) => !alreadyMatchedIds2.has(m.id));
      const instRows2 = (pendingInstallments2 || []) as any[];
      const expRows2 = (pendingExpenses2 || []) as any[];
      const expWithInst2 = new Set(instRows2.map((i: any) => i.expense_id));
      const payables: { id: string; expenseId: string; amount: number; description: string; fornecedor: string | null; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows2) {
        const exp = expRows2.find((e: any) => e.id === inst.expense_id);
        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
          fornecedor: exp?.favorecido_nome || null,
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
          fornecedor: exp.favorecido_nome || null,
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
          // Débito: buscar no fluxo de caixa — mesmo tipo (saída) + valor idêntico + data ±5 dias
          const candidates = movs.filter(
            (m) => m.tipo === "saida" && !usedMovIds.has(m.id) && Math.abs(Number(m.valor) - absVal) < 0.01 && daysDiff(txDate, m.data_movimentacao) <= 5
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
          // Crédito: buscar no fluxo de caixa — mesmo tipo (entrada) + valor + data ±5 dias
          const candidates = movs.filter(
            (m) => m.tipo === "entrada" && !usedMovIds.has(m.id) && Math.abs(Number(m.valor) - absVal) < 0.01 && daysDiff(txDate, m.data_movimentacao) <= 5
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
          matchedPayableFornecedor: payableMatch?.fornecedor || null,
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
        fornecedor: item.matchedPayableFornecedor || null,
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
        fornecedor: item.matchedPayableFornecedor || null,
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

  const markAsConciliated = useCallback(
    (itemId: string) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== itemId) return i;
          if (i.dbItemId) {
            supabase.from("bank_reconciliation_items").update({ status: "conciliado" }).eq("id", i.dbItemId).then();
          } else if (reconciliationId) {
            supabase.from("bank_reconciliation_items").update({ status: "conciliado" }).eq("reconciliation_id", reconciliationId).eq("fitid", i.fitid || "").eq("status", "pendente").then();
          }
          return { ...i, status: "conciliado" as const };
        })
      );
      setTimeout(updateReconciliationCount, 500);
    },
    [reconciliationId, updateReconciliationCount]
  );

  const onExpenseSaved = async (savedExpenseId?: string) => {
    // Auto-pay the expense so it flows into cash flow
    if (savedExpenseId && activeItem) {
      const valorPag = Math.abs(activeItem.amount);
      const dataPag = activeItem.date;

      // Insert payment record (triggers bank movement via DB trigger)
      const { error: payErr } = await supabase.from("expense_payments" as any).insert({
        expense_id: savedExpenseId,
        valor: valorPag,
        forma_pagamento: "transferencia",
        data_pagamento: dataPag,
        observacoes: "Quitação automática via conciliação bancária",
        created_by: user?.id,
        juros: 0,
      } as any);

      if (!payErr) {
        // Update expense status to paid
        await supabase.from("expenses").update({
          status: "pago" as any,
          valor_pago: valorPag,
          data_pagamento: dataPag,
        }).eq("id", savedExpenseId);
      } else {
        console.error("Erro ao quitar despesa automaticamente:", payErr);
        toast.warning("Despesa criada, mas não foi possível quitá-la automaticamente.");
      }
    }

    if (activeItem) markAsConciliated(activeItem.id);
    setExpenseDialogOpen(false);
    setActiveItem(null);
    toast.success("Despesa registrada, quitada e conciliada");
  };

  const onMovementSaved = () => {
    if (activeItem) markAsConciliated(activeItem.id);
    setManualMovDialogOpen(false);
    setActiveItem(null);
    toast.success("Movimentação registrada e conciliada");
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <SummaryCard icon={FileSpreadsheet} label="Total" value={totals.total} />
        <SummaryCard icon={CheckCircle2} label="Conciliados" value={totals.conciliados} valueColor="green" />
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

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou valor..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {(["todos", "pendente", "conciliado"] as const).map((tab) => {
            const labels: Record<string, string> = { todos: "Todos", pendente: "Pendentes", conciliado: "Conciliados" };
            const count = tab === "todos" ? items.length : items.filter((i) => i.status === tab).length;
            return (
              <Button
                key={tab}
                size="sm"
                variant={statusFilter === tab ? "default" : "outline"}
                className="h-7 text-[10px] px-2 gap-1"
                onClick={() => setStatusFilter(tab)}
              >
                {labels[tab]} <span className="opacity-70">({count})</span>
              </Button>
            );
          })}
        </div>
        <div className="flex gap-1">
          {(["todos", "debito", "credito"] as const).map((tab) => {
            const labels: Record<string, string> = { todos: "Todos", debito: "Débitos", credito: "Créditos" };
            const count = tab === "todos" ? items.length : items.filter((i) => tab === "debito" ? i.tipo === "saida" : i.tipo === "entrada").length;
            return (
              <Button
                key={tab}
                size="sm"
                variant={tipoFilter === tab ? "default" : "outline"}
                className="h-7 text-[10px] px-2 gap-1"
                onClick={() => setTipoFilter(tab)}
              >
                {labels[tab]} <span className="opacity-70">({count})</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Items */}
      <Card>
        <CardContent className="p-0">
          <p className="text-xs font-semibold text-muted-foreground px-4 pt-3 pb-2 uppercase tracking-wider">
            Transações do Extrato ({filteredItems.length})
          </p>

          {isMobile ? (
            <div className="divide-y divide-border">
              {filteredItems.map((item) => (
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
                      fornecedor={item.matchedPayableFornecedor}
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
              {filteredItems.map((item) => (
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
                      fornecedor={item.matchedPayableFornecedor}
                    />
                  )}
                  {item.status === "conciliado" && (
                    <span className="text-green-600 text-[11px]">✓ Conciliado</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm match dialog */}
      <AlertDialog open={!!confirmItem} onOpenChange={(o) => { if (!o) { setConfirmItem(null); setConfirmMatch(null); } }}>
        <AlertDialogContent className="max-w-sm overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Confirmar Conciliação</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="text-sm space-y-1 min-w-0 overflow-hidden">
            <p className="truncate"><span className="text-muted-foreground">Extrato:</span> {confirmItem?.description}</p>
            <p>{confirmItem && formatDateBR(confirmItem.date)} · {confirmItem && formatCurrency(Math.abs(confirmItem.amount))}</p>
            <hr className="my-2" />
            {confirmMatch?.isPayable && confirmMatch.fornecedor && (
              <p className="font-medium break-words">{confirmMatch.fornecedor}</p>
            )}
            {confirmMatch?.descricao && (
              <p className="text-muted-foreground text-xs truncate">{confirmMatch.descricao}</p>
            )}
            {!confirmMatch?.isPayable && !confirmMatch?.fornecedor && (
              <p className="truncate">{confirmMatch?.descricao || "—"}</p>
            )}
            <p className="text-muted-foreground text-xs">{confirmMatch?.isPayable ? "Venc:" : "Data:"} {confirmMatch && formatDateBR(confirmMatch.data_movimentacao)} · {confirmMatch && formatCurrency(confirmMatch.valor)}</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMatch}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual movement dialog */}
      <ManualCashFlowDialog
        open={manualMovDialogOpen}
        onOpenChange={(o) => { setManualMovDialogOpen(o); if (!o) setActiveItem(null); }}
        onSaved={onMovementSaved}
        chartAccounts={chartAccounts}
        initialValues={activeItem ? {
          valor: maskCurrency(String(Math.abs(activeItem.amount).toFixed(2))),
          data: new Date(activeItem.date + "T12:00:00"),
          tipo: activeItem.tipo,
          descricao: activeItem.description,
        } : null}
      />

      {/* Expense dialog */}
      <ExpenseFormDialog
        open={expenseDialogOpen}
        onOpenChange={(o) => { setExpenseDialogOpen(o); if (!o) setActiveItem(null); }}
        onSaved={onExpenseSaved}
        expense={null}
        empresaId={matrizId}
        chartAccounts={chartAccounts}
        initialValues={activeItem ? {
          valorTotal: String(Math.abs(activeItem.amount)),
          dataEmissao: activeItem.date,
          dataVencimento: activeItem.date,
          descricao: activeItem.description,
        } : null}
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

function MatchBox({ desc, date, valor, origem, variant = "amber", label = "Correspondência encontrada", precision, fornecedor }: {
  desc: string | null; date: string | null; valor: number | null; origem: string;
  variant?: "amber" | "blue"; label?: string; precision?: MatchPrecision | null; fornecedor?: string | null;
}) {
  const isProximo = precision === "proximo";
  const colors = variant === "blue"
    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600"
    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600";
  const finalLabel = isProximo ? `${label} (data próxima)` : label;
  const truncDesc = desc && desc.length > 40 ? desc.slice(0, 40) + "…" : desc;
  return (
    <div className={cn("border rounded px-2 py-1.5 space-y-0.5", colors.split(" ").slice(0, 4).join(" "), isProximo && "border-dashed")}>
      <span className={cn("flex items-center gap-1 font-medium text-[11px]", colors.split(" ").slice(4).join(" "))}>
        <Link2 className="h-3 w-3 shrink-0" /> {finalLabel}
      </span>
      <div className="text-[10px] text-muted-foreground pl-4 space-y-0.5">
        {fornecedor && <p><span className="font-medium">Fornecedor:</span> {fornecedor}</p>}
        <p><span className="font-medium">Desc:</span> {truncDesc || "Sem descrição"}</p>
        <p><span className="font-medium">{variant === "blue" ? "Venc:" : "Data:"}</span> {formatDateBR(date || "")} · <span className="font-medium">Valor:</span> {valor != null ? formatCurrency(valor) : "—"} · <span className="font-medium">Origem:</span> {origem}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "conciliado")
    return <Badge variant="outline" className="text-[10px] border-green-500 text-green-600">Conciliado</Badge>;
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
          {item.tipo === "saida" && (
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onNewExpense}>
              <Plus className="h-3 w-3" /> Despesa
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={onNewMovement}>
            <ArrowDownCircle className="h-3 w-3" /> Movimentação
          </Button>
        </>
      )}
    </div>
  );
}
