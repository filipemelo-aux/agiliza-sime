import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, TrendingDown, Fuel, Wrench, Truck, Gauge, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Vehicle = { id: string; plate: string };
type Cte = { id: string; numero: number | null; data_emissao: string | null; valor_frete: number | null; remetente_nome: string | null; destinatario_nome: string | null };
type Fueling = { id: string; data_abastecimento: string; tipo_combustivel: string; quantidade_litros: number; valor_total: number; km_atual: number | null; posto_combustivel: string | null };
type Maint = { id: string; data_manutencao: string; tipo_manutencao: string | null; descricao: string | null; custo_total: number | null; fornecedor: string | null; expense_id: string | null };
type Colheita = { id: string; data_prevista: string; valor: number; status: string; metadata: any };
type CardItem = { id: string; posted_date: string; description: string; amount: number; plano_contas_id: string | null; invoice_id: string; plano_nome?: string | null };


const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function VehicleMetrics() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [veiculoId, setVeiculoId] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>(monthStartISO());
  const [dataFim, setDataFim] = useState<string>(todayISO());

  const [loading, setLoading] = useState(false);
  const [ctes, setCtes] = useState<Cte[]>([]);
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [maints, setMaints] = useState<Maint[]>([]);
  const [colheitas, setColheitas] = useState<Colheita[]>([]);
  const [cardItems, setCardItems] = useState<CardItem[]>([]);


  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("vehicles").select("id, plate").eq("fleet_type", "propria").order("plate");
      setVehicles((data as any) || []);
    })();
  }, []);

  useEffect(() => {
    if (!veiculoId || !dataInicio || !dataFim) return;
    (async () => {
      setLoading(true);
      const startTs = `${dataInicio}T00:00:00`;
      const endTs = `${dataFim}T23:59:59`;
      const [cteRes, fuelRes, maintRes, colheitaRes, cardRes] = await Promise.all([
        supabase.from("ctes")
          .select("id, numero, data_emissao, valor_frete, remetente_nome, destinatario_nome")
          .eq("veiculo_id", veiculoId)
          .gte("data_emissao", startTs).lte("data_emissao", endTs)
          .order("data_emissao", { ascending: false }),
        supabase.from("fuelings")
          .select("id, data_abastecimento, tipo_combustivel, quantidade_litros, valor_total, km_atual, posto_combustivel")
          .eq("veiculo_id", veiculoId).is("deleted_at", null)
          .gte("data_abastecimento", dataInicio).lte("data_abastecimento", dataFim)
          .order("data_abastecimento", { ascending: true }),
        supabase.from("maintenances")
          .select("id, data_manutencao, tipo_manutencao, descricao, custo_total, fornecedor, expense_id")
          .eq("veiculo_id", veiculoId)
          .gte("data_manutencao", dataInicio).lte("data_manutencao", dataFim)
          .order("data_manutencao", { ascending: false }),
        (supabase.from("previsoes_recebimento") as any)
          .select("id, data_prevista, valor, status, metadata")
          .eq("veiculo_id", veiculoId)
          .eq("origem_tipo", "colheita")
          .gte("data_prevista", dataInicio).lte("data_prevista", dataFim)
          .order("data_prevista", { ascending: false }),
        (supabase.from("credit_card_invoice_items") as any)
          .select("id, posted_date, description, amount, plano_contas_id, invoice_id, plano:chart_of_accounts(nome)")
          .eq("veiculo_id", veiculoId)
          .gte("posted_date", dataInicio).lte("posted_date", dataFim)
          .order("posted_date", { ascending: false }),
      ]);
      setCtes((cteRes.data as any) || []);
      setFuelings((fuelRes.data as any) || []);
      setMaints((maintRes.data as any) || []);
      setColheitas((colheitaRes.data as any) || []);
      setCardItems(((cardRes.data as any[]) || []).map((r: any) => ({
        id: r.id, posted_date: r.posted_date, description: r.description, amount: Number(r.amount),
        plano_contas_id: r.plano_contas_id, invoice_id: r.invoice_id, plano_nome: r.plano?.nome || null,
      })));
      setLoading(false);
    })();
  }, [veiculoId, dataInicio, dataFim]);


  const m = useMemo(() => {
    const receitaCte = ctes.reduce((s, c) => s + Number(c.valor_frete || 0), 0);
    const receitaColheita = colheitas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const receita = receitaCte + receitaColheita;
    const custoComb = fuelings.reduce((s, f) => s + Number(f.valor_total || 0), 0);
    const custoMan = maints.reduce((s, x) => s + Number(x.custo_total || 0), 0);
    const custoCartao = cardItems.reduce((s, x) => s + Number(x.amount || 0), 0);
    const custoTotal = custoComb + custoMan + custoCartao;
    const lucro = receita - custoTotal;

    // KM/L: ignore first fueling (baseline odometer); diff(max-min km) / sum(litros excluding first)
    const fuelOrdered = [...fuelings]
      .filter(f => f.km_atual != null && f.quantidade_litros > 0)
      .sort((a, b) => (a.km_atual || 0) - (b.km_atual || 0));
    let kml = 0;
    if (fuelOrdered.length >= 2) {
      const kmDiff = (fuelOrdered[fuelOrdered.length - 1].km_atual || 0) - (fuelOrdered[0].km_atual || 0);
      const litrosExclFirst = fuelOrdered.slice(1).reduce((s, f) => s + Number(f.quantidade_litros), 0);
      kml = litrosExclFirst > 0 ? kmDiff / litrosExclFirst : 0;
    }

    const missingKm = fuelings.filter(f => f.km_atual == null || Number(f.km_atual) <= 0).length;
    const kmlImprecise = fuelings.length <= 1 || missingKm > 0;
    const kmlReason = fuelings.length === 0
      ? "Sem abastecimentos no período."
      : fuelings.length === 1
        ? "Apenas 1 abastecimento no período — são necessários ao menos 2 para calcular a média."
        : missingKm > 0
          ? `${missingKm} abastecimento(s) sem KM preenchido — média parcial.`
          : "";

    return { receita, receitaCte, receitaColheita, custoComb, custoMan, custoCartao, custoTotal, lucro, kml, kmlImprecise, kmlReason };
  }, [ctes, fuelings, maints, colheitas, cardItems]);

  const chartData = [
    { nome: "Receita CT-e", Receita: m.receitaCte, Custo: 0 },
    { nome: "Receita Colheita", Receita: m.receitaColheita, Custo: 0 },
    { nome: "Combustível", Receita: 0, Custo: m.custoComb },
    { nome: "Manutenção", Receita: 0, Custo: m.custoMan },
    { nome: "Cartão", Receita: 0, Custo: m.custoCartao },
    { nome: "Resultado", Receita: m.lucro >= 0 ? m.lucro : 0, Custo: m.lucro < 0 ? Math.abs(m.lucro) : 0 },
  ];


  const fmtDate = (d?: string | null) => d ? format(new Date(d.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy") : "—";
  const placa = vehicles.find(v => v.id === veiculoId)?.plate;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Métricas por Veículo</h1>
        <p className="text-sm text-muted-foreground">Dashboard de performance financeira e operacional da frota</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Veículo (Placa) *</Label>
            <Select value={veiculoId} onValueChange={setVeiculoId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione um veículo" /></SelectTrigger>
              <SelectContent>
                {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Data Inicial</Label>
            <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Data Final</Label>
            <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="h-9" />
          </div>
        </CardContent>
      </Card>

      {!veiculoId ? (
        <Card><CardContent className="p-10 flex flex-col items-center text-muted-foreground gap-2">
          <Truck className="h-10 w-10" />
          <p>Selecione um veículo para visualizar as métricas</p>
        </CardContent></Card>
      ) : loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Cards Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={DollarSign} label="Receita Bruta" value={formatCurrency(m.receita)} valueColor="primary" />
            <SummaryCard icon={TrendingDown} label="Custo Total" value={formatCurrency(m.custoTotal)} valueColor="red" />
            <SummaryCard icon={m.lucro >= 0 ? TrendingUp : TrendingDown} label="Resultado Líquido" value={formatCurrency(m.lucro)} valueColor={m.lucro >= 0 ? "green" : "red"} />
            <div className="relative">
              <SummaryCard icon={Gauge} label="Média KM/L" value={m.kml > 0 ? `${m.kml.toFixed(2)} km/L` : "—"} />
              {m.kmlImprecise && (
                <span
                  className="absolute top-1 right-1 text-amber-500 cursor-help text-sm"
                  title={`Métrica imprecisa: ${m.kmlReason}`}
                >⚠️</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={DollarSign} label="Receita CT-e" value={formatCurrency(m.receitaCte)} />
            <SummaryCard icon={DollarSign} label="Receita Colheita" value={formatCurrency(m.receitaColheita)} />
            <SummaryCard icon={Fuel} label="Custo Combustível" value={formatCurrency(m.custoComb)} />
            <SummaryCard icon={Wrench} label="Custo Manutenção" value={formatCurrency(m.custoMan)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard icon={Truck} label="Fretes (CT-e)" value={ctes.length} />
            <SummaryCard icon={Truck} label="Faturamentos Colheita" value={colheitas.length} />
            <SummaryCard icon={Wrench} label="Manutenções" value={maints.length} />
          </div>


          {/* Chart */}
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground mb-3">Receita vs Custos {placa ? `— ${placa}` : ""}</p>
              <div style={{ width: "100%", height: 280 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="nome" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                    <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => formatCurrency(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Custo" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detalhamento */}
          <Tabs defaultValue="fretes">
            <TabsList>
              <TabsTrigger value="fretes">Fretes ({ctes.length})</TabsTrigger>
              <TabsTrigger value="abast">Abastecimentos ({fuelings.length})</TabsTrigger>
              <TabsTrigger value="manut">Manutenções ({maints.length})</TabsTrigger>
              <TabsTrigger value="colheita">Colheita ({colheitas.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="colheita">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr><th className="p-2 text-left">Data</th><th className="p-2 text-left">Fazenda</th><th className="p-2 text-left">Período</th><th className="p-2 text-left">Status</th><th className="p-2 text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {colheitas.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma receita de colheita no período</td></tr> :
                      colheitas.map(c => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(c.data_prevista)}</td>
                          <td className="p-2 truncate max-w-[220px]">{c.metadata?.fazenda || "—"}</td>
                          <td className="p-2">{c.metadata?.periodo_inicio ? `${fmtDate(c.metadata.periodo_inicio)} → ${fmtDate(c.metadata.periodo_fim)}` : "—"}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{c.status}</Badge></td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(c.valor || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>


            <TabsContent value="fretes">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr><th className="p-2 text-left">Data</th><th className="p-2 text-left">Nº CT-e</th><th className="p-2 text-left">Remetente</th><th className="p-2 text-left">Destinatário</th><th className="p-2 text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {ctes.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhum frete no período</td></tr> :
                      ctes.map(c => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(c.data_emissao)}</td>
                          <td className="p-2 font-mono">{c.numero || "—"}</td>
                          <td className="p-2 truncate max-w-[200px]">{c.remetente_nome || "—"}</td>
                          <td className="p-2 truncate max-w-[200px]">{c.destinatario_nome || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(c.valor_frete || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="abast">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr><th className="p-2 text-left">Data</th><th className="p-2 text-left">Combustível</th><th className="p-2 text-left">Posto</th><th className="p-2 text-right">KM</th><th className="p-2 text-right">Litros</th><th className="p-2 text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {fuelings.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum abastecimento no período</td></tr> :
                      fuelings.map(f => (
                        <tr key={f.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(f.data_abastecimento)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{f.tipo_combustivel}</Badge></td>
                          <td className="p-2 truncate max-w-[200px]">{f.posto_combustivel || "—"}</td>
                          <td className="p-2 text-right font-mono">{f.km_atual?.toLocaleString("pt-BR") || "—"}</td>
                          <td className="p-2 text-right font-mono">{Number(f.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(f.valor_total))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="manut">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr><th className="p-2 text-left">Data</th><th className="p-2 text-left">Tipo</th><th className="p-2 text-left">Descrição</th><th className="p-2 text-left">Fornecedor</th><th className="p-2 text-right">Valor</th></tr>
                  </thead>
                  <tbody>
                    {maints.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma manutenção no período</td></tr> :
                      maints.map(x => (
                        <tr key={x.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(x.data_manutencao)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{x.tipo_manutencao || "—"}</Badge></td>
                          <td className="p-2 truncate max-w-[260px]">{x.descricao || "—"}</td>
                          <td className="p-2 truncate max-w-[180px]">{x.fornecedor || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(x.custo_total || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
