import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

interface BatchItem {
  id: string;
  descricao: string;
  valor: number;
  tipo: "expense" | "installment";
  expenseId: string;
  installmentId?: string;
  numeroParcela?: number;
  totalParcelas?: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BatchItem[];
  onSaved: () => void;
}

export function BatchPaymentDialog({ open, onOpenChange, items, onSaved }: Props) {
  const { user } = useAuth();
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [observacoes, setObservacoes] = useState("");
  const [dataPagamento, setDataPagamento] = useState<string>(getLocalDateISO());
  const [saving, setSaving] = useState(false);

  const totalGeral = items.reduce((s, i) => s + i.valor, 0);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    setSaving(true);
    const todayISO = dataPagamento;

    try {
      for (const item of items) {
        if (item.tipo === "installment" && item.installmentId) {
          // Pay installment
          await supabase.from("expense_installments").update({ status: "pago" } as any).eq("id", item.installmentId);
          // We need to recalculate expense totals - this is handled by the parent after batch
        } else {
          // Pay full expense
          await supabase.from("expense_payments" as any).insert({
            expense_id: item.expenseId,
            valor: item.valor,
            forma_pagamento: formaPagamento,
            data_pagamento: todayISO,
            observacoes: observacoes.trim() || null,
            created_by: user?.id,
          } as any);
        }

        // Update expense status
        // For installments, the parent will recalculate
        if (item.tipo === "expense") {
          await supabase.from("expenses").update({
            valor_pago: item.valor,
            status: "pago",
            forma_pagamento: formaPagamento,
            data_pagamento: todayISO,
          } as any).eq("id", item.expenseId);
        }
      }

      // For installments, recalculate expense totals
      const installmentsByExpense = new Map<string, number>();
      items.filter(i => i.tipo === "installment").forEach(i => {
        installmentsByExpense.set(i.expenseId, (installmentsByExpense.get(i.expenseId) || 0) + i.valor);
      });

      for (const [expenseId, addedValue] of installmentsByExpense) {
        const { data: exp } = await supabase.from("expenses").select("valor_pago, valor_total").eq("id", expenseId).maybeSingle();
        if (exp) {
          const newPago = Number((exp as any).valor_pago) + addedValue;
          const newStatus = newPago >= Number((exp as any).valor_total) ? "pago" : "parcial";
          await supabase.from("expenses").update({
            valor_pago: newPago,
            status: newStatus,
            forma_pagamento: formaPagamento,
            data_pagamento: todayISO,
          } as any).eq("id", expenseId);
        }
      }

      toast.success(`${items.length} conta(s) quitada(s)`);
      setSaving(false);
      onOpenChange(false);
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar pagamentos");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamento em Lote — {items.length} conta(s)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 max-h-[200px] overflow-y-auto">
            {items.map((item, idx) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground truncate max-w-[280px]">
                  {idx + 1}. {item.descricao}
                  {item.numeroParcela ? ` (P${item.numeroParcela}/${item.totalParcelas})` : ""}
                </span>
                <span className="font-mono font-medium text-foreground">{formatCurrency(item.valor)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-md bg-primary/5 p-3">
            <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(totalGeral)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <Button onClick={handleConfirm} className="w-full" disabled={saving}>
            {saving ? "Processando..." : "Confirmar Pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { BatchItem };
