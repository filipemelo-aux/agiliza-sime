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
import { PlanoContasCombobox, type PlanoContaOption } from "./PlanoContasCombobox";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { personDisplayName } from "@/lib/personName";
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

const rowBalance = (e: ExpenseOption) => Math.max(0, Number(e.valor_total) - Number(e.valor_pago || 0));

export function CheckIssueStandaloneDialog({ open, onOpenChange, onSaved }: Props) {
  const { matrizId } = useUnifiedCompany();
  const [linkType, setLinkType] = useState<LinkType>("conta_pagar");
  const [empresaId, setEmpresaId] = useState("");
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [value, setValue] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null);
  const [history, setHistory] = useState("");
  const [date, setDate] = useState(getLocalDateISO());
  const [planoContasId, setPlanoContasId] = useState<string>("");
  const [planos, setPlanos] = useState<PlanoContaOption[]>([]);
  const [rows, setRows] = useState<ExpenseOption[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [issueOpen, setIssueOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createPersonOpen, setCreatePersonOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const selectedRows = useMemo(
    () => rowIds.map((id) => rows.find((item) => item.id === id)).filter(Boolean) as ExpenseOption[],
    [rows, rowIds],
  );
  const selectedTotal = useMemo(() => selectedRows.reduce((sum, e) => sum + rowBalance(e), 0), [selectedRows]);
  const expenseIds = useMemo(() => Array.from(new Set(selectedRows.map((r) => r.expense_id))), [selectedRows]);
  const parsedValue = Number(unmaskCurrency(value)) || 0;

  const loadData = async () => {
    setLoading(true);
    const [expensesReq, accountsReq, coaReq, instReq] = await Promise.all([
      supabase.from("expenses")
        .select("id, descricao, valor_total, valor_pago, status, data_vencimento, data_emissao, favorecido_nome, favorecido_id, empresa_id, forma_pagamento, plano_contas_id, veiculo_placa, fornecedor_cnpj")
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true })
        .limit(1000),
      supabase.from("contas_bancarias").select("id, nome, banco, empresa_id").eq("ativo", true).order("nome"),
      supabase.from("chart_of_accounts").select("id, codigo, nome, tipo, conta_pai_id, tipo_operacional").order("codigo"),
      supabase.from("expense_installments").select("id, expense_id, numero_parcela, total_parcelas, valor, data_vencimento, status").order("numero_parcela"),
    ]);

    const coaRows = (coaReq.data as PlanoContaOption[]) || [];
    setPlanos(coaRows);
    const coaMap = new Map<string, string>();
    coaRows.forEach((c) => coaMap.set(c.id, `${c.codigo} · ${c.nome}`));

    const instByExpense = new Map<string, any[]>();
    ((instReq.data as any[]) || []).forEach((i) => {
      const list = instByExpense.get(i.expense_id) || [];
      list.push(i);
      instByExpense.set(i.expense_id, list);
    });

    const expanded: ExpenseOption[] = [];
    ((expensesReq.data as any[]) || []).forEach((e) => {
      const base = {
        ...e,
        expense_id: e.id,
        plano_contas_nome: e.plano_contas_id ? (coaMap.get(e.plano_contas_id) ?? null) : null,
      } as ExpenseOption;
      const parcelas = instByExpense.get(e.id) || [];
      if (parcelas.length === 0) {
        expanded.push({ ...base, parcela_label: null });
        return;
      }
      parcelas
        .sort((a, b) => (a.numero_parcela || 0) - (b.numero_parcela || 0))
        .forEach((p) => {
          const valor = Number(p.valor) || 0;
          const pago = p.status === "pago" ? valor : 0;
          expanded.push({
            ...base,
            id: p.id,
            parcela_label: `${p.numero_parcela}/${p.total_parcelas || parcelas.length}`,
            valor_total: valor,
            valor_pago: pago,
            status: p.status || base.status,
            data_vencimento: p.data_vencimento,
          });
        });
    });

    setRows(expanded);
    setAccounts((accountsReq.data as BankAccount[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setEmpresaId((current) => current || matrizId);
    setDate(getLocalDateISO());
    setLinkType("conta_pagar");
    setRowIds([]);
    setValue("");
    setBeneficiary("");
    setBeneficiaryId(null);
    setHistory("");
    setPlanoContasId("");
    void loadData();
  }, [open, matrizId]);

  useEffect(() => {
    if (selectedRows.length === 0) return;
    const first = selectedRows[0];
    setEmpresaId(first.empresa_id || matrizId);
    setValue(maskCurrency(String(Math.round(selectedTotal * 100))));
    const favorecidos = Array.from(new Set(selectedRows.map((e) => e.favorecido_nome || "").filter(Boolean)));
    setBeneficiary(favorecidos[0] || "");
    setBeneficiaryId(first.favorecido_id || null);
    setHistory(
      expenseIds.length === 1
        ? `${first.descricao || ""}${first.parcela_label ? ` (parcela ${first.parcela_label})` : ""}`
        : `Pagamento de ${selectedRows.length} parcela(s): ${selectedRows.map((e) => e.descricao).filter(Boolean).join(" | ").slice(0, 180)}`,
    );
    setDate(first.data_vencimento || getLocalDateISO());
  }, [selectedRows, selectedTotal, expenseIds, matrizId]);

  const multiplosFavorecidos = useMemo(
    () => new Set(selectedRows.map((e) => (e.favorecido_nome || "").trim().toLowerCase()).filter(Boolean)).size > 1,
    [selectedRows],
  );

  const handleContinue = () => {
    if (!empresaId) return toast.error("Selecione a empresa / unidade");
    if (linkType === "conta_pagar" && rowIds.length === 0) return toast.error("Selecione ao menos uma parcela");
    if (linkType === "movimentacao" && !planoContasId) return toast.error("Selecione o plano de contas");
    if (parsedValue <= 0) return toast.error("Informe um valor válido");
    if (!beneficiary.trim()) return toast.error("Informe o favorecido");
    setIssueOpen(true);
  };

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
                <Label className="text-xs">Parcelas a pagar <span className="text-destructive">*</span></Label>
                {selectedRows.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-primary/30 bg-primary/5 p-1.5">
                      {selectedRows.map((exp) => (
                        <div key={exp.id} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-background/60">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium" title={exp.descricao}>
                              {exp.favorecido_nome || "Sem favorecido"} — {exp.descricao}
                              {exp.parcela_label ? ` · parc. ${exp.parcela_label}` : ""}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Saldo {formatCurrency(rowBalance(exp))}
                              {exp.data_vencimento ? ` · Venc. ${formatDateBR(exp.data_vencimento)}` : ""}
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Remover parcela" onClick={() => setRowIds((prev) => prev.filter((id) => id !== exp.id))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {selectedRows.length} parcela(s) · saldo total <strong className="text-foreground">{formatCurrency(selectedTotal)}</strong>
                      </span>
                      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => setPickerOpen(true)}>
                        <Search className="h-3.5 w-3.5" /> Adicionar / alterar parcelas
                      </Button>
                    </div>
                    {multiplosFavorecidos && (
                      <p className="text-[10px] text-destructive">Atenção: as parcelas selecionadas têm favorecidos diferentes. Confira o favorecido do cheque.</p>
                    )}
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="h-9 w-full justify-start gap-2 text-xs text-muted-foreground" onClick={() => setPickerOpen(true)}>
                    <Search className="h-3.5 w-3.5" />
                    {loading ? "Carregando parcelas..." : "Buscar e selecionar parcelas..."}
                  </Button>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">Para quitar a conta inteira, selecione todas as parcelas dela.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">
                  Será registrada apenas uma movimentação bancária de saída na empresa / unidade selecionada, sem vínculo com contas a pagar.
                </p>
                <div>
                  <Label className="text-xs">Plano de contas <span className="text-destructive">*</span></Label>
                  <PlanoContasCombobox
                    value={planoContasId}
                    onChange={setPlanoContasId}
                    options={planos}
                    size="sm"
                    allowCreate
                    defaultTipo="despesa"
                    onCreated={(opt) => setPlanos((prev) => [...prev, opt])}
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Favorecido <span className="text-destructive">*</span></Label>
                <PersonSearchInput
                  categories={["cliente", "proprietario", "fornecedor", "colaborador", "banco", "motorista"]}
                  placeholder="Buscar favorecido cadastrado..."
                  selectedName={beneficiary || undefined}
                  onSelect={(person) => { setBeneficiary(personDisplayName(person)); setBeneficiaryId(person.id); }}
                  onClear={() => { setBeneficiary(""); setBeneficiaryId(null); }}
                  endAction={
                    <button
                      type="button"
                      title="Cadastrar novo favorecido"
                      className="rounded border border-border p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setCreatePersonOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Valor <span className="text-destructive">*</span></Label>
                <Input
                  className="h-9 text-xs"
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(maskCurrency(event.target.value))}
                  placeholder="0,00"
                />
              </div>
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
        payables={rows}
        loading={loading}
        selectedIds={rowIds}
        onConfirm={(options) => setRowIds(options.map((o) => o.id))}
      />
      <PersonCreateDialog
        open={createPersonOpen}
        onOpenChange={setCreatePersonOpen}
        defaultCategory="fornecedor"
        onCreated={() => { setCreatePersonOpen(false); }}
      />
      <CheckIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        data={{
          expenseId: linkType === "conta_pagar" ? (expenseIds[0] ?? null) : null,
          expenseIds: linkType === "conta_pagar" ? expenseIds : [],
          valor: parsedValue,
          nominal: beneficiary,
          favorecidoId: beneficiaryId,
          data: date,
          historico: history,
          numeroCheque: null,
          empresaId,
          planoContasId: linkType === "movimentacao" ? planoContasId : null,
          contaBancariaId: linkType === "movimentacao" ? (accounts.find((a) => a.empresa_id === empresaId)?.id ?? accounts[0]?.id ?? null) : null,
          vinculoTipo: linkType,
        }}
        onSaved={() => { setIssueOpen(false); onSaved(); }}
      />
    </>
  );
}
