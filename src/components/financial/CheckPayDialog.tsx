import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export interface PayableCheck {
  id: string;
  numero_cheque: string | null;
  valor: number;
  favorecido_nome: string;
  empresa_id: string | null;
  conta_bancaria_id: string | null;
  data_emissao: string;
  data_vencimento: string | null;
  historico: string | null;
  vinculo_tipo: string;
  status: string;
  expense_id: string | null;
  movimentacao_id: string | null;
  plano_contas_id?: string | null;
}

interface BankAccount { id: string; nome: string; banco: string | null; empresa_id: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cheques: PayableCheck[];
  onPaid: () => void;
}

export function CheckPayDialog({ open, onOpenChange, cheques, onPaid }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [contaId, setContaId] = useState("");
  const [data, setData] = useState(getLocalDateISO());
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => cheques.reduce((sum, c) => sum + Number(c.valor || 0), 0), [cheques]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: rows } = await supabase
        .from("contas_bancarias")
        .select("id, nome, banco, empresa_id")
        .eq("ativo", true)
        .order("nome");
      const list = ((rows as any[]) || []) as BankAccount[];
      setAccounts(list);
      const first = cheques[0];
      const preset =
        first?.conta_bancaria_id ||
        list.find((a) => a.empresa_id === first?.empresa_id)?.id ||
        list[0]?.id ||
        "";
      setContaId(preset);
      const venc = first?.data_vencimento;
      const hoje = getLocalDateISO();
      setData(venc && venc > hoje ? venc : hoje);
    })();
  }, [open, cheques]);

  const handleConfirm = async () => {
    if (!cheques.length) return;
    if (!data) return toast.error("Informe a data do pagamento");
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id || null;

      for (const cheque of cheques) {
        if (cheque.status === "cancelado") continue;
        const conta = contaId || cheque.conta_bancaria_id || null;

        // 1) Contas a pagar vinculadas -> quita o saldo em aberto
        const { data: linkRows } = await supabase
          .from("cheque_expense_links" as any)
          .select("expense_id")
          .eq("cheque_id", cheque.id);
        const expenseIds = Array.from(
          new Set([
            ...(((linkRows as any[]) || []).map((l) => l.expense_id) as string[]),
            ...(cheque.expense_id ? [cheque.expense_id] : []),
          ]),
        );

        if (expenseIds.length) {
          const { data: expRows } = await supabase
            .from("expenses")
            .select("id, valor_total, valor_pago, status")
            .in("id", expenseIds);
          for (const exp of ((expRows as any[]) || [])) {
            const saldo = Math.max(0, Number(exp.valor_total || 0) - Number(exp.valor_pago || 0));
            if (saldo <= 0.009) continue;
            const { error: payErr } = await supabase.from("expense_payments" as any).insert({
              expense_id: exp.id,
              valor: saldo,
              forma_pagamento: "cheque",
              data_pagamento: data,
              conta_bancaria_id: conta,
              created_by: userId,
              observacoes: `Quitação por cheque ${cheque.numero_cheque || "sem número"}`,
            } as any);
            if (payErr) throw payErr;

            await supabase
              .from("expense_installments")
              .update({ status: "pago" } as any)
              .eq("expense_id", exp.id)
              .neq("status", "pago");
          }
        }

        // 2) Cheque de movimentação -> efetiva o lançamento no fluxo de caixa
        let movimentacaoId = cheque.movimentacao_id;
        if (!expenseIds.length && !movimentacaoId) {
          const { data: mov, error: movErr } = await (supabase.from("movimentacoes_bancarias" as any) as any)
            .insert({
              empresa_id: cheque.empresa_id || null,
              conta_bancaria_id: conta,
              origem: "cheque",
              origem_id: cheque.id,
              plano_contas_id: cheque.plano_contas_id || null,
              tipo: "saida",
              valor: Number(cheque.valor) || 0,
              data_movimentacao: data,
              descricao:
                cheque.historico?.trim() ||
                `Cheque ${cheque.numero_cheque || "sem número"} - ${cheque.favorecido_nome || "Sem favorecido"}`,
            })
            .select("id")
            .single();
          if (movErr) throw movErr;
          movimentacaoId = mov?.id || null;
        }

        const { error: updErr } = await (supabase.from("cheques" as any) as any)
          .update({
            status: "compensado",
            data_pagamento: data,
            conta_bancaria_id: conta,
            movimentacao_id: movimentacaoId,
          })
          .eq("id", cheque.id);
        if (updErr) throw updErr;
      }

      toast.success(`${cheques.length} cheque(s) pago(s) e vinculado(s) ao fluxo de caixa`);
      onOpenChange(false);
      onPaid();
    } catch (e: any) {
      toast.error("Não foi possível pagar o(s) cheque(s)", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Pagar cheque(s)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">
            {cheques.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate">
                  <span className="font-mono">{c.numero_cheque || "s/ número"}</span> · {c.favorecido_nome || "—"}
                  {c.data_vencimento ? ` · bom para ${formatDateBR(c.data_vencimento)}` : ""}
                </span>
                <span className="font-mono font-medium">{formatCurrency(Number(c.valor))}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Total <strong className="text-foreground">{formatCurrency(total)}</strong> · as contas a pagar vinculadas
            serão quitadas e a saída aparecerá no fluxo de caixa.
          </div>
          <div>
            <Label className="text-xs">Data do pagamento <span className="text-destructive">*</span></Label>
            <Input type="date" className="h-9 text-xs" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Conta bancária</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.nome}{a.banco ? ` · ${a.banco}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" size="sm" className="gap-1.5" disabled={saving} onClick={() => void handleConfirm()}>
            <CheckCircle2 className="h-3.5 w-3.5" /> {saving ? "Processando..." : "Confirmar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
