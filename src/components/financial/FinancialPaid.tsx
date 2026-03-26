import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/masks";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "expense" | "legacy";
}

export function FinancialPaid() {
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
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pago</p>
            <p className="text-xl font-bold text-success">{formatCurrency(total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-xl font-bold text-foreground">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm text-center py-8">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm text-center py-8">Nenhuma conta paga encontrada</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.creditor_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                  <Badge variant={item.source === "expense" ? "outline" : "secondary"} className="text-[10px] shrink-0">
                    {item.source === "expense" ? "Despesa" : "Legado"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Valor Pago</span>
                    <p className="font-mono font-semibold text-foreground">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Data Pgto</span>
                    <p className="font-medium text-foreground">{item.paid_at ? format(new Date(item.paid_at), "dd/MM/yyyy") : "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
