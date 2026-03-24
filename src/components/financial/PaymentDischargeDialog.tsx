import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId: string;
  valorTotal: number;
  valorPago: number;
  onSaved: () => void;
}

export function PaymentDischargeDialog({ open, onOpenChange, expenseId, valorTotal, valorPago, onSaved }: Props) {
  const saldoRestante = valorTotal - valorPago;
  const [valor, setValor] = useState(String(saldoRestante));
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor");
    if (valorNum > saldoRestante + 0.01) return toast.error("Valor excede o saldo restante");

    setSaving(true);
    const novoValorPago = valorPago + valorNum;
    const novoStatus = novoValorPago >= valorTotal ? "pago" : "parcial";

    const { error } = await supabase.from("expenses").update({
      valor_pago: novoValorPago,
      status: novoStatus,
      forma_pagamento: formaPagamento,
      data_pagamento: new Date().toISOString(),
    } as any).eq("id", expenseId);

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(novoStatus === "pago" ? "Despesa quitada" : "Pagamento parcial registrado");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Baixa de Pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Total: R$ {valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | 
            Pago: R$ {valorPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | 
            Restante: <strong className="text-foreground">R$ {saldoRestante.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
          </div>
          <div>
            <Label>Valor do Pagamento (R$)</Label>
            <Input type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
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
          <Button onClick={handleConfirm} className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Confirmar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
