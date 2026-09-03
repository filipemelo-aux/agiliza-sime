import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { EmpresaSelect } from "./EmpresaControls";
import { CheckIssueDialog } from "./CheckIssueDialog";
import { PayablePickerDialog, type PayableOption } from "./PayablePickerDialog";
import { formatCurrency, unmaskCurrency } from "@/lib/masks";
import { formatDateBR, getLocalDateISO } from "@/lib/date";
import { toast } from "sonner";
import { Link2, Plus, Search, WalletCards, X } from "lucide-react";

type LinkType = "conta_pagar" | "movimentacao";

type ExpenseOption = PayableOption;

interface _ExpenseOption {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_vencimento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  empresa_id: string;
}

interface BankAccount { id: string; nome: string; banco: string | null; empresa_id: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function CheckIssueStandaloneDialog({ open, onOpenChange, onSaved }: Props) {
  const { matrizId } = useUnifiedCompany();
  const [linkType, setLinkType] = useState<LinkType>("conta_pagar");
  const [empresaId, setEmpresaId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [value, setValue] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [history, setHistory] = useState("");
  const [date, setDate] = useState(getLocalDateISO());
  const [expenses, setExpenses] = useState<ExpenseOption[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedExpense = useMemo(() => expenses.find((item) => item.id === expenseId), [expenses, expenseId]);
  const parsedValue = Number(unmaskCurrency(value)) || 0;

  useEffect(() => {
    if (!open) return;
    setEmpresaId((current) => current || matrizId);
    setDate(getLocalDateISO());
    setLinkType("conta_pagar");
    setExpenseId("");
    setAccountId("");
    setValue("");
    setBeneficiary("");
    setHistory("");
    const load = async () => {
      setLoading(true);
      const [{ data: expenseRows }, { data: accountRows }] = await Promise.all([
        supabase.from("expenses").select("id, descricao, valor_total, valor_pago, status, data_vencimento, favorecido_nome, favorecido_id, empresa_id").is("deleted_at", null).order("data_vencimento", { ascending: true }).limit(1000),
        supabase.from("contas_bancarias").select("id, nome, banco, empresa_id").eq("ativo", true).order("nome"),
      ]);
      setExpenses((expenseRows as ExpenseOption[]) || []);
      setAccounts((accountRows as BankAccount[]) || []);
      setLoading(false);
    };
    void load();
  }, [open, matrizId]);

  useEffect(() => {
    if (!selectedExpense) return;
    const remaining = Math.max(0, Number(selectedExpense.valor_total) - Number(selectedExpense.valor_pago || 0));
    setEmpresaId(selectedExpense.empresa_id || matrizId);
    setValue(remaining.toFixed(2).replace(".", ","));
    setBeneficiary(selectedExpense.favorecido_nome || "");
    setHistory(selectedExpense.descricao || "");
    setDate(selectedExpense.data_vencimento || getLocalDateISO());
  }, [selectedExpense, matrizId]);

  const handleContinue = () => {
    if (!empresaId) return toast.error("Selecione a empresa / unidade");
    if (linkType === "conta_pagar" && !expenseId) return toast.error("Selecione a conta a pagar vinculada");
    if (linkType === "movimentacao" && !accountId) return toast.error("Selecione a conta bancária");
    if (parsedValue <= 0) return toast.error("Informe um valor válido");
    if (!beneficiary.trim()) return toast.error("Informe o favorecido");
    setIssueOpen(true);
  };

  const handleSaved = () => onSaved();

  return (
    <>
      <Dialog open={open && !issueOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /> Novo cheque</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EmpresaSelect value={empresaId} onChange={setEmpresaId} />
              <div>
                <Label className="text-xs">Tipo de registro <span className="text-destructive">*</span></Label>
                <Select value={linkType} onValueChange={(value) => setLinkType(value as LinkType)}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conta_pagar" className="text-xs">Conta a pagar existente</SelectItem>
                    <SelectItem value="movimentacao" className="text-xs">Somente movimentação bancária</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            {linkType === "conta_pagar" ? (
              <div>
                <Label className="text-xs">Conta a pagar <span className="text-destructive">*</span></Label>
                <Select value={expenseId} onValueChange={setExpenseId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={loading ? "Carregando..." : "Selecione a conta..."} /></SelectTrigger>
                  <SelectContent className="max-w-[620px]">
                    {expenses.map((expense) => {
                      const balance = Math.max(0, Number(expense.valor_total) - Number(expense.valor_pago || 0));
                      return <SelectItem key={expense.id} value={expense.id} className="text-xs">{expense.favorecido_nome || "Sem favorecido"} — {expense.descricao} — {formatCurrency(balance)} ({expense.status})</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">O cheque será registrado e o número ficará vinculado à conta selecionada.</p>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Conta bancária de saída <span className="text-destructive">*</span></Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione a conta bancária..." /></SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => <SelectItem key={account.id} value={account.id} className="text-xs">{account.nome}{account.banco ? ` — ${account.banco}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><Label className="text-xs">Favorecido <span className="text-destructive">*</span></Label><Input className="h-9 text-xs" value={beneficiary} onChange={(event) => setBeneficiary(event.target.value)} /></div>
              <div><Label className="text-xs">Valor <span className="text-destructive">*</span></Label><Input className="h-9 text-xs" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0,00" /></div>
              <div><Label className="text-xs">Data de emissão <span className="text-destructive">*</span></Label><Input type="date" className="h-9 text-xs" value={date} onChange={(event) => setDate(event.target.value)} /></div>
              <div><Label className="text-xs">Descrição / histórico</Label><Input className="h-9 text-xs" value={history} onChange={(event) => setHistory(event.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="button" size="sm" className="gap-1.5" onClick={handleContinue}><Plus className="h-3.5 w-3.5" /> Continuar para emissão</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CheckIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        data={{
          expenseId: linkType === "conta_pagar" ? expenseId : null,
          valor: parsedValue,
          nominal: beneficiary,
          data: date,
          historico: history,
          numeroCheque: null,
          empresaId,
          contaBancariaId: linkType === "movimentacao" ? accountId : null,
          vinculoTipo: linkType,
        }}
        onSaved={() => { setIssueOpen(false); handleSaved(); }}
      />
    </>
  );
}
