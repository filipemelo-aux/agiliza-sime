import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, Loader2, FileSpreadsheet, Search } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

type ReportType = "payables" | "receivables" | "cashflow" | "forecasts";
type GroupBy = "none" | "plano" | "centro" | "favorecido" | "cliente" | "origem" | "status";

interface Filters {
  dataInicio: string;
  dataFim: string;
  status: string;
  planoContasId: string;
  centroCusto: string;
  favorecidoId: string;
  clienteId: string;
  origem: string;
  groupBy: GroupBy;
}

interface Row {
  id: string;
  data: string;
  descricao: string;
  pessoa: string;
  status: string;
  valor: number;
  origem: string;
  plano: string;
  centro: string;
  tipo?: "entrada" | "saida";
}

const initialFilters = (type: ReportType): Filters => ({
  dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  status: "todos",
  planoContasId: "todos",
  centroCusto: "todos",
  favorecidoId: "todos",
  clienteId: "todos",
  origem: "todos",
  groupBy: type === "payables" ? "plano" : type === "receivables" ? "cliente" : type === "cashflow" ? "origem" : "status",
});

const STATUS_OPTIONS: Record<ReportType, { value: string; label: string }[]> = {
  payables: [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "atrasado", label: "Atrasado" },
    { value: "parcial", label: "Parcial" },
    { value: "pago", label: "Pago" },
  ],
  receivables: [
    { value: "todos", label: "Todos" },
    { value: "aberto", label: "Aberto" },
    { value: "recebido", label: "Recebido" },
  ],
  cashflow: [
    { value: "todos", label: "Todas" },
    { value: "entrada", label: "Entradas" },
    { value: "saida", label: "Saídas" },
  ],
  forecasts: [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "faturado", label: "Faturado" },
  ],
};

const ORIGEM_OPTIONS: Record<ReportType, { value: string; label: string }[]> = {
  payables: [
    { value: "todos", label: "Todas" },
    { value: "manual", label: "Manual" },
    { value: "abastecimento", label: "Abastecimento" },
    { value: "manutencao", label: "Manutenção" },
    { value: "colheita", label: "Colheita" },
    { value: "xml_import", label: "XML Importado" },
  ],
  receivables: [{ value: "todos", label: "Todas" }],
  cashflow: [
    { value: "todos", label: "Todas" },
    { value: "contas_pagar", label: "Contas a Pagar" },
    { value: "contas_receber", label: "Contas a Receber" },
    { value: "pagamento_despesa", label: "Pagamento Despesa" },
    { value: "recebimento_conta_receber", label: "Recebimento" },
    { value: "manual", label: "Manual" },
  ],
  forecasts: [
    { value: "todos", label: "Todas" },
    { value: "cte", label: "CT-e" },
    { value: "manual", label: "Manual" },
    { value: "colheita", label: "Colheita" },
  ],
};

export function FinancialReports() {
  const isMobile = useIsMobile();
  const [reportType, setReportType] = useState<ReportType>("payables");
  const [favorecidoSearch, setFavorecidoSearch] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters("payables"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartAccounts, setChartAccounts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("chart_of_accounts").select("id, codigo, nome").eq("ativo", true).order("codigo").then(({ data }) => setChartAccounts(data || []));
    supabase.from("profiles").select("id, full_name, nome_fantasia, razao_social, category").order("full_name").then(({ data }) => setProfiles(data || []));
  }, []);

  const handleTabChange = (t: string) => {
    const tt = t as ReportType;
    setReportType(tt);
    setFilters(initialFilters(tt));
    setRows([]);
  };

  const updateFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result: Row[] = [];
      if (reportType === "payables") {
        let q: any = supabase.from("expenses").select("*").is("deleted_at", null);
        if (filters.dataInicio) q = q.gte("data_vencimento", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_vencimento", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.planoContasId !== "todos") q = q.eq("plano_contas_id", filters.planoContasId);
        if (filters.centroCusto !== "todos") q = q.eq("centro_custo", filters.centroCusto);
        if (filters.favorecidoId !== "todos") q = q.eq("favorecido_id", filters.favorecidoId);
        if (filters.origem !== "todos") q = q.eq("origem", filters.origem);
        const { data, error } = await q.order("data_vencimento", { ascending: true }).limit(2000);
        if (error) throw error;
        const chartMap = new Map(chartAccounts.map((c) => [c.id, c]));
        result = (data || []).map((e: any) => {
          const c = e.plano_contas_id ? chartMap.get(e.plano_contas_id) : null;
          return {
            id: e.id,
            data: e.data_vencimento || e.data_emissao,
            descricao: e.descricao,
            pessoa: e.favorecido_nome || "—",
            status: e.status,
            valor: Number(e.valor_total),
            origem: e.origem,
            plano: c ? `${c.codigo} ${c.nome}` : "—",
            centro: e.centro_custo,
          };
        });
      } else if (reportType === "receivables") {
        let q: any = supabase.from("contas_receber").select("*, faturas_recebimento(numero, cliente_id), profile:cliente_id(full_name, nome_fantasia)");
        if (filters.dataInicio) q = q.gte("data_vencimento", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_vencimento", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("cliente_id", filters.clienteId);
        const { data, error } = await q.order("data_vencimento", { ascending: true }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => ({
          id: c.id,
          data: c.data_vencimento,
          descricao: `Fatura ${c.faturas_recebimento?.numero || "—"}`,
          pessoa: c.profile?.nome_fantasia || c.profile?.full_name || "—",
          status: c.status,
          valor: Number(c.valor),
          origem: "fatura",
          plano: "—",
          centro: "—",
        }));
      } else if (reportType === "cashflow") {
        let q: any = supabase.from("movimentacoes_bancarias").select("*");
        if (filters.dataInicio) q = q.gte("data_movimentacao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_movimentacao", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("tipo", filters.status);
        if (filters.origem !== "todos") q = q.eq("origem", filters.origem);
        const { data, error } = await q.order("data_movimentacao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => ({
          id: m.id,
          data: m.data_movimentacao,
          descricao: m.descricao || "—",
          pessoa: "—",
          status: m.tipo,
          valor: Number(m.valor),
          origem: m.origem,
          plano: "—",
          centro: "—",
          tipo: m.tipo,
        }));
      } else if (reportType === "forecasts") {
        let q: any = supabase.from("previsoes_recebimento").select("*, profile:cliente_id(full_name, nome_fantasia)");
        if (filters.dataInicio) q = q.gte("data_prevista", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_prevista", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("cliente_id", filters.clienteId);
        if (filters.origem !== "todos") q = q.eq("origem_tipo", filters.origem);
        const { data, error } = await q.order("data_prevista", { ascending: true }).limit(2000);
        if (error) throw error;
        result = (data || []).map((p: any) => ({
          id: p.id,
          data: p.data_prevista,
          descricao: `${p.origem_tipo?.toUpperCase() || ""} ${p.metadata?.descricao || ""}`.trim(),
          pessoa: p.profile?.nome_fantasia || p.profile?.full_name || "—",
          status: p.status,
          valor: Number(p.valor),
          origem: p.origem_tipo,
          plano: "—",
          centro: "—",
        }));
      }
      setRows(result);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [reportType, filters, chartAccounts]);

  const grouped = useMemo(() => {
    const gb = filters.groupBy;
    if (gb === "none") return [{ key: "Todos", rows }];
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      let k = "—";
      if (gb === "plano") k = r.plano;
      else if (gb === "centro") k = r.centro;
      else if (gb === "favorecido" || gb === "cliente") k = r.pessoa;
      else if (gb === "origem") k = r.origem;
      else if (gb === "status") k = r.status;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => ({ key, rows: rs }));
  }, [rows, filters.groupBy]);

  const totals = useMemo(() => {
    if (reportType === "cashflow") {
      const entradas = rows.filter((r) => r.tipo === "entrada").reduce((s, r) => s + r.valor, 0);
      const saidas = rows.filter((r) => r.tipo === "saida").reduce((s, r) => s + r.valor, 0);
      return { total: entradas - saidas, count: rows.length, entradas, saidas };
    }
    return { total: rows.reduce((s, r) => s + r.valor, 0), count: rows.length };
  }, [rows, reportType]);

  const REPORT_TITLE: Record<ReportType, string> = {
    payables: "RELATÓRIO DE CONTAS A PAGAR",
    receivables: "RELATÓRIO DE CONTAS A RECEBER",
    cashflow: "RELATÓRIO DE FLUXO DE CAIXA",
    forecasts: "RELATÓRIO DE PREVISÕES DE RECEBIMENTO",
  };

  const handlePrint = async () => {
    if (!rows.length) {
      toast.warning("Nenhum dado para imprimir");
      return;
    }
    let estName = "";
    let estCnpj = "";
    try {
      const { data } = await supabase.from("fiscal_establishments").select("razao_social,cnpj,type").eq("active", true).order("type");
      if (data && data.length > 0) {
        const matriz = data.find((e: any) => e.type === "matriz") || data[0];
        estName = matriz?.razao_social || "";
        estCnpj = data
          .map((e: any) => {
            const c = e.cnpj;
            return c ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : "";
          })
          .filter(Boolean)
          .join(" / ");
      }
    } catch {}

    const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
    const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
    const periodoLabel = `${formatDateBR(filters.dataInicio)} a ${formatDateBR(filters.dataFim)}`;

    const statusBadge = (s: string) => {
      const colors: Record<string, { bg: string; fg: string }> = {
        pago: { bg: "#d4edda", fg: "#155724" },
        recebido: { bg: "#d4edda", fg: "#155724" },
        entrada: { bg: "#d4edda", fg: "#155724" },
        atrasado: { bg: "#f8d7da", fg: "#721c24" },
        saida: { bg: "#f8d7da", fg: "#721c24" },
        pendente: { bg: "#fff3cd", fg: "#856404" },
        aberto: { bg: "#fff3cd", fg: "#856404" },
        parcial: { bg: "#cce5ff", fg: "#004085" },
        faturado: { bg: "#cce5ff", fg: "#004085" },
      };
      const c = colors[s] || { bg: "#e9ecef", fg: "#495057" };
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${c.bg};color:${c.fg}">${s}</span>`;
    };

    const sectionsHtml = grouped
      .map((g) => {
        const subtotal = g.rows.reduce((s, r) => s + (r.tipo === "saida" ? -r.valor : r.valor), 0);
        const tableRows = g.rows
          .map(
            (r, i) => `<tr style="border-bottom:1px solid #f0f2f5">
        <td style="padding:8px 10px;font-size:11px;color:#888;text-align:center;width:28px">${i + 1}</td>
        <td style="padding:8px;font-size:11px;color:#555;white-space:nowrap">${formatDateBR(r.data)}</td>
        <td style="padding:8px;font-size:11px;color:#333">
          <div style="font-weight:600">${r.pessoa}</div>
          <div style="font-size:10px;color:#888;margin-top:1px">${r.descricao}</div>
        </td>
        <td style="padding:8px;text-align:center">${statusBadge(r.status)}</td>
        <td style="padding:8px 12px;text-align:right;font-weight:700;color:${r.tipo === "saida" ? "#c0392b" : "#2B4C7E"};white-space:nowrap;font-size:12px">${r.tipo === "saida" ? "-" : ""}${formatCurrency(r.valor)}</td>
      </tr>`,
          )
          .join("");
        const groupHeader =
          filters.groupBy !== "none"
            ? `<tr style="background:#eef2f7"><td colspan="5" style="padding:8px 12px;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:0.3px">${g.key} <span style="color:#888;font-weight:400">(${g.rows.length})</span></td></tr>`
            : "";
        const subtotalRow =
          filters.groupBy !== "none"
            ? `<tr style="background:#fafbfc"><td colspan="4" style="padding:6px 12px;text-align:right;font-size:11px;color:#666;font-weight:600">Subtotal</td><td style="padding:6px 12px;text-align:right;font-weight:700;color:#2B4C7E;font-size:12px">${formatCurrency(subtotal)}</td></tr>`
            : "";
        return groupHeader + tableRows + subtotalRow;
      })
      .join("");

    const totalLine =
      reportType === "cashflow"
        ? `<tr style="background:#f0f4f8"><td colspan="4" style="padding:12px;text-align:right;font-size:12px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Entradas: ${formatCurrency((totals as any).entradas)} | Saídas: ${formatCurrency((totals as any).saidas)} | Saldo</td><td style="padding:12px;text-align:right;font-size:15px;font-weight:800;color:${totals.total >= 0 ? "#2B4C7E" : "#c0392b"}">${formatCurrency(totals.total)}</td></tr>`
        : `<tr style="background:#f0f4f8"><td colspan="4" style="padding:12px;text-align:right;font-size:12px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total Geral</td><td style="padding:12px;text-align:right;font-size:15px;font-weight:800;color:#2B4C7E">${formatCurrency(totals.total)}</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${REPORT_TITLE[reportType]}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print { @page { margin: 8mm 6mm; size: A4; } html,body{margin:0!important;padding:0!important;background:#fff!important} }
</style></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:${FONT}">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 8px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:800px;font-family:${FONT}">
<tr><td style="background:#fff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E">
<table width="100%"><tr>
<td style="width:48px"><img src="${logoUrl}" width="42" height="42" style="border-radius:6px"/></td>
<td><div style="font-weight:800;font-size:18px;color:#2B4C7E">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
<div style="font-size:11px;color:#666">${estName}</div>
${estCnpj ? estCnpj.split(" / ").map((c) => `<div style="font-size:11px;color:#666">CNPJ: ${c}</div>`).join("") : ""}
</td></tr></table></td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="background:#fff;border-radius:10px;padding:10px 20px;text-align:center">
<div style="font-size:17px;font-weight:700;color:#2B4C7E">${REPORT_TITLE[reportType]}</div>
<div style="font-size:11px;color:#888;margin-top:4px">Período: ${periodoLabel} • ${rows.length} registro(s)</div>
</td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="background:#fff;border-radius:10px;overflow:hidden">
<table width="100%" cellpadding="0" cellspacing="0">
<tr style="background:#f5f7fa">
<td style="padding:8px 10px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:center;width:28px">#</td>
<td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase">Data</td>
<td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase">Pessoa / Descrição</td>
<td style="padding:8px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:center">Status</td>
<td style="padding:8px 12px;font-size:10px;font-weight:700;color:#888;text-transform:uppercase;text-align:right">Valor</td>
</tr>
${sectionsHtml}
${totalLine}
</table></td></tr>
<tr><td style="height:10px"></td></tr>
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
<div style="font-size:10px;color:rgba(255,255,255,0.85)">SIME TRANSPORTES${estName ? ` — ${estName}` : ""}</div>
<div style="font-size:10px;color:rgba(255,255,255,0.85)">Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
</td></tr>
</table></td></tr></table></body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { win.focus(); win.print(); };
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Pessoa", "Descrição", "Plano de Contas", "Centro de Custo", "Origem", "Status", "Valor"];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push([formatDateBR(r.data), r.pessoa, r.descricao.replace(/;/g, ","), r.plano, r.centro, r.origem, r.status, r.valor.toFixed(2).replace(".", ",")].join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${reportType}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showFavorecido = reportType === "payables";
  const showCliente = reportType === "receivables" || reportType === "forecasts";
  const showPlanoContas = reportType === "payables";
  const showCentroCusto = reportType === "payables";
  const showOrigem = reportType !== "receivables";

  const groupOptions: { value: GroupBy; label: string }[] = useMemo(() => {
    const base: { value: GroupBy; label: string }[] = [{ value: "none", label: "Sem agrupamento" }, { value: "status", label: "Status" }];
    if (showPlanoContas) base.push({ value: "plano", label: "Plano de Contas" });
    if (showCentroCusto) base.push({ value: "centro", label: "Centro de Custo" });
    if (showFavorecido) base.push({ value: "favorecido", label: "Favorecido" });
    if (showCliente) base.push({ value: "cliente", label: "Cliente" });
    if (showOrigem) base.push({ value: "origem", label: "Origem" });
    return base;
  }, [reportType]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-foreground">Relatórios Financeiros</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!rows.length} className="gap-1">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={handleTabChange}>
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
          <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
          <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="forecasts">Previsões</TabsTrigger>
        </TabsList>

        <TabsContent value={reportType} className="mt-4">
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data Inicial</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataInicio} onChange={(e) => updateFilter("dataInicio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data Final</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataFim} onChange={(e) => updateFilter("dataFim", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {showOrigem && (
                  <div className="space-y-1">
                    <Label className="text-xs">Origem</Label>
                    <Select value={filters.origem} onValueChange={(v) => updateFilter("origem", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ORIGEM_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showPlanoContas && (
                  <div className="space-y-1">
                    <Label className="text-xs">Plano de Contas</Label>
                    <Select value={filters.planoContasId} onValueChange={(v) => updateFilter("planoContasId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {chartAccounts.map((c) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.codigo} {c.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showCentroCusto && (
                  <div className="space-y-1">
                    <Label className="text-xs">Centro de Custo</Label>
                    <Select value={filters.centroCusto} onValueChange={(v) => updateFilter("centroCusto", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        <SelectItem value="operacional" className="text-xs">Operacional</SelectItem>
                        <SelectItem value="administrativo" className="text-xs">Administrativo</SelectItem>
                        <SelectItem value="comercial" className="text-xs">Comercial</SelectItem>
                        <SelectItem value="financeiro" className="text-xs">Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showFavorecido && (() => {
                  const term = favorecidoSearch.trim().toLowerCase();
                  const list = term
                    ? profiles.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)))
                    : profiles;
                  return (
                    <div className="space-y-1">
                      <Label className="text-xs">Favorecido</Label>
                      <Select value={filters.favorecidoId} onValueChange={(v) => updateFilter("favorecidoId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                value={favorecidoSearch}
                                onChange={(e) => setFavorecidoSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Buscar..."
                                className="h-7 text-xs pl-7"
                              />
                            </div>
                          </div>
                          <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                          {list.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                          {list.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                {showCliente && (() => {
                  const term = clienteSearch.trim().toLowerCase();
                  const baseList = profiles.filter((p) => p.category === "cliente");
                  const list = term
                    ? baseList.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)))
                    : baseList;
                  return (
                    <div className="space-y-1">
                      <Label className="text-xs">Cliente</Label>
                      <Select value={filters.clienteId} onValueChange={(v) => updateFilter("clienteId", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                value={clienteSearch}
                                onChange={(e) => setClienteSearch(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Buscar..."
                                className="h-7 text-xs pl-7"
                              />
                            </div>
                          </div>
                          <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                          {list.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                          {list.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
                <div className="space-y-1">
                  <Label className="text-xs">Agrupar por</Label>
                  <Select value={filters.groupBy} onValueChange={(v) => updateFilter("groupBy", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex flex-col justify-end">
                  <Button size="sm" onClick={fetchData} disabled={loading} className="gap-1 h-8">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Gerar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground">{rows.length} registro(s)</div>
                {reportType === "cashflow" ? (
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-600 font-semibold">Entradas: {formatCurrency((totals as any).entradas)}</span>
                    <span className="text-red-600 font-semibold">Saídas: {formatCurrency((totals as any).saidas)}</span>
                    <span className={`font-bold ${totals.total >= 0 ? "text-primary" : "text-red-600"}`}>Saldo: {formatCurrency(totals.total)}</span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-primary">Total: {formatCurrency(totals.total)}</div>
                )}
              </div>

              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {grouped.map((g) => (
                    <div key={g.key} className="space-y-2">
                      {filters.groupBy !== "none" && (
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-bold text-primary uppercase">
                            {g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span>
                          </span>
                          <span className="text-[11px] font-bold text-primary tabular-nums">
                            {formatCurrency(g.rows.reduce((s, r) => s + (r.tipo === "saida" ? -r.valor : r.valor), 0))}
                          </span>
                        </div>
                      )}
                      {g.rows.map((r) => (
                        <Card key={r.id}>
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">{r.pessoa}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-muted-foreground truncate">
                                <span>{formatDateBR(r.data)}</span>
                                <span className="truncate">· {r.descricao}</span>
                              </div>
                              <span className={`font-mono font-bold tabular-nums ${r.tipo === "saida" ? "text-red-600" : "text-foreground"}`}>
                                {r.tipo === "saida" ? "-" : ""}{formatCurrency(r.valor)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium whitespace-nowrap w-[110px]">Data</th>
                          <th className="px-3 py-2 font-medium">Pessoa / Descrição</th>
                          <th className="px-2 py-2 font-medium text-center w-[110px]">Status</th>
                          <th className="px-2 py-2 font-medium text-right w-[140px]">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.map((g) => (
                          <Fragment key={g.key}>
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/40 border-t border-border">
                                <td colSpan={4} className="px-3 py-1.5 text-xs font-bold text-primary uppercase">
                                  {g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span>
                                </td>
                              </tr>
                            )}
                            {g.rows.map((r) => (
                              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(r.data)}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium truncate max-w-[420px]">{r.pessoa}</div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[420px]">{r.descricao}</div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                                </td>
                                <td className={`px-2 py-2 text-right tabular-nums font-medium ${r.tipo === "saida" ? "text-red-600" : "text-foreground"}`}>
                                  {r.tipo === "saida" ? "-" : ""}{formatCurrency(r.valor)}
                                </td>
                              </tr>
                            ))}
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/20 border-t border-border">
                                <td colSpan={3} className="px-3 py-1.5 text-right text-xs font-semibold">Subtotal</td>
                                <td className="px-2 py-1.5 text-right text-xs font-bold text-primary tabular-nums">
                                  {formatCurrency(g.rows.reduce((s, r) => s + (r.tipo === "saida" ? -r.valor : r.valor), 0))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
