import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, CheckCircle2, Clock, AlertTriangle, HandCoins } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { ReceivablePaymentDialog } from "./ReceivablePaymentDialog";

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
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("todos");

  // Payment dialog
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaReceber | null>(null);

  const fetchContas = async () => {
    setLoading(true);
    const query = supabase
      .from("contas_receber")
      .select("*, profiles:cliente_id(full_name)")
      .order("data_vencimento", { ascending: true });

    const { data, error } = await query;

    if (error) {
      toast.error("Erro ao carregar contas a receber");
      setLoading(false);
      return;
    }

    const mapped = (data || []).map((c: any) => ({
      ...c,
      cliente_nome: c.profiles?.full_name || "—",
    }));

    setContas(mapped);
    setLoading(false);
  };

  useEffect(() => {
    fetchContas();
  }, []);

  const filtered = contas.filter(c => {
    if (filterStatus === "todos") return true;
    return c.status === filterStatus;
  });

  const totals = {
    aberto: contas.filter(c => c.status === "aberto").reduce((s, c) => s + Number(c.valor), 0),
    recebido: contas.filter(c => c.status === "recebido").reduce((s, c) => s + Number(c.valor), 0),
    atrasado: contas.filter(c => c.status === "atrasado").reduce((s, c) => s + Number(c.valor), 0),
  };

  const openPayment = (conta: ContaReceber) => {
    setSelectedConta(conta);
    setPayDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Contas a Receber</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Em aberto</p>
              <p className="text-lg font-bold">{formatCurrency(totals.aberto)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-xs text-muted-foreground">Recebido</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(totals.recebido)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-xs text-muted-foreground">Atrasado</p>
              <p className="text-lg font-bold text-destructive">{formatCurrency(totals.atrasado)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="recebido">Recebido</SelectItem>
            <SelectItem value="atrasado">Atrasado</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{filtered.length} título(s)</span>
      </div>

      {/* Table */}
      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <DollarSign className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Nenhuma conta a receber encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recebimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(c => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.aberto;
                const Icon = st.icon;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="text-sm">{c.cliente_nome}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(c.data_vencimento + "T12:00:00"), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-sm text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant} className="gap-1">
                        <Icon className="h-3 w-3" />
                        {st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.data_recebimento
                        ? format(new Date(c.data_recebimento + "T12:00:00"), "dd/MM/yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status !== "recebido" && (
                        <Button size="sm" variant="outline" onClick={() => openPayment(c)} className="gap-1">
                          <HandCoins className="h-3.5 w-3.5" />
                          Receber
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
