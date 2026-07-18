import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";
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
            const overdue = dv && dv < today && inst.status !== "pago";
            const s: Row["status"] = overdue ? "atrasado" : (inst.status as Row["status"]);
            out.push({
              id: `${e.id}-${inst.id}`,
              status: s,
              dataVencimento: dv,
              fornecedor,
              descricao,
              parcela: `${inst.numero_parcela}/${installs.length}`,
              categoria,
              veiculo,
              valor: Number(inst.valor),
              valorPago: pagoByInst[inst.id] || 0,
            });
          });
        } else {
          const dv = e.data_vencimento || e.data_emissao;
          if (!inRange(dv)) return;
          const overdue = dv && dv < today && e.status !== "pago";
          const s: Row["status"] = overdue ? "atrasado" : (e.status as Row["status"]);
          out.push({
            id: e.id,
            status: s,
            dataVencimento: dv,
            fornecedor,
            descricao,
            parcela: "—",
            categoria,
            veiculo,
            valor: Number(e.valor_total),
            valorPago: pagoByExp[e.id] || 0,
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dataInicio, dataFim]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const vterm = veiculoQ.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === "atrasado" && r.status !== "atrasado") return false;
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
    const atrasado = filtered.filter((r) => r.status === "atrasado").reduce((s, r) => s + r.valor, 0);
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
    <th className={cn("px-2 py-1.5 font-medium select-none cursor-pointer whitespace-nowrap", className)} onClick={() => toggle(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sort.key === k ? "text-primary" : "text-muted-foreground/40")} />
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold">Contas a Pagar / Pagas</h2>
            <ReportInfoTooltip text="Visão de obrigações. Data de vencimento como base; valor por parcela. Use o toggle de status para alternar entre atrasado, em aberto e pago." />
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
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Status</Label>
              <div className="flex gap-1">
                {statusButtons.map((b) => (
                  <Button
                    key={b.v}
                    size="sm"
                    variant={status === b.v ? "default" : "outline"}
                    className="h-8 text-xs px-2.5"
                    onClick={() => setStatus(b.v)}
                  >
                    {b.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Veículo</Label>
              <Input value={veiculoQ} onChange={(e) => setVeiculoQ(e.target.value)} placeholder="Placa" className="h-8 text-xs w-[110px]" />
            </div>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label className="text-[10px] text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fornecedor ou descrição..." className="h-8 text-xs pl-7" />
              </div>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardContent>
      </Card>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 shadow-sm">
              <tr className="text-left">
                <Th k="status" label="●" className="w-[36px] text-center" />
                <Th k="dataVencimento" label="Vencimento" className="w-[100px]" />
                <Th k="fornecedor" label="Fornecedor" />
                <Th k="descricao" label="Descrição" />
                <Th k="parcela" label="Parcela" className="w-[70px] text-center" />
                <Th k="categoria" label="Categoria" className="w-[200px]" />
                <Th k="veiculo" label="Veículo" className="w-[90px]" />
                <Th k="valor" label="Valor" className="w-[110px] text-right" />
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && !loading && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum registro no período.</td></tr>
              )}
              {sorted.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-1 text-center">
                    <span title={statusLabel[r.status]} className={cn("inline-block h-2.5 w-2.5 rounded-full", statusDot[r.status])} />
                  </td>
                  <td className={cn("px-2 py-1 whitespace-nowrap tabular-nums", r.status === "atrasado" && "text-red-600 font-semibold")}>
                    {formatDateBR(r.dataVencimento)}
                  </td>
                  <td className="px-2 py-1 truncate max-w-[180px]" title={r.fornecedor}>{r.fornecedor}</td>
                  <td className="px-2 py-1 truncate max-w-[260px]" title={r.descricao}>{r.descricao}</td>
                  <td className="px-2 py-1 text-center whitespace-nowrap tabular-nums">{r.parcela}</td>
                  <td className="px-2 py-1 truncate max-w-[200px] text-muted-foreground" title={r.categoria}>{r.categoria}</td>
                  <td className="px-2 py-1 whitespace-nowrap font-mono">{r.veiculo}</td>
                  <td className={cn("px-2 py-1 text-right tabular-nums font-medium", r.status === "atrasado" && "text-red-600")}>
                    {formatCurrency(r.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-muted/95 backdrop-blur border-t border-border">
              <tr className="text-xs">
                <td colSpan={4} className="px-3 py-2 font-semibold">
                  {filtered.length} registro(s)
                </td>
                <td colSpan={2} className="px-2 py-2 text-right text-muted-foreground">
                  <span className="mr-3">Atrasado: <span className="font-bold text-red-600">{formatCurrency(totais.atrasado)}</span></span>
                  <span className="mr-3">Aberto: <span className="font-bold text-amber-600">{formatCurrency(totais.aberto)}</span></span>
                  <span>Pago: <span className="font-bold text-emerald-600">{formatCurrency(totais.pago)}</span></span>
                </td>
                <td className="px-2 py-2 text-right text-muted-foreground">Total</td>
                <td className="px-2 py-2 text-right tabular-nums font-bold text-primary">{formatCurrency(totais.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
