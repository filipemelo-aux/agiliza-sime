import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";

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
  const [dataRecebimento, setDataRecebimento] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValor(String(valorTotal));
      setFormaRecebimento("pix");
      setDataRecebimento(new Date());
    }
  }, [open, valorTotal]);

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor");
    if (valorNum > valorTotal + 0.01) return toast.error("Valor excede o saldo");

    setSaving(true);

    const novoStatus = valorNum >= valorTotal ? "recebido" : "aberto";
    const novoValor = valorNum >= valorTotal ? valorTotal : valorTotal - valorNum;

    const updateData: Record<string, any> = {
      status: novoStatus,
      data_recebimento: format(dataRecebimento, "yyyy-MM-dd"),
    };

    // For partial payment, reduce the remaining value
    if (valorNum < valorTotal) {
      updateData.valor = novoValor;
      updateData.status = "aberto";
      updateData.data_recebimento = null;
    }

    const { error } = await supabase
      .from("contas_receber")
      .update(updateData)
      .eq("id", contaReceberId);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    toast.success(novoStatus === "recebido" ? "Título recebido!" : "Pagamento parcial registrado");
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !dataRecebimento && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataRecebimento ? format(dataRecebimento, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataRecebimento}
                    onSelect={(d) => d && setDataRecebimento(d)}
                    locale={ptBR}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
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
