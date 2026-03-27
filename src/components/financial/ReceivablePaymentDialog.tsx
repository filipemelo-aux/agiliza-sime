import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";

const FORMA_RECEBIMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contaReceberId: string;
  valorTotal: number;
  onSaved: () => void;
}

export function ReceivablePaymentDialog({ open, onOpenChange, contaReceberId, valorTotal, onSaved }: Props) {
  const [valor, setValor] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState("pix");
  const [dataRecebimento, setDataRecebimento] = useState<string>(getLocalDateISO());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValor(String(valorTotal));
      setFormaRecebimento("pix");
      setDataRecebimento(getLocalDateISO());
    }
  }, [open, valorTotal]);

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor");
    if (valorNum > valorTotal + 0.01) return toast.error("Valor excede o saldo");

    setSaving(true);

    const isTotal = valorNum >= valorTotal;

    const updateData: Record<string, any> = isTotal
      ? {
          status: "recebido",
          data_recebimento: dataRecebimento,
          valor_recebido: valorNum,
          forma_recebimento: formaRecebimento,
        }
      : {
          // Partial: reduce remaining, keep open, no receipt date
          valor: valorTotal - valorNum,
          status: "aberto",
          data_recebimento: null,
          valor_recebido: 0,
          forma_recebimento: null,
        };

    const { error } = await supabase
      .from("contas_receber")
      .update(updateData)
      .eq("id", contaReceberId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success(isTotal ? "Título recebido!" : "Pagamento parcial registrado");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Valor do título: <strong className="text-foreground">{formatCurrency(valorTotal)}</strong>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Valor Recebido (R$)</Label>
              <Input
                value={valor ? maskCurrency(String(Math.round(parseFloat(valor) * 100))) : ""}
                onChange={e => setValor(unmaskCurrency(e.target.value))}
              />
            </div>
            <div>
              <Label>Data do Recebimento</Label>
              <Input type="date" value={dataRecebimento} onChange={e => setDataRecebimento(e.target.value)} />
            </div>
            <div>
              <Label>Forma de Recebimento</Label>
              <Select value={formaRecebimento} onValueChange={setFormaRecebimento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_RECEBIMENTO_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={handleConfirm} className="w-full" disabled={saving}>
            {saving ? "Salvando..." : "Confirmar Recebimento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
