import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle2, TrendingUp, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "expense" | "legacy";
}

export function FinancialPaid() {
  const isMobile = useIsMobile();
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);

    const [{ data: paidExpenses }, { data: paidLegacy }] = await Promise.all([
      supabase
        .from("expenses")
        .select("id, descricao, valor_pago, data_pagamento, favorecido_nome")
        .is("deleted_at", null)
        .eq("status", "pago" as any)
        .order("data_pagamento", { ascending: false }),
      supabase
        .from("accounts_payable")
        .select("id, description, amount, paid_at, paid_amount, creditor_name")
        .eq("status", "pago" as any)
        .order("paid_at", { ascending: false }),
    ]);

    const expenseItems: PaidItem[] = (paidExpenses || []).map((e: any) => ({
      id: e.id,
      description: e.descricao,
      amount: Number(e.valor_pago || 0),
      paid_at: e.data_pagamento,
      creditor_name: e.favorecido_nome,
      source: "expense" as const,
    }));

    const legacyItems: PaidItem[] = (paidLegacy || []).map((a: any) => ({
      id: `legacy-${a.id}`,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: a.paid_at,
      creditor_name: a.creditor_name,
      source: "legacy" as const,
    }));

    setItems([...expenseItems, ...legacyItems].sort((a, b) => {
      const dateA = a.paid_at ? new Date(a.paid_at).getTime() : 0;
      const dateB = b.paid_at ? new Date(b.paid_at).getTime() : 0;
      return dateB - dateA;
    }));

    setLoading(false);
  };

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return i.description.toLowerCase().includes(q) || (i.creditor_name || "").toLowerCase().includes(q);
  });

  const total = filtered.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">Pagos</h1>

      {/* Summary cards - compact */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon={CheckCircle2} label="Total Pago" value={formatCurrency(total)} valueColor="green" />
        <SummaryCard icon={TrendingUp} label="Registros" value={filtered.length} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou descrição..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma conta paga encontrada.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{item.creditor_name || "—"}</p>
                  <Badge variant={item.source === "expense" ? "outline" : "secondary"} className="text-[10px] shrink-0">
                    {item.source === "expense" ? "Despesa" : "Legado"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{formatDateBR(item.paid_at)}</span>
                  <span className="font-mono font-bold text-green-600">{formatCurrency(item.amount)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Fornecedor</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Descrição</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Data Pgto</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Valor</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-medium">{item.creditor_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{item.description}</td>
                      <td className="px-4 py-2.5 text-xs">{formatDateBR(item.paid_at)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs font-semibold text-green-600">{formatCurrency(item.amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={item.source === "expense" ? "outline" : "secondary"} className="text-[10px]">
                          {item.source === "expense" ? "Despesa" : "Legado"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
