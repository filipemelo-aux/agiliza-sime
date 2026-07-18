import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format, eachDayOfInterval, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReportInfoTooltip } from "./ReportInfoTooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Daily {
  data: string;
  entradas: number;
  saidas: number;
  saldoDia: number;
  saldoAcumulado: number;
}

export function CashFlowDailyGrid() {
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [rows, setRows] = useState<Daily[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("movimentacoes_bancarias")
        .select("data_movimentacao, tipo, valor")
        .gte("data_movimentacao", dataInicio)
        .lte("data_movimentacao", dataFim)
        .limit(10000);
      if (error) throw error;
      const byDay: Record<string, { e: number; s: number }> = {};
      (data || []).forEach((m: any) => {
        const d = (m.data_movimentacao || "").slice(0, 10);
        if (!d) return;
        byDay[d] ||= { e: 0, s: 0 };
        if (m.tipo === "entrada") byDay[d].e += Number(m.valor || 0);
        else byDay[d].s += Number(m.valor || 0);
      });
      const days = eachDayOfInterval({ start: parseISO(dataInicio), end: parseISO(dataFim) });
      let acc = 0;
      const out: Daily[] = days.map((d) => {
        const key = format(d, "yyyy-MM-dd");
        const e = byDay[key]?.e || 0;
        const s = byDay[key]?.s || 0;
        const saldoDia = e - s;
        acc += saldoDia;
        return { data: key, entradas: e, saidas: s, saldoDia, saldoAcumulado: acc };
      });
      setRows(out);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dataInicio, dataFim]);

  const totals = useMemo(() => {
    const entradas = rows.reduce((a, r) => a + r.entradas, 0);
    const saidas = rows.reduce((a, r) => a + r.saidas, 0);
    return { entradas, saidas, saldo: entradas - saidas };
  }, [rows]);

  const chartData = useMemo(
    () => rows.map((r) => ({ dia: r.data.slice(8, 10) + "/" + r.data.slice(5, 7), Entradas: r.entradas, Saidas: r.saidas })),
    [rows],
  );

  return (
    <div className="flex flex-col gap-1 h-[calc(100vh-132px)]">
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <span className="text-[10px] text-muted-foreground">até</span>
        <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {rows.length > 0 && (
        <div className="border border-border rounded-md bg-card h-[120px] p-1 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => formatCurrency(v)} />
              <RTooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Entradas" fill="hsl(142 71% 45%)" />
              <Bar dataKey="Saidas" fill="hsl(0 84% 60%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex-1 min-h-0 border border-border rounded-md bg-card overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 z-20 bg-background/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-sm">
              <tr className="text-left">
                <th className="px-1.5 py-1 font-medium w-[100px]">Data</th>
                <th className="px-1.5 py-1 font-medium text-right">Entradas</th>
                <th className="px-1.5 py-1 font-medium text-right">Saídas</th>
                <th className="px-1.5 py-1 font-medium text-right">Saldo do Dia</th>
                <th className="px-1.5 py-1 font-medium text-right">Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.data} className="border-t border-border hover:bg-muted/30">
                  <td className="px-1.5 py-0.5 whitespace-nowrap tabular-nums">{formatDateBR(r.data)}</td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-600">{r.entradas > 0 ? formatCurrency(r.entradas) : "—"}</td>
                  <td className="px-1.5 py-0.5 text-right tabular-nums text-red-600">{r.saidas > 0 ? formatCurrency(r.saidas) : "—"}</td>
                  <td className={cn("px-1.5 py-0.5 text-right tabular-nums font-medium", r.saldoDia < 0 ? "text-red-600" : r.saldoDia > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {formatCurrency(r.saldoDia)}
                  </td>
                  <td className={cn("px-1.5 py-0.5 text-right tabular-nums font-semibold", r.saldoAcumulado < 0 ? "text-red-600" : "text-primary")}>
                    {formatCurrency(r.saldoAcumulado)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-muted/95 backdrop-blur border-t border-border">
              <tr className="text-xs font-bold">
                <td className="px-1.5 py-1.5">Total do Período</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-emerald-600">{formatCurrency(totals.entradas)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-red-600">{formatCurrency(totals.saidas)}</td>
                <td className={cn("px-1.5 py-1.5 text-right tabular-nums", totals.saldo < 0 ? "text-red-600" : "text-primary")}>{formatCurrency(totals.saldo)}</td>
                <td className="px-1.5 py-1.5 text-right tabular-nums text-primary">{formatCurrency(totals.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

