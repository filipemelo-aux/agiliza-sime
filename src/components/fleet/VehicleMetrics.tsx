import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SummaryCard } from "@/components/SummaryCard";
import { Badge } from "@/components/ui/badge";
import { SortableTh } from "@/components/ui/sortable-th";
import { useSortableTable } from "@/hooks/useSortableTable";
import { DollarSign, TrendingUp, TrendingDown, Fuel, Wrench, Truck, Gauge, Loader2, CreditCard } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

type Vehicle = { id: string; plate: string };
type Cte = { id: string; numero: number | null; data_emissao: string | null; valor_frete: number | null; remetente_nome: string | null; destinatario_nome: string | null; veiculo_id?: string | null };
type Fueling = { id: string; data_abastecimento: string; tipo_combustivel: string; quantidade_litros: number; valor_total: number; km_atual: number | null; posto_combustivel: string | null; veiculo_id?: string | null };
type Maint = { id: string; data_manutencao: string; tipo_manutencao: string | null; descricao: string | null; custo_total: number | null; fornecedor: string | null; expense_id: string | null; veiculo_id?: string | null };
type Colheita = { id: string; data_prevista: string; valor: number; status: string; metadata: any; veiculo_id?: string | null };
type CardItem = { id: string; posted_date: string; description: string; amount: number; plano_contas_id: string | null; invoice_id: string; plano_nome?: string | null; veiculo_id?: string | null };

const ALL = "__all__";
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

export default function VehicleMetrics() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [veiculoId, setVeiculoId] = useState<string>(ALL);
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
    if (!dataInicio || !dataFim) return;
    (async () => {
      setLoading(true);
      const startTs = `${dataInicio}T00:00:00`;
      const endTs = `${dataFim}T23:59:59`;
      const isAll = veiculoId === ALL;

      const cteQ = supabase.from("ctes")
        .select("id, numero, data_emissao, valor_frete, remetente_nome, destinatario_nome, veiculo_id")
        .gte("data_emissao", startTs).lte("data_emissao", endTs)
        .order("data_emissao", { ascending: false });
      const fuelQ = supabase.from("fuelings")
        .select("id, data_abastecimento, tipo_combustivel, quantidade_litros, valor_total, km_atual, posto_combustivel, veiculo_id")
        .is("deleted_at", null)
        .gte("data_abastecimento", dataInicio).lte("data_abastecimento", dataFim)
        .order("data_abastecimento", { ascending: true });
      const maintQ = supabase.from("maintenances")
        .select("id, data_manutencao, tipo_manutencao, descricao, custo_total, fornecedor, expense_id, veiculo_id")
        .gte("data_manutencao", dataInicio).lte("data_manutencao", dataFim)
        .order("data_manutencao", { ascending: false });
      const colheitaQ = (supabase.from("previsoes_recebimento") as any)
        .select("id, data_prevista, valor, veiculo_id, status, metadata")
        .eq("origem_tipo", "colheita")
        .gte("data_prevista", dataInicio).lte("data_prevista", dataFim)
        .order("data_prevista", { ascending: false });
      const cardQ = (supabase.from("credit_card_invoice_items") as any)
        .select("id, posted_date, description, amount, plano_contas_id, invoice_id, veiculo_id, plano:chart_of_accounts(nome)")
        .gte("posted_date", dataInicio).lte("posted_date", dataFim)
        .order("posted_date", { ascending: false });

      if (!isAll) {
        cteQ.eq("veiculo_id", veiculoId);
        fuelQ.eq("veiculo_id", veiculoId);
        maintQ.eq("veiculo_id", veiculoId);
        cardQ.eq("veiculo_id", veiculoId);
      }

      const [cteRes, fuelRes, maintRes, colheitaRes, cardRes] = await Promise.all([cteQ, fuelQ, maintQ, colheitaQ, cardQ]);

      setCtes((cteRes.data as any) || []);
      setFuelings((fuelRes.data as any) || []);
      setMaints((maintRes.data as any) || []);

      const plate = vehicles.find(v => v.id === veiculoId)?.plate || "";
      const rawColheitas = ((colheitaRes.data as any[]) || []);
      const colheitasResolved = isAll
        ? rawColheitas.map(r => ({ ...r, valor: Number(r.valor || 0) }))
        : rawColheitas.flatMap((r: any) => {
            if (r.veiculo_id === veiculoId) return [{ ...r, valor: Number(r.valor || 0) }];
            const det: any[] = Array.isArray(r.metadata?.detalhamento) ? r.metadata.detalhamento : [];
            const item = det.find((d: any) => d?.veiculo_id === veiculoId || (plate && d?.placa === plate));
            if (!item) return [];
            return [{ ...r, valor: Number(item.liquido || 0) }];
          });
      setColheitas(colheitasResolved as any);

      setCardItems(((cardRes.data as any[]) || []).map((r: any) => ({
        id: r.id, posted_date: r.posted_date, description: r.description, amount: Number(r.amount),
        plano_contas_id: r.plano_contas_id, invoice_id: r.invoice_id, plano_nome: r.plano?.nome || null,
        veiculo_id: r.veiculo_id,
      })));
      setLoading(false);
    })();
  }, [veiculoId, dataInicio, dataFim]);

  const plateById = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach(v => m.set(v.id, v.plate));
    return m;
  }, [vehicles]);
  const plateOf = (id?: string | null) => (id && plateById.get(id)) || "—";

  const m = useMemo(() => {
    const receitaCte = ctes.reduce((s, c) => s + Number(c.valor_frete || 0), 0);
    const receitaColheita = colheitas.reduce((s, c) => s + Number(c.valor || 0), 0);
    const receita = receitaCte + receitaColheita;
    const custoComb = fuelings.reduce((s, f) => s + Number(f.valor_total || 0), 0);
    const custoMan = maints.reduce((s, x) => s + Number(x.custo_total || 0), 0);
    const custoCartao = cardItems.reduce((s, x) => s + Number(x.amount || 0), 0);
    const custoTotal = custoComb + custoMan + custoCartao;
    const lucro = receita - custoTotal;

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
    const kmlImprecise = fuelings.length <= 1 || missingKm > 0 || veiculoId === ALL;
    const kmlReason = veiculoId === ALL
      ? "KM/L agregado de toda a frota é apenas indicativo — selecione um veículo para precisão."
      : fuelings.length === 0
        ? "Sem abastecimentos no período."
        : fuelings.length === 1
          ? "Apenas 1 abastecimento no período — são necessários ao menos 2."
          : missingKm > 0
            ? `${missingKm} abastecimento(s) sem KM preenchido — média parcial.`
            : "";

    return { receita, receitaCte, receitaColheita, custoComb, custoMan, custoCartao, custoTotal, lucro, kml, kmlImprecise, kmlReason };
  }, [ctes, fuelings, maints, colheitas, cardItems, veiculoId]);

  const chartData = [
    { nome: "Receita CT-e", Receita: m.receitaCte, Custo: 0 },
    { nome: "Receita Colheita", Receita: m.receitaColheita, Custo: 0 },
    { nome: "Combustível", Receita: 0, Custo: m.custoComb },
    { nome: "Manutenção", Receita: 0, Custo: m.custoMan },
    { nome: "Cartão", Receita: 0, Custo: m.custoCartao },
    { nome: "Resultado", Receita: m.lucro >= 0 ? m.lucro : 0, Custo: m.lucro < 0 ? Math.abs(m.lucro) : 0 },
  ];

  const fmtDate = (d?: string | null) => d ? format(new Date(d.slice(0, 10) + "T12:00:00"), "dd/MM/yyyy") : "—";
  const placa = veiculoId === ALL ? "Toda a Frota" : vehicles.find(v => v.id === veiculoId)?.plate;
  const isAll = veiculoId === ALL;

  // Unified "all expenses" rows
  type DespesaRow = { id: string; data: string; tipo: "Combustível" | "Manutenção" | "Cartão"; descricao: string; fornecedor: string; placa: string; valor: number };
  const despesas: DespesaRow[] = useMemo(() => {
    const a: DespesaRow[] = fuelings.map(f => ({
      id: `f-${f.id}`, data: f.data_abastecimento, tipo: "Combustível",
      descricao: `${f.tipo_combustivel} — ${Number(f.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L`,
      fornecedor: f.posto_combustivel || "—", placa: plateOf(f.veiculo_id), valor: Number(f.valor_total || 0),
    }));
    const b: DespesaRow[] = maints.map(x => ({
      id: `m-${x.id}`, data: x.data_manutencao, tipo: "Manutenção",
      descricao: x.descricao || x.tipo_manutencao || "—", fornecedor: x.fornecedor || "—",
      placa: plateOf(x.veiculo_id), valor: Number(x.custo_total || 0),
    }));
    const c: DespesaRow[] = cardItems.map(x => ({
      id: `c-${x.id}`, data: x.posted_date, tipo: "Cartão",
      descricao: x.description, fornecedor: x.plano_nome || "—",
      placa: plateOf(x.veiculo_id), valor: Number(x.amount || 0),
    }));
    return [...a, ...b, ...c];
  }, [fuelings, maints, cardItems, plateById]);

  // Sortable tables
  const despSort = useSortableTable<DespesaRow, "data" | "tipo" | "descricao" | "fornecedor" | "placa" | "valor">(
    despesas, { key: "data", direction: "desc" }, {
      data: r => r.data, tipo: r => r.tipo, descricao: r => r.descricao,
      fornecedor: r => r.fornecedor, placa: r => r.placa, valor: r => r.valor,
    });
  const cteSort = useSortableTable<Cte, "data_emissao" | "numero" | "remetente_nome" | "destinatario_nome" | "valor_frete" | "placa">(
    ctes, { key: "data_emissao", direction: "desc" }, {
      data_emissao: r => r.data_emissao, numero: r => r.numero, remetente_nome: r => r.remetente_nome,
      destinatario_nome: r => r.destinatario_nome, valor_frete: r => Number(r.valor_frete || 0), placa: r => plateOf(r.veiculo_id),
    });
  const fuelSort = useSortableTable<Fueling, "data_abastecimento" | "tipo_combustivel" | "posto_combustivel" | "km_atual" | "quantidade_litros" | "valor_total" | "placa">(
    fuelings, { key: "data_abastecimento", direction: "desc" }, {
      data_abastecimento: r => r.data_abastecimento, tipo_combustivel: r => r.tipo_combustivel,
      posto_combustivel: r => r.posto_combustivel, km_atual: r => Number(r.km_atual || 0),
      quantidade_litros: r => Number(r.quantidade_litros), valor_total: r => Number(r.valor_total), placa: r => plateOf(r.veiculo_id),
    });
  const maintSort = useSortableTable<Maint, "data_manutencao" | "tipo_manutencao" | "descricao" | "fornecedor" | "custo_total" | "placa">(
    maints, { key: "data_manutencao", direction: "desc" }, {
      data_manutencao: r => r.data_manutencao, tipo_manutencao: r => r.tipo_manutencao,
      descricao: r => r.descricao, fornecedor: r => r.fornecedor, custo_total: r => Number(r.custo_total || 0), placa: r => plateOf(r.veiculo_id),
    });
  const colhSort = useSortableTable<Colheita, "data_prevista" | "fazenda" | "status" | "valor">(
    colheitas, { key: "data_prevista", direction: "desc" }, {
      data_prevista: r => r.data_prevista, fazenda: r => r.metadata?.fazenda || "",
      status: r => r.status, valor: r => Number(r.valor || 0),
    });
  const cardSort = useSortableTable<CardItem, "posted_date" | "description" | "plano_nome" | "amount" | "placa">(
    cardItems, { key: "posted_date", direction: "desc" }, {
      posted_date: r => r.posted_date, description: r => r.description,
      plano_nome: r => r.plano_nome || "", amount: r => Number(r.amount), placa: r => plateOf(r.veiculo_id),
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Métricas por Veículo</h1>
        <p className="text-sm text-muted-foreground">Dashboard de performance financeira e operacional da frota</p>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Veículo (Placa)</Label>
            <Select value={veiculoId} onValueChange={setVeiculoId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os veículos</SelectItem>
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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={DollarSign} label="Receita Bruta" value={formatCurrency(m.receita)} valueColor="primary" />
            <SummaryCard icon={TrendingDown} label="Custo Total" value={formatCurrency(m.custoTotal)} valueColor="red" />
            <SummaryCard icon={m.lucro >= 0 ? TrendingUp : TrendingDown} label="Resultado Líquido" value={formatCurrency(m.lucro)} valueColor={m.lucro >= 0 ? "green" : "red"} />
            <div className="relative">
              <SummaryCard icon={Gauge} label="Média KM/L" value={m.kml > 0 ? `${m.kml.toFixed(2)} km/L` : "—"} />
              {m.kmlImprecise && (
                <span className="absolute top-1 right-1 text-amber-500 cursor-help text-sm" title={`Métrica imprecisa: ${m.kmlReason}`}>⚠️</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryCard icon={DollarSign} label="Receita CT-e" value={formatCurrency(m.receitaCte)} />
            <SummaryCard icon={DollarSign} label="Receita Colheita" value={formatCurrency(m.receitaColheita)} />
            <SummaryCard icon={Fuel} label="Custo Combustível" value={formatCurrency(m.custoComb)} />
            <SummaryCard icon={Wrench} label="Custo Manutenção" value={formatCurrency(m.custoMan)} />
            <SummaryCard icon={CreditCard} label="Outros Custos (Cartão)" value={formatCurrency(m.custoCartao)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={Truck} label="Fretes (CT-e)" value={ctes.length} />
            <SummaryCard icon={Truck} label="Faturamentos Colheita" value={colheitas.length} />
            <SummaryCard icon={Wrench} label="Manutenções" value={maints.length} />
            <SummaryCard icon={CreditCard} label="Lançamentos Cartão" value={cardItems.length} />
          </div>

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

          <Tabs defaultValue="despesas">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="despesas">Todas Despesas ({despesas.length})</TabsTrigger>
              <TabsTrigger value="fretes">Fretes ({ctes.length})</TabsTrigger>
              <TabsTrigger value="abast">Abastecimentos ({fuelings.length})</TabsTrigger>
              <TabsTrigger value="manut">Manutenções ({maints.length})</TabsTrigger>
              <TabsTrigger value="colheita">Colheita ({colheitas.length})</TabsTrigger>
              <TabsTrigger value="cartao">Cartão de Crédito ({cardItems.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="despesas">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={despSort.sort.key === "data"} direction={despSort.sort.direction} onSort={() => despSort.toggle("data")} className="p-2 text-left">Data</SortableTh>
                      <SortableTh active={despSort.sort.key === "tipo"} direction={despSort.sort.direction} onSort={() => despSort.toggle("tipo")} className="p-2 text-left">Tipo</SortableTh>
                      {isAll && <SortableTh active={despSort.sort.key === "placa"} direction={despSort.sort.direction} onSort={() => despSort.toggle("placa")} className="p-2 text-left">Placa</SortableTh>}
                      <SortableTh active={despSort.sort.key === "descricao"} direction={despSort.sort.direction} onSort={() => despSort.toggle("descricao")} className="p-2 text-left">Descrição</SortableTh>
                      <SortableTh active={despSort.sort.key === "fornecedor"} direction={despSort.sort.direction} onSort={() => despSort.toggle("fornecedor")} className="p-2 text-left">Fornecedor/Plano</SortableTh>
                      <SortableTh active={despSort.sort.key === "valor"} direction={despSort.sort.direction} align="right" onSort={() => despSort.toggle("valor")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {despesas.length === 0 ? <tr><td colSpan={isAll ? 6 : 5} className="p-6 text-center text-muted-foreground">Nenhuma despesa no período</td></tr> :
                      despSort.sorted.map(r => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(r.data)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{r.tipo}</Badge></td>
                          {isAll && <td className="p-2 font-mono">{r.placa}</td>}
                          <td className="p-2 truncate max-w-[320px]">{r.descricao}</td>
                          <td className="p-2 truncate max-w-[220px]">{r.fornecedor}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(r.valor)}</td>
                        </tr>
                      ))}
                  </tbody>
                  {despesas.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={isAll ? 5 : 4}>Total ({despesas.length} lançamento{despesas.length === 1 ? "" : "s"})</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.custoTotal)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="fretes">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={cteSort.sort.key === "data_emissao"} direction={cteSort.sort.direction} onSort={() => cteSort.toggle("data_emissao")} className="p-2 text-left">Data</SortableTh>
                      <SortableTh active={cteSort.sort.key === "numero"} direction={cteSort.sort.direction} onSort={() => cteSort.toggle("numero")} className="p-2 text-left">Nº CT-e</SortableTh>
                      {isAll && <SortableTh active={cteSort.sort.key === "placa"} direction={cteSort.sort.direction} onSort={() => cteSort.toggle("placa")} className="p-2 text-left">Placa</SortableTh>}
                      <SortableTh active={cteSort.sort.key === "remetente_nome"} direction={cteSort.sort.direction} onSort={() => cteSort.toggle("remetente_nome")} className="p-2 text-left">Remetente</SortableTh>
                      <SortableTh active={cteSort.sort.key === "destinatario_nome"} direction={cteSort.sort.direction} onSort={() => cteSort.toggle("destinatario_nome")} className="p-2 text-left">Destinatário</SortableTh>
                      <SortableTh active={cteSort.sort.key === "valor_frete"} direction={cteSort.sort.direction} align="right" onSort={() => cteSort.toggle("valor_frete")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {ctes.length === 0 ? <tr><td colSpan={isAll ? 6 : 5} className="p-6 text-center text-muted-foreground">Nenhum frete no período</td></tr> :
                      cteSort.sorted.map(c => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(c.data_emissao)}</td>
                          <td className="p-2 font-mono">{c.numero || "—"}</td>
                          {isAll && <td className="p-2 font-mono">{plateOf(c.veiculo_id)}</td>}
                          <td className="p-2 truncate max-w-[200px]">{c.remetente_nome || "—"}</td>
                          <td className="p-2 truncate max-w-[200px]">{c.destinatario_nome || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(c.valor_frete || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                  {ctes.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={isAll ? 5 : 4}>Total ({ctes.length})</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.receitaCte)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="abast">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={fuelSort.sort.key === "data_abastecimento"} direction={fuelSort.sort.direction} onSort={() => fuelSort.toggle("data_abastecimento")} className="p-2 text-left">Data</SortableTh>
                      <SortableTh active={fuelSort.sort.key === "tipo_combustivel"} direction={fuelSort.sort.direction} onSort={() => fuelSort.toggle("tipo_combustivel")} className="p-2 text-left">Combustível</SortableTh>
                      {isAll && <SortableTh active={fuelSort.sort.key === "placa"} direction={fuelSort.sort.direction} onSort={() => fuelSort.toggle("placa")} className="p-2 text-left">Placa</SortableTh>}
                      <SortableTh active={fuelSort.sort.key === "posto_combustivel"} direction={fuelSort.sort.direction} onSort={() => fuelSort.toggle("posto_combustivel")} className="p-2 text-left">Posto</SortableTh>
                      <SortableTh active={fuelSort.sort.key === "km_atual"} direction={fuelSort.sort.direction} align="right" onSort={() => fuelSort.toggle("km_atual")} className="p-2 text-right">KM</SortableTh>
                      <SortableTh active={fuelSort.sort.key === "quantidade_litros"} direction={fuelSort.sort.direction} align="right" onSort={() => fuelSort.toggle("quantidade_litros")} className="p-2 text-right">Litros</SortableTh>
                      <SortableTh active={fuelSort.sort.key === "valor_total"} direction={fuelSort.sort.direction} align="right" onSort={() => fuelSort.toggle("valor_total")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {fuelings.length === 0 ? <tr><td colSpan={isAll ? 7 : 6} className="p-6 text-center text-muted-foreground">Nenhum abastecimento no período</td></tr> :
                      fuelSort.sorted.map(f => (
                        <tr key={f.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(f.data_abastecimento)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{f.tipo_combustivel}</Badge></td>
                          {isAll && <td className="p-2 font-mono">{plateOf(f.veiculo_id)}</td>}
                          <td className="p-2 truncate max-w-[200px]">{f.posto_combustivel || "—"}</td>
                          <td className="p-2 text-right font-mono">{f.km_atual?.toLocaleString("pt-BR") || "—"}</td>
                          <td className="p-2 text-right font-mono">{Number(f.quantidade_litros).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(f.valor_total))}</td>
                        </tr>
                      ))}
                  </tbody>
                  {fuelings.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={isAll ? 5 : 4}>Total ({fuelings.length})</td>
                        <td className="p-2 text-right font-mono">{fuelings.reduce((s, f) => s + Number(f.quantidade_litros || 0), 0).toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.custoComb)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="manut">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={maintSort.sort.key === "data_manutencao"} direction={maintSort.sort.direction} onSort={() => maintSort.toggle("data_manutencao")} className="p-2 text-left">Data</SortableTh>
                      <SortableTh active={maintSort.sort.key === "tipo_manutencao"} direction={maintSort.sort.direction} onSort={() => maintSort.toggle("tipo_manutencao")} className="p-2 text-left">Tipo</SortableTh>
                      {isAll && <SortableTh active={maintSort.sort.key === "placa"} direction={maintSort.sort.direction} onSort={() => maintSort.toggle("placa")} className="p-2 text-left">Placa</SortableTh>}
                      <SortableTh active={maintSort.sort.key === "descricao"} direction={maintSort.sort.direction} onSort={() => maintSort.toggle("descricao")} className="p-2 text-left">Descrição</SortableTh>
                      <SortableTh active={maintSort.sort.key === "fornecedor"} direction={maintSort.sort.direction} onSort={() => maintSort.toggle("fornecedor")} className="p-2 text-left">Fornecedor</SortableTh>
                      <SortableTh active={maintSort.sort.key === "custo_total"} direction={maintSort.sort.direction} align="right" onSort={() => maintSort.toggle("custo_total")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {maints.length === 0 ? <tr><td colSpan={isAll ? 6 : 5} className="p-6 text-center text-muted-foreground">Nenhuma manutenção no período</td></tr> :
                      maintSort.sorted.map(x => (
                        <tr key={x.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(x.data_manutencao)}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{x.tipo_manutencao || "—"}</Badge></td>
                          {isAll && <td className="p-2 font-mono">{plateOf(x.veiculo_id)}</td>}
                          <td className="p-2 truncate max-w-[260px]">{x.descricao || "—"}</td>
                          <td className="p-2 truncate max-w-[180px]">{x.fornecedor || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(x.custo_total || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                  {maints.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={isAll ? 5 : 4}>Total ({maints.length})</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.custoMan)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="colheita">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={colhSort.sort.key === "data_prevista"} direction={colhSort.sort.direction} onSort={() => colhSort.toggle("data_prevista")} className="p-2 text-left">Data</SortableTh>
                      <SortableTh active={colhSort.sort.key === "fazenda"} direction={colhSort.sort.direction} onSort={() => colhSort.toggle("fazenda")} className="p-2 text-left">Fazenda</SortableTh>
                      <th className="p-2 text-left">Período</th>
                      <SortableTh active={colhSort.sort.key === "status"} direction={colhSort.sort.direction} onSort={() => colhSort.toggle("status")} className="p-2 text-left">Status</SortableTh>
                      <SortableTh active={colhSort.sort.key === "valor"} direction={colhSort.sort.direction} align="right" onSort={() => colhSort.toggle("valor")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {colheitas.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nenhuma receita de colheita no período</td></tr> :
                      colhSort.sorted.map(c => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(c.data_prevista)}</td>
                          <td className="p-2 truncate max-w-[220px]">{c.metadata?.fazenda || "—"}</td>
                          <td className="p-2">{c.metadata?.periodo_inicio ? `${fmtDate(c.metadata.periodo_inicio)} → ${fmtDate(c.metadata.periodo_fim)}` : "—"}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{c.status}</Badge></td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(c.valor || 0))}</td>
                        </tr>
                      ))}
                  </tbody>
                  {colheitas.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={4}>Total ({colheitas.length})</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.receitaColheita)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="cartao">
              <Card><CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <SortableTh active={cardSort.sort.key === "posted_date"} direction={cardSort.sort.direction} onSort={() => cardSort.toggle("posted_date")} className="p-2 text-left">Data</SortableTh>
                      {isAll && <SortableTh active={cardSort.sort.key === "placa"} direction={cardSort.sort.direction} onSort={() => cardSort.toggle("placa")} className="p-2 text-left">Placa</SortableTh>}
                      <SortableTh active={cardSort.sort.key === "description"} direction={cardSort.sort.direction} onSort={() => cardSort.toggle("description")} className="p-2 text-left">Descrição</SortableTh>
                      <SortableTh active={cardSort.sort.key === "plano_nome"} direction={cardSort.sort.direction} onSort={() => cardSort.toggle("plano_nome")} className="p-2 text-left">Plano de Contas</SortableTh>
                      <SortableTh active={cardSort.sort.key === "amount"} direction={cardSort.sort.direction} align="right" onSort={() => cardSort.toggle("amount")} className="p-2 text-right">Valor</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {cardItems.length === 0 ? <tr><td colSpan={isAll ? 5 : 4} className="p-6 text-center text-muted-foreground">Nenhum lançamento de cartão no período</td></tr> :
                      cardSort.sorted.map(c => (
                        <tr key={c.id} className="border-t border-border">
                          <td className="p-2">{fmtDate(c.posted_date)}</td>
                          {isAll && <td className="p-2 font-mono">{plateOf(c.veiculo_id)}</td>}
                          <td className="p-2 truncate max-w-[320px]">{c.description}</td>
                          <td className="p-2 truncate max-w-[220px]">{c.plano_nome || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(c.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                  {cardItems.length > 0 && (
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr>
                        <td className="p-2" colSpan={isAll ? 4 : 3}>Total ({cardItems.length})</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(m.custoCartao)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
