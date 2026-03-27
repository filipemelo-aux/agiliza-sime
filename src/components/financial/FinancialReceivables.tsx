import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Em aberto</p>
              <p className="text-sm font-bold text-foreground truncate">{formatCurrency(totals.aberto)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recebido</p>
              <p className="text-sm font-bold text-green-600 truncate">{formatCurrency(totals.recebido)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Atrasado</p>
              <p className="text-sm font-bold text-destructive truncate">{formatCurrency(totals.atrasado)}</p>
            </div>
          </CardContent>
        </Card>
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
            return (
              <Card key={c.id} className={cn(
                "border-l-4",
                c.status === "recebido" && "border-l-green-500",
                c.status === "atrasado" && "border-l-destructive",
                c.status === "aberto" && "border-l-amber-400",
              )}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{c.cliente_nome}</p>
                    <Badge variant={st.variant} className="text-[10px] gap-0.5 shrink-0">
                      <Icon className="h-2.5 w-2.5" />{st.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Venc: {formatDateBR(c.data_vencimento)}</span>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(Number(c.valor))}</span>
                  </div>
                  {c.data_recebimento && (
                    <p className="text-[11px] text-muted-foreground">Receb: {formatDateBR(c.data_recebimento)}</p>
                  )}
                  {c.status !== "recebido" && (
                    <Button size="sm" variant="outline" onClick={() => openPayment(c)} className="gap-1 h-7 text-xs w-full mt-1">
                      <HandCoins className="h-3 w-3" /> Receber
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Cliente</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Vencimento</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Valor</th>
                    <th className="text-center text-xs font-medium text-muted-foreground px-4 py-2">Status</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-4 py-2">Recebimento</th>
                    <th className="text-right text-xs font-medium text-muted-foreground px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(c => {
                    const st = STATUS_MAP[c.status] || STATUS_MAP.aberto;
                    const Icon = st.icon;
                    return (
                      <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-medium">{c.cliente_nome}</td>
                        <td className="px-4 py-2.5 text-xs">{formatDateBR(c.data_vencimento)}</td>
                        <td className="px-4 py-2.5 text-xs text-right font-mono font-semibold">{formatCurrency(Number(c.valor))}</td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant={st.variant} className="text-[10px] gap-0.5">
                            <Icon className="h-2.5 w-2.5" />{st.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs">{formatDateBR(c.data_recebimento)}</td>
                        <td className="px-4 py-2.5 text-right">
                          {c.status !== "recebido" && (
                            <Button size="sm" variant="outline" onClick={() => openPayment(c)} className="gap-1 h-7 text-xs">
                              <HandCoins className="h-3 w-3" /> Receber
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
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
