import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, HandCoins } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO, formatDateBR } from "@/lib/date";

const FORMA_RECEBIMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "ted", label: "TED" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
];

const FORMA_LABEL: Record<string, string> = Object.fromEntries(FORMA_RECEBIMENTO_OPTIONS.map(o => [o.value, o.label]));

interface PaymentRow {
  id: string;
  valor: number;
  forma_recebimento: string;
  data_recebimento: string;
  observacoes: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaReceberId: string;
  valorTotal: number;
  onSaved: () => void;
}

export function ReceivablePaymentDialog({ open, onOpenChange, contaReceberId, valorTotal, onSaved }: Props) {
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [valor, setValor] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState("pix");
  const [dataRecebimento, setDataRecebimento] = useState<string>(getLocalDateISO());
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const totalRecebido = history.reduce((s, h) => s + Number(h.valor), 0);
  const saldo = Math.max(0, +(valorTotal - totalRecebido).toFixed(2));

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("receivable_payments" as any)
      .select("*")
      .eq("conta_receber_id", contaReceberId)
      .order("data_recebimento", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setHistory(((data as any) || []) as PaymentRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && contaReceberId) {
      loadHistory();
      setFormaRecebimento("pix");
      setDataRecebimento(getLocalDateISO());
      setObservacoes("");
    }
  }, [open, contaReceberId]);

  // Pre-fill amount with remaining balance whenever history changes
  useEffect(() => {
    if (open) setValor(String(saldo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, totalRecebido]);

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor recebido");
    if (valorNum > saldo + 0.01) return toast.error(`Valor excede o saldo (${formatCurrency(saldo)})`);
    if (!formaRecebimento) return toast.error("Informe a forma de recebimento");
    if (!dataRecebimento) return toast.error("Informe a data");
    if (!user?.id) return toast.error("Sessão inválida");

    setSaving(true);
    const { error } = await supabase
      .from("receivable_payments" as any)
      .insert({
        conta_receber_id: contaReceberId,
        valor: valorNum,
        forma_recebimento: formaRecebimento,
        data_recebimento: dataRecebimento,
        observacoes: observacoes || null,
        created_by: user.id,
      });
    setSaving(false);
    if (error) return toast.error(error.message);

    const wasTotal = valorNum + 0.005 >= saldo;
    toast.success(wasTotal ? "Título quitado!" : "Recebimento parcial registrado");
    setObservacoes("");
    await loadHistory();
    onSaved();
    if (wasTotal) onOpenChange(false);
  };

  const handleDelete = async (row: PaymentRow) => {
    const ok = await confirm({
      title: "Estornar recebimento?",
      description: `Remover o recebimento de ${formatCurrency(Number(row.valor))} de ${formatDateBR(row.data_recebimento)}? A movimentação bancária será estornada.`,
      confirmLabel: "Estornar",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.from("receivable_payments" as any).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Recebimento estornado");
    await loadHistory();
    onSaved();
  };

  const isQuitado = saldo <= 0.005 && history.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="w-5 h-5" /> Recebimento do Título
          </DialogTitle>
        </DialogHeader>

        {/* Resumo */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-md bg-muted/40 border text-xs">
          <div>
            <div className="text-muted-foreground">Valor do título</div>
            <div className="font-mono font-semibold text-foreground">{formatCurrency(valorTotal)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Recebido</div>
            <div className="font-mono font-semibold text-green-600">{formatCurrency(totalRecebido)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Saldo</div>
            <div className={`font-mono font-semibold ${saldo > 0 ? "text-amber-600" : "text-green-600"}`}>{formatCurrency(saldo)}</div>
          </div>
        </div>

        {/* Novo recebimento */}
        {!isQuitado && (
          <div className="space-y-3 border rounded-md p-3">
            <div className="text-xs font-semibold text-foreground">Novo recebimento</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <Label className="text-xs">Valor recebido (R$)</Label>
                <Input
                  className="h-9 text-xs"
                  value={valor ? maskCurrency(String(Math.round(parseFloat(valor) * 100))) : ""}
                  onChange={e => setValor(unmaskCurrency(e.target.value))}
                />
                <div className="flex gap-1 mt-1">
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setValor(String(saldo))}>
                    Saldo total
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setValor(String(+(saldo / 2).toFixed(2)))}>
                    50%
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" className="h-9 text-xs" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Forma</Label>
                <Select value={formaRecebimento} onValueChange={setFormaRecebimento}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMA_RECEBIMENTO_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
                placeholder="Ex.: pagamento via PIX em duas etapas, desconto comercial concedido, etc."
              />
            </div>
            <Button onClick={handleConfirm} className="w-full h-10" disabled={saving}>
              {saving ? "Salvando..." : Number(valor) + 0.005 >= saldo ? "Quitar título" : "Registrar recebimento parcial"}
            </Button>
          </div>
        )}

        {isQuitado && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2 text-center">
            Título quitado. Para registrar outro recebimento, estorne um existente.
          </div>
        )}

        {/* Histórico */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">Histórico de recebimentos</div>
          {loading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum recebimento registrado.</p>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">Data</TableHead>
                    <TableHead className="text-xs h-8">Forma</TableHead>
                    <TableHead className="text-xs h-8 text-right">Valor</TableHead>
                    <TableHead className="text-xs h-8">Obs.</TableHead>
                    <TableHead className="text-xs h-8 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs py-1.5">{formatDateBR(h.data_recebimento)}</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge variant="outline" className="text-[10px]">{FORMA_LABEL[h.forma_recebimento] || h.forma_recebimento}</Badge>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(Number(h.valor))}</TableCell>
                      <TableCell className="text-xs py-1.5 text-muted-foreground truncate max-w-[200px]">{h.observacoes || "—"}</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(h)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {ConfirmDialog}
      </DialogContent>
    </Dialog>
  );
}
