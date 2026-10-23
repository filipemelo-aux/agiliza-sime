import { printHeaderMarker } from "@/lib/printHeader";
import { useEffect, useMemo, useState } from "react";
import { downloadHtmlAsPdf, titleFromHtml } from "@/lib/pdfDownload";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { installmentPrincipalMap, payableReportState, matchesPayableReportFilter } from "@/lib/payableReportState";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Printer, Filter, X } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { limitDisplayText } from "@/lib/displayText";
import { formatDateBR } from "@/lib/date";
import { toast } from "@/lib/notice";
import { cn } from "@/lib/utils";
import { ReportInfoTooltip } from "./ReportInfoTooltip";
import { useSortableTable } from "@/hooks/useSortableTable";
import { ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { FilterField, SearchFilterCard } from "@/components/ui/search-filter-card";

type StatusFilter = "todos" | "atrasado" | "aberto" | "pago";

interface Row {
  id: string;
  status: "atrasado" | "pendente" | "parcial" | "pago";
  dataVencimento: string;
  fornecedor: string;
  razaoSocial: string;
  nomeFantasia: string;
  descricao: string;
  parcela: string;
  categoria: string;
  veiculo: string;
  valor: number;
  valorPago: number;
  vencido: boolean;
}

const statusDot: Record<Row["status"], string> = {
  atrasado: "bg-red-500",
  pendente: "bg-amber-400",
  parcial: "bg-amber-400",
  pago: "bg-emerald-500",
};

const statusLabel: Record<Row["status"], string> = {
  atrasado: "Atrasado",
  pendente: "Em aberto",
  parcial: "Parcial",
  pago: "Pago",
};

export function PayablesDataGrid() {
  const { user, loading: authLoading, supportTenantId } = useAuth();
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [veiculoQ, setVeiculoQ] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [excludedCategorias, setExcludedCategorias] = useState<Set<string>>(new Set());

  const load = async () => {
    if (authLoading || !user) return;
    setLoading(true);
    try {
      const [chartRes, expensesRes, profilesRes, instRes, payRes, contractRes] = await Promise.all([
        fetchAllRows((from, to) => supabase.from("chart_of_accounts").select("id, codigo, nome").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("expenses").select("*").is("deleted_at", null).order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("profiles").select("id, full_name, razao_social, nome_fantasia").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("expense_installments").select("*").order("numero_parcela").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("expense_payments").select("id, expense_id, installment_id, valor, juros, desconto").order("id").range(from, to)),
        fetchAllRows((from, to) => supabase.from("freight_contracts")
          .select("id, expense_id, numero, cte:ctes!freight_contracts_cte_id_fkey(remetente_nome, recebedor_nome, destinatario_nome)")
          .order("id").range(from, to)),
      ]);
      const chart = chartRes.data;
      const expenses = expensesRes.data;
      const chartMap = new Map((chart || []).map((c: any) => [c.id, `${c.codigo} ${c.nome}`]));
      const profileById = new Map((profilesRes.data || []).map((p: any) => [p.id, p]));

      const installmentsByExp: Record<string, any[]> = {};
      (instRes.data || []).forEach((i: any) => { (installmentsByExp[i.expense_id] ||= []).push(i); });
      const pagoByInst = installmentPrincipalMap(instRes.data || [], payRes.data || []);
      const contractDescByExp: Record<string, string> = {};
      (contractRes.data || []).forEach((c: any) => {
        if (!c.expense_id) return;
        const remet = (c.cte?.remetente_nome || "—").trim().split(/\s+/).slice(0, 2).join(" ");
        const destin = (c.cte?.recebedor_nome || c.cte?.destinatario_nome || "—").trim();
        contractDescByExp[c.expense_id] = `Contrato de Frete Nº ${c.numero} - ${remet} → ${destin.slice(0, 40)}`;
      });

      const today = format(new Date(), "yyyy-MM-dd");
      const out: Row[] = [];

      (expenses || []).forEach((e: any) => {
        if (e.status === "cancelado") return;
        const categoria = e.plano_contas_id ? (chartMap.get(e.plano_contas_id) as string) || "—" : "—";
        const veiculo = e.veiculo_placa || "—";
        const descricao = contractDescByExp[e.id] || e.descricao || "—";
        const profile = e.favorecido_id ? profileById.get(e.favorecido_id) : null;
        const razaoSocial = profile?.razao_social || e.favorecido_nome || "—";
        const nomeFantasia = profile?.nome_fantasia || "";
        // Preferência: nome fantasia > razão social > favorecido_nome
        const fornecedor = nomeFantasia || razaoSocial;
        const installs = installmentsByExp[e.id] || [];

        if (installs.length > 0) {
          installs.forEach((inst: any) => {
            if (inst.status === "cancelado") return;
            const dv = inst.data_vencimento;
            const pago = pagoByInst[inst.id] || 0;
            const state = payableReportState(Number(inst.valor), pago, inst.status, dv, today);
            const restante = state.status === "pago" ? Number(inst.valor) : state.balance;
            out.push({
              id: `${e.id}-${inst.id}`,
              status: state.status,
              vencido: state.overdue,
              dataVencimento: dv,
              fornecedor,
              razaoSocial,
              nomeFantasia,
              descricao,
              parcela: `${inst.numero_parcela}/${installs.length}`,
              categoria,
              veiculo,
              valor: restante,
              valorPago: state.status === "pago" ? Number(inst.valor) : pago,
            });
          });
        } else {
          const dv = e.data_vencimento || e.data_emissao;
          const pago = Number(e.valor_pago || 0);
          const state = payableReportState(Number(e.valor_total), pago, e.status, dv, today);
          const restante = state.status === "pago" ? Number(e.valor_total) : state.balance;
          out.push({
            id: e.id,
            status: state.status,
            vencido: state.overdue,
            dataVencimento: dv,
            fornecedor,
            razaoSocial,
            nomeFantasia,
            descricao,
            parcela: "—",
            categoria,
            veiculo,
            valor: restante,
            valorPago: state.status === "pago" ? Number(e.valor_total) : pago,
          });
        }
      });

      out.sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));
      setRows(out);
    } catch (e: any) {
      setRows([]);
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authLoading, user?.id, supportTenantId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const vterm = veiculoQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (dataInicio && r.dataVencimento < dataInicio) return false;
      if (dataFim && r.dataVencimento > dataFim) return false;
      if (!matchesPayableReportFilter(r, status)) return false;
      if (vterm && !r.veiculo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(vterm)) return false;
      if (term) {
        const t = term;
        const matchFornecedor = r.fornecedor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t);
        const matchRazao = r.razaoSocial.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t);
        const matchFantasia = r.nomeFantasia.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t);
        const matchDescricao = r.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(t);
        if (!(matchFornecedor || matchRazao || matchFantasia || matchDescricao)) return false;
      }
      if (excludedCategorias.has(r.categoria)) return false;
      return true;
    });
  }, [rows, status, veiculoQ, search, excludedCategorias, dataInicio, dataFim]);

  const categoriasDisponiveis = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.categoria))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const { sort, toggle, sorted } = useSortableTable<Row, "status" | "dataVencimento" | "fornecedor" | "descricao" | "parcela" | "categoria" | "veiculo" | "valor">(
    filtered,
    { key: "dataVencimento", direction: "asc" },
    {
      status: (r) => r.status,
      dataVencimento: (r) => r.dataVencimento,
      fornecedor: (r) => r.fornecedor,
      descricao: (r) => r.descricao,
      parcela: (r) => {
        const [a] = (r.parcela || "").split("/");
        return Number(a) || 0;
      },
      categoria: (r) => r.categoria,
      veiculo: (r) => r.veiculo,
      valor: (r) => r.valor,
    },
  );

  const hideAberto = false;

  const totais = useMemo(() => {
    const sum = (filter: StatusFilter) => filtered.filter(r => matchesPayableReportFilter(r, filter)).reduce((s, r) => s + Math.round(r.valor * 100), 0) / 100;
    const total = sum("todos");
    const atrasado = sum("atrasado");
    const aberto = sum("aberto");
    const pago = sum("pago");
    return { total, atrasado, aberto, pago };
  }, [filtered]);


  const statusButtons: { v: StatusFilter; label: string }[] = [
    { v: "todos", label: "Todos" },
    { v: "atrasado", label: "Atrasado" },
    { v: "aberto", label: "A vencer" },
    { v: "pago", label: "Pago" },
  ];

  const handleExportXlsx = async () => {
    if (!sorted.length) {
      toast.warning("Nenhum registro para exportar");
      return;
    }
    const XLSX = await import("xlsx");
    const periodo = `${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`;
    const statusLbl = statusButtons.find((b) => b.v === status)?.label || "Todos";
    const data = sorted.map((r) => ({
      Status: `${statusLabel[r.status]}${r.status === "parcial" && r.vencido ? " • Vencido" : ""}`,
      Vencimento: formatDateBR(r.dataVencimento),
      Fornecedor: r.fornecedor,
      Descrição: r.descricao,
      Parcela: r.parcela,
      Categoria: r.categoria,
      Veículo: r.veiculo,
      Valor: Number(r.valor) || 0,
    }));
    const totalsRow: any = { Status: "TOTAL", Vencimento: "", Fornecedor: "", Descrição: "", Parcela: "", Categoria: "", Veículo: "", Valor: Number(totais.total) || 0 };
    const ws = XLSX.utils.json_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      ["Relatório de Contas a Pagar"],
      [`Período: ${periodo}`],
      [`Status: ${statusLbl}${veiculoQ ? ` • Placa: ${veiculoQ}` : ""}${search ? ` • Busca: ${search}` : ""}`],
      [`Atrasado: ${formatCurrency(totais.atrasado)}${hideAberto ? "" : ` • Em aberto: ${formatCurrency(totais.aberto)}`} • Pago: ${formatCurrency(totais.pago)}`],
      [],
    ]);
    XLSX.utils.sheet_add_json(ws, data, { origin: "A6" });
    XLSX.utils.sheet_add_json(ws, [totalsRow], { origin: -1, skipHeader: true });
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 40 }, { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
    XLSX.writeFile(wb, `contas-a-pagar_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);
  };

  const handlePrint = async () => {
    if (!sorted.length) {
      toast.warning("Nenhum registro para imprimir");
      return;
    }
    const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

    const periodo = `${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`;
    const statusLbl = statusButtons.find((b) => b.v === status)?.label || "Todos";
    const rowsHtml = sorted.map((r) => `
      <tr>
        <td>${esc(statusLabel[r.status])}${r.status === "parcial" && r.vencido ? " • Vencido" : ""}</td>
        <td class="nowrap">${esc(formatDateBR(r.dataVencimento))}</td>
        <td title="${esc(r.fornecedor)}${r.razaoSocial && r.razaoSocial !== r.fornecedor ? ` • Razão: ${esc(r.razaoSocial)}` : ""}${r.nomeFantasia && r.nomeFantasia !== r.fornecedor ? ` • Fantasia: ${esc(r.nomeFantasia)}` : ""}">${esc(r.fornecedor)}</td>
        <td>${esc(r.descricao)}</td>
        <td class="c">${esc(r.parcela)}</td>
        <td>${esc(r.categoria)}</td>
        <td class="nowrap">${esc(r.veiculo)}</td>
        <td class="r ${(r.status === "atrasado" || (r.status === "parcial" && r.vencido)) ? "neg" : ""}">${esc(formatCurrency(r.valor))}</td>
      </tr>`).join("");

    // Gera o XLSX AGORA no contexto do app (com xlsx bundlado) e embute como data URL no popup.
    // Isso elimina a dependência de CDN e o problema de cross-window ao clicar em "Exportar Excel".
    let xlsxDataUrl = "";
    const fileName = `contas-a-pagar_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`;
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([
        ["Relatório de Contas a Pagar"],
        [`Período: ${periodo}`],
        [`Status: ${statusLbl}${veiculoQ ? ` • Placa: ${veiculoQ}` : ""}${search ? ` • Busca: ${search}` : ""}`],
        [`Atrasado: ${formatCurrency(totais.atrasado)}${hideAberto ? "" : ` • Em aberto: ${formatCurrency(totais.aberto)}`} • Pago: ${formatCurrency(totais.pago)}`],
        [],
      ]);
      const data = sorted.map((r) => ({
        Status: `${statusLabel[r.status]}${r.status === "parcial" && r.vencido ? " • Vencido" : ""}`,
        Vencimento: formatDateBR(r.dataVencimento),
        Fornecedor: r.fornecedor,
        Descricao: r.descricao,
        Parcela: r.parcela,
        Categoria: r.categoria,
        Veiculo: r.veiculo,
        Valor: Number(r.valor) || 0,
      }));
      XLSX.utils.sheet_add_json(ws, data, { origin: "A6" });
      XLSX.utils.sheet_add_json(ws, [{ Status: "TOTAL", Vencimento: "", Fornecedor: "", Descricao: "", Parcela: "", Categoria: "", Veiculo: "", Valor: Number(totais.total) || 0 }], { origin: -1, skipHeader: true });
      ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 40 }, { wch: 8 }, { wch: 28 }, { wch: 12 }, { wch: 14 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contas a Pagar");
      const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" }) as string;
      xlsxDataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${b64}`;
    } catch (e) {
      console.error("Falha ao gerar XLSX", e);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Contas a Pagar</title>
<style>
*{box-sizing:border-box}
@page { margin: 10mm 8mm; size: A4 portrait; }
html,body{margin:0;padding:0;background:#fff;font-family:Arial,'Segoe UI',system-ui,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 12px;display:flex;gap:8px;justify-content:flex-end;position:sticky;top:0;z-index:10}
.toolbar a,.toolbar button{font-family:inherit;font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid #d1d5db;background:#2B4C7E;color:#fff;cursor:pointer;text-decoration:none;display:inline-block}
.toolbar a.excel{background:#1f7a4d}
.toolbar a.disabled{background:#9ca3af;cursor:not-allowed;pointer-events:none}
.wrap{padding:4px;background:#fff;width:100%;max-width:100%}
.head{display:flex;align-items:center;gap:10px;padding:2px 2px 4px;border-bottom:1.5px solid #2B4C7E;margin-bottom:4px}
.head img{height:26px}
.head h1{margin:0;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:8px;color:#666;text-align:right;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:7pt;background:#fff;border:1px solid #d0d7de;table-layout:fixed}
thead th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:6.5pt;letter-spacing:.2px;padding:3px 3px;border:1px solid #d0d7de;text-align:left;word-wrap:break-word;overflow-wrap:anywhere}
tbody td{padding:2px 3px;border:1px solid #e5e7eb;font-size:7pt;line-height:1.15;word-wrap:break-word;overflow-wrap:anywhere;vertical-align:top}
tbody tr:nth-child(even) td{background:#fafbfc}
.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}
.c{text-align:center}
.nowrap{white-space:nowrap;overflow-wrap:normal;font-size:6.5pt}
.neg{color:#b91c1c;font-weight:700}
tfoot td{background:#eef2f6;border-top:1.5px solid #2B4C7E}
tr{page-break-inside:avoid}
thead{display:table-header-group}
tfoot{display:table-row-group}
.foot{margin-top:4px;display:flex;justify-content:space-between;font-size:7pt;color:#6b7280}
.filters{font-size:7.5pt;color:#555;margin-bottom:3px}
.totals-labels{padding:4px 6px}
.totals-row{display:flex;justify-content:flex-end;align-items:center;gap:12px;flex-wrap:wrap}
.total-item{font-size:7.5pt;color:#4b5563}
.total-item b{font-size:8pt;color:#1f2937;font-weight:800}
.grand-total{font-size:9pt;font-weight:800;color:#2B4C7E;background:#e5ebf2;padding:4px 5px;text-align:right;white-space:nowrap}
@media print { .no-print{display:none!important} .toolbar{display:none!important} }
</style></head>
<body>
<div class="toolbar no-print">
  ${xlsxDataUrl
    ? `<a class="excel" href="${xlsxDataUrl}" download="${fileName}">Exportar Excel</a>`
    : `<a class="excel disabled">Excel indisponível</a>`}
</div>
<div class="wrap">
  ${printHeaderMarker({ title: "RELATÓRIO DE CONTAS A PAGAR", subtitle: `Período: ${periodo} · ${sorted.length} registro(s)` })}
  <div class="filters">
    Status: <b>${esc(statusLbl)}</b>${veiculoQ ? ` • Placa: <b>${esc(veiculoQ)}</b>` : ""}${search ? ` • Busca: <b>${esc(search)}</b>` : ""}
  </div>
  <table>
    <colgroup>
      <col style="width:9%" />
      <col style="width:8%" />
      <col style="width:16%" />
      <col style="width:24%" />
      <col style="width:6%" />
      <col style="width:16%" />
      <col style="width:9%" />
      <col style="width:12%" />
    </colgroup>
    <thead><tr>
      <th>Status</th><th>Venc.</th><th>Fornecedor</th><th>Descrição</th>
      <th class="c">Parc.</th><th>Categoria</th><th>Veículo</th><th class="r">Valor</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="7" class="totals-labels">
          <div class="totals-row">
            <span class="total-item">Atrasado: <b>${esc(formatCurrency(totais.atrasado))}</b></span>
            ${hideAberto ? "" : `<span class="total-item">A vencer: <b>${esc(formatCurrency(totais.aberto))}</b></span>`}
            <span class="total-item">Pago: <b>${esc(formatCurrency(totais.pago))}</b></span>
            <span class="total-item"><b>TOTAL</b></span>
          </div>
        </td>
        <td class="grand-total">${esc(formatCurrency(totais.total))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="foot"><div>SIME TRANSPORTES</div><div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div></div>
</div>
<script>
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(function () { window.focus(); window.print(); }, 400);
      });
    });
  });
</script>
</body></html>`;

    downloadHtmlAsPdf(html, titleFromHtml(html, "Contas a Pagar"));
  };


  const Th = ({ k, label, className }: { k: Parameters<typeof toggle>[0]; label: string; className?: string }) => (
    <th className={cn("px-1 py-0.5 font-medium select-none cursor-pointer whitespace-nowrap", className)} onClick={() => toggle(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sort.key === k ? "text-primary" : "text-muted-foreground/40")} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-1 h-[calc(100vh-132px)]">
      <SearchFilterCard contentClassName="gap-1.5">
        <FilterField label="Vencimento">
          <div className="flex items-center gap-1.5">
            <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            <span className="text-[10px] text-muted-foreground">até</span>
            <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        </FilterField>
        <FilterField label="Situação" className="shrink-0">
          <div className="flex gap-0.5">
            {statusButtons.map((b) => (
              <Button key={b.v} size="sm" variant={status === b.v ? "default" : "outline"} className="h-7 text-[11px] px-2 py-0" onClick={() => setStatus(b.v)}>
                {b.label}
              </Button>
            ))}
          </div>
        </FilterField>
        <FilterField label="Placa">
          <Input value={veiculoQ} onChange={(e) => setVeiculoQ(e.target.value)} placeholder="Placa" className="h-7 text-xs w-[90px] px-1.5" />
        </FilterField>
        <FilterField label="Busca" className="flex-1 min-w-[160px]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Razão social, nome fantasia ou descrição..." className="h-7 text-xs pl-7 px-1.5" />
          </div>
        </FilterField>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 py-0 gap-1" disabled={loading || categoriasDisponiveis.length === 0}>
              <Filter className="h-3 w-3" /> Excluir planos
              {excludedCategorias.size > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{excludedCategorias.size}</Badge>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold">Ocultar planos de contas</span>
              {excludedCategorias.size > 0 && <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-1" onClick={() => setExcludedCategorias(new Set())}><X className="h-3 w-3" /> Limpar</Button>}
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">Marcados serão excluídos do relatório.</p>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {categoriasDisponiveis.map((c) => (
                <label key={c} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded p-1">
                  <Checkbox checked={excludedCategorias.has(c)} onCheckedChange={(v) => setExcludedCategorias((prev) => { const next = new Set(prev); if (v) next.add(c); else next.delete(c); return next; })} />
                  <span className="leading-tight break-words">{c}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </SearchFilterCard>
      <GlobalToolbar
        actions={[
          { key: "generate", label: loading ? "Gerando" : "Gerar relatório", icon: loading ? Loader2 : Search, mode: "always", variant: "default", disabled: loading, onClick: load },
          { key: "print", label: "Imprimir", icon: Printer, mode: "always", disabled: loading || sorted.length === 0, onClick: handlePrint },
        ]}
        selectedCount={0}
      />

      <div className="flex-1 min-h-0 border border-border rounded-md bg-card overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 z-20 bg-background/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto xl:overflow-x-hidden">
          <table className="w-full min-w-[980px] xl:min-w-full text-[11px] table-fixed">
            <colgroup>
              <col className="w-[26px]" />
              <col className="w-[80px]" />
              <col className="w-[20%]" />
              <col />
              <col className="w-[56px]" />
              <col className="w-[15%]" />
              <col className="w-[76px]" />
              <col className="w-[96px]" />
            </colgroup>
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-sm">
              <tr className="text-left">
                <Th k="status" label="●" className="text-center px-1 py-0.5" />
                <Th k="dataVencimento" label="Vencimento" className="px-1 py-0.5" />
                <Th k="fornecedor" label="Fornecedor" className="px-1 py-0.5" />
                <Th k="descricao" label="Descrição" className="px-1 py-0.5" />
                <Th k="parcela" label="Parc." className="text-center px-1 py-0.5" />
                <Th k="categoria" label="Categoria" className="px-1 py-0.5" />
                <Th k="veiculo" label="Veículo" className="px-1 py-0.5" />
                <Th k="valor" label="Valor" className="text-right px-1 py-0.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-[11px] text-muted-foreground">Nenhum registro no período.</td></tr>
              )}
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-1 py-0 text-center">
                    <span
                      title={r.status === "parcial" && r.vencido ? "Parcial • Vencido" : statusLabel[r.status]}
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        r.status === "parcial" && r.vencido ? "bg-red-500 ring-2 ring-amber-300" : statusDot[r.status],
                      )}
                    />
                  </td>
                  <td className={cn("px-1 py-0 whitespace-nowrap tabular-nums", (r.status === "atrasado" || (r.status === "parcial" && r.vencido)) && "text-red-600 font-semibold")}>
                    {formatDateBR(r.dataVencimento)}
                  </td>
                  <td className="px-1 py-0 truncate whitespace-nowrap" title={`${r.fornecedor}${r.razaoSocial && r.razaoSocial !== r.fornecedor ? ` • Razão: ${r.razaoSocial}` : ""}${r.nomeFantasia && r.nomeFantasia !== r.fornecedor ? ` • Fantasia: ${r.nomeFantasia}` : ""}`}>{limitDisplayText(r.fornecedor)}</td>
                  <td className="px-1 py-0 truncate" title={r.descricao}>
                    {r.descricao}
                    {r.status === "parcial" && r.vencido && (
                      <span className="ml-1 inline-block text-[9px] px-1 py-0 rounded bg-red-100 text-red-700 border border-red-200 align-middle">Vencido</span>
                    )}
                  </td>
                  <td className="px-1 py-0 text-center whitespace-nowrap tabular-nums">{r.parcela}</td>
                  <td className="px-1 py-0 truncate text-muted-foreground" title={r.categoria}>{r.categoria}</td>
                  <td className="px-1 py-0 whitespace-nowrap font-mono truncate" title={r.veiculo}>{r.veiculo}</td>
                  <td className={cn("px-1 py-0 text-right tabular-nums font-medium", (r.status === "atrasado" || (r.status === "parcial" && r.vencido)) && "text-red-600")}>
                    {formatCurrency(r.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-muted/95 backdrop-blur px-2 py-0.5 text-[11px] flex items-center justify-between gap-3 flex-wrap">
          <span className="font-semibold">{filtered.length} registro(s)</span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Atrasado: <span className="font-bold text-red-600">{formatCurrency(totais.atrasado)}</span></span>
            {!hideAberto && <span>A vencer: <span className="font-bold text-amber-600">{formatCurrency(totais.aberto)}</span></span>}
            <span>Pago: <span className="font-bold text-emerald-600">{formatCurrency(totais.pago)}</span></span>
            <span>Total: <span className="font-bold text-primary tabular-nums">{formatCurrency(totais.total)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

