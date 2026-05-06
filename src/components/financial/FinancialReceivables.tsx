import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { SummaryCard } from "@/components/SummaryCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { DollarSign, CheckCircle2, Clock, AlertTriangle, HandCoins, X } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { ReceivablePaymentDialog } from "./ReceivablePaymentDialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ContaReceber {
  id: string;
  fatura_id: string;
  cliente_id: string;
  valor: number;
  valor_recebido?: number | null;
  data_vencimento: string;
  status: string;
  data_recebimento: string | null;
  created_at: string;
  cliente_nome?: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  aberto: { label: "Aberto", variant: "outline", icon: Clock },
  recebido: { label: "Recebido", variant: "default", icon: CheckCircle2 },
  atrasado: { label: "Atrasado", variant: "destructive", icon: AlertTriangle },
};

export function FinancialReceivables() {
  const isMobile = useIsMobile();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaReceber | null>(null);

  const fetchContas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contas_receber")
      .select("*, profiles:cliente_id(full_name)")
      .order("data_vencimento", { ascending: true });
    if (error) { toast.error("Erro ao carregar contas a receber"); setLoading(false); return; }
    setContas((data || []).map((c: any) => ({ ...c, cliente_nome: c.profiles?.full_name || "—" })));
    setLoading(false);
  };

  useEffect(() => { fetchContas(); }, []);

  const filtered = contas.filter(c => filterStatus === "todos" || c.status === filterStatus);

  const totals = {
    aberto: contas.filter(c => c.status === "aberto").reduce((s, c) => s + Number(c.valor), 0),
    recebido: contas.filter(c => c.status === "recebido").reduce((s, c) => s + Number(c.valor), 0),
    atrasado: contas.filter(c => c.status === "atrasado").reduce((s, c) => s + Number(c.valor), 0),
  };

  const openPayment = (conta: ContaReceber) => { setSelectedConta(conta); setPayDialogOpen(true); };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">Contas a Receber</h1>

      {/* Summary cards - compact */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryCard icon={Clock} label="Em aberto" value={formatCurrency(totals.aberto)} />
        <SummaryCard icon={CheckCircle2} label="Recebido" value={formatCurrency(totals.recebido)} valueColor="green" />
        <SummaryCard icon={AlertTriangle} label="Atrasado" value={formatCurrency(totals.atrasado)} valueColor="red" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="recebido">Recebido</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} título(s)</span>
        {filterStatus !== "todos" && (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive gap-1" onClick={() => setFilterStatus("todos")}>
            <X className="h-3 w-3" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma conta a receber encontrada.</p>
          </CardContent>
        </Card>
      ) : isMobile ? (
        <div className="grid grid-cols-1 gap-2">
          {filtered.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.aberto;
            const Icon = st.icon;
            const recebido = Number(c.valor_recebido || 0);
            const isParcial = c.status !== "recebido" && recebido > 0;
            return (
              <Card key={c.id} onClick={() => openPayment(c)} className="cursor-pointer">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{c.cliente_nome}</p>
                    <Badge variant={isParcial ? "secondary" : st.variant} className="text-[10px] gap-0.5 shrink-0">
                      <Icon className="h-2.5 w-2.5" />{isParcial ? "Parcial" : st.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <HandCoins className="h-3 w-3" />
                      <span>Venc: {formatDateBR(c.data_vencimento)}</span>
                      {c.data_recebimento && <span>· Receb: {formatDateBR(c.data_recebimento)}</span>}
                    </div>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(Number(c.valor))}</span>
                  </div>
                  {isParcial && (
                    <p className="text-[11px] text-amber-600">Recebido: {formatCurrency(recebido)} • Saldo: {formatCurrency(Number(c.valor) - recebido)}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Vencimento</th>
                  <th className="px-2 py-2 font-medium text-right w-[110px]">Valor</th>
                  <th className="px-2 py-2 font-medium text-right w-[110px]">Recebido</th>
                  <th className="px-2 py-2 font-medium text-center w-[100px]">Status</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Recebimento</th>
                  <th className="px-2 py-2 font-medium text-right w-[110px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const st = STATUS_MAP[c.status] || STATUS_MAP.aberto;
                  const Icon = st.icon;
                  const recebido = Number(c.valor_recebido || 0);
                  const isParcial = c.status !== "recebido" && recebido > 0;
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30 cursor-pointer" onClick={() => openPayment(c)}>
                      <td className="px-3 py-2 font-medium truncate max-w-[420px]">{c.cliente_nome}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(c.data_vencimento)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">{formatCurrency(Number(c.valor))}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${isParcial ? "text-amber-600" : "text-muted-foreground"}`}>
                        {recebido > 0 ? formatCurrency(recebido) : "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Badge variant={isParcial ? "secondary" : st.variant} className="text-[10px] gap-0.5">
                          <Icon className="h-2.5 w-2.5" />{isParcial ? "Parcial" : st.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(c.data_recebimento)}</td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600 hover:text-green-600" onClick={(e) => { e.stopPropagation(); openPayment(c); }} title={c.status === "recebido" ? "Ver" : "Receber"}>
                          <HandCoins className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedConta && (
        <ReceivablePaymentDialog
          open={payDialogOpen}
          onOpenChange={setPayDialogOpen}
          contaReceberId={selectedConta.id}
          valorTotal={Number(selectedConta.valor)}
          onSaved={fetchContas}
        />
      )}
    </div>
  );
}
