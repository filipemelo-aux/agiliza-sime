import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReportInfoTooltip } from "./ReportInfoTooltip";
import { useSortableTable } from "@/hooks/useSortableTable";
import { ArrowUpDown } from "lucide-react";

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
      return true;
    });
  }, [rows, status, veiculoQ, search]);

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

  const totais = useMemo(() => {
    const total = filtered.reduce((s, r) => s + r.valor, 0);
    const atrasado = filtered.filter((r) => r.status === "atrasado" || (r.status === "parcial" && r.vencido)).reduce((s, r) => s + r.valor, 0);
    const aberto = filtered.filter((r) => r.status === "pendente" || r.status === "parcial").reduce((s, r) => s + r.valor, 0);
    const pago = filtered.filter((r) => r.status === "pago").reduce((s, r) => s + r.valorPago, 0);
    return { total, atrasado, aberto, pago };
  }, [filtered]);

  const statusButtons: { v: StatusFilter; label: string }[] = [
    { v: "todos", label: "Todos" },
    { v: "atrasado", label: "Atrasado" },
    { v: "aberto", label: "Em aberto" },
    { v: "pago", label: "Pago" },
  ];

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
            <span>Aberto: <span className="font-bold text-amber-600">{formatCurrency(totais.aberto)}</span></span>
            <span>Pago: <span className="font-bold text-emerald-600">{formatCurrency(totais.pago)}</span></span>
            <span>Total: <span className="font-bold text-primary tabular-nums">{formatCurrency(totais.total)}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

