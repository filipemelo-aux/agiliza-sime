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
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Link2, Plus, ArrowDownCircle, ArrowUpCircle, Loader2, CheckSquare, History, Trash2, Search, RefreshCw, List, ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ManualCashFlowDialog } from "./ManualCashFlowDialog";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { counterpartyFromDescription } from "@/lib/counterpartyFromDescription";
import { personDisplayName } from "@/lib/personName";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { GlobalToolbar, ToolbarIconButton } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";


type MatchPrecision = "exato" | "proximo";

function daysDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000));
}

function matchValueQuery(query: string, valor?: number | null): boolean {
  if (!query || !/[0-9]/.test(query) || valor == null) return false;
  const qDigits = query.replace(/\D/g, "");
  if (!qDigits) return false;
  const vDigits = Math.round(Number(valor) * 100).toString();
  const vInteger = Math.trunc(Number(valor)).toString();
  return vDigits === qDigits || vInteger.includes(qDigits) || vDigits.includes(qDigits);
}

function matchAccountSearch(query: string, account: any, installments: any[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    String(account.descricao || account.description || "").toLowerCase().includes(q) ||
    String(account.favorecido_nome || account.creditor_name || "").toLowerCase().includes(q) ||
    String(account.veiculo_placa || "").toLowerCase().includes(q) ||
    String(account.documento_fiscal_numero || "").toLowerCase().includes(q) ||
    String(account.chave_nfe || "").toLowerCase().includes(q) ||
    String(account.numero_multa || "").toLowerCase().includes(q) ||
    String(account.observacoes || "").toLowerCase().includes(q) ||
    String(account.fornecedor_cnpj || "").toLowerCase().includes(q) ||
    String(account.forma_pagamento || "").toLowerCase().includes(q) ||
    matchValueQuery(q, Number(account.valor_total || account.amount || 0)) ||
    matchValueQuery(q, Number(account.valor_pago || account.paid_amount || 0)) ||
    installments.some((inst) => matchValueQuery(q, Number(inst.valor || 0)))
  );
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
  matchedMovFavorecido: string | null;
  matchedPayableId: string | null;
  matchedPayableDesc: string | null;
  matchedPayableFornecedor: string | null;
  matchedPayableDue: string | null;
  matchedPayableValor: number | null;
  matchedPayablePrecision: MatchPrecision | null;
  matchedPayableExpenseId: string | null;
  matchedPayableIsInstallment: boolean;
  matchedPayableInstallmentId: string | null;
  matchedReceivableId: string | null;
  matchedReceivableDesc: string | null;
  matchedReceivableCliente: string | null;
  matchedReceivableDue: string | null;
  matchedReceivableValor: number | null;
  matchedReceivablePrecision: MatchPrecision | null;
  matchedReceivableContaId: string | null;
  matchedReceivableFaturaNumero: number | null;
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
  isReceivable?: boolean;
  contaReceberId?: string;
  receivableDueDate?: string;
  cliente?: string | null;
  faturaNumero?: number | null;
}

interface ReconciliationSummary {
  id: string;
  file_name: string;
  bank_name: string | null;
  created_at: string;
  total_items: number;
  reconciled_items: number;
}

/** Normaliza nome para casar com o cadastro (sem acento, sem pontuação, maiúsculo). */
function normalizeName(n?: string | null): string {
  return String(n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Só interessa saber de onde veio / para quem foi. */
const DETAIL_LABELS: Array<[string, string]> = [
  ["contraparte", "Contraparte"],
  ["documentoContraparte", "Documento"],
];


/** Exibe os detalhes adicionais trazidos pelo Open Finance (quando o banco fornece). */
function TransactionDetails({
  details,
  description,
  tipo,
  resolveName,
  cadastroNome,
}: {
  details?: Record<string, string | number | null> | null;
  description?: string | null;
  tipo?: "entrada" | "saida";
  resolveName?: (doc: string) => string | null;
  /** Nome encontrado no cadastro (profiles) para a contraparte do lançamento. */
  cadastroNome?: string | null;
}) {
  const fromDesc = counterpartyFromDescription(description);
  const documento = fromDesc.documento || (details?.documentoContraparte as string) || null;
  const nome =
    cadastroNome ||
    fromDesc.nome ||
    (details?.contraparte as string) ||
    (details?.estabelecimento as string) ||
    (documento && resolveName ? resolveName(documento) : null) ||
    null;
  const merged: Record<string, string | number | null> = {
    contraparte: nome,
    documentoContraparte: documento,
  };


  if (!details && !nome && !documento) return null;
  const partyLabel = fromDesc.papel
    ? fromDesc.papel === "favorecido"
      ? "Favorecido"
      : "Remetente"
    : tipo === "saida"
      ? "Favorecido"
      : "Remetente";
  const chips = DETAIL_LABELS
    .map(([key, label]) => {
      const value = merged[key];
      if (value === null || value === undefined || value === "") return null;
      return { label: key === "contraparte" ? partyLabel : label, value: String(value) };
    })

    .filter((c): c is { label: string; value: string } => c !== null);
  // Fallback: o banco não informou contraparte (ex.: transferência entre contas).
  // Mostramos ao menos o tipo de operação/forma de pagamento para dar contexto.
  if (chips.length === 0) {
    const tipoOp = (details?.tipoOperacao as string) || (details?.formaPagamento as string) || (details?.categoria as string) || null;
    if (!tipoOp) return null;
    const legivel = String(tipoOp).replace(/_/g, " ").toLowerCase();
    chips.push({ label: "Operação", value: legivel.charAt(0).toUpperCase() + legivel.slice(1) });
  }



  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          title={`${c.label}: ${c.value}`}
          className="min-w-0 max-w-full truncate rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          <span className="text-muted-foreground/70">{c.label}:</span> {c.value}
        </span>
      ))}
    </div>
  );
}


export function BankReconciliation() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { matrizId } = useUnifiedCompany();
  const { confirm, ConfirmDialog } = useConfirmDialog();
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
  // Movimentações do fluxo no período do OFX (para detectar lançamentos que NÃO existem no extrato)
  const [movsInPeriod, setMovsInPeriod] = useState<Array<{ id: string; valor: number; data_movimentacao: string; tipo: "entrada" | "saida"; descricao: string | null; origem: string; favorecido?: string | null }>>([]);
  const [ofxRange, setOfxRange] = useState<{ min: string; max: string } | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
  // Cadastro (CNPJ -> nome) para identificar favorecidos de transferências enviadas
  const [docNameMap, setDocNameMap] = useState<Record<string, string>>({});
  const [profileByDoc, setProfileByDoc] = useState<Record<string, { id: string; nome: string }>>({});
  const [profileByName, setProfileByName] = useState<Record<string, { id: string; nome: string }>>({});
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, cnpj, razao_social, nome_fantasia, full_name")
      .limit(5000)
      .then(({ data, error }) => {
        if (error) console.error("Falha ao carregar cadastro de pessoas", error);
        const map: Record<string, string> = {};
        const byDoc: Record<string, { id: string; nome: string }> = {};
        const byName: Record<string, { id: string; nome: string }> = {};
        (data || []).forEach((p: any) => {
          const nome = personDisplayName(p);
          if (!nome) return;
          [p.cnpj].forEach((d) => {
            const digits = String(d || "").replace(/\D/g, "");
            if (digits.length >= 11) {
              map[digits] = nome;
              byDoc[digits] = { id: p.id, nome };
            }
          });

          [p.razao_social, p.full_name, p.nome_fantasia].forEach((n) => {
            const key = normalizeName(n);
            if (key && !byName[key]) byName[key] = { id: p.id, nome };
          });
        });
        setDocNameMap(map);
        setProfileByDoc(byDoc);
        setProfileByName(byName);
      });
  }, []);
  const resolveDocName = useCallback(
    (doc: string) => {
      const digits = doc.replace(/\D/g, "");
      if (digits.length < 11) return null;
      return docNameMap[digits] ?? null;
    },
    [docNameMap],
  );

  /** Resolve o favorecido/remetente de um lançamento do extrato contra o cadastro. */
  const resolveCounterpartyProfile = useCallback(
    (item: OfxItem | null) => {
      if (!item) return null;
      const fromDesc = counterpartyFromDescription(item.description);
      const details = (item as any).details as Record<string, any> | null | undefined;
      const documento = fromDesc.documento || (details?.documentoContraparte as string) || null;
      const nome =
        fromDesc.nome ||
        (details?.contraparte as string) ||
        (details?.estabelecimento as string) ||
        (documento ? resolveDocName(documento) : null) ||
        null;
      const digits = documento ? documento.replace(/\D/g, "") : "";
      const hit =
        (digits.length >= 11 ? profileByDoc[digits] : undefined) ||
        (nome ? profileByName[normalizeName(nome)] : undefined) ||
        null;
      if (hit) return { favorecidoId: hit.id, favorecidoNome: hit.nome };
      if (nome) return { favorecidoId: null, favorecidoNome: nome };
      return null;
    },
    [profileByDoc, profileByName, resolveDocName],
  );


  // Load chart of accounts (plano de contas é único/unificado entre as empresas)
  useEffect(() => {
    supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
  }, []);

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

      const [{ data: existingMovs }, { data: pendingExpenses }, { data: pendingInstallments }, { data: alreadyMatched }, { data: linkedMovements }, { data: pendingReceivables }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem, origem_id")
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
          .in("status", ["pendente", "atrasado"]),
        supabase
          .from("bank_reconciliation_items")
          .select("matched_movimentacao_id, reconciliation_id")
          .not("matched_movimentacao_id", "is", null),
        supabase
          .from("bank_reconciliation_item_links")
          .select("movimentacao_id"),
        supabase
          .from("contas_receber")
          .select("id, valor, valor_recebido, data_vencimento, status, fatura_id, faturas_recebimento(numero, cliente_id, profiles:cliente_id(full_name, razao_social))")
          .in("status", ["aberto", "atrasado"]),
      ]);

      // Movimentações já vinculadas podem ter data fora da janela do extrato
      // (ex.: baixa registrada em outro mês). Busca-as explicitamente pelo id
      // para que os detalhes do vínculo apareçam nos itens já conciliados.
      const linkedMovIds = Array.from(
        new Set(dbItems.map((i: any) => i.matched_movimentacao_id).filter(Boolean)),
      ) as string[];
      const inWindow = new Set((existingMovs || []).map((m: any) => m.id));
      const missingLinkedIds = linkedMovIds.filter((id) => !inWindow.has(id));
      let extraMovs: any[] = [];
      if (missingLinkedIds.length > 0) {
        const { data: extra } = await supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem, origem_id")
          .in("id", missingLinkedIds);
        extraMovs = extra || [];
      }
      const allMovs = [...(existingMovs || []), ...extraMovs];

      // Exclude movements already linked to ANY reconciliation item (including
      // items inside the current reconciliation), so a single paid/reconciled
      // entry is never suggested as a close-date match for a different OFX line.
      const alreadyMatchedIds = new Set([
        ...(alreadyMatched || []).map((r: any) => r.matched_movimentacao_id),
        ...(linkedMovements || []).map((r: any) => r.movimentacao_id),
      ].filter(Boolean));
      const movs = (existingMovs || []).filter((m: any) => !alreadyMatchedIds.has(m.id));

      // Fetch favorecido/conta for movements linked to expenses (for reconciled items display)
      const expenseMovIds = allMovs.filter((m: any) =>
        ["contas_pagar", "pagamento_despesa", "despesas"].includes(m.origem)
      );
      const payableIdsToFetch = expenseMovIds.filter((m: any) => m.origem === "contas_pagar").map((m: any) => m.origem_id);
      const paymentIdsToFetch = expenseMovIds.filter((m: any) => m.origem === "pagamento_despesa").map((m: any) => m.origem_id);
      const expenseDirectIds = expenseMovIds.filter((m: any) => m.origem === "despesas").map((m: any) => m.origem_id);

      const movFavorecidoMap = new Map<string, string>();
      if (paymentIdsToFetch.length > 0) {
        const { data: payments } = await supabase
          .from("expense_payments")
          .select("id, expense_id, expenses(favorecido_nome, descricao)")
          .in("id", paymentIdsToFetch);
        (payments || []).forEach((p: any) => {
          const mov = expenseMovIds.find((m: any) => m.origem === "pagamento_despesa" && m.origem_id === p.id);
          if (mov && p.expenses?.favorecido_nome) movFavorecidoMap.set(mov.id, p.expenses.favorecido_nome);
        });
      }
      if (expenseDirectIds.length > 0) {
        const { data: exps } = await supabase
          .from("expenses")
          .select("id, favorecido_nome")
          .in("id", expenseDirectIds);
        (exps || []).forEach((e: any) => {
          const mov = expenseMovIds.find((m: any) => m.origem === "despesas" && m.origem_id === e.id);
          if (mov && e.favorecido_nome) movFavorecidoMap.set(mov.id, e.favorecido_nome);
        });
      }
      if (payableIdsToFetch.length > 0) {
        const { data: aps } = await supabase
          .from("accounts_payable")
          .select("id, supplier_name")
          .in("id", payableIdsToFetch);
        (aps || []).forEach((a: any) => {
          const mov = expenseMovIds.find((m: any) => m.origem === "contas_pagar" && m.origem_id === a.id);
          if (mov && a.supplier_name) movFavorecidoMap.set(mov.id, a.supplier_name);
        });
      }
      // Build unified payables list: installments first, then expenses without installments
      const instRows = (pendingInstallments || []) as any[];
      const expRows = (pendingExpenses || []) as any[];
      const expWithInst = new Set(instRows.map((i: any) => i.expense_id));
      // Despesas-mãe das parcelas que não estão na lista de pendentes (ex.: status parcial/pago)
      const parentIds = Array.from(
        new Set(instRows.map((i: any) => i.expense_id).filter((id: string) => id && !expRows.some((e: any) => e.id === id))),
      );
      const parentMap = new Map<string, any>();
      if (parentIds.length > 0) {
        const { data: parents } = await supabase
          .from("expenses")
          .select("id, descricao, favorecido_nome, deleted_at")
          .in("id", parentIds);
        (parents || []).forEach((p: any) => parentMap.set(p.id, p));
      }
      const payables: { id: string; expenseId: string; amount: number; description: string; fornecedor: string | null; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows) {
        const exp = expRows.find((e: any) => e.id === inst.expense_id) || parentMap.get(inst.expense_id) || null;
        if (exp?.deleted_at) continue;
        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp?.descricao ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
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
        if (saldo <= 0.005) continue;
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

      // Build receivables list (pending contas_receber) for credit matching
      const recRows = (pendingReceivables || []) as any[];
      const receivables: { id: string; contaReceberId: string; amount: number; description: string; cliente: string | null; referenceDate: string | null; faturaNumero: number | null }[] = [];
      for (const r of recRows) {
        const saldo = Number(r.valor) - Number(r.valor_recebido || 0);
        if (saldo <= 0.005) continue;
        const fat = r.faturas_recebimento;
        const cli = fat?.profiles;
        const cliNome = cli?.razao_social || cli?.full_name || null;
        receivables.push({
          id: `rec_${r.id}`,
          contaReceberId: r.id,
          amount: saldo,
          description: fat?.numero ? `Fatura #${fat.numero}` : "Conta a Receber",
          cliente: cliNome,
          referenceDate: r.data_vencimento || null,
          faturaNumero: fat?.numero || null,
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
         // Se já existe pagamento no caixa para o mesmo valor/data, ele é a
         // correspondência efetiva; não crie uma segunda sugestão de título.
         if (assignedMovByIdx.has(idx)) return;
         for (const p of payables) {
           if (Math.abs(p.amount - raw.absVal) >= 0.01) continue;
           const dist = p.referenceDate ? daysDiff(raw.txDate, p.referenceDate) : 9999;
           payPairs.push({ idx, candId: p.id, dist });
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

      // ── Assign receivable matches (entrada only) ──
      const recPairs: Pair[] = [];
      rawItems.forEach((raw, idx) => {
        if (raw.status !== "pendente" || raw.tipo !== "entrada") return;
        for (const r of receivables) {
          if (Math.abs(r.amount - raw.absVal) >= 0.01) continue;
          const dist = r.referenceDate ? daysDiff(raw.txDate, r.referenceDate) : 9999;
          recPairs.push({ idx, candId: r.id, dist });
        }
      });
      recPairs.sort((a, b) => a.dist - b.dist);
      const assignedRecByIdx = new Map<number, string>();
      const usedRecCands = new Set<string>();
      const usedItemForRec = new Set<number>();
      for (const p of recPairs) {
        if (usedItemForRec.has(p.idx) || usedRecCands.has(p.candId)) continue;
        assignedRecByIdx.set(p.idx, p.candId);
        usedRecCands.add(p.candId);
        usedItemForRec.add(p.idx);
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
        let matchedMovFavorecido: string | null = null;
        let matchedPayableId: string | null = null;
        let matchedPayableDesc: string | null = null;
        let matchedPayableFornecedor: string | null = null;
        let matchedPayableDue: string | null = null;
        let matchedPayableValor: number | null = null;
        let matchedPayableExpenseId: string | null = null;
        let matchedPayableIsInstallment = false;
        let matchedPayableInstallmentId: string | null = null;
        let matchedPayablePrecision: MatchPrecision | null = null;
        let matchedReceivableId: string | null = null;
        let matchedReceivableDesc: string | null = null;
        let matchedReceivableCliente: string | null = null;
        let matchedReceivableDue: string | null = null;
        let matchedReceivableValor: number | null = null;
        let matchedReceivablePrecision: MatchPrecision | null = null;
        let matchedReceivableContaId: string | null = null;
        let matchedReceivableFaturaNumero: number | null = null;

        if (status === "pendente") {
          const movCandId = assignedMovByIdx.get(idx);
          if (movCandId) {
            const match = movs.find((m) => m.id === movCandId)!;
            matchedMovId = match.id;
            matchedMovDesc = match.descricao;
            matchedMovDate = match.data_movimentacao;
            matchedMovOrigem = match.origem;
            matchedMovValor = Math.abs(Number(match.valor));
            matchedMovPrecision = match.data_movimentacao === txDate ? "exato" : "proximo";
            matchedMovFavorecido = movFavorecidoMap.get(match.id) || null;
          }

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

          const recCandId = assignedRecByIdx.get(idx);
          if (recCandId) {
            const rm = receivables.find((r) => r.id === recCandId)!;
            matchedReceivableId = rm.id;
            matchedReceivableDesc = rm.description;
            matchedReceivableCliente = rm.cliente;
            matchedReceivableDue = rm.referenceDate;
            matchedReceivableValor = rm.amount;
            matchedReceivableContaId = rm.contaReceberId;
            matchedReceivableFaturaNumero = rm.faturaNumero;
            matchedReceivablePrecision = rm.referenceDate && rm.referenceDate === txDate ? "exato" : "proximo";
          }
        } else if (matchedMovId) {
          const mov = allMovs.find((m: any) => m.id === matchedMovId);
          if (mov) {
            matchedMovDesc = mov.descricao;
            matchedMovDate = mov.data_movimentacao;
            matchedMovOrigem = mov.origem;
            matchedMovValor = Math.abs(Number(mov.valor));
            matchedMovPrecision = mov.data_movimentacao === txDate ? "exato" : "proximo";
            matchedMovFavorecido = movFavorecidoMap.get(mov.id) || null;
          }
        }

        return {
          fitid: dbItem.fitid || "",
          date: txDate,
          amount: tipo === "saida" ? -absVal : absVal,
          description: dbItem.description || "",
          details: (dbItem as any).details ?? null,
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
          matchedMovFavorecido,
          matchedPayableId,
          matchedPayableDesc,
          matchedPayableFornecedor,
          matchedPayableDue,
          matchedPayableValor,
          matchedPayablePrecision,
          matchedPayableExpenseId,
          matchedPayableIsInstallment,
          matchedPayableInstallmentId,
          matchedReceivableId,
          matchedReceivableDesc,
          matchedReceivableCliente,
          matchedReceivableDue,
          matchedReceivableValor,
          matchedReceivablePrecision,
          matchedReceivableContaId,
          matchedReceivableFaturaNumero,
        };
      });

      // Guarda período do OFX e movimentações do fluxo nesse período (para visão inversa)
      const ofxMin = dates[0];
      const ofxMax = dates[dates.length - 1];
      const movsInside = (existingMovs || [])
        .filter((m: any) => m.data_movimentacao >= ofxMin && m.data_movimentacao <= ofxMax)
        .map((m: any) => ({
          id: m.id, valor: Number(m.valor), data_movimentacao: m.data_movimentacao,
          tipo: m.tipo, descricao: m.descricao, origem: m.origem,
          favorecido: movFavorecidoMap.get(m.id) || null,
        }));
      setOfxRange({ min: ofxMin, max: ofxMax });
      setMovsInPeriod(movsInside);

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
  const [expenseFavorecido, setExpenseFavorecido] = useState<{ favorecidoId: string | null; favorecidoNome: string | null } | null>(null);
  const [manualMovDialogOpen, setManualMovDialogOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<OfxItem | null>(null);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Manual link-to-account dialog
  const [linkAccountDialogOpen, setLinkAccountDialogOpen] = useState(false);
  const [linkSearchText, setLinkSearchText] = useState("");
  const [linkSearchResults, setLinkSearchResults] = useState<any[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkSelectedAccount, setLinkSelectedAccount] = useState<any | null>(null);
  const [linkSelectedAccounts, setLinkSelectedAccounts] = useState<any[]>([]);
  const [linkAllocations, setLinkAllocations] = useState<Record<string, string>>({});
  const [linkTargetItemIds, setLinkTargetItemIds] = useState<string[]>([]);
  const [linkSubmitting, setLinkSubmitting] = useState(false);

  const selectableItems = useMemo(() =>
    items.filter((i) => i.status === "pendente" && (i.matchedMovId || i.matchedPayableId || i.matchedReceivableId)),
    [items]
  );

  // Items that can be manually linked (any pending)
  const linkableSelectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id) && i.status === "pendente"),
    [items, selectedIds]
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

  // Localiza a movimentação bancária criada para uma despesa/conta a pagar
  // (após quitação, o trigger gera movimento via origem='pagamento_despesa' ou 'contas_pagar').
  // Retorna a melhor candidata por proximidade de data.
  const fetchMovDetails = useCallback(async (ids: string[]) => {
    const map = new Map<string, { descricao: string | null; data_movimentacao: string; valor: number; origem: string }>();
    if (ids.length === 0) return map;
    const { data } = await supabase
      .from("movimentacoes_bancarias")
      .select("id, descricao, data_movimentacao, valor, origem")
      .in("id", ids);
    (data || []).forEach((m: any) => map.set(m.id, {
      descricao: m.descricao, data_movimentacao: m.data_movimentacao, valor: Number(m.valor), origem: m.origem,
    }));
    return map;
  }, []);

  const findCreatedMovId = useCallback(async (params: {

    expenseId?: string;
    accountsPayableId?: string;
    amount: number;
    tipo: "entrada" | "saida";
    referenceDate: string;
  }): Promise<string | null> => {
    const { expenseId, accountsPayableId, amount, tipo, referenceDate } = params;
    const d0 = new Date(referenceDate + "T00:00:00"); d0.setDate(d0.getDate() - 7);
    const d1 = new Date(referenceDate + "T00:00:00"); d1.setDate(d1.getDate() + 7);
    const minDate = d0.toISOString().slice(0, 10);
    const maxDate = d1.toISOString().slice(0, 10);

    // 1) Tenta via pagamento_despesa (precisa expandir via expense_payments)
    if (expenseId) {
      const { data: pays } = await supabase
        .from("expense_payments" as any)
        .select("id")
        .eq("expense_id", expenseId)
        .order("created_at", { ascending: false })
        .limit(20);
      const payIds = (pays || []).map((p: any) => p.id);
      if (payIds.length > 0) {
        const { data: movs } = await supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao")
          .eq("origem", "pagamento_despesa")
          .in("origem_id", payIds)
          .eq("tipo", tipo);
        const cand = (movs || []).filter((m: any) => Math.abs(Number(m.valor) - amount) < 0.01);
        if (cand.length > 0) {
          cand.sort((a: any, b: any) =>
            Math.abs(new Date(a.data_movimentacao).getTime() - new Date(referenceDate).getTime()) -
            Math.abs(new Date(b.data_movimentacao).getTime() - new Date(referenceDate).getTime())
          );
          return cand[0].id;
        }
      }
    }

    // 2) Tenta via contas_pagar
    if (accountsPayableId) {
      const { data: movs } = await supabase
        .from("movimentacoes_bancarias")
        .select("id, valor, data_movimentacao")
        .eq("origem", "contas_pagar")
        .eq("origem_id", accountsPayableId)
        .eq("tipo", tipo);
      const cand = (movs || []).filter((m: any) => Math.abs(Number(m.valor) - amount) < 0.01);
      if (cand.length > 0) return cand[0].id;
    }

    // 3) Fallback: busca por valor+tipo+data próxima sem vínculo prévio
    const { data: movs } = await supabase
      .from("movimentacoes_bancarias")
      .select("id, valor, data_movimentacao")
      .eq("tipo", tipo)
      .gte("data_movimentacao", minDate)
      .lte("data_movimentacao", maxDate);
    const cand = (movs || []).filter((m: any) => Math.abs(Number(m.valor) - amount) < 0.01);
    if (cand.length === 0) return null;
    cand.sort((a: any, b: any) =>
      Math.abs(new Date(a.data_movimentacao).getTime() - new Date(referenceDate).getTime()) -
      Math.abs(new Date(b.data_movimentacao).getTime() - new Date(referenceDate).getTime())
    );
    // Verifica se já está vinculado a outro item
    const ids = cand.map((c: any) => c.id);
    const { data: used } = await supabase
      .from("bank_reconciliation_items")
      .select("matched_movimentacao_id")
      .in("matched_movimentacao_id", ids);
    const usedSet = new Set((used || []).map((u: any) => u.matched_movimentacao_id));
    const free = cand.find((c: any) => !usedSet.has(c.id));
    return free?.id || cand[0].id;
  }, []);

  const handleBatchConciliate = useCallback(async () => {
    if (selectedIds.size === 0 || !reconciliationId) return;
    setLoading(true);
    try {
      const selected = items.filter((i) => selectedIds.has(i.id));
      for (const item of selected) {
        let movIdToLink = item.matchedMovId || null;
        if (item.matchedPayableId && item.matchedPayableExpenseId && !item.matchedMovId) {
          const amount = Math.abs(item.amount);
          const { data: payment, error: paymentError } = await supabase
            .from("expense_payments" as any)
            .insert({
              expense_id: item.matchedPayableExpenseId,
              valor: amount,
              forma_pagamento: "transferencia",
              data_pagamento: item.date,
              observacoes: "Pagamento via conciliação bancária em lote (OFX)",
              created_by: user?.id,
              juros: 0,
              installment_id: item.matchedPayableIsInstallment ? item.matchedPayableInstallmentId : null,
            } as any)
            .select("id")
            .single();
          const paymentId = (payment as any)?.id as string | undefined;
          if (paymentError || !paymentId) throw paymentError || new Error("Pagamento não foi criado");

          if (item.matchedPayableIsInstallment && item.matchedPayableInstallmentId) {
            const { error: installmentError } = await supabase
              .from("expense_installments")
              .update({ status: "pago" } as any)
              .eq("id", item.matchedPayableInstallmentId);
            if (installmentError) throw installmentError;
          }

          const { data: movement, error: movementError } = await supabase
            .from("movimentacoes_bancarias")
            .select("id")
            .eq("origem", "pagamento_despesa")
            .eq("origem_id", paymentId)
            .maybeSingle();
          if (movementError) throw movementError;
          movIdToLink = movement?.id || await findCreatedMovId({
            expenseId: item.matchedPayableExpenseId,
            amount,
            tipo: item.tipo,
            referenceDate: item.date,
          });
        }
        if (item.matchedReceivableId && item.matchedReceivableContaId && !item.matchedMovId) {
          // Registrar recebimento na conta a receber pendente
          await supabase.from("receivable_payments" as any).insert({
            conta_receber_id: item.matchedReceivableContaId,
            valor: item.matchedReceivableValor || Math.abs(item.amount),
            forma_recebimento: "transferencia",
            data_recebimento: item.date,
            observacoes: "Recebimento via conciliação bancária (OFX em lote)",
            created_by: user?.id,
          });
          movIdToLink = await findCreatedMovId({
            amount: Math.abs(item.amount),
            tipo: item.tipo,
            referenceDate: item.date,
          });
        }
        if (!movIdToLink) {
          throw new Error(`Não foi possível localizar a movimentação de ${formatCurrency(Math.abs(item.amount))}. A conciliação foi interrompida.`);
        }
        const updateFilter = item.dbItemId
          ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("id", item.dbItemId)
          : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("reconciliation_id", reconciliationId).eq("fitid", item.fitid || "").eq("status", "pendente");
        const { error: updateError } = await updateFilter;
        if (updateError) throw updateError;
      }
      setItems((prev) =>
        prev.map((i) => selectedIds.has(i.id) ? { ...i, status: "conciliado" } : i)
      );
      toast.success(`${selectedIds.size} transação(ões) conciliada(s)`);
      setSelectedIds(new Set());
      setTimeout(updateReconciliationCount, 500);
      // Re-resume para garantir que os itens efetivados não reapareçam
      // como pendentes (re-hidrata status/matches direto do banco).
      const rec = history.find((h) => h.id === reconciliationId);
      if (rec) await resumeReconciliation(rec);
    } catch (err: any) {
      toast.error("Erro na conciliação em lote: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, [selectedIds, items, reconciliationId, updateReconciliationCount, findCreatedMovId, user, history, resumeReconciliation]);

  // ── Desfazer conciliação (volta item para pendente e re-tenta match) ──
  const handleUndoReconcile = useCallback(async (item: OfxItem) => {
    if (!reconciliationId) return;
    if (!window.confirm("Desfazer a conciliação deste lançamento?\n\nO item voltará para 'pendente' para que você possa vincular novamente a uma movimentação compatível.")) return;
    setLoading(true);
    try {
      const filter = item.dbItemId
        ? supabase.from("bank_reconciliation_items").update({ status: "pendente", matched_movimentacao_id: null }).eq("id", item.dbItemId)
        : supabase.from("bank_reconciliation_items").update({ status: "pendente", matched_movimentacao_id: null }).eq("reconciliation_id", reconciliationId).eq("fitid", item.fitid || "");
      const { error } = await filter;
      if (error) throw error;
      // Re-resume to re-run auto-matching across all items
      const rec = history.find((h) => h.id === reconciliationId);
      if (rec) {
        await resumeReconciliation(rec);
      } else {
        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, status: "pendente" } : i));
      }
      toast.success("Conciliação desfeita.");
      setTimeout(updateReconciliationCount, 500);
    } catch (err: any) {
      toast.error("Erro ao desfazer: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, [reconciliationId, history, resumeReconciliation, updateReconciliationCount]);

  // ── Excluir lançamento(s) do extrato da conciliação ──
  // Útil para linhas duplicadas do banco (ex.: depósito de cheque lançado no depósito e na compensação)
  const handleDeleteItems = useCallback(async (ids: string[]) => {
    if (!reconciliationId || ids.length === 0) return;
    const targets = items.filter((i) => ids.includes(i.id));
    if (targets.length === 0) return;
    const conciliados = targets.filter((i) => i.status === "conciliado").length;
    const msg = targets.length === 1
      ? `Excluir este lançamento do extrato da conciliação?\n\n${targets[0].description}\n\nO lançamento sai desta conciliação (nenhuma movimentação financeira é apagada).`
      : `Excluir ${targets.length} lançamentos do extrato desta conciliação?\n\nNenhuma movimentação financeira será apagada.`;
    if (!window.confirm(conciliados > 0 ? `${msg}\n\nAtenção: ${conciliados} já está(ão) conciliado(s); o vínculo será removido.` : msg)) return;

    setLoading(true);
    try {
      const withDbId = targets.filter((i) => i.dbItemId).map((i) => i.dbItemId as string);
      if (withDbId.length > 0) {
        const { error } = await supabase.from("bank_reconciliation_items").delete().in("id", withDbId);
        if (error) throw error;
      }
      for (const item of targets.filter((i) => !i.dbItemId)) {
        await supabase
          .from("bank_reconciliation_items")
          .delete()
          .eq("reconciliation_id", reconciliationId)
          .eq("fitid", item.fitid || "");
      }

      const remaining = items.filter((i) => !ids.includes(i.id));
      setItems(remaining);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });

      await supabase
        .from("bank_reconciliations")
        .update({
          total_items: remaining.length,
          reconciled_items: remaining.filter((i) => i.status === "conciliado").length,
        })
        .eq("id", reconciliationId);

      toast.success(targets.length === 1 ? "Lançamento excluído da conciliação." : `${targets.length} lançamentos excluídos.`);
    } catch (err: any) {
      toast.error("Erro ao excluir: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, [reconciliationId, items]);



  // ── Manual link to account (paid or pending) ──
  const openLinkAccountDialog = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) {
      toast.error("Selecione ao menos uma transação");
      return;
    }
    setLinkTargetItemIds(itemIds);
    setLinkSearchText("");
    setLinkSearchResults([]);
    setLinkSelectedAccount(null);
    setLinkSelectedAccounts([]);
    setLinkAllocations({});
    setLinkAccountDialogOpen(true);
  }, []);

  // Debounced search across expenses (any status, including paid).
  // Expenses with installments are expanded — one result per installment so the
  // user can link the OFX entry to the correct parcela (matching valor + vencimento).
  useEffect(() => {
    if (!linkAccountDialogOpen) return;
    const q = linkSearchText.trim();

    // Detecta se os itens alvo são créditos (entradas) → buscar em contas a receber
    const targetItems = items.filter((i) => linkTargetItemIds.includes(i.id));
    const allEntradas = targetItems.length > 0 && targetItems.every((i) => i.tipo === "entrada");
    const allSaidas = targetItems.length > 0 && targetItems.every((i) => i.tipo === "saida");
    const targetTotal = targetItems.reduce((sum, item) => sum + Math.abs(item.amount), 0);

    // Para entradas: permite busca sem texto (carrega recebíveis em aberto compatíveis com o valor)
    // Para saídas: exige ao menos 2 caracteres
    if (!allEntradas && q.length < 2) {
      setLinkSearchResults([]);
      return;
    }
    let cancelled = false;
    setLinkSearching(true);

    const timer = setTimeout(async () => {
      const safe = q.replace(/[,()]/g, " ").trim();
      const parseQueryDate = (s: string): string | null => {
        const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (br) return `${br[3]}-${br[2]}-${br[1]}`;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return null;
      };
      const queryDate = parseQueryDate(safe);

      // ───────────── BUSCA DE RECEBÍVEIS (créditos) ─────────────
      if (allEntradas) {
        const faturaNum = (() => {
          const m = safe.match(/^#?(\d+)$/);
          return m ? Number(m[1]) : null;
        })();

        // Valor total das entradas selecionadas — usado para pré-carregar candidatos
        const targetValor = targetItems.reduce((s, i) => s + Math.abs(i.amount), 0);

        // 1) Carrega TODAS as contas_receber em aberto/atrasado (limite alto) como base
        //    Isso garante que o usuário sempre veja recebíveis pendentes mesmo sem digitar nada.
        const receberMap = new Map<string, any>();
        const { data: openReceber } = await supabase
          .from("contas_receber")
          .select("id, fatura_id, valor, valor_recebido, data_vencimento, status, cliente_id")
          .in("status", ["aberto", "atrasado"])
          .order("data_vencimento", { ascending: false })
          .limit(500);
        for (const row of ((openReceber as any[]) || [])) receberMap.set(row.id, row);

        // 2) Se houver data na busca, garante carregamento por data
        if (queryDate) {
          const { data: byDate } = await supabase
            .from("contas_receber")
            .select("id, fatura_id, valor, valor_recebido, data_vencimento, status, cliente_id")
            .eq("data_vencimento", queryDate)
            .limit(100);
          for (const row of ((byDate as any[]) || [])) receberMap.set(row.id, row);
        }

        // 3) Carrega faturas dos recebíveis encontrados
        const allFatIds = Array.from(new Set(Array.from(receberMap.values()).map((r) => r.fatura_id).filter(Boolean)));
        const faturasMap = new Map<string, any>();
        if (allFatIds.length > 0) {
          const { data: fats } = await supabase
            .from("faturas_recebimento")
            .select("id, numero, cliente_id, valor_total, status, data_emissao, profiles:cliente_id(full_name, razao_social, documento)")
            .in("id", allFatIds);
          for (const f of ((fats as any[]) || [])) faturasMap.set(f.id, f);
        }

        // 4) Se busca por número de fatura, garante inclusão
        if (faturaNum) {
          const { data: fatByNum } = await supabase
            .from("faturas_recebimento")
            .select("id, numero, cliente_id, valor_total, status, data_emissao, profiles:cliente_id(full_name, razao_social, documento)")
            .eq("numero", faturaNum)
            .limit(20);
          const extraIds = ((fatByNum as any[]) || []).map((f) => { faturasMap.set(f.id, f); return f.id; });
          if (extraIds.length > 0) {
            const { data: extraCr } = await supabase
              .from("contas_receber")
              .select("id, fatura_id, valor, valor_recebido, data_vencimento, status, cliente_id")
              .in("fatura_id", extraIds);
            for (const row of ((extraCr as any[]) || [])) receberMap.set(row.id, row);
          }
        }

        // 5) Monta resultados
        const statusMap: any = { aberto: "pendente", atrasado: "atrasado", recebido: "pago", parcial: "parcial" };
        let results: any[] = [];
        for (const cr of receberMap.values()) {
          const fat = faturasMap.get(cr.fatura_id);
          const cli = fat?.profiles;
          const valor = Number(cr.valor) || 0;
          const recebido = Number(cr.valor_recebido) || 0;
          const saldo = Math.max(0, valor - recebido);
          results.push({
            id: `rec_${cr.id}`,
            is_receivable: true,
            conta_receber_id: cr.id,
            fatura_id: cr.fatura_id,
            fatura_numero: fat?.numero || null,
            descricao: fat ? `Fatura #${fat.numero}` : "Conta a Receber",
            favorecido_nome: cli?.razao_social || cli?.full_name || "Cliente",
            cliente_nome_lower: ((cli?.razao_social || cli?.full_name || "") as string).toLowerCase(),
            documento_fiscal_numero: fat?.numero ? String(fat.numero) : null,
            valor_total: valor,
            valor_pago: recebido,
            saldo,
            status: statusMap[cr.status] || cr.status,
            data_vencimento: cr.data_vencimento,
            data_emissao: fat?.data_emissao,
          });
        }

        // 6) Filtro client-side por texto (nome cliente / número fatura / data)
        if (safe.length >= 2) {
          const needle = safe.toLowerCase();
          results = results.filter((r) =>
            (r.cliente_nome_lower || "").includes(needle) ||
            (r.documento_fiscal_numero || "").includes(safe) ||
            (queryDate && r.data_vencimento === queryDate) ||
            (faturaNum && Number(r.fatura_numero) === faturaNum)
          );
        }

        // 7) Ordena: valor compatível primeiro, depois por data
        results.sort((a, b) => {
          const aMatch = Math.abs(Number(a.saldo) - targetValor) < 0.01 ? 0 : 1;
          const bMatch = Math.abs(Number(b.saldo) - targetValor) < 0.01 ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return String(b.data_vencimento || "").localeCompare(String(a.data_vencimento || ""));
        });

        if (!cancelled) {
          setLinkSearchResults(results.slice(0, 100));
          setLinkSearching(false);
        }
        return;
      }

      // ───────────── BUSCA DE DESPESAS (débitos) ─────────────
      const textSearch = supabase
        .from("expenses")
        .select("id, descricao, favorecido_nome, valor_total, valor_pago, status, data_vencimento, data_emissao, documento_fiscal_numero")
        .is("deleted_at", null)
        .or(
          `descricao.ilike.%${safe}%,favorecido_nome.ilike.%${safe}%,documento_fiscal_numero.ilike.%${safe}%`
        )
        .order("data_vencimento", { ascending: false })
        .limit(50);

      const dateExpensesSearch = queryDate
        ? supabase
            .from("expenses")
            .select("id, descricao, favorecido_nome, valor_total, valor_pago, status, data_vencimento, data_emissao, documento_fiscal_numero")
            .is("deleted_at", null)
            .eq("data_vencimento", queryDate)
            .limit(50)
        : Promise.resolve({ data: [] as any[] });

      const dateInstallmentsSearch = queryDate
        ? supabase
            .from("expense_installments")
            .select("id, expense_id, numero_parcela, total_parcelas, valor, data_vencimento, status")
            .eq("data_vencimento", queryDate)
            .limit(100)
        : Promise.resolve({ data: [] as any[] });

      const [{ data: expData }, { data: dateExpData }, { data: dateInstData }] = await Promise.all([
        textSearch,
        dateExpensesSearch,
        dateInstallmentsSearch,
      ]);

      const expensesMap = new Map<string, any>();
      for (const e of ((expData as any[]) || [])) expensesMap.set(e.id, e);
      for (const e of ((dateExpData as any[]) || [])) expensesMap.set(e.id, e);

      const missingExpIds = ((dateInstData as any[]) || [])
        .map((i: any) => i.expense_id)
        .filter((id: string) => !expensesMap.has(id));
      if (missingExpIds.length > 0) {
        const { data: extraExp } = await supabase
          .from("expenses")
          .select("id, descricao, favorecido_nome, valor_total, valor_pago, status, data_vencimento, data_emissao, documento_fiscal_numero")
          .is("deleted_at", null)
          .in("id", missingExpIds);
        for (const e of ((extraExp as any[]) || [])) expensesMap.set(e.id, e);
      }

      const expenses = Array.from(expensesMap.values());
      const expIds = expenses.map((e) => e.id);
      const linkedPayableExpenseIds = new Set<string>();
      if (expIds.length > 0) {
        const { data: paymentRows } = await supabase
          .from("expense_payments")
          .select("expense_id, valor, data_pagamento")
          .in("expense_id", expIds);
        for (const payment of (paymentRows || []) as any[]) {
          const paymentAmount = Number(payment.valor) || 0;
          if (Math.abs(paymentAmount - targetTotal) < 0.01) {
            linkedPayableExpenseIds.add(payment.expense_id);
          }
        }
      }

      let installments: any[] = [];
      if (expIds.length > 0) {
        const { data: instData } = await supabase
          .from("expense_installments")
          .select("id, expense_id, numero_parcela, total_parcelas, valor, data_vencimento, status")
          .in("expense_id", expIds)
          .order("numero_parcela");
        installments = instData || [];
      }
      const instByExp = new Map<string, any[]>();
      for (const inst of installments) {
        const arr = instByExp.get(inst.expense_id) || [];
        arr.push(inst);
        instByExp.set(inst.expense_id, arr);
      }

      const paidByInstallment = new Map<string, number>();
      const paidByExpense = new Map<string, number>();
      if (expIds.length > 0) {
        const { data: payData } = await supabase
          .from("expense_payments")
          .select("expense_id, installment_id, valor")
          .in("expense_id", expIds);
        for (const p of ((payData as any[]) || [])) {
          const v = Number(p.valor) || 0;
          if (p.installment_id) {
            paidByInstallment.set(p.installment_id, (paidByInstallment.get(p.installment_id) || 0) + v);
          } else {
            paidByExpense.set(p.expense_id, (paidByExpense.get(p.expense_id) || 0) + v);
          }
        }
      }

      const results: any[] = [];
      for (const exp of expenses) {
        const insts = instByExp.get(exp.id);
        if (insts && insts.length > 0) {
          const fallbackTotal = insts.length;
          for (const inst of insts) {
            const totalParcelas = inst.total_parcelas ?? fallbackTotal;
            const paidReal = paidByInstallment.get(inst.id) || 0;
            const saldo = Math.max(0, Number(inst.valor) - paidReal);
            if (saldo <= 0.005) continue;
            results.push({
              id: `inst_${inst.id}`,
              expense_id: exp.id,
              installment_id: inst.id,
              is_installment: true,
              numero_parcela: inst.numero_parcela,
              total_parcelas: totalParcelas,
              descricao: `${exp.descricao} (parcela ${inst.numero_parcela}/${totalParcelas})`,
              favorecido_nome: exp.favorecido_nome,
              documento_fiscal_numero: exp.documento_fiscal_numero,
              valor_total: Number(inst.valor),
              valor_pago: paidReal,
              status: exp.status === "atrasado" ? "atrasado" : "pendente",
              data_vencimento: inst.data_vencimento,
              data_emissao: exp.data_emissao,
            });
          }
        } else {
          const paidReal = paidByExpense.get(exp.id);
          const valorPago = paidReal != null ? paidReal : Number(exp.valor_pago || 0);
          const saldo = Math.max(0, Number(exp.valor_total || 0) - valorPago);
          if (saldo <= 0.005) continue;
          results.push({
            ...exp,
            valor_pago: valorPago,
            is_installment: false,
          });
        }
      }

      results.sort((a, b) =>
        String(b.data_vencimento || "").localeCompare(String(a.data_vencimento || ""))
      );

      if (!cancelled) {
        setLinkSearchResults(results);
        setLinkSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [linkSearchText, linkAccountDialogOpen, linkTargetItemIds, items]);

  const handleLinkConfirm = useCallback(async () => {
    if (!linkSelectedAccount || !reconciliationId || linkTargetItemIds.length === 0) return;
    setLinkSubmitting(true);
    try {
      const targetItems = items.filter((i) => linkTargetItemIds.includes(i.id));
      const totalSel = targetItems.reduce((s, i) => s + Math.abs(i.amount), 0);
      const minDate = targetItems.map((i) => i.date).sort()[0];

      const isReceivable = !!linkSelectedAccount.is_receivable;

      if (isReceivable) {
        const contaReceberId = linkSelectedAccount.conta_receber_id;
        const valorTotalConta = Number(linkSelectedAccount.valor_total || 0);
        const jaRecebido = Number(linkSelectedAccount.valor_pago || 0);
        const saldo = Math.max(0, valorTotalConta - jaRecebido);
        // Sempre registra o valor real do extrato (não o valor do título),
        // para que fatura, recebimento e fluxo de caixa fiquem idênticos.
        const valorPag = +totalSel.toFixed(2);
        const dif = +(valorPag - saldo).toFixed(2);
        if (linkSelectedAccount.status !== "pago" && valorPag > 0) {
          const { error: rpErr } = await supabase.from("receivable_payments" as any).insert({
            conta_receber_id: contaReceberId,
            valor: valorPag,
            forma_recebimento: "transferencia",
            data_recebimento: minDate,
            observacoes:
              `Recebimento via conciliação bancária (${targetItems.length} lançamento(s) OFX)` +
              (dif !== 0 ? ` — ${dif > 0 ? "acréscimo" : "desconto"} de ${formatCurrency(Math.abs(dif))} em relação ao título` : ""),
            created_by: user?.id,
          });
          if (rpErr) throw rpErr;
        }

        const linkedMap = new Map<string, string | null>();
        for (const it of targetItems) {
          const movIdToLink = await findCreatedMovId({
            amount: Math.abs(it.amount),
            tipo: it.tipo,
            referenceDate: it.date,
          });
          // Sem movimentação localizada não há o que conciliar: nunca marcar
          // como "conciliado" com matched_movimentacao_id nulo.
          if (!movIdToLink) {
            throw new Error(`Não foi possível localizar a movimentação de ${formatCurrency(Math.abs(it.amount))}. A conciliação foi interrompida.`);
          }
          linkedMap.set(it.id, movIdToLink);
          const updateFilter = it.dbItemId
            ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("id", it.dbItemId)
            : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("reconciliation_id", reconciliationId).eq("fitid", it.fitid || "").eq("status", "pendente");
          const { error: linkUpdateError } = await updateFilter;
          if (linkUpdateError) throw linkUpdateError;
        }
        const movDetails = await fetchMovDetails(Array.from(linkedMap.values()).filter(Boolean) as string[]);
        setItems((prev) =>
          prev.map((i) => {
            if (!linkTargetItemIds.includes(i.id)) return i;
            const mid = linkedMap.get(i.id) || null;
            const d = mid ? movDetails.get(mid) : null;
            return {
              ...i,
              status: "conciliado" as const,
              matchedMovId: mid,
              matchedMovDesc: d?.descricao ?? i.matchedMovDesc,
              matchedMovDate: d?.data_movimentacao ?? i.matchedMovDate,
              matchedMovValor: d?.valor ?? i.matchedMovValor,
              matchedMovOrigem: d?.origem ?? i.matchedMovOrigem,
            };
          })
        );

        setSelectedIds((prev) => {
          const next = new Set(prev);
          linkTargetItemIds.forEach((id) => next.delete(id));
          return next;
        });
        toast.success(
          linkSelectedAccount.status === "pago"
            ? `${targetItems.length} lançamento(s) vinculado(s) à conta recebida`
            : `Recebimento registrado e ${targetItems.length} lançamento(s) conciliado(s)`
        );
        setLinkAccountDialogOpen(false);
        setLinkSelectedAccount(null);
        setLinkTargetItemIds([]);
        setTimeout(updateReconciliationCount, 500);
        return;
      }

      const isInstallment = !!linkSelectedAccount.is_installment;
      const expenseId = isInstallment ? linkSelectedAccount.expense_id : linkSelectedAccount.id;
      const isPaid = linkSelectedAccount.status === "pago";

      // If account/parcela is not fully paid yet, register a payment for the sum
      if (!isPaid) {
        const { error: payInsErr } = await supabase.from("expense_payments" as any).insert({
          expense_id: expenseId,
          valor: totalSel,
          forma_pagamento: "transferencia",
          data_pagamento: minDate,
          observacoes: isInstallment
            ? `Quitação parcela ${linkSelectedAccount.numero_parcela}/${linkSelectedAccount.total_parcelas} via conciliação bancária (${targetItems.length} lançamento(s) OFX)`
            : `Quitação via conciliação bancária (${targetItems.length} lançamento(s) OFX)`,
          created_by: user?.id,
          juros: 0,
          installment_id: isInstallment ? (linkSelectedAccount.installment_id ?? null) : null,
        } as any);
        // Sem pagamento gravado não existe movimentação: não marcar como conciliado.
        if (payInsErr) throw payInsErr;


        if (isInstallment) {
          const { error: installmentError } = await supabase
            .from("expense_installments")
            .update({ status: "pago" } as any)
            .eq("id", linkSelectedAccount.installment_id);
          if (installmentError) throw installmentError;

          const { data: allInst } = await supabase
            .from("expense_installments")
            .select("valor, status")
            .eq("expense_id", expenseId);

          const totalPagoNow = ((allInst as any) || [])
            .filter((i: any) => i.status === "pago")
            .reduce((s: number, i: any) => s + Number(i.valor), 0);
          const allPaid = ((allInst as any) || []).every((i: any) => i.status === "pago");

          const { error: expenseUpdateError } = await supabase.from("expenses").update({
            valor_pago: totalPagoNow,
            status: allPaid ? "pago" : "parcial",
            forma_pagamento: "transferencia",
            data_pagamento: minDate,
          } as any).eq("id", expenseId);
          if (expenseUpdateError) throw expenseUpdateError;
        } else {
          const { data: expData, error: expenseReadError } = await supabase
            .from("expenses")
            .select("valor_total, valor_pago")
            .eq("id", expenseId)
            .single();
          if (expenseReadError) throw expenseReadError;
          const novoValorPago = Number(expData?.valor_pago || 0) + totalSel;
          const valorTotal = Number(expData?.valor_total || 0);
          const novoStatus = novoValorPago >= valorTotal ? "pago" : "parcial";
          const { error: expenseUpdateError } = await supabase.from("expenses").update({
            valor_pago: novoValorPago,
            status: novoStatus,
            forma_pagamento: "transferencia",
            data_pagamento: minDate,
          } as any).eq("id", expenseId);
          if (expenseUpdateError) throw expenseUpdateError;
        }
      }

      const linkedMap = new Map<string, string | null>();
      for (const it of targetItems) {
        const movIdToLink = await findCreatedMovId({
          expenseId: expenseId,
          amount: Math.abs(it.amount),
          tipo: it.tipo,
          referenceDate: it.date,
        });
        if (!movIdToLink) {
          throw new Error(`Não foi possível localizar a movimentação de ${formatCurrency(Math.abs(it.amount))}. O lançamento continuará pendente.`);
        }
        linkedMap.set(it.id, movIdToLink);
        const updateFilter = it.dbItemId
          ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("id", it.dbItemId)
          : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("reconciliation_id", reconciliationId).eq("fitid", it.fitid || "").eq("status", "pendente");
        const { error: linkUpdateError } = await updateFilter;
        if (linkUpdateError) throw linkUpdateError;
      }

      const movDetails = await fetchMovDetails(Array.from(linkedMap.values()).filter(Boolean) as string[]);
      setItems((prev) =>
        prev.map((i) => {
          if (!linkTargetItemIds.includes(i.id)) return i;
          const mid = linkedMap.get(i.id) || null;
          const d = mid ? movDetails.get(mid) : null;
          return {
            ...i,
            status: "conciliado" as const,
            matchedMovId: mid,
            matchedMovDesc: d?.descricao ?? i.matchedMovDesc,
            matchedMovDate: d?.data_movimentacao ?? i.matchedMovDate,
            matchedMovValor: d?.valor ?? i.matchedMovValor,
            matchedMovOrigem: d?.origem ?? i.matchedMovOrigem,
          };
        })
      );

      setSelectedIds((prev) => {
        const next = new Set(prev);
        linkTargetItemIds.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(
        isPaid
          ? `${targetItems.length} lançamento(s) vinculado(s) à conta paga`
          : isInstallment
            ? `Parcela ${linkSelectedAccount.numero_parcela}/${linkSelectedAccount.total_parcelas} quitada e ${targetItems.length} lançamento(s) conciliado(s)`
            : `Conta quitada e ${targetItems.length} lançamento(s) conciliado(s)`
      );
      setLinkAccountDialogOpen(false);
      setLinkSelectedAccount(null);
      setLinkTargetItemIds([]);
      setTimeout(updateReconciliationCount, 500);
    } catch (err: any) {
      toast.error("Erro ao vincular: " + (err.message || ""));
    } finally {
      setLinkSubmitting(false);
    }
  }, [linkSelectedAccount, linkTargetItemIds, items, reconciliationId, user, updateReconciliationCount, findCreatedMovId]);

  const totals = useMemo(() => {
    const total = items.length;
    const conciliados = items.filter((i) => i.status === "conciliado").length;
    const pendentes = items.filter((i) => i.status === "pendente").length;
    return { total, conciliados, pendentes };
  }, [items]);

  // Visão inversa: TODAS as movimentações efetivadas no Fluxo de Caixa dentro do
  // período do OFX (independentemente da origem — manual, pagamento de contas,
  // recebimento, etc.), pois todo registro em movimentacoes_bancarias já representa
  // dinheiro efetivamente movimentado. Se algo está no fluxo mas não aparece no
  // extrato bancário real, é um problema que o usuário precisa investigar.
  const missingFromOfx = useMemo(() => {
    if (!ofxRange || movsInPeriod.length === 0) return [] as typeof movsInPeriod;
    const linkedIds = new Set(items.map((i) => i.matchedMovId).filter(Boolean) as string[]);
    // Cada linha do extrato só pode "cobrir" UMA movimentação do sistema.
    // Linhas já conciliadas com outra movimentação ficam indisponíveis, de modo que
    // o segundo candidato de um match duplo passe a aparecer aqui como divergência.
    const consumed = new Set<string>(
      items.filter((i) => i.matchedMovId).map((i) => i.id)
    );
    const candidates = movsInPeriod.filter((m) => !linkedIds.has(m.id));
    const missing: typeof movsInPeriod = [];
    for (const m of candidates) {
      const absVal = Math.abs(m.valor);
      const hit = items.find((i) =>
        !consumed.has(i.id) &&
        i.tipo === m.tipo &&
        Math.abs(Math.abs(i.amount) - absVal) < 0.01 &&
        daysDiff(i.date, m.data_movimentacao) <= 5
      );
      if (hit) consumed.add(hit.id);
      else missing.push(m);
    }
    return missing;
  }, [items, movsInPeriod, ofxRange]);


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

  // Mantém a seleção sempre coerente com as linhas visíveis: itens ocultos por
  // filtro/busca ou removidos da lista deixam de contar em "N sel.".
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filteredItems.map((i) => i.id));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visible.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [filteredItems]);



  const runImport = useCallback(async (parsed: { bankName: string; accountId: string; transactions: OfxTransaction[] }, sourceName: string) => {
      if (parsed.transactions.length === 0) {
        toast.error("Nenhuma transação encontrada");
        return;
      }


      // Save reconciliation header
      const { data: rec, error: recErr } = await supabase
        .from("bank_reconciliations")
        .insert({
          file_name: sourceName,
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

      const [{ data: existingMovs }, { data: pendingExpenses2 }, { data: pendingInstallments2 }, { data: alreadyMatched2 }, { data: pendingReceivables2 }] = await Promise.all([
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
        // Movimentações já vinculadas a outras conciliações, incluindo a tabela
        // de múltiplos vínculos usada por operações rateadas.
        supabase
          .from("bank_reconciliation_items")
          .select("matched_movimentacao_id")
          .not("matched_movimentacao_id", "is", null),
        supabase
          .from("bank_reconciliation_item_links")
          .select("movimentacao_id"),
        supabase
          .from("contas_receber")
          .select("id, valor, valor_recebido, data_vencimento, status, fatura_id, faturas_recebimento(numero, cliente_id, profiles:cliente_id(full_name, razao_social))")
          .in("status", ["aberto", "atrasado"]),
      ]);

      const alreadyMatchedIds2 = new Set(
        (alreadyMatched2 || []).map((r: any) => r.matched_movimentacao_id).filter(Boolean)
      );
      const movs = ((existingMovs || []) as MatchCandidate[]).filter((m) => !alreadyMatchedIds2.has(m.id));
      const linkedPayableExpenseIds = new Set<string>();
      const paymentCandidates = ((pendingExpenses2 || []) as any[]).map((e) => e.id).filter(Boolean);
      if (paymentCandidates.length > 0) {
        const { data: paymentsForMatching } = await supabase
          .from("expense_payments")
          .select("expense_id, valor")
          .in("expense_id", paymentCandidates);
        for (const payment of (paymentsForMatching || []) as any[]) {
          if (Number(payment.valor) > 0) linkedPayableExpenseIds.add(payment.expense_id);
        }
      }
      const instRows2 = (pendingInstallments2 || []) as any[];
      const expRows2 = (pendingExpenses2 || []) as any[];
      const expWithInst2 = new Set(instRows2.map((i: any) => i.expense_id));
      const parentIds2 = Array.from(
        new Set(instRows2.map((i: any) => i.expense_id).filter((id: string) => id && !expRows2.some((e: any) => e.id === id))),
      );
      const parentMap2 = new Map<string, any>();
      if (parentIds2.length > 0) {
        const { data: parents2 } = await supabase
          .from("expenses")
          .select("id, descricao, favorecido_nome, deleted_at")
          .in("id", parentIds2);
        (parents2 || []).forEach((p: any) => parentMap2.set(p.id, p));
      }
      const payables: { id: string; expenseId: string; amount: number; description: string; fornecedor: string | null; referenceDate: string | null; isInstallment: boolean; installmentId?: string; numeroParcela?: number }[] = [];
      for (const inst of instRows2) {
        const exp = expRows2.find((e: any) => e.id === inst.expense_id) || parentMap2.get(inst.expense_id) || null;
        if (exp?.deleted_at) continue;
        const installmentPaid = await supabase
          .from("expense_payments")
          .select("valor")
          .eq("installment_id", inst.id);
        const paidAmount = ((installmentPaid.data || []) as any[]).reduce((sum, payment) => sum + (Number(payment.valor) || 0), 0);
        if (Number(inst.valor) - paidAmount <= 0.005) continue;

        payables.push({
          id: `inst_${inst.id}`,
          expenseId: inst.expense_id,
          amount: Number(inst.valor),
          description: exp?.descricao ? `${exp.descricao} (parcela ${inst.numero_parcela})` : `Parcela ${inst.numero_parcela}`,
          fornecedor: exp?.favorecido_nome || null,
          referenceDate: inst.data_vencimento || null,
          isInstallment: true,
          installmentId: inst.id,
          numeroParcela: inst.numero_parcela,
        });
      }
      for (const exp of expRows2) {
        if (expWithInst2.has(exp.id)) continue;
        if (linkedPayableExpenseIds.has(exp.id)) continue;
        const saldo = Number(exp.valor_total) - Number(exp.valor_pago || 0);
        if (saldo <= 0.005) continue;
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

      const recRows2 = (pendingReceivables2 || []) as any[];
      const receivables: { id: string; contaReceberId: string; amount: number; description: string; cliente: string | null; referenceDate: string | null; faturaNumero: number | null }[] = [];
      for (const r of recRows2) {
        const saldo = Number(r.valor) - Number(r.valor_recebido || 0);
        if (saldo <= 0.005) continue;
        const fat = r.faturas_recebimento;
        const cli = fat?.profiles;
        const cliNome = cli?.razao_social || cli?.full_name || null;
        receivables.push({
          id: `rec_${r.id}`,
          contaReceberId: r.id,
          amount: saldo,
          description: fat?.numero ? `Fatura #${fat.numero}` : "Conta a Receber",
          cliente: cliNome,
          referenceDate: r.data_vencimento || null,
          faturaNumero: fat?.numero || null,
        });
      }

      const usedMovIds = new Set<string>();
      const usedPayableIds = new Set<string>();
      const usedReceivableIds = new Set<string>();
      const ofxItems: OfxItem[] = parsed.transactions.map((tx) => {
        const absVal = Math.abs(tx.amount);
        const txDate = tx.date;
        let matchedMov: typeof movs[0] | undefined;
        let matchedMovPrecision: MatchPrecision | null = null;
        let payableMatch: typeof payables[0] | null = null;
        let matchedPayablePrecision: MatchPrecision | null = null;
        let receivableMatch: typeof receivables[0] | null = null;
        let matchedReceivablePrecision: MatchPrecision | null = null;

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

          // A movimentação de pagamento é a fonte principal. Só oferece a conta
          // em aberto quando ainda existe saldo e não há movimento equivalente;
          // assim a mesma despesa não aparece como "paga" e "a pagar" ao mesmo tempo.
          let pCandidates = matchedMov
            ? []
            : payables.filter(
                (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01 && p.referenceDate && daysDiff(txDate, p.referenceDate) <= 5,
              );
          if (!matchedMov && pCandidates.length === 0) {
            pCandidates = payables.filter(
              (p) => !usedPayableIds.has(p.id) && Math.abs(p.amount - absVal) < 0.01,
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

          // E também em contas a receber pendentes — valor + data referência ±10 dias
          let rCandidates = receivables.filter(
            (r) => !usedReceivableIds.has(r.id) && Math.abs(r.amount - absVal) < 0.01 && r.referenceDate && daysDiff(txDate, r.referenceDate) <= 10
          );
          if (rCandidates.length === 0) {
            rCandidates = receivables.filter(
              (r) => !usedReceivableIds.has(r.id) && Math.abs(r.amount - absVal) < 0.01
            );
          }
          const rExact = rCandidates.find((r) => r.referenceDate === txDate);
          const rm = rExact || (rCandidates.length > 0 ? (rCandidates[0].referenceDate ? rCandidates.sort((a, b) => daysDiff(txDate, a.referenceDate || "9999-12-31") - daysDiff(txDate, b.referenceDate || "9999-12-31"))[0] : rCandidates[0]) : undefined);
          if (rm) {
            receivableMatch = rm;
            usedReceivableIds.add(rm.id);
            matchedReceivablePrecision = rm.referenceDate && rm.referenceDate === txDate ? "exato" : "proximo";
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
          matchedMovFavorecido: null,
          matchedPayableId: payableMatch?.id || null,
          matchedPayableDesc: payableMatch?.description || null,
          matchedPayableFornecedor: payableMatch?.fornecedor || null,
          matchedPayableDue: payableMatch?.referenceDate || null,
          matchedPayableValor: payableMatch ? payableMatch.amount : null,
          matchedPayablePrecision,
          matchedPayableExpenseId: payableMatch?.expenseId || null,
          matchedPayableIsInstallment: payableMatch?.isInstallment || false,
          matchedPayableInstallmentId: payableMatch?.installmentId || null,
          matchedReceivableId: receivableMatch?.id || null,
          matchedReceivableDesc: receivableMatch?.description || null,
          matchedReceivableCliente: receivableMatch?.cliente || null,
          matchedReceivableDue: receivableMatch?.referenceDate || null,
          matchedReceivableValor: receivableMatch ? receivableMatch.amount : null,
          matchedReceivablePrecision,
          matchedReceivableContaId: receivableMatch?.contaReceberId || null,
          matchedReceivableFaturaNumero: receivableMatch?.faturaNumero || null,
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
          details: item.details ?? null,
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

      // Guarda período do OFX e movimentações do fluxo nesse período (para visão inversa)
      const ofxMin = dates[0];
      const ofxMax = dates[dates.length - 1];
      const movsInside = (existingMovs || [])
        .filter((m: any) => m.data_movimentacao >= ofxMin && m.data_movimentacao <= ofxMax)
        .map((m: any) => ({
          id: m.id, valor: Number(m.valor), data_movimentacao: m.data_movimentacao,
          tipo: m.tipo as "entrada" | "saida", descricao: m.descricao, origem: m.origem, favorecido: null,
        }));
      setOfxRange({ min: ofxMin, max: ofxMax });
      setMovsInPeriod(movsInside);

      setReconciliationId(rec.id);
      setItems(ofxItems);
      setFileName(sourceName);
      loadHistory();
      toast.success(`${ofxItems.length} transações importadas`);
  }, [user, loadHistory]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      let text: string;
      const rawBytes = await file.arrayBuffer();
      const latin1Text = new TextDecoder("iso-8859-1").decode(rawBytes);
      const charsetMatch = latin1Text.match(/CHARSET:\s*(\d+|[A-Za-z0-9_-]+)/i);
      const charset = charsetMatch?.[1];
      if (charset === "UTF-8" || charset === "65001") {
        text = new TextDecoder("utf-8").decode(rawBytes);
      } else {
        text = latin1Text;
      }
      await runImport(parseOfx(text), file.name);
    } catch (err: any) {
      toast.error("Erro ao importar OFX: " + (err.message || ""));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }, [runImport]);

  const [syncing, setSyncing] = useState(false);
  // -3 = mês atual, -2 = período manual, -1 = somente ontem, 0 = somente hoje, >0 = últimos N dias
  const [syncDays, setSyncDays] = useState(90);
  const [syncFrom, setSyncFrom] = useState("");
  const [syncTo, setSyncTo] = useState("");
  const runOpenFinanceSync = useCallback(async () => {
    const hoje = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const ontem = new Date(hoje.getTime() - 86400000);
    let from: string;
    let to: string;
    if (syncDays === -2) {
      if (!syncFrom || !syncTo) {
        toast.error("Informe a data inicial e final do período");
        return;
      }
      from = syncFrom;
      to = syncTo;
    } else if (syncDays === -3) {
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      from = iso(inicioMes);
      to = iso(hoje);
    } else if (syncDays === -1) {
      from = iso(ontem);
      to = iso(ontem);
    } else if (syncDays === 0) {
      from = iso(hoje);
      to = iso(hoje);
    } else {
      from = iso(new Date(hoje.getTime() - syncDays * 86400000));
      to = iso(hoje);
    }
    setSyncing(true);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("open-finance-sync", {
        body: { from, to },
      });
      if (error) {
        let detail = error.message || "";
        const ctx: any = (error as any).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            const j = await ctx.json();
            if (j?.error) detail = j.error;
          } catch { /* ignora */ }
        }
        throw new Error(detail);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const txs = ((data as any)?.transactions || []) as Array<{ externalId: string; data: string; descricao: string; valor: number; tipo: "entrada" | "saida"; detalhes?: Record<string, string | number | null> }>;
      const duplicados = Number((data as any)?.duplicados || 0);
      if (txs.length === 0) {
        toast.info(duplicados > 0 ? `Nenhum lançamento inédito (${duplicados} já registrados)` : "Nenhuma transação retornada pelo banco");
        return;
      }
      const parsed = {
        bankName: String((data as any)?.bankName || "Open Finance"),
        accountId: String((data as any)?.accountLabel || ""),
        transactions: txs.map((t) => ({
          fitid: t.externalId,
          date: t.data,
          amount: t.tipo === "saida" ? -Math.abs(t.valor) : Math.abs(t.valor),
          description: t.descricao,
          tipo: t.tipo,
          details: t.detalhes ?? null,
        })) as OfxTransaction[],
      };
      await runImport(parsed, `Open Finance · ${parsed.bankName} · ${formatDateBR(new Date())}`);
      if (duplicados > 0) toast.info(`${duplicados} lançamento(s) já existentes foram ignorados`);
    } catch (err: any) {
      toast.error("Erro ao sincronizar Open Finance: " + (err.message || ""), { duration: 12000 });

    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, [runImport, syncDays, syncFrom, syncTo]);

  const handleOpenFinanceSync = useCallback(async () => {
    const ok = await confirm({
      title: "Sincronizar Open Finance",
      description: "Será realizada a busca de movimentações bancárias via Open Finance para o período selecionado. Deseja continuar?",
      confirmLabel: "Sincronizar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    await runOpenFinanceSync();
  }, [confirm, runOpenFinanceSync]);

  const syncDaysSelect = (
    <div className="flex items-center gap-1.5">
      <select
        value={syncDays}
        onChange={(e) => {
          const v = Number(e.target.value);
          setSyncDays(v);
          if (v === -2 && !syncFrom && !syncTo) {
            const hoje = new Date();
            const iso = (d: Date) => d.toISOString().slice(0, 10);
            setSyncFrom(iso(new Date(hoje.getTime() - 7 * 86400000)));
            setSyncTo(iso(hoje));
          }
        }}
        disabled={loading || syncing}
        title="Período buscado no Open Finance"
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value={0}>Somente hoje</option>
        <option value={-1}>Somente ontem</option>
        <option value={-3}>Mês atual</option>
        <option value={7}>Últimos 7 dias</option>
        <option value={30}>Últimos 30 dias</option>
        <option value={60}>Últimos 60 dias</option>
        <option value={90}>Últimos 90 dias</option>
        <option value={180}>Últimos 180 dias</option>
        <option value={365}>Últimos 365 dias</option>
        <option value={-2}>Período definido...</option>
      </select>
      {syncDays === -2 && (
        <>
          <Input
            type="date"
            aria-label="Data inicial"
            className="h-8 w-[130px] text-xs"
            value={syncFrom}
            disabled={loading || syncing}
            onChange={(e) => setSyncFrom(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">a</span>
          <Input
            type="date"
            aria-label="Data final"
            className="h-8 w-[130px] text-xs"
            value={syncTo}
            disabled={loading || syncing}
            onChange={(e) => setSyncTo(e.target.value)}
          />
        </>
      )}
    </div>
  );



  const handleConfirmMatch = useCallback(async () => {
    if (!confirmItem || !confirmMatch || !reconciliationId) return;

    try {
      let createdOriginId: string | null = null;
      if (confirmMatch.isPayable && confirmMatch.expenseId) {
        const dataPagISO = confirmItem.date;
        const valorPag = confirmMatch.valor;

        // Insert expense_payment record
        const { data: payment, error: payInsErr } = await supabase.from("expense_payments" as any).insert({
          expense_id: confirmMatch.expenseId,
          valor: valorPag,
          forma_pagamento: "transferencia",
          data_pagamento: dataPagISO,
          observacoes: "Pagamento via conciliação bancária (OFX)",
          created_by: user?.id,
          juros: 0,
          installment_id: confirmMatch.isInstallment ? (confirmMatch.installmentId ?? null) : null,
        } as any).select("id").single();
        // Sem pagamento gravado não existe movimentação: aborta antes de marcar conciliado.
        if (payInsErr) throw payInsErr;
        createdOriginId = (payment as any)?.id || null;
        if (!createdOriginId) throw new Error("Pagamento criado sem identificador");


        if (confirmMatch.isInstallment && confirmMatch.installmentId) {
          await supabase.from("expense_installments").update({ status: "pago" } as any).eq("id", confirmMatch.installmentId);
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
      } else if (confirmMatch.isReceivable && confirmMatch.contaReceberId) {
        // Registrar recebimento na conta a receber com o valor REAL do extrato
        const valorExtrato = +Math.abs(confirmItem.amount).toFixed(2);
        const difR = +(valorExtrato - Number(confirmMatch.valor || 0)).toFixed(2);
        const { data: receipt, error: rpErr } = await supabase.from("receivable_payments" as any).insert({
          conta_receber_id: confirmMatch.contaReceberId,
          valor: valorExtrato,
          forma_recebimento: "transferencia",
          data_recebimento: confirmItem.date,
          observacoes:
            "Recebimento via conciliação bancária (OFX)" +
            (difR !== 0 ? ` — ${difR > 0 ? "acréscimo" : "desconto"} de ${formatCurrency(Math.abs(difR))} em relação ao título` : ""),
          created_by: user?.id,
        }).select("id").single();
        if (rpErr) throw rpErr;
        createdOriginId = (receipt as any)?.id || null;
        if (!createdOriginId) throw new Error("Recebimento criado sem identificador");

      }

      // Resolver vínculo: buscar a movimentação criada pelo trigger
      let movIdToLink: string | null = (confirmMatch.isPayable || confirmMatch.isReceivable) ? null : confirmMatch.id;
      if (createdOriginId) {
        const { data: exactMovement, error: exactMovementError } = await supabase
          .from("movimentacoes_bancarias")
          .select("id")
          .eq("origem_id", createdOriginId)
          .maybeSingle();
        if (exactMovementError) throw exactMovementError;
        movIdToLink = exactMovement?.id || null;
      }
      if (!movIdToLink && confirmMatch.isPayable && confirmMatch.expenseId) {
        movIdToLink = await findCreatedMovId({
          expenseId: confirmMatch.expenseId,
          amount: Math.abs(confirmItem.amount),
          tipo: confirmItem.tipo,
          referenceDate: confirmItem.date,
        });
      } else if (!movIdToLink && confirmMatch.isReceivable && confirmMatch.contaReceberId) {
        movIdToLink = await findCreatedMovId({
          amount: Math.abs(confirmItem.amount),
          tipo: confirmItem.tipo,
          referenceDate: confirmItem.date,
        });
      }
      if (!movIdToLink) {
        throw new Error("A baixa foi registrada, mas a movimentação bancária não foi localizada. O item não foi conciliado.");
      }

      // Sem movimentação localizada não há o que conciliar: nunca marcar
      // como "conciliado" com matched_movimentacao_id nulo.
      if (!movIdToLink) {
        throw new Error(`Não foi possível localizar a movimentação de ${formatCurrency(Math.abs(confirmItem.amount))}. A conciliação foi interrompida.`);
      }
      const updateFilter = confirmItem.dbItemId
        ? supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("id", confirmItem.dbItemId)
        : supabase.from("bank_reconciliation_items").update({ status: "conciliado", matched_movimentacao_id: movIdToLink }).eq("reconciliation_id", reconciliationId).eq("fitid", confirmItem.fitid || "").eq("status", "pendente");
      const { error: updateError } = await updateFilter;
      if (updateError) throw updateError;

      const cmDetails = movIdToLink ? (await fetchMovDetails([movIdToLink])).get(movIdToLink) : null;
      setItems((prev) =>
        prev.map((i) =>
          i.id === confirmItem.id
            ? {
                ...i,
                status: "conciliado" as const,
                matchedMovId: movIdToLink,
                matchedMovDesc: cmDetails?.descricao ?? confirmMatch.descricao ?? i.matchedMovDesc,
                matchedMovDate: cmDetails?.data_movimentacao ?? confirmItem.date ?? i.matchedMovDate,
                matchedMovValor: cmDetails?.valor ?? Math.abs(confirmItem.amount),
                matchedMovOrigem: cmDetails?.origem ?? i.matchedMovOrigem,
              }
            : i
        )
      );

      toast.success(
        confirmMatch.isPayable
          ? "Conta paga e conciliada com sucesso"
          : confirmMatch.isReceivable
            ? "Recebimento registrado e conciliado"
            : "Transação conciliada com sucesso"
      );
      setTimeout(updateReconciliationCount, 500);
      // Re-resume garante que o item efetivado não reapareça em pendentes
      const rec = history.find((h) => h.id === reconciliationId);
      if (rec) await resumeReconciliation(rec);
    } catch (err: any) {
      toast.error("Erro ao conciliar: " + (err.message || ""));
    }
    setConfirmItem(null);
    setConfirmMatch(null);
  }, [confirmItem, confirmMatch, reconciliationId, updateReconciliationCount, user, findCreatedMovId, history, resumeReconciliation]);

  // Estrito: conciliação via match do FLUXO DE CAIXA (movimento existente).
  // Não faz fallback para payable/receivable — esses têm handlers próprios
  // (openConfirmPayable) para que os botões fiquem independentes quando o mesmo
  // lançamento OFX possui múltiplos matches (fluxo + contas a pagar/receber).
  const openConfirm = useCallback((item: OfxItem) => {
    if (!item.matchedMovId) return;
    setConfirmItem(item);
    setConfirmMatch({
      id: item.matchedMovId,
      descricao: item.matchedMovDesc,
      data_movimentacao: item.matchedMovDate || item.date,
      valor: Math.abs(item.amount),
      origem: item.matchedMovOrigem || "",
    });
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
    } else if (item.matchedReceivableId) {
      setConfirmItem(item);
      setConfirmMatch({
        id: item.matchedReceivableId,
        descricao: item.matchedReceivableDesc,
        data_movimentacao: item.matchedReceivableDue || item.date,
        valor: item.matchedReceivableValor || Math.abs(item.amount),
        origem: "contas_receber_pendente",
        isReceivable: true,
        contaReceberId: item.matchedReceivableContaId || undefined,
        receivableDueDate: item.matchedReceivableDue || undefined,
        cliente: item.matchedReceivableCliente || null,
        faturaNumero: item.matchedReceivableFaturaNumero || null,
      });
    }
  }, []);

  const handleNewExpense = async (item: OfxItem) => {
    setActiveItem(item);
    const local = resolveCounterpartyProfile(item);
    setExpenseFavorecido(local);
    setExpenseDialogOpen(true);
    // Sempre confirma no cadastro (banco) quando ainda não há vínculo
    if (!local?.favorecidoId) {
      const found = await searchProfileInCadastro(item, local?.favorecidoNome);
      if (found) setExpenseFavorecido(found);
    }
  };


  /** Busca no cadastro (banco) pelo documento e, em seguida, pelo nome do favorecido. */
  const searchProfileInCadastro = useCallback(
    async (item: OfxItem, nome?: string | null) => {
      const fromDesc = counterpartyFromDescription(item.description);
      const details = (item as any).details as Record<string, any> | null | undefined;
      const documento = fromDesc.documento || (details?.documentoContraparte as string) || null;
      const digits = documento ? documento.replace(/\D/g, "") : "";

      // 1) Por CNPJ (cadastro guarda apenas dígitos)
      if (digits.length === 14) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, cnpj, razao_social, nome_fantasia, full_name")
          .eq("cnpj", digits)
          .limit(1);
        if (error) console.error("Busca de favorecido por CNPJ falhou", error);
        const p = (data || [])[0] as any;
        if (p) return { favorecidoId: p.id as string, favorecidoNome: personDisplayName(p) };
      }

      // 2) Por nome (razão social, nome fantasia ou nome)
      const termo = (nome || fromDesc.nome || (details?.contraparte as string) || (details?.estabelecimento as string) || "").trim();
      if (termo.length >= 3) {
        const clean = termo.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
        const like = `%${clean}%`;
        const { data, error } = await supabase
          .from("profiles")
          .select("id, cnpj, razao_social, nome_fantasia, full_name")
          .or(`razao_social.ilike.${like},full_name.ilike.${like},nome_fantasia.ilike.${like}`)
          .limit(10);
        if (error) console.error("Busca de favorecido por nome falhou", error);
        let rows = (data || []) as any[];

        // Fallback: tenta sem sufixos societários (LTDA, S.A., ME, EIRELI...)
        if (rows.length === 0) {
          const base = clean.replace(/\b(ltda|me|epp|eireli|s\.?\/?a\.?|sa|cia|comercio|com|industria|ind)\b\.?/gi, " ").replace(/\s+/g, " ").trim();
          if (base.length >= 4 && base.toLowerCase() !== clean.toLowerCase()) {
            const like2 = `%${base}%`;
            const { data: d2 } = await supabase
              .from("profiles")
              .select("id, cnpj, razao_social, nome_fantasia, full_name")
              .or(`razao_social.ilike.${like2},full_name.ilike.${like2},nome_fantasia.ilike.${like2}`)
              .limit(10);
            rows = (d2 || []) as any[];
          }
        }

        // Prefere match exato normalizado; senão, único resultado; senão, o único com CNPJ
        const exact = rows.find((p) =>
          [p.razao_social, p.full_name, p.nome_fantasia].some((n) => normalizeName(n) === normalizeName(clean)),
        );
        if (exact) return { favorecidoId: exact.id as string, favorecidoNome: personDisplayName(exact) };
        if (rows.length === 1) {
          return { favorecidoId: rows[0].id as string, favorecidoNome: personDisplayName(rows[0]) };
        }
        const comCnpj = rows.filter((p) => String(p.cnpj || "").replace(/\D/g, "").length === 14);
        if (comCnpj.length === 1) {
          return { favorecidoId: comCnpj[0].id as string, favorecidoNome: personDisplayName(comCnpj[0]) };
        }
      }
      return null;
    },

    [],
  );

  const handleNewMovement = (item: OfxItem) => {
    setActiveItem(item);
    setManualMovDialogOpen(true);
  };

  // Busca os detalhes completos da movimentação recém-criada (descrição, data,
  // valor, origem e favorecido) para que o vínculo nunca apareça "sem descrição".
  const fetchLinkedMovDetails = useCallback(async (movId: string | null): Promise<Partial<OfxItem> | null> => {
    if (!movId) return null;
    const { data: mov } = await supabase
      .from("movimentacoes_bancarias")
      .select("id, valor, data_movimentacao, tipo, descricao, origem, origem_id")
      .eq("id", movId)
      .maybeSingle();
    if (!mov) return null;

    let favorecido: string | null = null;
    try {
      if (mov.origem === "pagamento_despesa" && mov.origem_id) {
        const { data: pay } = await supabase
          .from("expense_payments" as any)
          .select("expenses(favorecido_nome, descricao)")
          .eq("id", mov.origem_id)
          .maybeSingle();
        favorecido = (pay as any)?.expenses?.favorecido_nome || null;
      } else if (mov.origem === "despesas" && mov.origem_id) {
        const { data: exp } = await supabase
          .from("expenses")
          .select("favorecido_nome")
          .eq("id", mov.origem_id)
          .maybeSingle();
        favorecido = (exp as any)?.favorecido_nome || null;
      }
    } catch { /* favorecido é opcional */ }

    return {
      matchedMovId: mov.id,
      matchedMovDesc: mov.descricao,
      matchedMovDate: mov.data_movimentacao,
      matchedMovValor: Math.abs(Number(mov.valor)),
      matchedMovOrigem: mov.origem,
      matchedMovFavorecido: favorecido,
      matchedMovPrecision: "exato",
    };
  }, []);

  const markAsConciliated = useCallback(
    async (itemId: string, movId: string, details?: Partial<OfxItem> | null) => {
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error("Transação não encontrada na conciliação");
      const payload = { status: "conciliado", matched_movimentacao_id: movId };
      const updateRequest = item.dbItemId
        ? supabase.from("bank_reconciliation_items").update(payload).eq("id", item.dbItemId)
        : reconciliationId
          ? supabase.from("bank_reconciliation_items").update(payload).eq("reconciliation_id", reconciliationId).eq("fitid", item.fitid || "").eq("status", "pendente")
          : null;
      if (!updateRequest) throw new Error("Conciliação não encontrada");
      const { error } = await updateRequest;
      if (error) throw error;

      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== itemId) return i;
          return {
            ...i,
            status: "conciliado" as const,
            matchedMovId: movId,
            ...(details || {}),
          };
        })
      );
      setTimeout(updateReconciliationCount, 500);
    },
    [items, reconciliationId, updateReconciliationCount]
  );

  const onExpenseSaved = async (savedExpenseId?: string) => {
    let createdPaymentId: string | null = null;
    // Auto-pay the expense so it flows into cash flow
    if (savedExpenseId && activeItem) {
      const valorPag = Math.abs(activeItem.amount);
      const dataPag = activeItem.date;

      // Insert payment record (triggers bank movement via DB trigger)
      const { data: payRow, error: payErr } = await supabase.from("expense_payments" as any).insert({
        expense_id: savedExpenseId,
        valor: valorPag,
        forma_pagamento: "transferencia",
        data_pagamento: dataPag,
        observacoes: "Quitação automática via conciliação bancária",
        created_by: user?.id,
        juros: 0,
      } as any).select("id").maybeSingle();
      createdPaymentId = (payRow as any)?.id || null;

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

    let movIdToLink: string | null = null;
    if (savedExpenseId && activeItem) {
      // 1) Vínculo determinístico: movimentação gerada pelo pagamento recém-criado
      if (createdPaymentId) {
        const { data: movByPay } = await supabase
          .from("movimentacoes_bancarias")
          .select("id")
          .eq("origem", "pagamento_despesa")
          .eq("origem_id", createdPaymentId)
          .maybeSingle();
        movIdToLink = (movByPay as any)?.id || null;
      }
      // 2) Fallback por valor/data
      if (!movIdToLink) {
        movIdToLink = await findCreatedMovId({
          expenseId: savedExpenseId,
          amount: Math.abs(activeItem.amount),
          tipo: activeItem.tipo,
          referenceDate: activeItem.date,
        });
      }
    }

    // Detalhes do vínculo para exibir imediatamente (fornecedor, descrição, data, valor)
    let details = await fetchLinkedMovDetails(movIdToLink);
    if (!details && savedExpenseId && activeItem) {
      const { data: exp } = await supabase
        .from("expenses")
        .select("descricao, favorecido_nome, data_vencimento, data_emissao")
        .eq("id", savedExpenseId)
        .maybeSingle();
      if (exp) {
        details = {
          matchedMovDesc: (exp as any).descricao || activeItem.description,
          matchedMovDate: (exp as any).data_vencimento || (exp as any).data_emissao || activeItem.date,
          matchedMovValor: Math.abs(activeItem.amount),
          matchedMovOrigem: "despesas",
          matchedMovFavorecido: (exp as any).favorecido_nome || null,
          matchedMovPrecision: "exato",
        };
      }
    }

    if (!movIdToLink) {
      toast.error("A despesa foi salva, mas a movimentação bancária não foi gerada. O item continuará pendente.");
      setExpenseDialogOpen(false);
      setActiveItem(null);
      return;
    }
    if (activeItem) await markAsConciliated(activeItem.id, movIdToLink, details);
    setExpenseDialogOpen(false);
    setActiveItem(null);
    toast.success("Despesa registrada, quitada e conciliada");
  };


  const onMovementSaved = async () => {
    let movIdToLink: string | null = null;
    if (activeItem) {
      movIdToLink = await findCreatedMovId({
        amount: Math.abs(activeItem.amount),
        tipo: activeItem.tipo,
        referenceDate: activeItem.date,
      });
      const details = await fetchLinkedMovDetails(movIdToLink);
      if (!movIdToLink) {
        toast.error("A movimentação não foi localizada. O item continuará pendente.");
        return;
      }
      await markAsConciliated(activeItem.id, movIdToLink, details);
    }
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

  // Recarrega a conciliação atual (reexecuta matching) sem sair da tela
  const refreshReconciliation = useCallback(async () => {
    if (!reconciliationId) return;
    setLoading(true);
    const { data: rec } = await supabase
      .from("bank_reconciliations")
      .select("id, file_name, bank_name, created_at, total_items, reconciled_items")
      .eq("id", reconciliationId)
      .maybeSingle();
    if (rec) {
      await loadHistory();
      await resumeReconciliation(rec as ReconciliationSummary);
    } else {
      setLoading(false);
      toast.error("Conciliação não encontrada");
    }
  }, [reconciliationId, resumeReconciliation, loadHistory]);

  const gridSelected = items.filter((i) => selectedIds.has(i.id));
  // seleção mista (crédito + débito): só permite excluir
  const mixedSelection = gridSelected.some((i) => i.tipo === "entrada") && gridSelected.some((i) => i.tipo === "saida");


  const _sel = gridSelected[0];
  const matchMovAtivo = !!_sel?.matchedMovId && _sel?.status === "pendente" && !loading && gridSelected.length === 1;
  const matchPagarAtivo = !!_sel?.matchedPayableId && _sel?.status === "pendente" && !loading && gridSelected.length === 1;
  const matchReceberAtivo = !!_sel?.matchedReceivableId && _sel?.status === "pendente" && !loading && gridSelected.length === 1;

  const reconColumns: DataGridColumn<OfxItem>[] = [
    {
      key: "date",
      header: "Data",
      width: "90px",
      sortValue: (r) => r.date,
      cell: (r) => <span className="whitespace-nowrap">{formatDateBR(r.date)}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      width: "84px",
      align: "center",
      sortValue: (r) => r.tipo,
      cell: (r) => (
        <Badge
          variant={r.tipo === "entrada" ? "default" : "destructive"}
          className={cn("text-[10px] h-5", r.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
        >
          {r.tipo === "entrada" ? "Crédito" : "Débito"}
        </Badge>
      ),
    },
    {
      key: "valor",
      header: "Valor",
      width: "110px",
      align: "right",
      sortValue: (r) => Math.abs(r.amount),
      cell: (r) => (
        <span className={cn("font-mono font-bold whitespace-nowrap", r.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
          {formatCurrency(Math.abs(r.amount))}
        </span>
      ),
    },
    {
      key: "description",
      header: "Descrição",
      sortValue: (r) => r.description,
      cell: (r) => (
        <div className="space-y-1 min-w-[240px]">
          <p className="text-xs text-foreground">{r.description}</p>
          <TransactionDetails
            details={r.details}
            description={r.description}
            tipo={r.tipo}
            resolveName={resolveDocName}
            cadastroNome={resolveCounterpartyProfile(r)?.favorecidoNome ?? null}
          />
        </div>
      ),
    },
    {
      key: "vinculo",
      header: "Correspondência",
      width: "300px",
      sortValue: (r) => r.matchedMovDesc || r.matchedPayableDesc || r.matchedReceivableDesc || "",
      cell: (r) => (
        <div className="space-y-1">
          {r.matchedMovId && r.status === "pendente" && (
            <MatchBox
              desc={r.matchedMovDesc}
              date={r.matchedMovDate}
              valor={r.matchedMovValor}
              origem={translateOrigem(r.matchedMovOrigem)}
              precision={r.matchedMovPrecision}
            />
          )}
          {r.matchedPayableId && r.status === "pendente" && (
            <MatchBox
              desc={r.matchedPayableDesc}
              date={r.matchedPayableDue}
              valor={r.matchedPayableValor}
              origem="Conta a Pagar (pendente)"
              variant="blue"
              label="Conta a Pagar encontrada"
              precision={r.matchedPayablePrecision}
              fornecedor={r.matchedPayableFornecedor}
            />
          )}
          {r.matchedReceivableId && r.status === "pendente" && (
            <MatchBox
              desc={`${r.matchedReceivableDesc || ""}${r.matchedReceivableFaturaNumero ? ` (Fatura #${r.matchedReceivableFaturaNumero})` : ""}`}
              date={r.matchedReceivableDue}
              valor={r.matchedReceivableValor}
              origem="Conta a Receber (pendente)"
              variant="green"
              label="Conta a Receber encontrada"
              precision={r.matchedReceivablePrecision}
              fornecedor={r.matchedReceivableCliente}
            />
          )}

          {r.status === "conciliado" && (r.matchedMovId || r.matchedMovDesc) && (
            <MatchBox
              desc={r.matchedMovDesc || r.description || null}
              date={r.matchedMovDate || r.date}
              valor={r.matchedMovValor ?? Math.abs(r.amount)}
              origem={r.matchedMovOrigem ? translateOrigem(r.matchedMovOrigem) : "Lançamento conciliado"}
              variant="green"
              label="Vinculado a"
              precision={r.matchedMovPrecision}
              fornecedor={r.matchedMovFavorecido || resolveCounterpartyProfile(r)?.favorecidoNome || null}
            />
          )}
          {r.status === "conciliado" && !r.matchedMovId && !r.matchedMovDesc && (
            <span className="text-[10px] text-muted-foreground">Conciliado sem vínculo</span>
          )}
          {r.status === "pendente" && !r.matchedMovId && !r.matchedPayableId && !r.matchedReceivableId && (
            <span className="text-[10px] text-muted-foreground">Sem correspondência</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Situação",
      width: "100px",
      align: "center",
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
  ];


  // Empty state: show history + upload
  if (items.length === 0) {
     return (
       <div className="space-y-4">
        {ConfirmDialog}
        <h1 className="text-lg font-bold text-foreground">Conciliação Bancária</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            {syncing ? (
              <>
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <p className="text-sm font-medium text-foreground">Sincronizando com o banco...</p>
                <p className="text-xs text-muted-foreground">Buscando movimentações via Open Finance</p>
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground/40" />
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Importar Movimentações</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Sincronize automaticamente via Open Finance ou selecione um arquivo OFX do seu banco
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-center">
                  {syncDaysSelect}
                  <Button variant="default" size="sm" className="gap-2" disabled={loading} onClick={handleOpenFinanceSync}>
                    <RefreshCw className="h-4 w-4" /> Sincronizar Open Finance
                  </Button>
                  <label>
                    <input
                      type="file"
                      accept=".ofx,.qfx"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={loading}
                    />
                    <Button asChild variant="outline" size="sm" disabled={loading} className="gap-2 cursor-pointer">
                      <span>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {loading ? "Importando..." : "Selecionar Arquivo OFX"}
                      </span>
                    </Button>
                  </label>
                </div>
              </>
            )}
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
      {ConfirmDialog}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">Conciliação Bancária</h1>
          <p className="text-xs text-muted-foreground">{fileName}</p>
        </div>
        <div className="flex w-full items-center justify-end gap-1.5 md:w-auto">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={goBack} title="Voltar para a listagem de conciliações">
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="max-md:hidden">Voltar à lista</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 gap-1 p-0 md:w-auto md:px-3" title="Atualizar conciliação" aria-label="Atualizar conciliação" disabled={loading || !reconciliationId} onClick={refreshReconciliation}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="max-md:hidden">Atualizar</span>
          </Button>
          <label>
            <input
              type="file"
              accept=".ofx,.qfx"
              className="hidden"
              onChange={handleFileUpload}
              disabled={loading}
            />
            <Button asChild variant="outline" size="sm" disabled={loading} className="h-8 w-8 gap-1 p-0 cursor-pointer md:w-auto md:px-3" title="Novo Extrato" aria-label="Novo Extrato">
              <span>
                <Upload className="h-3.5 w-3.5" /> <span className="max-md:hidden">Novo Extrato</span>
              </span>
            </Button>
          </label>
        </div>

      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard icon={FileSpreadsheet} label="Total" value={totals.total} />
        <SummaryCard icon={CheckCircle2} label="Conciliados" value={totals.conciliados} valueColor="green" />
        <SummaryCard icon={AlertCircle} label="Pendentes" value={totals.pendentes} valueColor={totals.pendentes > 0 ? "red" : "green"} />
        <button
          type="button"
          onClick={() => setShowMissing((v) => !v)}
          className="text-left"
          title="Movimentações do fluxo de caixa que não aparecem neste extrato OFX"
        >
          <SummaryCard
            icon={AlertCircle}
            label="Só no sistema"
            value={missingFromOfx.length}
            valueColor={missingFromOfx.length > 0 ? "red" : "green"}
          />
        </button>
      </div>

      {/* Missing from OFX panel (visão inversa) */}
      {showMissing && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Lançamentos no sistema sem correspondência no OFX
                {ofxRange && (
                  <span className="ml-2 text-[10px] normal-case font-normal">
                    ({formatDateBR(ofxRange.min)} → {formatDateBR(ofxRange.max)})
                  </span>
                )}
              </p>
              <Badge variant="outline" className="text-[10px]">{missingFromOfx.length}</Badge>
            </div>
            {missingFromOfx.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 pb-3">
                Nenhuma divergência: todo lançamento do fluxo no período do OFX tem correspondência no extrato.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {missingFromOfx
                  .slice()
                  .sort((a, b) => a.data_movimentacao.localeCompare(b.data_movimentacao))
                  .map((m) => (
                    <div key={m.id} className="px-4 py-2 flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] text-muted-foreground w-20 shrink-0">
                        {formatDateBR(m.data_movimentacao)}
                      </span>
                      <Badge
                        variant={m.tipo === "entrada" ? "default" : "destructive"}
                        className={cn("text-[10px] shrink-0", m.tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
                      >
                        {m.tipo === "entrada" ? "Crédito" : "Débito"}
                      </Badge>
                      <span className={cn("text-xs font-mono font-bold w-28 shrink-0", m.tipo === "entrada" ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(Math.abs(m.valor))}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground truncate">
                          {m.descricao || "(sem descrição)"}
                          {m.favorecido && <span className="text-muted-foreground"> · {m.favorecido}</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Origem: {translateOrigem(m.origem)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-destructive gap-1"
                        onClick={() => setDeletingMovId(m.id)}
                        disabled={m.origem !== "manual"}
                        title={m.origem === "manual" ? "Excluir lançamento manual" : "Só é possível excluir lançamentos manuais — os demais devem ser estornados na origem (Contas a Pagar / Receber)"}
                      >
                        <Trash2 className="h-3 w-3" /> Excluir
                      </Button>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deletingMovId} onOpenChange={(o) => { if (!o) setDeletingMovId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento do fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              A movimentação bancária será removida permanentemente do fluxo de caixa. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingMovId) return;
                const { error } = await supabase.from("movimentacoes_bancarias").delete().eq("id", deletingMovId);
                if (error) { toast.error("Erro ao excluir: " + error.message); return; }
                setMovsInPeriod((prev) => prev.filter((x) => x.id !== deletingMovId));
                setDeletingMovId(null);
                toast.success("Lançamento removido do fluxo");
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Global Toolbar (ações + filtros) */}
      <GlobalToolbar
        iconOnlyOnDesktop
        actions={[
          {
            key: "conciliar-movimento",
            label: "Conciliar movimento",
            icon: CheckCircle2,
            mode: "single",
            variant: "default",
            disabled: mixedSelection || loading || !gridSelected[0]?.matchedMovId || gridSelected[0]?.status !== "pendente",
            className: cn(matchMovAtivo && "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"),
            onClick: () => { const it = gridSelected[0]; if (it) openConfirm(it); },
          },
          {
            key: "pagar-conciliar",
            label: "Pagar e conciliar",
            icon: CheckCircle2,
            mode: "single",
            variant: "default",
            disabled: mixedSelection || loading || !gridSelected[0]?.matchedPayableId || gridSelected[0]?.status !== "pendente",
            className: cn(matchPagarAtivo && "bg-blue-600 hover:bg-blue-700 border-blue-600 text-white"),
            onClick: () => { const it = gridSelected[0]; if (it) openConfirmPayable(it); },
          },
          {
            key: "receber-conciliar",
            label: "Receber e conciliar",
            icon: CheckCircle2,
            mode: "single",
            variant: "default",
            disabled: mixedSelection || loading || !gridSelected[0]?.matchedReceivableId || gridSelected[0]?.status !== "pendente",
            className: cn(matchReceberAtivo && "bg-green-600 hover:bg-green-700 border-green-600 text-white"),
            onClick: () => { const it = gridSelected[0]; if (it) openConfirmPayable(it); },
          },
          {
            key: "conciliar-lote",
            label: "Conciliar lote",
            icon: CheckSquare,
            mode: "batch",
            variant: "default",
            disabled: mixedSelection || loading || gridSelected.length < 2 || !gridSelected.some((i) => i.status === "pendente" && (i.matchedMovId || i.matchedPayableId || i.matchedReceivableId)),
            onClick: handleBatchConciliate,
          },
          {
            key: "vincular",
            label: "Vincular a conta",
            icon: Link2,
            mode: "single+batch",
            disabled: mixedSelection || loading || linkableSelectedItems.length === 0,
            onClick: () => openLinkAccountDialog(linkableSelectedItems.map((i) => i.id)),
          },
          {
            key: "despesa",
            label: "Nova Despesa",
            icon: Plus,
            mode: "single",
            disabled: mixedSelection || !(gridSelected[0]?.status === "pendente" && gridSelected[0]?.tipo === "saida"),
            onClick: () => { const it = gridSelected[0]; if (it) handleNewExpense(it); },
          },
          {
            key: "movimentacao",
            label: "Movimentação",
            icon: ArrowDownCircle,
            mode: "single",
            disabled: mixedSelection || gridSelected[0]?.status !== "pendente",
            onClick: () => { const it = gridSelected[0]; if (it) handleNewMovement(it); },
          },
          {
            key: "desfazer",
            label: "Desfazer",
            icon: History,
            mode: "single",
            disabled: mixedSelection || gridSelected[0]?.status !== "conciliado",
            onClick: () => { const it = gridSelected[0]; if (it) handleUndoReconcile(it); },
          },
          {
            key: "excluir",
            label: "Excluir",
            icon: Trash2,
            mode: "single+batch",
            variant: "ghost",
            disabled: loading,
            onClick: () => handleDeleteItems(Array.from(selectedIds)),
          },
        ]}
        selectedCount={selectedIds.size}
        filtersFirstOnMobile
      >
        <div className="relative order-3 w-full lg:order-none lg:ml-1 lg:w-[220px] lg:border-l lg:border-border lg:pl-2 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-9 md:h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(([{ tab: "todos", label: "Todos", icon: List }, { tab: "pendente", label: "Pend.", icon: AlertCircle }, { tab: "conciliado", label: "Concil.", icon: CheckCircle2 }] as const)).map(({ tab, label, icon: Icon }) => {
            const count = tab === "todos" ? items.length : items.filter((i) => i.status === tab).length;
            return (
              <ToolbarIconButton
                key={tab}
                label={`${label} (${count})`}
                icon={Icon}
                active={statusFilter === tab}
                showLabel
                onClick={() => setStatusFilter(tab)}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(([{ tab: "todos", label: "Todos", icon: List }, { tab: "debito", label: "Débito", icon: ArrowDownCircle }, { tab: "credito", label: "Crédito", icon: ArrowUpCircle }] as const)).map(({ tab, label, icon: Icon }) => {
            const count = tab === "todos" ? items.length : items.filter((i) => tab === "debito" ? i.tipo === "saida" : i.tipo === "entrada").length;
            return (
              <ToolbarIconButton
                key={tab}
                label={`${label} (${count})`}
                icon={Icon}
                active={tipoFilter === tab}
                showLabel
                onClick={() => setTipoFilter(tab)}
              />
            );
          })}
        </div>

      </GlobalToolbar>

      {/* Data Grid */}
      <DataGrid
        rows={filteredItems}
        columns={reconColumns}
        rowId={(r) => r.id}
        selected={selectedIds}
        onSelectedChange={setSelectedIds}
        loading={loading && items.length === 0}
        minWidth={980}
        emptyMessage="Nenhuma transação encontrada."
        rowClassName={(r) => rowToneClass(r.status === "conciliado" ? "resolved" : "pending")}
        footer={
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filteredItems.length} transação(ões)</span>
            <span className="font-mono">
              Total: {formatCurrency(filteredItems.reduce((s, i) => s + Math.abs(i.amount), 0))}
            </span>
          </div>
        }
      />

      <StatusLegend
        className="px-1"
        items={[
          { tone: "pending", label: "Pendente de conciliação" },
          { tone: "resolved", label: "Conciliado" },
        ]}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10px] text-muted-foreground md:hidden">
        <span className="inline-flex items-center gap-1.5"><RefreshCw className="h-3 w-3" /> Sincronizar Open Finance</span>
        <span className="inline-flex items-center gap-1.5"><Upload className="h-3 w-3" /> Novo Extrato</span>
      </div>


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
          ...(expenseFavorecido || resolveCounterpartyProfile(activeItem) || {}),
        } : null}
      />

      {/* Link to existing account dialog */}
      <Dialog open={linkAccountDialogOpen} onOpenChange={(o) => { setLinkAccountDialogOpen(o); if (!o) { setLinkSelectedAccount(null); setLinkSelectedAccounts([]); setLinkAllocations({}); setLinkTargetItemIds([]); setLinkSearchText(""); setLinkSearchResults([]); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Vincular lançamento(s) a uma conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
              <p className="font-medium">{linkTargetItemIds.length} lançamento(s) selecionado(s)</p>
              <p className="text-muted-foreground">
                Total: <span className="font-mono font-semibold">
                  {formatCurrency(items.filter((i) => linkTargetItemIds.includes(i.id)).reduce((s, i) => s + Math.abs(i.amount), 0))}
                </span>
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Buscar por descrição, favorecido, nota ou data de vencimento (dd/mm/aaaa)..."
                value={linkSearchText}
                onChange={(e) => setLinkSearchText(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <div className="border rounded max-h-72 overflow-y-auto divide-y divide-border">
              {linkSearching && (
                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                </div>
              )}
              {!linkSearching && linkSearchText.trim().length < 2 && linkSearchResults.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Digite ao menos 2 caracteres para buscar contas. Para créditos, os recebíveis em aberto já são listados automaticamente.
                </div>
              )}
              {!linkSearching && linkSearchResults.length === 0 && linkSearchText.trim().length >= 2 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma conta encontrada.
                </div>
              )}
              {linkSearchResults.map((acc) => {
                const saldo = Number(acc.valor_total || 0) - Number(acc.valor_pago || 0);
                const isSelected = linkSelectedAccount?.id === acc.id;
                const statusLabel: Record<string, { label: string; cls: string }> = {
                  pago: { label: "Pago", cls: "border-green-500 text-green-600" },
                  parcial: { label: "Parcial", cls: "border-amber-500 text-amber-600" },
                  pendente: { label: "Pendente", cls: "border-blue-500 text-blue-600" },
                  atrasado: { label: "Atrasado", cls: "border-red-500 text-red-600" },
                };
                const st = statusLabel[acc.status] || { label: acc.status, cls: "" };
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setLinkSelectedAccount(acc)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-start gap-2",
                      isSelected && "bg-accent"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium truncate">{acc.descricao}</span>
                        <Badge variant="outline" className={cn("text-[10px]", st.cls)}>{st.label}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {acc.favorecido_nome || "Sem favorecido"} · Venc: {formatDateBR(acc.data_vencimento || acc.data_emissao)}
                        {acc.documento_fiscal_numero && <> · NF: <span className="font-mono">{acc.documento_fiscal_numero}</span></>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Total: <span className="font-mono">{formatCurrency(Number(acc.valor_total))}</span>
                        {" · "}Pago: <span className="font-mono">{formatCurrency(Number(acc.valor_pago || 0))}</span>
                        {acc.status !== "pago" && (
                          <> {" · "}Saldo: <span className="font-mono font-semibold">{formatCurrency(saldo)}</span></>
                        )}
                      </p>
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {linkSelectedAccount && linkSelectedAccount.status !== "pago" && (
              <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-2 py-1.5">
                Esta conta ainda não foi quitada. Ao confirmar, será registrado um pagamento de{" "}
                <span className="font-mono font-semibold">
                  {formatCurrency(items.filter((i) => linkTargetItemIds.includes(i.id)).reduce((s, i) => s + Math.abs(i.amount), 0))}
                </span>{" "}para esta conta.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkAccountDialogOpen(false)} disabled={linkSubmitting}>Cancelar</Button>
            <Button size="sm" onClick={handleLinkConfirm} disabled={!linkSelectedAccount || linkSubmitting}>
              {linkSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function translateOrigem(origem: string | null): string {
  const map: Record<string, string> = {
    pagamento_despesa: "Pagamento de Despesa",
    pagamento_agrupado: "Pagamento Agrupado",
    despesas: "Despesa",
    contas_pagar: "Contas a Pagar",
    contas_pagar_pendente: "Conta a Pagar (pendente)",
    contas_receber: "Contas a Receber",
    recebimento_conta_receber: "Recebimento",
    manual: "Lançamento Manual",
    colheita: "Colheita",
    colheitas: "Colheita",
    abastecimento: "Abastecimento",
    faturamento: "Faturamento",
  };
  return map[origem || ""] || origem || "Outro";
}


function MatchDesc({ desc }: { desc: string | null }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const text = desc || "Sem descrição";
  const line = (
    <p
      className={cn("min-w-0 break-words", expanded ? "" : "line-clamp-2")}
      onClick={isMobile ? () => setExpanded((v) => !v) : undefined}
      role={isMobile ? "button" : undefined}
      tabIndex={isMobile ? 0 : undefined}
    >
      <span className="font-medium">Desc:</span> {text}
    </p>
  );
  if (isMobile) {
    return line;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {line}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm text-[11px] leading-snug whitespace-normal text-left">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function MatchBox({ desc, date, valor, origem, variant = "amber", label = "Correspondência encontrada", precision, fornecedor }: {
  desc: string | null; date: string | null; valor: number | null; origem: string;
  variant?: "amber" | "blue" | "green"; label?: string; precision?: MatchPrecision | null; fornecedor?: string | null;
}) {
  const isProximo = precision === "proximo";
  const colors =
    variant === "blue"
      ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600"
      : variant === "green"
      ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-600"
      : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600";
  const finalLabel = isProximo ? `${label} (data próxima)` : label;
  return (
    <div className={cn("border rounded px-2 py-1.5 space-y-0.5 min-w-0", colors.split(" ").slice(0, 4).join(" "), isProximo && "border-dashed")}>
      <span className={cn("flex items-center gap-1 font-medium text-[11px]", colors.split(" ").slice(4).join(" "))}>
        <Link2 className="h-3 w-3 shrink-0" /> {finalLabel}
      </span>
      <div className="text-[10px] text-muted-foreground pl-4 space-y-0.5">
        {fornecedor && (
          <p className="min-w-0 break-words line-clamp-2">
            <span className="font-medium">Fornecedor:</span> {fornecedor}
          </p>
        )}
        <MatchDesc desc={desc} />
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
  onLinkAccount,
  onDelete,
}: {
  item: OfxItem;
  onConfirmMatch: () => void;
  onConfirmPayable?: () => void;
  onNewExpense: () => void;
  onNewMovement: () => void;
  onLinkAccount?: () => void;
  onDelete?: () => void;
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
      {item.matchedReceivableId && !item.matchedPayableId && (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={onConfirmPayable || onConfirmMatch}>
          <CheckCircle2 className="h-3 w-3" /> Receber e Conciliar
        </Button>
      )}
      {onLinkAccount && (
        <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-blue-600" onClick={onLinkAccount}>
          <Link2 className="h-3 w-3" /> Vincular a conta
        </Button>
      )}
      {item.tipo === "saida" && (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onNewExpense}>
          <Plus className="h-3 w-3" /> Despesa
        </Button>
      )}
      <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={onNewMovement}>
        <ArrowDownCircle className="h-3 w-3" /> Movimentação
      </Button>
      {onDelete && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[10px] gap-1 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          title="Excluir este lançamento do extrato da conciliação"
        >
          <Trash2 className="h-3 w-3" /> Excluir
        </Button>
      )}
    </div>

  );
}
