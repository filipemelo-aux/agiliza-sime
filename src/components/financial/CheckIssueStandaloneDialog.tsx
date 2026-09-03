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
  const [expenseIds, setExpenseIds] = useState<string[]>([]);
  const [accountId, setAccountId] = useState("");
  const [value, setValue] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [history, setHistory] = useState("");
  const [date, setDate] = useState(getLocalDateISO());
  const [expenses, setExpenses] = useState<ExpenseOption[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedExpenses = useMemo(() => expenseIds.map((id) => expenses.find((item) => item.id === id)).filter(Boolean) as ExpenseOption[], [expenses, expenseIds]);
  const selectedTotal = useMemo(
    () => selectedExpenses.reduce((sum, e) => sum + Math.max(0, Number(e.valor_total) - Number(e.valor_pago || 0)), 0),
    [selectedExpenses],
  );
  const parsedValue = Number(unmaskCurrency(value)) || 0;

  useEffect(() => {
    if (!open) return;
    setEmpresaId((current) => current || matrizId);
    setDate(getLocalDateISO());
    setLinkType("conta_pagar");
    setExpenseIds([]);
    setAccountId("");
    setValue("");
    setBeneficiary("");
    setHistory("");
    const load = async () => {
      setLoading(true);
      const [expensesReq, accountsReq, coaReq] = await Promise.all([
        supabase.from("expenses")
          .select("id, descricao, valor_total, valor_pago, status, data_vencimento, data_emissao, favorecido_nome, favorecido_id, empresa_id, forma_pagamento, plano_contas_id, veiculo_placa, fornecedor_cnpj")
          .is("deleted_at", null)
          .order("data_vencimento", { ascending: true })
          .limit(1000),
        supabase.from("contas_bancarias").select("id, nome, banco, empresa_id").eq("ativo", true).order("nome"),
        supabase.from("chart_of_accounts").select("id, codigo, nome").order("codigo"),
      ]);
      const coaMap = new Map<string, string>();
      (coaReq.data || []).forEach((c: { id: string; codigo: string; nome: string }) => {
        coaMap.set(c.id, `${c.codigo} · ${c.nome}`);
      });
      const rows = ((expensesReq.data as ExpenseOption[]) || []).map((e) => ({
        ...e,
        plano_contas_nome: e.plano_contas_id ? (coaMap.get(e.plano_contas_id) ?? null) : null,
      }));
      setExpenses(rows);
      setAccounts((accountsReq.data as BankAccount[]) || []);
      setLoading(false);
    };
    void load();
  }, [open, matrizId]);

  useEffect(() => {
    if (selectedExpenses.length === 0) return;
    const first = selectedExpenses[0];
    setEmpresaId(first.empresa_id || matrizId);
    setValue(selectedTotal.toFixed(2).replace(".", ","));
    const favorecidos = Array.from(new Set(selectedExpenses.map((e) => e.favorecido_nome || "").filter(Boolean)));
    setBeneficiary(favorecidos.length === 1 ? favorecidos[0] : favorecidos[0] || "");
    setHistory(
      selectedExpenses.length === 1
        ? first.descricao || ""
        : `Pagamento de ${selectedExpenses.length} contas: ${selectedExpenses.map((e) => e.descricao).filter(Boolean).join(" | ").slice(0, 180)}`,
    );
    setDate(first.data_vencimento || getLocalDateISO());
  }, [selectedExpenses, selectedTotal, matrizId]);

  const multiplosFavorecidos = useMemo(
    () => new Set(selectedExpenses.map((e) => (e.favorecido_nome || "").trim().toLowerCase()).filter(Boolean)).size > 1,
    [selectedExpenses],
  );

  const handleContinue = () => {
    if (!empresaId) return toast.error("Selecione a empresa / unidade");
    if (linkType === "conta_pagar" && expenseIds.length === 0) return toast.error("Selecione ao menos uma conta a pagar");
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
                <Label className="text-xs">Contas a pagar <span className="text-destructive">*</span></Label>
                {selectedExpenses.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-primary/30 bg-primary/5 p-1.5">
                      {selectedExpenses.map((exp) => (
                        <div key={exp.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-background/60">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium" title={exp.descricao}>
                              {exp.favorecido_nome || "Sem favorecido"} — {exp.descricao}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Saldo {formatCurrency(Math.max(0, Number(exp.valor_total) - Number(exp.valor_pago || 0)))}
                              {exp.data_vencimento ? ` · Venc. ${formatDateBR(exp.data_vencimento)}` : ""}
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Remover conta" onClick={() => setExpenseIds((prev) => prev.filter((id) => id !== exp.id))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {selectedExpenses.length} conta(s) · saldo total <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong>
                      </span>
                      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setPickerOpen(true)}>
                        <Search className="h-3.5 w-3.5" /> Adicionar / alterar contas
                      </Button>
                    </div>
                    {multiplosFavorecidos && (
                      <p className="text-[10px] text-destructive">Atenção: as contas selecionadas têm favorecidos diferentes. Confira o favorecido do cheque.</p>
                    )}
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="h-9 w-full justify-start gap-2 text-xs text-muted-foreground" onClick={() => setPickerOpen(true)}>
                    <Search className="h-3.5 w-3.5" />
                    {loading ? "Carregando contas..." : "Buscar e selecionar conta a pagar..."}
                  </Button>
                )}
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
      <PayablePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        payables={expenses}
        loading={loading}
        onSelect={(option) => setExpenseId(option.id)}
      />
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
