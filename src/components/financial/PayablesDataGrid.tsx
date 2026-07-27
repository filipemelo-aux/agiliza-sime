import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Printer, Filter, X } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReportInfoTooltip } from "./ReportInfoTooltip";
import { useSortableTable } from "@/hooks/useSortableTable";
import { ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

type StatusFilter = "todos" | "atrasado" | "aberto" | "pago";

interface Row {
  id: string;
  status: "atrasado" | "pendente" | "parcial" | "pago";
  dataVencimento: string;
  fornecedor: string;
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
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dataFim, setDataFim] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [veiculoQ, setVeiculoQ] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [excludedCategorias, setExcludedCategorias] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const { data: chart } = await supabase.from("chart_of_accounts").select("id, codigo, nome");
      const chartMap = new Map((chart || []).map((c: any) => [c.id, `${c.codigo} ${c.nome}`]));

      let q: any = supabase.from("expenses").select("*").is("deleted_at", null);
      const { data: expenses, error } = await q.limit(10000);
      if (error) throw error;
      const expIds = (expenses || []).map((e: any) => e.id);

      const [instRes, payRes, contractRes] = await Promise.all([
        expIds.length
          ? supabase.from("expense_installments").select("*").in("expense_id", expIds).order("numero_parcela")
          : Promise.resolve({ data: [] as any[] } as any),
        expIds.length
          ? supabase.from("expense_payments").select("expense_id, installment_id, valor")
              .in("expense_id", expIds)
          : Promise.resolve({ data: [] as any[] } as any),
        expIds.length
          ? supabase.from("freight_contracts")
              .select("expense_id, numero, cte:ctes!freight_contracts_cte_id_fkey(remetente_nome, recebedor_nome, destinatario_nome)")
              .in("expense_id", expIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const installmentsByExp: Record<string, any[]> = {};
      (instRes.data || []).forEach((i: any) => { (installmentsByExp[i.expense_id] ||= []).push(i); });
      const pagoByInst: Record<string, number> = {};
      const pagoByExp: Record<string, number> = {};
      (payRes.data || []).forEach((p: any) => {
        if (p.installment_id) pagoByInst[p.installment_id] = (pagoByInst[p.installment_id] || 0) + Number(p.valor || 0);
        pagoByExp[p.expense_id] = (pagoByExp[p.expense_id] || 0) + Number(p.valor || 0);
      });
      const contractDescByExp: Record<string, string> = {};
      (contractRes.data || []).forEach((c: any) => {
        if (!c.expense_id) return;
        const remet = (c.cte?.remetente_nome || "—").trim().split(/\s+/).slice(0, 2).join(" ");
        const destin = (c.cte?.recebedor_nome || c.cte?.destinatario_nome || "—").trim();
        contractDescByExp[c.expense_id] = `Contrato de Frete Nº ${c.numero} - ${remet} → ${destin.slice(0, 40)}`;
      });

      const today = format(new Date(), "yyyy-MM-dd");
      const inRange = (d: string | null) => !!d && d >= dataInicio && d <= dataFim;
      const out: Row[] = [];

      (expenses || []).forEach((e: any) => {
        const categoria = e.plano_contas_id ? (chartMap.get(e.plano_contas_id) as string) || "—" : "—";
        const veiculo = e.veiculo_placa || "—";
        const descricao = contractDescByExp[e.id] || e.descricao || "—";
        const fornecedor = e.favorecido_nome || "—";
        const installs = installmentsByExp[e.id] || [];

        if (installs.length > 0) {
          installs.forEach((inst: any) => {
            const dv = inst.data_vencimento;
            if (!inRange(dv)) return;
            const pago = pagoByInst[inst.id] || 0;
            const isPago = inst.status === "pago";
            // Mantém 'parcial' quando há pagamento; só marca 'atrasado' quando ainda pendente sem quitação
            let s: Row["status"];
            if (isPago) s = "pago";
            else if (pago > 0) s = "parcial";
            else if (dv && dv < today) s = "atrasado";
            else s = (inst.status as Row["status"]) || "pendente";
            const restante = isPago ? Number(inst.valor) : Math.max(Number(inst.valor) - pago, 0);
            out.push({
              id: `${e.id}-${inst.id}`,
              status: s,
              vencido: !isPago && !!dv && dv < today,
              dataVencimento: dv,
              fornecedor,
              descricao,
              parcela: `${inst.numero_parcela}/${installs.length}`,
              categoria,
              veiculo,
              valor: restante,
              valorPago: pago,
            });
          });
        } else {
          const dv = e.data_vencimento || e.data_emissao;
          if (!inRange(dv)) return;
          const pago = Number(e.valor_pago || 0);
          const isPago = e.status === "pago";
          let s: Row["status"];
          if (isPago) s = "pago";
          else if (pago > 0) s = "parcial";
          else if (dv && dv < today) s = "atrasado";
          else s = (e.status as Row["status"]) || "pendente";
          const restante = isPago ? Number(e.valor_total) : Math.max(Number(e.valor_total) - pago, 0);
          out.push({
            id: e.id,
            status: s,
            vencido: !isPago && !!dv && dv < today,
            dataVencimento: dv,
            fornecedor,
            descricao,
            parcela: "—",
            categoria,
            veiculo,
            valor: restante,
            valorPago: pago,
          });
        }
      });

      out.sort((a, b) => (a.dataVencimento || "").localeCompare(b.dataVencimento || ""));
      setRows(out);
    } catch (e: any) {
      toast.error("Erro ao carregar", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const vterm = veiculoQ.trim().toLowerCase();
    return rows.filter((r) => {
      // 'atrasado' inclui: status='atrasado' OU parcial vencido
      if (status === "atrasado" && !(r.status === "atrasado" || (r.status === "parcial" && r.vencido))) return false;
      if (status === "aberto" && !(r.status === "pendente" || r.status === "parcial")) return false;
      if (status === "pago" && r.status !== "pago") return false;
      if (vterm && !r.veiculo.toLowerCase().includes(vterm)) return false;
      if (term && !(r.fornecedor.toLowerCase().includes(term) || r.descricao.toLowerCase().includes(term))) return false;
      if (excludedCategorias.has(r.categoria)) return false;
      return true;
    });
  }, [rows, status, veiculoQ, search, excludedCategorias]);

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

  const hideAberto = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return dataFim < today;
  }, [dataFim]);

  const totais = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.valor, 0);
    const atrasado = filtered.filter((r) => r.status === "atrasado" || (r.status === "parcial" && r.vencido)).reduce((s, r) => s + r.valor, 0);
    const aberto = hideAberto ? 0 : filtered.filter((r) => r.status === "pendente" || r.status === "parcial").reduce((s, r) => s + r.valor, 0);
    const pago = filtered.filter((r) => r.status === "pago").reduce((s, r) => s + r.valorPago, 0);
    return { total, atrasado, aberto, pago };
  }, [filtered, hideAberto]);


  const statusButtons: { v: StatusFilter; label: string }[] = [
    { v: "todos", label: "Todos" },
    { v: "atrasado", label: "Atrasado" },
    { v: "aberto", label: "Em aberto" },
    { v: "pago", label: "Pago" },
  ];

  const handlePrint = () => {
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
        <td>${esc(r.fornecedor)}</td>
        <td>${esc(r.descricao)}</td>
        <td class="c">${esc(r.parcela)}</td>
        <td>${esc(r.categoria)}</td>
        <td class="nowrap">${esc(r.veiculo)}</td>
        <td class="r ${(r.status === "atrasado" || (r.status === "parcial" && r.vencido)) ? "neg" : ""}">${esc(formatCurrency(r.valor))}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Contas a Pagar</title>
<style>
*{box-sizing:border-box}
@page { margin: 8mm 6mm; size: A4 landscape; }
html,body{margin:0;padding:0;background:#fff;font-family:Arial,'Segoe UI',system-ui,sans-serif;color:#1f2937;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.toolbar{background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 12px;display:flex;gap:8px;justify-content:flex-end}
.toolbar button{font-family:inherit;font-size:11px;font-weight:600;padding:5px 10px;border-radius:4px;border:1px solid #d1d5db;background:#2B4C7E;color:#fff;cursor:pointer}
.wrap{padding:4px 6px;background:#fff}
.head{display:flex;align-items:center;gap:10px;padding:4px 2px 6px;border-bottom:1.5px solid #2B4C7E;margin-bottom:6px}
.head img{height:32px}
.head h1{margin:0;font-size:12px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:9px;color:#666;text-align:right;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:9px;background:#fff;border:1px solid #d0d7de;table-layout:fixed}
thead th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:8px;letter-spacing:.2px;padding:4px 5px;border:1px solid #d0d7de;text-align:left}
tbody td{padding:3px 5px;border:1px solid #e5e7eb;font-size:9px;line-height:1.25;word-wrap:break-word;overflow-wrap:break-word}
tbody tr:nth-child(even) td{background:#fafbfc}
.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.c{text-align:center}
.nowrap{white-space:nowrap}
.neg{color:#b91c1c;font-weight:700}
tfoot td{background:#eef2f6;border-top:1.5px solid #2B4C7E}
tr{page-break-inside:avoid}
thead{display:table-header-group}
tfoot{display:table-row-group}
.foot{margin-top:6px;display:flex;justify-content:space-between;font-size:8px;color:#6b7280}
.filters{font-size:8.5px;color:#555;margin-bottom:4px}
.totals-labels{padding:6px 10px}
.totals-row{display:flex;justify-content:flex-end;align-items:center;gap:20px;flex-wrap:wrap}
.total-item{font-size:9px;color:#4b5563}
.total-item b{font-size:10px;color:#1f2937;font-weight:800}
.grand-total{font-size:11px;font-weight:800;color:#2B4C7E;background:#e5ebf2;padding:6px 8px}
@media print { .no-print{display:none!important} .toolbar{display:none!important} }
</style></head>
<body>
<div class="toolbar no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
<div class="wrap">
  <div class="head">
    <img src="${window.location.origin}/logo.png" alt="" onerror="this.style.display='none'" />
    <div style="flex:1"><h1>Relatório de Contas a Pagar</h1><div class="per">Período: ${esc(periodo)} • ${sorted.length} registro(s)</div></div>
  </div>
  <div class="filters">
    Status: <b>${esc(statusLbl)}</b>${veiculoQ ? ` • Placa: <b>${esc(veiculoQ)}</b>` : ""}${search ? ` • Busca: <b>${esc(search)}</b>` : ""}
  </div>
  <table>
    <colgroup>
      <col style="width:8%" />
      <col style="width:7%" />
      <col style="width:18%" />
      <col style="width:24%" />
      <col style="width:5%" />
      <col style="width:16%" />
      <col style="width:7%" />
      <col style="width:9%" />
    </colgroup>
    <thead><tr>
      <th>Status</th><th>Vencimento</th><th>Fornecedor</th><th>Descrição</th>
      <th class="c">Parc.</th><th>Categoria</th><th>Veículo</th><th class="r">Valor</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr>
        <td colspan="7" class="totals-labels">
          <div class="totals-row">
            <span class="total-item">Atrasado: <b>${esc(formatCurrency(totais.atrasado))}</b></span>
            ${hideAberto ? "" : `<span class="total-item">Em aberto: <b>${esc(formatCurrency(totais.aberto))}</b></span>`}
            <span class="total-item">Pago: <b>${esc(formatCurrency(totais.pago))}</b></span>
            <span class="total-item total"><b>TOTAL</b></span>
          </div>
        </td>
        <td class="r grand-total">${esc(formatCurrency(totais.total))}</td>
      </tr>
    </tfoot>
  </table>
  <div class="foot"><div>SIME TRANSPORTES</div><div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div></div>
</div>
<script>
  window.addEventListener('load', function () {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        setTimeout(function () { window.focus(); window.print(); }, 250);
      });
    });
  });
</script>
</body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      toast.error("Libere pop-ups para gerar a impressão");
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
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
      <div className="flex flex-wrap items-center gap-1 px-0.5">
        <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <span className="text-[10px] text-muted-foreground">até</span>
        <Input type="date" className="h-7 text-xs w-[120px] px-1.5" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        <div className="flex gap-0.5 ml-1">
          {statusButtons.map((b) => (
            <Button
              key={b.v}
              size="sm"
              variant={status === b.v ? "default" : "outline"}
              className="h-7 text-[11px] px-2 py-0"
              onClick={() => setStatus(b.v)}
            >
              {b.label}
            </Button>
          ))}
        </div>
        <Input value={veiculoQ} onChange={(e) => setVeiculoQ(e.target.value)} placeholder="Placa" className="h-7 text-xs w-[90px] px-1.5" />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fornecedor ou descrição..." className="h-7 text-xs pl-7 px-1.5" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 py-0 gap-1" disabled={loading || categoriasDisponiveis.length === 0}>
              <Filter className="h-3 w-3" /> Excluir planos
              {excludedCategorias.size > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">{excludedCategorias.size}</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold">Ocultar planos de contas</span>
              {excludedCategorias.size > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-1" onClick={() => setExcludedCategorias(new Set())}>
                  <X className="h-3 w-3" /> Limpar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">Marcados serão excluídos do relatório.</p>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {categoriasDisponiveis.map((c) => {
                const checked = excludedCategorias.has(c);
                return (
                  <label key={c} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded p-1">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setExcludedCategorias((prev) => {
                          const next = new Set(prev);
                          if (v) next.add(c); else next.delete(c);
                          return next;
                        });
                      }}
                    />
                    <span className="leading-tight break-words">{c}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" className="h-7 text-[11px] px-2 py-0" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Gerar Relatório
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 py-0 gap-1" onClick={handlePrint} disabled={loading || sorted.length === 0}>
          <Printer className="h-3 w-3" /> Imprimir
        </Button>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex-1 min-h-0 border border-border rounded-md bg-card overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 z-20 bg-background/50 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px] table-fixed">
            <colgroup>
              <col className="w-[26px]" />
              <col className="w-[80px]" />
              <col className="w-[18%]" />
              <col />
              <col className="w-[56px]" />
              <col className="w-[18%]" />
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
                  <td className="px-1 py-0 truncate" title={r.fornecedor}>{r.fornecedor}</td>
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
            {!hideAberto && <span>Aberto: <span className="font-bold text-amber-600">{formatCurrency(totais.aberto)}</span></span>}
            <span>Pago: <span className="font-bold text-emerald-600">{formatCurrency(totais.pago)}</span></span>
            <span>Total: <span className="font-bold text-primary tabular-nums">{formatCurrency(totais.total)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

