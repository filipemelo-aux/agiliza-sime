import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, CheckCircle2, TrendingUp, DollarSign, CalendarIcon, X, FileText } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { format } from "date-fns";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "expense_payment" | "legacy";
  status?: string;
  forma_pagamento?: string | null;
}

export function FinancialPaid() {
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");

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
      paid_at: p.data_pagamento,
      creditor_name: p.expenses?.favorecido_nome || null,
      source: "expense_payment" as const,
      status: "pago",
      forma_pagamento: p.forma_pagamento || null,
    }));

    const legacyItems: PaidItem[] = (paidLegacy || []).map((a: any) => ({
      id: `legacy-${a.id}`,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: a.paid_at,
      creditor_name: a.creditor_name,
      source: "legacy" as const,
      forma_pagamento: null,
    }));

    setItems([...expenseItems, ...legacyItems].sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const dateB = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return dateB - dateA;
    }));

    setLoading(false);
  };

  const filtered = useMemo(() => {
    return items.filter(i => {
      const q = search.toLowerCase();
      const matchSearch = !search ||
        i.description.toLowerCase().includes(q) ||
        (i.creditor_name || "").toLowerCase().includes(q);

      let matchPeriodo = true;
      if (periodoInicio || periodoFim) {
        const dateRef = i.paid_at || "";
        matchPeriodo = (!periodoInicio || dateRef >= periodoInicio) &&
          (!periodoFim || dateRef <= periodoFim);
      }

      return matchSearch && matchPeriodo;
    });
  }, [items, search, periodoInicio, periodoFim]);

  const total = filtered.reduce((s, i) => s + i.amount, 0);

  const hasFilters = search !== "" || periodoInicio !== "" || periodoFim !== "";

  const clearFilters = () => {
    setSearch("");
    setPeriodoInicio("");
    setPeriodoFim("");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">Contas Pagas</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={CheckCircle2} label="Total Pago" value={formatCurrency(total)} valueColor="green" />
        <SummaryCard icon={TrendingUp} label="Registros" value={filtered.length} />
      </div>

      {/* Filter Card */}
      <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border border-border">
        {/* Row 1: Period */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 shrink-0">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-foreground whitespace-nowrap">Período:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="h-8 text-xs flex-1 min-w-0"
            />
            <span className="text-xs text-muted-foreground shrink-0">até</span>
            <Input
              type="date"
              value={periodoFim}
              onChange={(e) => setPeriodoFim(e.target.value)}
              className="h-8 text-xs flex-1 min-w-0"
            />
            {(periodoInicio || periodoFim) && (
              <button
                type="button"
                onClick={() => { setPeriodoInicio(""); setPeriodoFim(""); }}
                className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Limpar período"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-destructive rounded-full"
              onClick={clearFilters}
            >
              <X className="h-3 w-3 mr-1" /> Limpar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Cards List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-muted-foreground text-sm">Nenhuma conta paga encontrada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <Card key={item.id} className="h-full">
              <CardContent className="p-3 flex flex-col h-full">
                {/* Row 1: Nome + Badge */}
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {item.creditor_name || "Sem favorecido"}
                  </p>
                  <Badge
                    variant={item.source === "legacy" ? "secondary" : "default"}
                    className="text-[10px] shrink-0"
                  >
                    {item.source === "legacy" ? "Legado" : "Pago"}
                  </Badge>
                </div>

                {/* Row 2: Descrição */}
                <p className="text-xs text-muted-foreground truncate mb-1.5">{item.description}</p>

                {/* Row 3: Dados */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs flex-1">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Valor Pago</span>
                    <p className="font-mono font-semibold text-green-600">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Data Pgto</span>
                    <p className="font-medium text-foreground">
                      {formatDateBR(item.paid_at)}
                    </p>
                  </div>
                  {item.forma_pagamento && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-[11px]">Forma Pgto</span>
                      <p className="text-[11px] text-foreground capitalize">{item.forma_pagamento}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
