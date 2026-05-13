import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO, formatDateBR } from "@/lib/date";

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
  dataVencimento?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BatchItem[];
  onSaved: () => void;
  /** When true, all payments are consolidated into a single cash flow movement (one bank entry). */
  consolidated?: boolean;
}

export function BatchPaymentDialog({ open, onOpenChange, items, onSaved, consolidated = false }: Props) {
  const { user } = useAuth();
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [observacoes, setObservacoes] = useState("");
  const [dataPagamento, setDataPagamento] = useState<string>(getLocalDateISO());
  const [saving, setSaving] = useState(false);
  // Per-item amount edits, keyed by item.id (string of cents)
  const [valores, setValores] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      items.forEach(it => { init[it.id] = String(it.valor); });
      setValores(init);
      setObservacoes("");
      setFormaPagamento("pix");
      setDataPagamento(getLocalDateISO());
    }
  }, [open, items]);

  const getValor = (id: string, fallback: number) => {
    const v = valores[id];
    const n = v !== undefined ? Number(v) : fallback;
    return isNaN(n) ? 0 : n;
  };

  const totalGeral = items.reduce((s, i) => s + getValor(i.id, i.valor), 0);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    if (!formaPagamento) return toast.error("Selecione a forma de pagamento");
    if (!dataPagamento) return toast.error("Informe a data do pagamento");

    // Validate all values
    for (const it of items) {
      const v = getValor(it.id, it.valor);
      if (v === 0 || isNaN(v)) return toast.error(`Valor inválido para: ${it.descricao}`);
    }

    setSaving(true);
    const todayISO = dataPagamento;

    try {
      // Group items by expenseId to recalc once per expense
      const touchedExpenses = new Set<string>();
      // Shared lote_id so individual payments + consolidated movement are linked
      const loteId = consolidated ? (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) : null;
      let totalConsolidado = 0;

      for (const item of items) {
        const valorPago = getValor(item.id, item.valor);
        const saldoItem = item.valor; // valor original do item (parcela ou saldo da despesa)
        const juros = Math.max(0, Math.round((valorPago - saldoItem) * 100) / 100);
        const obsBase = observacoes.trim();
        const obsFinal = juros > 0
          ? `${obsBase ? obsBase + ' | ' : ''}Juros por atraso: R$ ${juros.toFixed(2).replace('.', ',')}`
          : (obsBase || null);

        // Insert payment record
        const { error: payErr } = await supabase.from("expense_payments" as any).insert({
          expense_id: item.expenseId,
          valor: valorPago,
          forma_pagamento: formaPagamento,
          data_pagamento: todayISO,
          observacoes: obsFinal,
          created_by: user?.id,
          juros,
          lote_id: loteId,
          skip_cashflow: consolidated,
        } as any);
        if (payErr) throw payErr;

        totalConsolidado += valorPago;

        if (item.tipo === "installment" && item.installmentId) {
          // Marca parcela como paga somente se cobriu o valor da parcela (com tolerância)
          if (valorPago + 0.005 >= saldoItem) {
            const { error: e } = await supabase
              .from("expense_installments")
              .update({ status: "pago" } as any)
              .eq("id", item.installmentId);
            if (e) throw e;
          }
        }

        touchedExpenses.add(item.expenseId);
      }

      // Create consolidated bank movement (single entry for the whole batch)
      if (consolidated && loteId && Math.abs(totalConsolidado) > 0.005) {
        const tipo = totalConsolidado < 0 ? "entrada" : "saida";
        const descricao = `Pagamento agrupado de ${items.length} conta(s) — ${formatCurrency(Math.abs(totalConsolidado))}`;
        const { error: movErr } = await supabase.from("movimentacoes_bancarias").insert({
          tipo,
          origem: "pagamento_agrupado",
          origem_id: loteId,
          valor: Math.abs(totalConsolidado),
          data_movimentacao: todayISO,
          descricao,
          lote_id: loteId,
        } as any);
        if (movErr) throw movErr;
      }

      // Recalc each touched expense
      for (const expenseId of touchedExpenses) {
        const { data: exp } = await supabase
          .from("expenses")
          .select("valor_total")
          .eq("id", expenseId)
          .maybeSingle();
        if (!exp) continue;
        const valorTotal = Number((exp as any).valor_total);

        // Has installments?
        const { data: insts } = await supabase
          .from("expense_installments")
          .select("valor, status")
          .eq("expense_id", expenseId);

        let novoPago = 0;
        let novoStatus: string;
        if (insts && insts.length > 0) {
          novoPago = (insts as any[])
            .filter(i => i.status === "pago")
            .reduce((s, i) => s + Number(i.valor), 0);
          const allPaid = (insts as any[]).every(i => i.status === "pago");
          novoStatus = allPaid ? "pago" : (novoPago > 0 ? "parcial" : "pendente");
        } else {
          // Sum payments (principal only, excluding juros)
          const { data: pays } = await supabase
            .from("expense_payments" as any)
            .select("valor, juros")
            .eq("expense_id", expenseId);
          novoPago = ((pays as any[]) || []).reduce(
            (s, p) => s + (Number(p.valor) - Number(p.juros || 0)),
            0,
          );
          novoStatus = novoPago + 0.005 >= valorTotal ? "pago" : (novoPago !== 0 ? "parcial" : "pendente");
        }

        await supabase.from("expenses").update({
          valor_pago: novoPago,
          status: novoStatus,
          forma_pagamento: formaPagamento,
          data_pagamento: todayISO,
        } as any).eq("id", expenseId);
      }

      toast.success(`${items.length} pagamento(s) processado(s)`);
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {consolidated ? "Pagamento Agrupado" : "Pagamento em Lote"} — {items.length} conta(s)
          </DialogTitle>
          {consolidated && (
            <p className="text-xs text-muted-foreground mt-1">
              Os pagamentos serão registrados individualmente, mas gerarão uma única movimentação consolidada no fluxo de caixa.
            </p>
          )}
        </DialogHeader>
        <div className="space-y-4">
          {/* Editable items list */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2 max-h-[280px] overflow-y-auto">
            {items.map((item, idx) => {
              const valorPago = getValor(item.id, item.valor);
              const diff = Math.round((valorPago - item.valor) * 100) / 100;
              return (
                <div key={item.id} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground truncate flex-1 min-w-0">
                    {idx + 1}.
                    {item.dataVencimento ? <span className="ml-1 font-mono text-foreground">{formatDateBR(item.dataVencimento)}</span> : null}
                    <span className="ml-1">— {item.descricao}</span>
                    {item.numeroParcela ? ` (P${item.numeroParcela}/${item.totalParcelas})` : ""}
                  </span>
                  <span className="text-muted-foreground font-mono whitespace-nowrap">
                    {formatCurrency(item.valor)}
                  </span>
                  <Input
                    className="h-7 w-32 text-xs font-mono"
                    value={(() => {
                      const raw = valores[item.id];
                      if (raw === undefined || raw === "") return "";
                      const num = parseFloat(raw);
                      if (isNaN(num)) return "";
                      const isNeg = num < 0;
                      const masked = maskCurrency(String(Math.round(Math.abs(num) * 100)));
                      return isNeg ? `-${masked}` : masked;
                    })()}
                    onChange={e => {
                      const txt = e.target.value;
                      const isNeg = txt.trim().startsWith("-");
                      const unmasked = unmaskCurrency(txt);
                      const next = unmasked === "" ? "" : (isNeg ? `-${unmasked}` : unmasked);
                      setValores(v => ({ ...v, [item.id]: next }));
                    }}
                  />
                  {Math.abs(diff) > 0.005 && (
                    <span className={`text-[10px] font-bold whitespace-nowrap ${diff > 0 ? "text-yellow-600" : "text-orange-600"}`}>
                      {diff > 0 ? `+${formatCurrency(diff)} juros` : `${formatCurrency(diff)} parcial`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-md bg-primary/5 p-3">
            <span className="text-sm font-medium text-muted-foreground">Total a pagar</span>
            <span className="text-lg font-bold text-primary">{formatCurrency(totalGeral)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
