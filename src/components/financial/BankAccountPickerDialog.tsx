import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, PiggyBank, Building2, Wallet, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";

interface BankAccountPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** IDs to update in the target table */
  selectedIds: string[];
  /** Which table to update */
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

export function BankAccountPickerDialog({ open, onOpenChange, selectedIds, target, onLinked }: BankAccountPickerDialogProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("bank_accounts")
      .select("id, nome, tipo, banco_nome, saldo_atual, ativo")
      .eq("ativo", true)
      .order("nome")
      .then(({ data }) => {
        setAccounts((data as any[]) ?? []);
        setLoading(false);
      });
  }, [open]);

  const handleSelect = async (accountId: string, accountName: string) => {
    setSaving(true);

    const { error } = await supabase
      .from(target)
      .update({ conta_bancaria_id: accountId } as any)
      .in("id", selectedIds);

    if (error) {
      toast.error("Erro ao vincular à conta bancária");
    } else {
      toast.success(`${selectedIds.length} lançamento(s) vinculado(s) à "${accountName}"`);
      onLinked();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular {selectedIds.length} item(ns) à conta
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
                onClick={() => !saving && handleSelect(acc.id, acc.nome)}
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
                    <p className={`text-sm font-mono font-bold ${Number(acc.saldo_atual) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
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
