import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, PiggyBank, Building2, Wallet, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";

interface BankAccountPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  selectedCount?: number;
  harvestPaymentIds?: string[];
  target: "expenses" | "accounts_receivable";
  onLinked: () => void;
}

interface BankAccount {
  id: string;
  nome: string;
  tipo: string;
  banco_nome: string | null;
  saldo_atual: number;
  ativo: boolean;
  empresa_id: string;
}

const tipoIcon = (tipo: string) => {
  switch (tipo) {
    case "corrente": return <Landmark className="h-4 w-4" />;
    case "poupanca": return <PiggyBank className="h-4 w-4" />;
    case "caixa": return <Building2 className="h-4 w-4" />;
    case "carteira": return <Wallet className="h-4 w-4" />;
    default: return <Landmark className="h-4 w-4" />;
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

export function BankAccountPickerDialog({ open, onOpenChange, selectedIds, selectedCount, harvestPaymentIds, target, onLinked }: BankAccountPickerDialogProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("bank_accounts")
      .select("id, nome, tipo, banco_nome, saldo_atual, ativo, empresa_id")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        setAccounts((data as any[]) ?? []);
        setLoading(false);
      });
  }, [open]);

  const syncPaidExpenses = async (accountId: string): Promise<number> => {
    const { data: expenses } = await supabase
      .from("expenses")
      .select("id, descricao, status, valor_pago, data_pagamento, plano_contas_id, empresa_id, unidade_id")
      .in("id", selectedIds)
      .gt("valor_pago", 0)
      .in("status", ["pago", "parcial"]);

    if (!expenses || expenses.length === 0) return 0;

    const expenseIds = expenses.map((e: any) => e.id);
    const [{ data: txExisting }, { data: authData }] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("origem_id, valor, tipo")
        .eq("origem", "conta_pagar")
        .eq("status", "confirmado")
        .in("origem_id", expenseIds),
      supabase.auth.getUser(),
    ]);

    const existingByExpense = new Map<string, number>();
    (txExisting ?? []).forEach((tx: any) => {
      if (tx.tipo !== "saida") return;
      existingByExpense.set(tx.origem_id, (existingByExpense.get(tx.origem_id) ?? 0) + Number(tx.valor));
    });

    const userId = authData.user?.id;
    const rows = (expenses as any[]).flatMap((e) => {
      const paid = Number(e.valor_pago ?? 0);
      const alreadyPosted = Number(existingByExpense.get(e.id) ?? 0);
      const diff = Number((paid - alreadyPosted).toFixed(2));
      if (diff <= 0.009) return [];

      return [{
        conta_bancaria_id: accountId,
        tipo: "saida",
        valor: diff,
        data_movimentacao: (e.data_pagamento || todayISO()).slice(0, 10),
        descricao: `Pgto: ${e.descricao || "Conta a Pagar"} (retroativo)`,
        plano_contas_id: e.plano_contas_id || null,
        origem: "conta_pagar",
        origem_id: e.id,
        status: "confirmado",
        observacoes: "Movimentação criada automaticamente após vinculação da conta bancária",
        empresa_id: e.empresa_id,
        unidade_id: e.unidade_id || e.empresa_id,
        created_by: userId || null,
      }];
    });

    if (rows.length > 0) {
      const { error: txError } = await supabase.from("financial_transactions").insert(rows as any);
      if (txError) throw txError;
      await supabase.rpc("recalc_bank_balance", { _conta_id: accountId } as any);
    }

    return rows.length;
  };

  const syncReceivedReceivables = async (accountId: string, accountEmpresaId: string): Promise<number> => {
    const { data: receivables } = await supabase
      .from("accounts_receivable")
      .select("id, description, status, paid_amount, paid_at, category_id")
      .in("id", selectedIds)
      .gt("paid_amount", 0)
      .in("status", ["pago", "parcial", "recebido"]);

    if (!receivables || receivables.length === 0) return 0;

    const receivableIds = receivables.map((r: any) => r.id);
    const [{ data: txExisting }, { data: authData }] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("origem_id, valor, tipo")
        .eq("origem", "conta_receber")
        .eq("status", "confirmado")
        .in("origem_id", receivableIds),
      supabase.auth.getUser(),
    ]);

    const existingByReceivable = new Map<string, number>();
    (txExisting ?? []).forEach((tx: any) => {
      if (tx.tipo !== "entrada") return;
      existingByReceivable.set(tx.origem_id, (existingByReceivable.get(tx.origem_id) ?? 0) + Number(tx.valor));
    });

    const userId = authData.user?.id;
    const rows = (receivables as any[]).flatMap((r) => {
      const received = Number(r.paid_amount ?? 0);
      const alreadyPosted = Number(existingByReceivable.get(r.id) ?? 0);
      const diff = Number((received - alreadyPosted).toFixed(2));
      if (diff <= 0.009) return [];

      return [{
        conta_bancaria_id: accountId,
        tipo: "entrada",
        valor: diff,
        data_movimentacao: (r.paid_at || todayISO()).slice(0, 10),
        descricao: `Recebimento: ${r.description || "Conta a Receber"} (retroativo)`,
        plano_contas_id: r.category_id || null,
        origem: "conta_receber",
        origem_id: r.id,
        status: "confirmado",
        observacoes: "Movimentação criada automaticamente após vinculação da conta bancária",
        empresa_id: accountEmpresaId,
        unidade_id: accountEmpresaId,
        created_by: userId || null,
      }];
    });

    if (rows.length > 0) {
      const { error: txError } = await supabase.from("financial_transactions").insert(rows as any);
      if (txError) throw txError;
      await supabase.rpc("recalc_bank_balance", { _conta_id: accountId } as any);
    }

    return rows.length;
  };

  const syncHarvestPayments = async (accountId: string, accountEmpresaId: string): Promise<number> => {
    if (!harvestPaymentIds || harvestPaymentIds.length === 0) return 0;

    const { data: payments } = await supabase
      .from("harvest_payments")
      .select("id, total_amount, created_at, period_start, period_end, harvest_job_id")
      .in("id", harvestPaymentIds);

    if (!payments || payments.length === 0) return 0;

    const paymentIds = payments.map((p: any) => p.id);
    const [{ data: txExisting }, { data: authData }] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("origem_id, valor, tipo")
        .eq("origem", "colheita_pagamento")
        .eq("status", "confirmado")
        .in("origem_id", paymentIds),
      supabase.auth.getUser(),
    ]);

    const existingByPayment = new Map<string, number>();
    (txExisting ?? []).forEach((tx: any) => {
      if (tx.tipo !== "saida") return;
      existingByPayment.set(tx.origem_id, (existingByPayment.get(tx.origem_id) ?? 0) + Number(tx.valor));
    });

    const userId = authData.user?.id;
    const rows = (payments as any[]).flatMap((p) => {
      const amount = Number(p.total_amount ?? 0);
      const alreadyPosted = Number(existingByPayment.get(p.id) ?? 0);
      const diff = Number((amount - alreadyPosted).toFixed(2));
      if (diff <= 0.009) return [];

      const periodLabel = `${(p.period_start || "").split("-").reverse().join("/")} a ${(p.period_end || "").split("-").reverse().join("/")}`;
      return [{
        conta_bancaria_id: accountId,
        tipo: "saida",
        valor: diff,
        data_movimentacao: (p.created_at || todayISO()).slice(0, 10),
        descricao: `Pgto Colheita: ${periodLabel} (retroativo)`,
        origem: "colheita_pagamento",
        origem_id: p.id,
        status: "confirmado",
        observacoes: "Movimentação criada automaticamente após vinculação da conta bancária",
        empresa_id: accountEmpresaId,
        unidade_id: accountEmpresaId,
        created_by: userId || null,
      }];
    });

    if (rows.length > 0) {
      const { error: txError } = await supabase.from("financial_transactions").insert(rows as any);
      if (txError) throw txError;
      await supabase.rpc("recalc_bank_balance", { _conta_id: accountId } as any);
    }

    return rows.length;
  };

  const handleSelect = async (accountId: string, accountName: string, accountEmpresaId: string) => {
    setSaving(true);

    if (selectedIds.length > 0) {
      const { error } = await supabase
        .from(target)
        .update({ conta_bancaria_id: accountId } as any)
        .in("id", selectedIds);

      if (error) {
        toast.error("Erro ao vincular à conta bancária");
        setSaving(false);
        return;
      }
    }

    let syncedCount = 0;
    try {
      if (target === "expenses") {
        syncedCount += await syncPaidExpenses(accountId);
        syncedCount += await syncHarvestPayments(accountId, accountEmpresaId);
      } else {
        syncedCount += await syncReceivedReceivables(accountId, accountEmpresaId);
      }
    } catch (syncError: any) {
      console.error("Erro ao sincronizar movimentações retroativas:", syncError?.message || syncError);
      toast.warning("Vínculo salvo, mas houve erro na sincronização retroativa do extrato.");
    }

    const linkedCount = selectedCount ?? (selectedIds.length + (harvestPaymentIds?.length ?? 0));
    if (syncedCount > 0) {
      toast.success(`${linkedCount} item(ns) vinculado(s) e ${syncedCount} movimentação(ões) retroativa(s) criada(s) em "${accountName}"`);
    } else {
      toast.success(`${linkedCount} item(ns) vinculado(s) à "${accountName}"`);
    }

    onLinked();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular {selectedCount ?? selectedIds.length} item(ns) à conta
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma conta bancária ativa encontrada.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {accounts.map(acc => (
              <Card
                key={acc.id}
                className="cursor-pointer transition-colors hover:bg-accent/50 border-l-4 border-l-primary/40"
                onClick={() => !saving && handleSelect(acc.id, acc.nome, acc.empresa_id)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="text-muted-foreground">{tipoIcon(acc.tipo)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{acc.nome}</p>
                    {acc.banco_nome && (
                      <p className="text-xs text-muted-foreground">{acc.banco_nome}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-mono font-bold ${Number(acc.saldo_atual) >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(Number(acc.saldo_atual))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {saving && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Vinculando...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
