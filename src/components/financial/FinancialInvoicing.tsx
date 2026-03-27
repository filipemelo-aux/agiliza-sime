import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, CheckCircle2, Clock, Eye, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/masks";

interface Fatura {
  id: string;
  cliente_id: string;
  valor_total: number;
  num_parcelas: number;
  intervalo_dias: number;
  status: string;
  data_emissao: string;
  created_at: string;
  cliente_nome?: string;
}

interface Previsao {
  id: string;
  origem_tipo: string;
  origem_id: string;
  valor: number;
  data_prevista: string;
  status: string;
}

interface ContaReceber {
  id: string;
  valor: number;
  data_vencimento: string;
  status: string;
  data_recebimento: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  faturada: { label: "Faturada", variant: "default" },
  paga: { label: "Paga", variant: "secondary" },
};

export function FinancialInvoicing() {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedFatura, setSelectedFatura] = useState<Fatura | null>(null);
  const [previsoes, setPrevisoes] = useState<Previsao[]>([]);
  const [contas, setContas] = useState<ContaReceber[]>([]);

  useEffect(() => {
    fetchFaturas();
  }, []);

  const fetchFaturas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("faturas_recebimento")
      .select("*, profiles:cliente_id(full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar faturas");
      setLoading(false);
      return;
    }

    setFaturas(
      (data || []).map((f: any) => ({
        ...f,
        cliente_nome: f.profiles?.full_name || "—",
      }))
    );
    setLoading(false);
  };

  const openDetail = async (fatura: Fatura) => {
    setSelectedFatura(fatura);
    setDetailOpen(true);

    // Load linked previsoes
    const { data: links } = await supabase
      .from("fatura_previsoes")
      .select("previsao_id")
      .eq("fatura_id", fatura.id);

    if (links && links.length > 0) {
      const ids = links.map((l: any) => l.previsao_id);
      const { data: prevData } = await supabase
        .from("previsoes_recebimento")
        .select("*")
        .in("id", ids);
      setPrevisoes((prevData as Previsao[]) || []);
    } else {
      setPrevisoes([]);
    }

    // Load contas a receber
    const { data: contasData } = await supabase
      .from("contas_receber")
      .select("*")
      .eq("fatura_id", fatura.id)
      .order("data_vencimento", { ascending: true });
    setContas((contasData as ContaReceber[]) || []);
  };

  const totalFaturado = faturas.reduce((s, f) => s + Number(f.valor_total), 0);
  const totalFaturas = faturas.length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Faturamento</h1>
      <p className="text-sm text-muted-foreground">
        Gerencie faturas criadas a partir de previsões de recebimento. Para criar novas faturas, acesse "Previsões de Recebimento".
      </p>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total de Faturas</p>
              <p className="text-lg font-bold">{totalFaturas}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Valor Total Faturado</p>
              <p className="text-lg font-bold">{formatCurrency(totalFaturado)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Faturas Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Parcelas</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : faturas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Nenhuma fatura encontrada. Crie faturas a partir das Previsões de Recebimento.
                    </TableCell>
                  </TableRow>
                ) : (
                  faturas.map((f) => {
                    const st = STATUS_MAP[f.status] || STATUS_MAP.rascunho;
                    return (
                      <TableRow key={f.id}>
                        <TableCell className="text-sm">{format(new Date(f.data_emissao), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-sm font-medium">{f.cliente_nome}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(f.valor_total))}</TableCell>
                        <TableCell className="text-center">{f.num_parcelas}x</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" onClick={() => openDetail(f)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Fatura</DialogTitle>
          </DialogHeader>
          {selectedFatura && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <strong>{selectedFatura.cliente_nome}</strong></div>
                <div><span className="text-muted-foreground">Emissão:</span> <strong>{format(new Date(selectedFatura.data_emissao), "dd/MM/yyyy")}</strong></div>
                <div><span className="text-muted-foreground">Valor Total:</span> <strong>{formatCurrency(Number(selectedFatura.valor_total))}</strong></div>
                <div><span className="text-muted-foreground">Parcelas:</span> <strong>{selectedFatura.num_parcelas}x (a cada {selectedFatura.intervalo_dias} dias)</strong></div>
              </div>

              {/* Previsões vinculadas */}
              <div>
                <p className="text-sm font-semibold mb-2">Previsões Vinculadas ({previsoes.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Origem</TableHead>
                        <TableHead>Data Prevista</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previsoes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs">
                            <Badge variant="outline">{p.origem_tipo === "cte" ? "CT-e" : "Colheita"}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(p.data_prevista), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Contas a Receber geradas */}
              <div>
                <p className="text-sm font-semibold mb-2">Contas a Receber Geradas ({contas.length})</p>
                <div className="overflow-x-auto border rounded max-h-[150px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Recebimento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contas.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{format(new Date(c.data_vencimento), "dd/MM/yyyy")}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{formatCurrency(Number(c.valor))}</TableCell>
                          <TableCell className="text-xs text-center">
                            <Badge variant={c.status === "recebido" ? "default" : c.status === "atrasado" ? "destructive" : "outline"}>
                              {c.status === "recebido" ? "Recebido" : c.status === "atrasado" ? "Atrasado" : "Aberto"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{c.data_recebimento ? format(new Date(c.data_recebimento), "dd/MM/yyyy") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
