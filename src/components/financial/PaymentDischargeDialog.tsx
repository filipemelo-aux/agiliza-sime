import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "cartao_credito", label: "Cartão de Crédito" },
  { value: "cartao_debito", label: "Cartão de Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

interface BankAccount {
  id: string;
  nome: string;
  tipo: string;
  saldo_atual: number;
  ativo: boolean;
  empresa_id: string;
}

interface PaymentRecord {
  id: string;
  valor: number;
  forma_pagamento: string;
  data_pagamento: string;
  observacoes: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId: string;
  valorTotal: number;
  valorPago: number;
  planoContasId?: string | null;
  empresaId?: string | null;
  descricao?: string | null;
  onSaved: () => void;
}

export function PaymentDischargeDialog({ open, onOpenChange, expenseId, valorTotal, valorPago, planoContasId, empresaId, descricao, onSaved }: Props) {
  const { user } = useAuth();
  const saldoRestante = valorTotal - valorPago;
  const [valor, setValor] = useState(String(saldoRestante));
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [observacoes, setObservacoes] = useState("");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [dataPagamento, setDataPagamento] = useState<Date>(new Date());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    if (open && expenseId) {
      setValor(String(valorTotal - valorPago));
      setObservacoes("");
      setDataPagamento(new Date());
      setContaBancariaId("");
      loadHistory();
      loadBankAccounts();
    }
  }, [open, expenseId]);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("expense_payments" as any)
      .select("*")
      .eq("expense_id", expenseId)
      .order("created_at", { ascending: false });
    setHistory((data as any) || []);
  };

  const loadBankAccounts = async () => {
    const query = supabase.from("bank_accounts").select("id, nome, tipo, saldo_atual, ativo, empresa_id").eq("ativo", true).order("nome");
    const { data } = empresaId
      ? await query.eq("empresa_id", empresaId)
      : await query;
    setBankAccounts(data || []);
  };

  const handleConfirm = async () => {
    const valorNum = Number(valor);
    if (!valorNum || valorNum <= 0) return toast.error("Informe o valor");
    if (valorNum > saldoRestante + 0.01) return toast.error("Valor excede o saldo restante");
    if (!contaBancariaId) return toast.error("Selecione a conta bancária");

    setSaving(true);

    // Insert payment record
    const { error: payErr } = await supabase.from("expense_payments" as any).insert({
      expense_id: expenseId,
      valor: valorNum,
      forma_pagamento: formaPagamento,
      data_pagamento: format(dataPagamento, "yyyy-MM-dd"),
      observacoes: observacoes.trim() || null,
      created_by: user?.id,
    } as any);
    if (payErr) { toast.error(payErr.message); setSaving(false); return; }

    const novoValorPago = valorPago + valorNum;
    const novoStatus = novoValorPago >= valorTotal ? "pago" : "parcial";

    const { error } = await supabase.from("expenses").update({
      valor_pago: novoValorPago,
      status: novoStatus,
      forma_pagamento: formaPagamento,
      data_pagamento: getLocalDateISO(dataPagamento),
    } as any).eq("id", expenseId);

    if (error) { toast.error(error.message); setSaving(false); return; }

    // Create financial transaction (saida)
    const selectedAccount = bankAccounts.find(ba => ba.id === contaBancariaId);
    const { error: txErr } = await supabase.from("financial_transactions").insert({
      conta_bancaria_id: contaBancariaId,
      tipo: "saida",
      valor: valorNum,
      data_movimentacao: format(dataPagamento, "yyyy-MM-dd"),
      descricao: `Pgto: ${descricao || "Conta a Pagar"}`,
      plano_contas_id: planoContasId || null,
      origem: "conta_pagar",
      origem_id: expenseId,
      status: "confirmado",
      observacoes: observacoes.trim() || null,
      empresa_id: selectedAccount?.empresa_id || empresaId || "",
      created_by: user?.id,
    } as any);

    if (txErr) {
      console.error("Erro ao criar movimentação:", txErr.message);
      // Payment was already recorded — don't block, just warn
      toast.warning("Pagamento registrado, mas houve erro ao criar movimentação financeira.");
    }

    toast.success(novoStatus === "pago" ? "Despesa quitada" : "Pagamento parcial registrado");
    setSaving(false);
    onOpenChange(false);
    onSaved();
  };

  const formaLabel = (v: string) => FORMA_PAGAMENTO_OPTIONS.find(o => o.value === v)?.label || v;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Baixa de Pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Total: {formatCurrency(valorTotal)} | 
            Pago: {formatCurrency(valorPago)} | 
            Restante: <strong className="text-foreground">{formatCurrency(saldoRestante)}</strong>
          </div>

          {/* Bank Account Selection */}
          <div>
            <Label>Conta Bancária *</Label>
            <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map(ba => (
                  <SelectItem key={ba.id} value={ba.id}>
                    {ba.nome} ({formatCurrency(ba.saldo_atual)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={valor ? maskCurrency(String(Math.round(parseFloat(valor) * 100))) : ""} onChange={e => setValor(unmaskCurrency(e.target.value))} />
            </div>
            <div>
              <Label>Data do Pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !dataPagamento && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataPagamento ? format(dataPagamento, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataPagamento}
                    onSelect={(d) => d && setDataPagamento(d)}
                    locale={ptBR}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
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
            {saving ? "Salvando..." : "Confirmar Pagamento"}
          </Button>

          {/* Payment history */}
          {history.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Histórico de Pagamentos</p>
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Forma</TableHead>
                      <TableHead>Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                        <TableCell className="text-xs font-mono">{formatCurrency(Number(p.valor))}</TableCell>
                        <TableCell className="text-xs">{formaLabel(p.forma_pagamento)}</TableCell>
                        <TableCell className="text-xs max-w-[100px] truncate">{p.observacoes || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
