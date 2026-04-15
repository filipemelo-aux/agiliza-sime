import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SummaryCard } from "@/components/SummaryCard";
import { toast } from "sonner";
import { parseOfx, type OfxTransaction } from "@/lib/ofxParser";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Upload, CheckCircle2, AlertCircle, FileSpreadsheet, Link2, Plus, ArrowDownCircle, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ManualCashFlowDialog } from "./ManualCashFlowDialog";
import { ExpenseFormDialog } from "./ExpenseFormDialog";

interface OfxItem extends OfxTransaction {
  id: string;
  status: "pendente" | "conciliado" | "registrado";
  matchedMovId: string | null;
  matchedMovDesc: string | null;
  matchedMovDate: string | null;
  matchedMovOrigem: string | null;
  matchedMovValor: number | null;
  // Conta a pagar match (not yet paid)
  matchedPayableId: string | null;
  matchedPayableDesc: string | null;
  matchedPayableDue: string | null;
  matchedPayableValor: number | null;
}

interface MatchCandidate {
  id: string;
  descricao: string | null;
  data_movimentacao: string;
  valor: number;
  origem: string;
  // For payable matches
  isPayable?: boolean;
  payableDueDate?: string;
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

  useEffect(() => {
    if (matrizId) {
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").eq("empresa_id", matrizId).eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
    }
  }, [matrizId]);

  // Confirm match dialog
  const [confirmItem, setConfirmItem] = useState<OfxItem | null>(null);
  const [confirmMatch, setConfirmMatch] = useState<MatchCandidate | null>(null);

  // Manual registration dialogs
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [manualMovDialogOpen, setManualMovDialogOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<OfxItem | null>(null);

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

      // Fetch existing movimentações for matching (date range from OFX)
      const dates = parsed.transactions.map((t) => t.date).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      const [{ data: existingMovs }, { data: pendingPayables }] = await Promise.all([
        supabase
          .from("movimentacoes_bancarias")
          .select("id, valor, data_movimentacao, tipo, descricao, origem")
          .gte("data_movimentacao", minDate)
          .lte("data_movimentacao", maxDate),
        supabase
          .from("accounts_payable")
          .select("id, amount, description, due_date, status")
          .in("status", ["pendente", "atrasado"]),
      ]);

      const movs = (existingMovs || []) as MatchCandidate[];
      const payables = (pendingPayables || []) as { id: string; amount: number; description: string; due_date: string | null; status: string }[];

      // Build items with auto-matching by value
      const usedMovIds = new Set<string>();
      const usedPayableIds = new Set<string>();
      const ofxItems: OfxItem[] = parsed.transactions.map((tx) => {
        const absVal = Math.abs(tx.amount);
        // 1) Match against existing cash flow movements
        const match = movs.find(
          (m) =>
            !usedMovIds.has(m.id) &&
            Math.abs(Number(m.valor) - absVal) < 0.01 &&
            ((tx.tipo === "saida" && (m.origem !== "contas_receber")) ||
             (tx.tipo === "entrada" && m.origem !== "pagamento_despesa" && m.origem !== "despesas" && m.origem !== "contas_pagar"))
        );
        if (match) usedMovIds.add(match.id);

        // 2) If no movement match and it's a debit, match against pending payables
        let payableMatch: typeof payables[0] | null = null;
        if (!match && tx.tipo === "saida") {
          const pm = payables.find(
            (p) => !usedPayableIds.has(p.id) && Math.abs(Number(p.amount) - absVal) < 0.01
          );
          if (pm) {
            payableMatch = pm;
            usedPayableIds.add(pm.id);
          }
        }

        return {
          ...tx,
          id: crypto.randomUUID(),
          status: "pendente" as const,
          matchedMovId: match?.id || null,
          matchedMovDesc: match?.descricao || null,
          matchedMovDate: match?.data_movimentacao || null,
          matchedMovOrigem: match?.origem || null,
          matchedMovValor: match ? Math.abs(Number(match.valor)) : null,
          matchedPayableId: payableMatch?.id || null,
          matchedPayableDesc: payableMatch?.description || null,
          matchedPayableDue: payableMatch?.due_date || null,
          matchedPayableValor: payableMatch ? Number(payableMatch.amount) : null,
        };
      });

      // Save items to DB
      const itemsToInsert = ofxItems.map((item) => ({
        reconciliation_id: rec.id,
        transaction_date: item.date,
        description: item.description,
        amount: Math.abs(item.amount),
        tipo: item.tipo,
        fitid: item.fitid || null,
        status: "pendente",
        matched_movimentacao_id: null, // not confirmed yet
      }));

      await supabase.from("bank_reconciliation_items").insert(itemsToInsert);

      setReconciliationId(rec.id);
      setItems(ofxItems);
      setFileName(file.name);
      toast.success(`${ofxItems.length} transações importadas`);
    } catch (err: any) {
      toast.error("Erro ao importar OFX: " + (err.message || ""));
    } finally {
      setLoading(false);
      // Reset file input
      e.target.value = "";
    }
  }, [user]);

  const handleConfirmMatch = useCallback(async () => {
    if (!confirmItem || !confirmMatch || !reconciliationId) return;

    try {
      if (confirmMatch.isPayable) {
        // Pay the accounts_payable record using the OFX transaction date
        const now = new Date().toISOString();
        await supabase
          .from("accounts_payable")
          .update({
            status: "pago",
            paid_amount: confirmMatch.valor,
            paid_at: `${confirmItem.date}T12:00:00`,
          })
          .eq("id", confirmMatch.id);
      }

      // Update reconciliation item status in DB
      await supabase
        .from("bank_reconciliation_items")
        .update({ status: "conciliado", matched_movimentacao_id: confirmMatch.isPayable ? null : confirmMatch.id })
        .eq("reconciliation_id", reconciliationId)
        .eq("fitid", confirmItem.fitid || "")
        .eq("status", "pendente");

      setItems((prev) =>
        prev.map((i) =>
          i.id === confirmItem.id ? { ...i, status: "conciliado" } : i
        )
      );
      toast.success(confirmMatch.isPayable ? "Conta paga e conciliada com sucesso" : "Transação conciliada com sucesso");
    } catch (err: any) {
      toast.error("Erro ao conciliar: " + (err.message || ""));
    }
    setConfirmItem(null);
    setConfirmMatch(null);
  }, [confirmItem, confirmMatch, reconciliationId]);

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
        prev.map((i) => (i.id === itemId ? { ...i, status: "registrado" } : i))
      );
      if (reconciliationId) {
        // Best-effort DB update
        supabase
          .from("bank_reconciliation_items")
          .update({ status: "registrado" })
          .eq("reconciliation_id", reconciliationId)
          .eq("status", "pendente")
          .then();
      }
    },
    [reconciliationId]
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

  // Empty state
  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">Conciliação Bancária</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
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

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard icon={FileSpreadsheet} label="Total" value={totals.total} />
        <SummaryCard icon={CheckCircle2} label="Conciliados" value={totals.conciliados} valueColor="green" />
        <SummaryCard icon={Plus} label="Registrados" value={totals.registrados} valueColor="primary" />
        <SummaryCard icon={AlertCircle} label="Pendentes" value={totals.pendentes} valueColor={totals.pendentes > 0 ? "red" : "green"} />
      </div>

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
                    />
                  )}
                  {!item.matchedMovId && item.matchedPayableId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedPayableDesc}
                      date={item.matchedPayableDue}
                      valor={item.matchedPayableValor}
                      origem="Conta a Pagar (pendente)"
                      variant="blue"
                      label="Conta a Pagar encontrada"
                    />
                  )}
                  <ItemActions
                    item={item}
                    onConfirmMatch={() => openConfirm(item)}
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
                  {/* Row 1: date, type badge, value, status, actions */}
                  <div className="flex items-center gap-2 flex-wrap">
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
                    />
                  )}
                  {!item.matchedMovId && item.matchedPayableId && item.status === "pendente" && (
                    <MatchBox
                      desc={item.matchedPayableDesc}
                      date={item.matchedPayableDue}
                      valor={item.matchedPayableValor}
                      origem="Conta a Pagar (pendente)"
                      variant="blue"
                      label="Conta a Pagar encontrada"
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

function MatchBox({ desc, date, valor, origem, variant = "amber", label = "Correspondência encontrada" }: {
  desc: string | null; date: string | null; valor: number | null; origem: string;
  variant?: "amber" | "blue"; label?: string;
}) {
  const colors = variant === "blue"
    ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-600"
    : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-600";
  return (
    <div className={cn("border rounded px-2 py-1.5 space-y-0.5", colors.split(" ").slice(0, 4).join(" "))}>
      <span className={cn("flex items-center gap-1 font-medium text-[11px]", colors.split(" ").slice(4).join(" "))}>
        <Link2 className="h-3 w-3 shrink-0" /> {label}
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
  onNewExpense,
  onNewMovement,
}: {
  item: OfxItem;
  onConfirmMatch: () => void;
  onNewExpense: () => void;
  onNewMovement: () => void;
}) {
  if (item.status !== "pendente") return null;

  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {(item.matchedMovId || item.matchedPayableId) && (
        <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onConfirmMatch}>
          <CheckCircle2 className="h-3 w-3" /> {item.matchedPayableId && !item.matchedMovId ? "Pagar e Conciliar" : "Conciliar"}
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={onNewExpense}>
        <Plus className="h-3 w-3" /> Despesa
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={onNewMovement}>
        <ArrowDownCircle className="h-3 w-3" /> Movimentação
      </Button>
    </div>
  );
}
