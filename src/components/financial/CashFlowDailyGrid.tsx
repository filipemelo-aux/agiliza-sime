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
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold">Fluxo de Caixa (Liquidez)</h2>
            <ReportInfoTooltip text="Regime de Caixa Puro. Agrega movimentações bancárias pela data de pagamento, exibindo entradas, saídas, saldo do dia e saldo acumulado do período." />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">De</Label>
              <Input type="date" className="h-8 text-xs w-[140px]" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Até</Label>
              <Input type="date" className="h-8 text-xs w-[140px]" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-2 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} width={70} tickFormatter={(v) => formatCurrency(v)} />
                <RTooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Entradas" fill="hsl(142 71% 45%)" />
                <Bar dataKey="Saidas" fill="hsl(0 84% 60%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-sm">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium w-[110px]">Data</th>
                <th className="px-2 py-1.5 font-medium text-right">Entradas</th>
                <th className="px-2 py-1.5 font-medium text-right">Saídas</th>
                <th className="px-2 py-1.5 font-medium text-right">Saldo do Dia</th>
                <th className="px-2 py-1.5 font-medium text-right">Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.data} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-1 whitespace-nowrap tabular-nums">{formatDateBR(r.data)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-emerald-600">{r.entradas > 0 ? formatCurrency(r.entradas) : "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-red-600">{r.saidas > 0 ? formatCurrency(r.saidas) : "—"}</td>
                  <td className={cn("px-2 py-1 text-right tabular-nums font-medium", r.saldoDia < 0 ? "text-red-600" : r.saldoDia > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                    {formatCurrency(r.saldoDia)}
                  </td>
                  <td className={cn("px-2 py-1 text-right tabular-nums font-semibold", r.saldoAcumulado < 0 ? "text-red-600" : "text-primary")}>
                    {formatCurrency(r.saldoAcumulado)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-muted/95 backdrop-blur border-t border-border">
              <tr className="text-xs font-bold">
                <td className="px-2 py-2">Total do Período</td>
                <td className="px-2 py-2 text-right tabular-nums text-emerald-600">{formatCurrency(totals.entradas)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-red-600">{formatCurrency(totals.saidas)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", totals.saldo < 0 ? "text-red-600" : "text-primary")}>{formatCurrency(totals.saldo)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-primary">{formatCurrency(totals.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
