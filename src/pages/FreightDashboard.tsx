import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, DollarSign, XCircle, Ban, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const chartConfig: ChartConfig = {
  count: { label: "CT-es", color: "hsl(var(--primary))" },
};

export default function FreightDashboard() {
  const [stats, setStats] = useState({
    totalEmitidos: 0,
    totalFaturado: 0,
    rejeitados: 0,
    cancelados: 0,
    icmsTotal: 0,
  });
  const [chartData, setChartData] = useState<{ day: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: ctes } = await supabase
        .from("ctes")
        .select("status, valor_frete, valor_icms, data_emissao")
        .gte("created_at", firstDay)
        .lte("created_at", lastDay);

      if (ctes) {
        const autorizados = ctes.filter((c) => c.status === "autorizado");
        setStats({
          totalEmitidos: autorizados.length,
          totalFaturado: autorizados.reduce((s, c) => s + Number(c.valor_frete || 0), 0),
          rejeitados: ctes.filter((c) => c.status === "rejeitado").length,
          cancelados: ctes.filter((c) => c.status === "cancelado").length,
          icmsTotal: autorizados.reduce((s, c) => s + Number(c.valor_icms || 0), 0),
        });

        // Group by day
        const byDay: Record<string, number> = {};
        autorizados.forEach((c) => {
          if (c.data_emissao) {
            const day = new Date(c.data_emissao).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            byDay[day] = (byDay[day] || 0) + 1;
          }
        });
        setChartData(
          Object.entries(byDay)
            .map(([day, count]) => ({ day, count }))
            .sort((a, b) => a.day.localeCompare(b.day))
        );
      }
    } catch (err) {
      console.error("Erro ao buscar estatísticas:", err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cards = [
    { title: "CT-e Emitidos", value: stats.totalEmitidos, icon: FileText, color: "text-primary" },
    { title: "Faturado", value: fmt(stats.totalFaturado), icon: DollarSign, color: "text-emerald-500" },
    { title: "Rejeitados", value: stats.rejeitados, icon: XCircle, color: "text-destructive" },
    { title: "Cancelados", value: stats.cancelados, icon: Ban, color: "text-muted-foreground" },
    { title: "ICMS Total", value: fmt(stats.icmsTotal), icon: Receipt, color: "text-amber-500" },
  ];

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold font-display mb-6">Dashboard — Fretes</h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {cards.map((c) => (
            <Card key={c.title} className="border-border bg-card">
              <CardContent className="pt-6 flex flex-col items-center text-center gap-2">
                <c.icon className={`h-6 w-6 ${c.color}`} />
                <p className="text-sm text-muted-foreground">{c.title}</p>
                <p className="text-2xl font-bold font-display">{loading ? "—" : c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {chartData.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg font-display">Emissão por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" className="text-muted-foreground" />
                  <YAxis allowDecimals={false} className="text-muted-foreground" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
