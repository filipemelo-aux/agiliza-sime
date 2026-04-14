import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO, formatDateBR } from "@/lib/date";

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

interface PaymentRecord {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
}

/** Optional: when paying a specific installment */
export interface InstallmentContext {
  installmentId: string;
  numeroParcela: number;
  totalParcelas: number;
  valorParcela: number;
  dataVencimentoParcela: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId: string;
  valorTotal: number;
  valorPago: number;
  planoContasId?: string | null;
  empresaId?: string | null;
  unidadeId?: string | null;
  descricao?: string | null;
  contaBancariaIdPreset?: string | null;
  favorecidoNome?: string | null;
  dataVencimento?: string | null;
  /** When set, the dialog operates on a single installment */
  installment?: InstallmentContext | null;
  onSaved: () => void;
}

export function PaymentDischargeDialog({
  open, onOpenChange, expenseId, valorTotal, valorPago,
  descricao, favorecidoNome, dataVencimento, installment, onSaved,
}: Props) {
  const { user } = useAuth();

  // Determine the effective amount for this payment context
  const isInstallmentMode = !!installment;
  const effectiveTotal = isInstallmentMode ? installment!.valorParcela : valorTotal;
  const effectivePago = isInstallmentMode ? 0 : valorPago; // installments are either paid or not
  const saldoRestante = effectiveTotal - effectivePago;
  const effectiveVencimento = isInstallmentMode ? installment!.dataVencimentoParcela : dataVencimento;

  const [valor, setValor] = useState(String(saldoRestante));
  const [formaPagamento, setFormaPagamento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [dataPagamento, setDataPagamento] = useState<string>(getLocalDateISO());

  useEffect(() => {
    if (open && expenseId) {
      const restante = isInstallmentMode ? installment!.valorParcela : (valorTotal - valorPago);
      setValor(String(restante));
      setObservacoes("");
      setFormaPagamento("");
      setDataPagamento(getLocalDateISO());
      loadHistory();
    }
  }, [open, expenseId, installment?.installmentId]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("expense_payments" as any)
      .select("*")
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: false });
    setHistory((data as any) || []);
  };

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor");
    if (!formaPagamento) return toast.error("Selecione a forma de pagamento");
    if (!dataPagamento) return toast.error("Informe a data do pagamento");

    // Calculate interest: any amount above the remaining balance is interest
    const juros = Math.max(0, Math.round((valorNum - saldoRestante) * 100) / 100);
    const valorPrincipal = Math.round((valorNum - juros) * 100) / 100;

    setSaving(true);
    const dataPagISO = dataPagamento;

    // Insert payment record with interest
    const { error: payErr } = await supabase.from("expense_payments" as any).insert({
      expense_id: expenseId,
      valor: valorNum,
      forma_pagamento: formaPagamento,
      data_pagamento: dataPagISO,
      observacoes: juros > 0
        ? `${observacoes.trim() ? observacoes.trim() + ' | ' : ''}Juros por atraso: R$ ${juros.toFixed(2).replace('.', ',')}`
        : (observacoes.trim() || null),
      created_by: user?.id,
      juros: juros,
    } as any);
    if (payErr) { toast.error(payErr.message); setSaving(false); return; }

    if (isInstallmentMode) {
      // ---- INSTALLMENT MODE: update only the installment ----
      const { error: instErr } = await supabase
        .from("expense_installments")
        .update({ status: "pago" } as any)
        .eq("id", installment!.installmentId);
      if (instErr) { toast.error(instErr.message); setSaving(false); return; }

      // Recalculate expense totals from all installments
      const { data: allInst } = await supabase
        .from("expense_installments")
        .select("valor, status")
        .eq("expense_id", expenseId);

      const totalPagoNow = ((allInst as any) || [])
        .filter((i: any) => i.status === "pago")
        .reduce((s: number, i: any) => s + Number(i.valor), 0);
      const allPaid = ((allInst as any) || []).every((i: any) => i.status === "pago");

      const { error } = await supabase.from("expenses").update({
        valor_pago: totalPagoNow,
        status: allPaid ? "pago" : "parcial",
        forma_pagamento: formaPagamento,
        data_pagamento: dataPagISO,
      } as any).eq("id", expenseId);

      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(`Parcela ${installment!.numeroParcela}/${installment!.totalParcelas} quitada`);
    } else {
      // ---- REGULAR MODE: update expense directly ----
      const novoValorPago = valorPago + valorPrincipal;
      const novoStatus = novoValorPago >= valorTotal ? "pago" : "parcial";

      const { error } = await supabase.from("expenses").update({
        valor_pago: novoValorPago,
        status: novoStatus,
        forma_pagamento: formaPagamento,
        data_pagamento: dataPagISO,
      } as any).eq("id", expenseId);

      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(novoStatus === "pago" ? "Despesa quitada" : "Pagamento parcial registrado");
    }

    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const formaLabel = (v: string) => FORMA_PAGAMENTO_OPTIONS.find(o => o.value === v)?.label || v;

  const titleText = isInstallmentMode
    ? `Pagamento — Parcela ${installment!.numeroParcela}/${installment!.totalParcelas}`
    : "Baixa de Pagamento";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Resumo */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
            {(favorecidoNome || descricao) && (
              <p className="text-sm font-medium text-foreground">{favorecidoNome || descricao}</p>
            )}
            {effectiveVencimento && (
              <p className="text-xs text-muted-foreground">Vencimento: {formatDateBR(effectiveVencimento)}</p>
            )}
            <div className="flex items-center gap-4 text-sm flex-wrap">
              {isInstallmentMode ? (
                <>
                  <span className="text-muted-foreground">Valor da parcela: <strong className="text-primary font-bold">{formatCurrency(effectiveTotal)}</strong></span>
                  <span className="text-muted-foreground text-xs">(Total da conta: {formatCurrency(valorTotal)})</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(valorTotal)}</strong></span>
                  {valorPago > 0 && <span className="text-muted-foreground">Pago: <strong className="text-foreground">{formatCurrency(valorPago)}</strong></span>}
                  <span className="text-muted-foreground">Restante: <strong className="text-primary font-bold">{formatCurrency(saldoRestante)}</strong></span>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={valor ? maskCurrency(String(Math.round(parseFloat(valor) * 100))) : ""} onChange={e => setValor(unmaskCurrency(e.target.value))} />
            </div>
            <div>
              <Label>Data do Pagamento</Label>
              <Input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} />
            </div>
            <div>
              <Label>Forma de Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_PAGAMENTO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Input value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Opcional" />
          </div>

          {/* Interest indicator */}
          {Number(valor) > saldoRestante + 0.009 && (
            <div className="rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 p-3 space-y-1">
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">⚠️ Juros por atraso detectado</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor principal:</span>
                <span className="font-mono">{formatCurrency(saldoRestante)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Juros:</span>
                <span className="font-mono text-yellow-700 dark:text-yellow-400 font-bold">
                  {formatCurrency(Math.round((Number(valor) - saldoRestante) * 100) / 100)}
                </span>
              </div>
            </div>
          )}

          <Button onClick={handleConfirm} className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Confirmar Pagamento"}
          </Button>

          {/* Payment history */}
          {history.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Histórico de Pagamentos</p>
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                        <TableCell className="text-xs font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                        <TableCell className="text-xs">{formaLabel(p.forma_pagamento)}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{p.observacoes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
