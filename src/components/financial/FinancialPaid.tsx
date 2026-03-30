import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, CheckCircle2, TrendingUp, DollarSign, CalendarIcon, X, Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "expense_payment" | "legacy";
  expense_id: string | null;
  forma_pagamento?: string | null;
}

const toDateOnly = (value?: string | null) => {
  if (!value) return null;
  return String(value).slice(0, 10);
};

export function FinancialPaid() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reversing, setReversing] = useState(false);
  const [search, setSearch] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);

    const [{ data: expensePayments }, { data: paidLegacy }] = await Promise.all([
      supabase
        .from("expense_payments" as any)
        .select(`
          id,
          valor,
          data_pagamento,
          forma_pagamento,
          expense_id,
          expenses:expense_id (
            descricao,
            favorecido_nome
          )
        `)
        .order("data_pagamento", { ascending: false }),
      supabase
        .from("accounts_payable")
        .select("id, description, amount, paid_at, paid_amount, creditor_name")
        .eq("status", "pago" as any)
        .order("paid_at", { ascending: false }),
    ]);

    const expenseItems: PaidItem[] = (expensePayments || []).map((p: any) => ({
      id: p.id,
      description: p.expenses?.descricao || "Pagamento de despesa",
      amount: Number(p.valor || 0),
      paid_at: toDateOnly(p.data_pagamento),
      creditor_name: p.expenses?.favorecido_nome || null,
      source: "expense_payment" as const,
      expense_id: p.expense_id,
      forma_pagamento: p.forma_pagamento || null,
    }));

    const legacyItems: PaidItem[] = (paidLegacy || []).map((a: any) => ({
      id: `legacy-${a.id}`,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: toDateOnly(a.paid_at),
      creditor_name: a.creditor_name,
      source: "legacy" as const,
      expense_id: null,
      forma_pagamento: null,
    }));

    setItems(
      [...expenseItems, ...legacyItems].sort((a, b) => {
        const dateA = a.paid_at ? new Date(`${a.paid_at}T12:00:00`).getTime() : 0;
        const dateB = b.paid_at ? new Date(`${b.paid_at}T12:00:00`).getTime() : 0;
        return dateB - dateA;
      }),
    );

    setLoading(false);
  };

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        i.description.toLowerCase().includes(q) ||
        (i.creditor_name || "").toLowerCase().includes(q);

      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        const dateRef = i.paid_at || "";
        matchPeriodo = (!periodoInicio || dateRef >= periodoInicio) && (!periodoFim || dateRef <= periodoFim);
      }

      return matchSearch && matchPeriodo;
    });
  }, [items, search, periodoInicio, periodoFim]);

  // Only expense_payment items can be reversed
  const selectableIds = useMemo(() => filtered.filter(i => i.source === "expense_payment").map(i => i.id), [filtered]);

  const total = filtered.reduce((s, i) => s + i.amount, 0);
  const selectedTotal = useMemo(() => {
    let t = 0;
    selectedIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (item) t += item.amount;
    });
    return t;
  }, [selectedIds, items]);

  const hasFilters = search !== "" || periodoInicio !== "" || periodoFim !== "";

  const clearFilters = () => {
    setSearch("");
    setPeriodoInicio("");
    setPeriodoFim("");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableIds.length && selectableIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const handleReverseSingle = async (item: PaidItem) => {
    if (item.source !== "expense_payment" || !item.expense_id) return;
    if (!await confirm({
      title: "Estornar pagamento",
      description: `Deseja estornar o pagamento de "${item.creditor_name || item.description}"? O registro será removido e o saldo da despesa recalculado.`,
    })) return;

    setReversing(true);
    try {
      await reversePayment(item);
      toast.success("Pagamento estornado com sucesso");
      setSelectedIds(new Set());
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar");
    }
    setReversing(false);
  };

  const handleBatchReverse = async () => {
    if (selectedIds.size === 0) return;
    if (!await confirm({
      title: "Estornar selecionados",
      description: `Deseja estornar ${selectedIds.size} pagamento(s)? Os registros serão removidos e os saldos recalculados.`,
    })) return;

    setReversing(true);
    try {
      for (const id of selectedIds) {
        const item = items.find(i => i.id === id);
        if (item && item.source === "expense_payment") {
          await reversePayment(item);
        }
      }
      toast.success(`${selectedIds.size} pagamento(s) estornado(s)`);
      setSelectedIds(new Set());
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao estornar");
    }
    setReversing(false);
  };

  const reversePayment = async (item: PaidItem) => {
    if (!item.expense_id) return;

    // Delete the specific payment record (trigger removes movimentacao_bancaria)
    await supabase.from("expense_payments" as any).delete().eq("id", item.id);

    // Recalculate expense totals from remaining payments
    const { data: remainingPayments } = await supabase
      .from("expense_payments" as any)
      .select("valor")
      .eq("expense_id", item.expense_id);

    const totalPago = (remainingPayments || []).reduce((s: number, p: any) => s + Number(p.valor), 0);

    // Get expense to determine new status
    const { data: expense } = await supabase
      .from("expenses")
      .select("valor_total")
      .eq("id", item.expense_id)
      .maybeSingle();

    let newStatus = "pendente";
    if (totalPago > 0 && expense && totalPago >= Number(expense.valor_total)) {
      newStatus = "pago";
    } else if (totalPago > 0) {
      newStatus = "parcial";
    }

    await supabase.from("expenses").update({
      valor_pago: totalPago,
      status: newStatus,
      ...(totalPago <= 0 ? { data_pagamento: null } : {}),
    } as any).eq("id", item.expense_id);

    // Reset installment status if this payment was for an installment
    // Find installments that are pago for this expense and check if payments still cover them
    const { data: installments } = await supabase
      .from("expense_installments")
      .select("id, valor, status")
      .eq("expense_id", item.expense_id)
      .eq("status", "pago" as any);

    if (installments && installments.length > 0 && totalPago < (installments || []).reduce((s: number, inst: any) => s + Number(inst.valor), 0)) {
      // Some installments need to be reopened - reopen from last to first
      const sorted = [...installments].reverse();
      let deficit = (installments || []).reduce((s: number, inst: any) => s + Number(inst.valor), 0) - totalPago;
      for (const inst of sorted) {
        if (deficit <= 0) break;
        await supabase.from("expense_installments").update({ status: "pendente" } as any).eq("id", inst.id);
        deficit -= Number(inst.valor);
      }
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog />
      <h1 className="text-lg font-bold text-foreground">Contas Pagas</h1>

      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={CheckCircle2} label="Total Pago" value={formatCurrency(total)} valueColor="green" />
        <SummaryCard icon={TrendingUp} label="Registros" value={filtered.length} />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">Período:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            <span className="text-xs text-muted-foreground shrink-0">até</span>
            <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
            {(periodoInicio || periodoFim) && (
              <button type="button" onClick={() => { setPeriodoInicio(""); setPeriodoFim(""); }} className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Limpar período">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs" />
        </div>
        {hasFilters && (
          <div className="flex items-center">
            <Button variant="ghost" size="sm" className="h-7 rounded-full px-2 text-[11px] text-muted-foreground hover:text-destructive" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Selection bar */}
      {selectableIds.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg border bg-muted/50 p-2 flex-wrap">
          <Checkbox
            checked={selectedIds.size === selectableIds.length && selectableIds.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0
              ? `${selectedIds.size} selecionada(s) — ${formatCurrency(selectedTotal)}`
              : "Selecionar todas"}
          </span>
          {selectedIds.size > 0 && (
            <div className="ml-auto">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                onClick={handleBatchReverse}
                disabled={reversing}
              >
                <Undo2 className="h-3.5 w-3.5" />
                {reversing ? "Processando..." : "Estornar"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Cards List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <DollarSign className="mx-auto mb-2 h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhuma conta paga encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const isSelectable = item.source === "expense_payment";
            const isSelected = selectedIds.has(item.id);

            return (
              <Card
                key={item.id}
                className={`h-full transition-all ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
              >
                <CardContent className="flex h-full flex-col p-3">
                  {/* Row 1: Checkbox + Nome + Badge */}
                  <div className="mb-1 flex items-center gap-2">
                    {isSelectable && (
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(item.id)} />
                    )}
                    <p className="flex-1 truncate text-sm font-semibold text-foreground">{item.creditor_name || "Sem favorecido"}</p>
                    <Badge variant={item.source === "legacy" ? "secondary" : "default"} className="shrink-0 text-[10px]">
                      {item.source === "legacy" ? "Legado" : "Pago"}
                    </Badge>
                  </div>

                  {/* Row 2: Descrição */}
                  <p className="mb-1.5 truncate text-xs text-muted-foreground">{item.description}</p>

                  {/* Row 3: Dados */}
                  <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <div>
                      <span className="text-[11px] text-muted-foreground">Valor Pago</span>
                      <p className="font-mono font-semibold text-success">{formatCurrency(item.amount)}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground">Data Pgto</span>
                      <p className="font-medium text-foreground">{formatDateBR(item.paid_at)}</p>
                    </div>
                    {item.forma_pagamento && (
                      <div className="col-span-2">
                        <span className="text-[11px] text-muted-foreground">Forma Pgto</span>
                        <p className="text-[11px] capitalize text-foreground">{item.forma_pagamento}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer: Estornar button */}
                  {isSelectable && (
                    <div className="flex items-center pt-1.5 mt-1.5 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px] gap-1 text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                        onClick={() => handleReverseSingle(item)}
                        disabled={reversing}
                      >
                        <Undo2 className="h-3 w-3" /> Estornar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
