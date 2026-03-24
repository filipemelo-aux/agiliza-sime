import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { format } from "date-fns";

interface PaidItem {
  id: string;
  description: string;
  amount: number;
  paid_at: string | null;
  creditor_name: string | null;
  source: "manual" | "harvest";
}

export function FinancialPaid() {
  const [items, setItems] = useState<PaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: paidAccounts } = await supabase
      .from("accounts_payable")
      .select("id, description, amount, paid_at, paid_amount, creditor_name")
      .eq("status", "pago" as any)
      .order("paid_at", { ascending: false });

    const manualItems: PaidItem[] = (paidAccounts || []).map((a: any) => ({
      id: a.id,
      description: a.description,
      amount: Number(a.paid_amount || a.amount),
      paid_at: a.paid_at,
      creditor_name: a.creditor_name,
      source: "manual" as const,
    }));

    const { data: harvestPayments } = await supabase
      .from("harvest_payments")
      .select("id, harvest_job_id, period_start, period_end, total_amount, filter_context, created_at")
      .order("created_at", { ascending: false });

    const harvestItems: PaidItem[] = [];

    if (harvestPayments && harvestPayments.length > 0) {
      const jobIds = [...new Set(harvestPayments.map(p => p.harvest_job_id))];
      const { data: jobs } = await supabase.from("harvest_jobs").select("id, farm_name").in("id", jobIds);
      const jobMap = new Map((jobs || []).map(j => [j.id, j.farm_name]));

      for (const payment of harvestPayments) {
        const farmName = jobMap.get(payment.harvest_job_id) || "Colheita";
        const periodLabel = `${format(new Date(payment.period_start + "T12:00:00"), "dd/MM/yy")} - ${format(new Date(payment.period_end + "T12:00:00"), "dd/MM/yy")}`;

        let ownerName = "Proprietário";
        if (payment.filter_context) {
          const userIds = payment.filter_context.split(",").filter(Boolean);
          if (userIds.length > 0) {
            const { data: profiles } = await supabase.from("profiles").select("full_name, nome_fantasia").in("user_id", userIds).limit(1);
            if (profiles && profiles.length > 0) {
              const { data: vehiclesData } = await supabase.from("vehicles").select("owner_id").in("driver_id", userIds).limit(1);
              if (vehiclesData && vehiclesData.length > 0 && vehiclesData[0].owner_id) {
                const { data: ownerProfile } = await supabase.from("profiles").select("full_name, nome_fantasia").eq("user_id", vehiclesData[0].owner_id).maybeSingle();
                if (ownerProfile) ownerName = ownerProfile.nome_fantasia || ownerProfile.full_name;
              }
            }
          }
        }

        harvestItems.push({
          id: `harvest-${payment.id}`,
          description: `🌱 ${farmName} — ${periodLabel}`,
          amount: Number(payment.total_amount),
          paid_at: payment.created_at,
          creditor_name: ownerName,
          source: "harvest",
        });
      }
    }

    setItems([...manualItems, ...harvestItems].sort((a, b) => {
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
            <p className="text-xl font-bold text-success">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
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
                  <Badge variant={item.source === "harvest" ? "secondary" : "outline"} className="text-[10px] shrink-0">
                    {item.source === "harvest" ? "Colheita" : "Manual"}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Valor Pago</span>
                    <p className="font-mono font-semibold text-foreground">
                      R$ {item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
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
