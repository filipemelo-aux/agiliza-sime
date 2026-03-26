import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Pencil, Search, Landmark, Building2, Wallet, PiggyBank, Ban, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { BankStatementDialog } from "@/components/financial/BankStatementDialog";

interface BankAccount {
  id: string;
  nome: string;
  tipo: string;
  banco_nome: string | null;
  banco_codigo: string | null;
  agencia: string | null;
  conta_numero: string | null;
  saldo_inicial: number;
  saldo_atual: number;
  ativo: boolean;
  empresa_id: string;
  created_at: string;
}

interface Establishment {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
}


const TIPOS = [
  { value: "corrente", label: "Conta Corrente" },
  { value: "poupanca", label: "Poupança" },
  { value: "caixa", label: "Caixa" },
  { value: "carteira", label: "Carteira" },
];

const tipoIcon = (tipo: string) => {
  switch (tipo) {
    case "corrente": return <Landmark className="h-4 w-4" />;
    case "poupanca": return <PiggyBank className="h-4 w-4" />;
    case "caixa": return <Building2 className="h-4 w-4" />;
    case "carteira": return <Wallet className="h-4 w-4" />;
    default: return <Landmark className="h-4 w-4" />;
  }
};

const tipoLabel = (tipo: string) => TIPOS.find(t => t.value === tipo)?.label ?? tipo;

const origemLabel = (o: string) => {
  switch (o) {
    case "manual": return "Manual";
    case "ajuste": return "Ajuste";
    case "conta_pagar": return "Conta a Pagar";
    case "conta_receber": return "Conta a Receber";
    default: return o;
  }
};

const emptyForm = {
  nome: "",
  tipo: "corrente",
  banco_nome: "",
  banco_codigo: "",
  agencia: "",
  conta_numero: "",
  saldo_inicial: "0,00",
  empresa_id: "",
};

export default function AdminBankAccounts() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Statement (extrato) dialog state
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extratoAccount, setExtratoAccount] = useState<BankAccount | null>(null);
  const [extratoTransactions, setExtratoTransactions] = useState<Transaction[]>([]);
  const [extratoLoading, setExtratoLoading] = useState(false);
  const [extratoInicio, setExtratoInicio] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [extratoFim, setExtratoFim] = useState(() => getLocalDateISO());

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .order("ativo", { ascending: false })
      .order("nome");
    if (error) {
      toast.error("Erro ao carregar contas bancárias");
    } else {
      setAccounts((data as any[]) ?? []);
    }
    setLoading(false);
  }, []);

  const fetchEstablishments = useCallback(async () => {
    const { data } = await supabase
      .from("fiscal_establishments")
      .select("id, razao_social, nome_fantasia")
      .eq("active", true)
      .order("razao_social");
    setEstablishments(data ?? []);
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchEstablishments();
  }, [fetchAccounts, fetchEstablishments]);

  // Realtime subscription for bank_accounts balance updates
  useEffect(() => {
    const channel = supabase
      .channel("bank-accounts-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bank_accounts" },
        (payload) => {
          setAccounts(prev =>
            prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new as any } : a)
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      empresa_id: establishments.length === 1 ? establishments[0].id : "",
    });
    setDialogOpen(true);
  };

  const openEdit = (acc: BankAccount) => {
    setEditing(acc);
    setForm({
      nome: acc.nome,
      tipo: acc.tipo,
      banco_nome: acc.banco_nome ?? "",
      banco_codigo: acc.banco_codigo ?? "",
      agencia: acc.agencia ?? "",
      conta_numero: acc.conta_numero ?? "",
      saldo_inicial: formatCurrency(acc.saldo_inicial).replace("R$\u00a0", "").replace("R$ ", ""),
      empresa_id: acc.empresa_id,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Informe o nome da conta"); return; }
    if (!form.empresa_id) { toast.error("Selecione a empresa"); return; }

    setSaving(true);
    const saldoInicial = unmaskCurrency(form.saldo_inicial);

    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      banco_nome: form.banco_nome.trim() || null,
      banco_codigo: form.banco_codigo.trim() || null,
      agencia: form.agencia.trim() || null,
      conta_numero: form.conta_numero.trim() || null,
      saldo_inicial: saldoInicial,
      empresa_id: form.empresa_id,
    };

    if (editing) {
      const { error } = await supabase
        .from("bank_accounts")
        .update(payload as any)
        .eq("id", editing.id);
      if (error) {
        toast.error("Erro ao atualizar conta");
      } else {
        toast.success("Conta atualizada");
        // Recalculate balance when saldo_inicial changes
        await supabase.rpc("recalc_bank_balance", { _conta_id: editing.id } as any);
      }
    } else {
      const { error } = await supabase
        .from("bank_accounts")
        .insert({ ...payload, saldo_atual: saldoInicial } as any);
      if (error) toast.error("Erro ao criar conta");
      else toast.success("Conta criada");
    }

    setSaving(false);
    setDialogOpen(false);
    fetchAccounts();
  };

  const toggleAtivo = async (acc: BankAccount) => {
    const action = acc.ativo ? "inativar" : "reativar";
    const ok = await confirm(`Deseja ${action} a conta "${acc.nome}"?`);
    if (!ok) return;

    const { error } = await supabase
      .from("bank_accounts")
      .update({ ativo: !acc.ativo } as any)
      .eq("id", acc.id);
    if (error) toast.error("Erro ao alterar status");
    else {
      toast.success(`Conta ${acc.ativo ? "inativada" : "reativada"}`);
      fetchAccounts();
    }
  };

  // Statement (extrato) functions
  const openExtrato = (acc: BankAccount) => {
    setExtratoAccount(acc);
    setExtratoInicio(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setExtratoFim(getLocalDateISO());
    setExtratoOpen(true);
  };

  const fetchExtrato = useCallback(async () => {
    if (!extratoAccount) return;
    setExtratoLoading(true);
    let query = supabase
      .from("financial_transactions")
      .select("id, tipo, valor, data_movimentacao, descricao, origem, status, created_at")
      .eq("conta_bancaria_id", extratoAccount.id)
      .order("data_movimentacao", { ascending: true })
      .order("created_at", { ascending: true });

    if (extratoInicio) query = query.gte("data_movimentacao", extratoInicio);
    if (extratoFim) query = query.lte("data_movimentacao", extratoFim);

    const { data } = await query;
    setExtratoTransactions((data as any[]) || []);
    setExtratoLoading(false);
  }, [extratoAccount, extratoInicio, extratoFim]);

  useEffect(() => {
    if (extratoOpen && extratoAccount) fetchExtrato();
  }, [extratoOpen, extratoAccount, fetchExtrato]);

  const extratoEntradas = extratoTransactions.filter(t => t.tipo === "entrada" && t.status === "confirmado").reduce((s, t) => s + Number(t.valor), 0);
  const extratoSaidas = extratoTransactions.filter(t => t.tipo === "saida" && t.status === "confirmado").reduce((s, t) => s + Number(t.valor), 0);

  const filtered = accounts.filter(a =>
    a.nome.toLowerCase().includes(search.toLowerCase()) ||
    (a.banco_nome ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalSaldo = filtered.filter(a => a.ativo).reduce((s, a) => s + Number(a.saldo_atual), 0);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Contas Bancárias</h1>
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Conta
          </Button>
        </div>

        {/* Summary */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo Total (contas ativas)</p>
              <p className={`text-2xl font-bold font-mono ${totalSaldo >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {formatCurrency(totalSaldo)}
              </p>
            </div>
            <Landmark className="h-8 w-8 text-muted-foreground/40" />
          </CardContent>
        </Card>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Ag / Conta</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-right">Saldo Atual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(acc => (
                  <TableRow key={acc.id} className={!acc.ativo ? "opacity-50" : ""}>
                    <TableCell className="font-medium">{acc.nome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {tipoIcon(acc.tipo)}
                        <span className="text-xs">{tipoLabel(acc.tipo)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {acc.banco_nome ? `${acc.banco_nome}${acc.banco_codigo ? ` (${acc.banco_codigo})` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {acc.agencia || acc.conta_numero
                        ? `${acc.agencia ?? "—"} / ${acc.conta_numero ?? "—"}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatCurrency(acc.saldo_inicial)}</TableCell>
                    <TableCell className={`text-right font-mono text-xs font-semibold ${Number(acc.saldo_atual) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(Number(acc.saldo_atual))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={acc.ativo ? "default" : "secondary"} className="text-[10px]">
                        {acc.ativo ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openExtrato(acc)} title="Extrato">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(acc)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleAtivo(acc)} title={acc.ativo ? "Inativar" : "Reativar"}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Banco do Brasil" />
            </div>

            <div>
              <Label>Empresa *</Label>
              <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {establishments.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome_fantasia || e.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Banco</Label>
                <Input value={form.banco_nome} onChange={e => setForm(f => ({ ...f, banco_nome: e.target.value }))} placeholder="Ex: Bradesco" />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={form.banco_codigo} onChange={e => setForm(f => ({ ...f, banco_codigo: e.target.value }))} placeholder="Ex: 237" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Agência</Label>
                <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0001" />
              </div>
              <div>
                <Label>Conta</Label>
                <Input value={form.conta_numero} onChange={e => setForm(f => ({ ...f, conta_numero: e.target.value }))} placeholder="12345-6" />
              </div>
            </div>

            <div>
              <Label>Saldo Inicial</Label>
              <Input
                value={form.saldo_inicial}
                onChange={e => setForm(f => ({ ...f, saldo_inicial: maskCurrency(e.target.value) }))}
                className="font-mono"
                placeholder="0,00"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Statement (Extrato) Dialog */}
      <Dialog open={extratoOpen} onOpenChange={setExtratoOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extrato — {extratoAccount?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Period filter */}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="date" className="h-9 w-[150px]" value={extratoInicio} onChange={e => setExtratoInicio(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Fim</Label>
                <Input type="date" className="h-9 w-[150px]" value={extratoFim} onChange={e => setExtratoFim(e.target.value)} />
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <ArrowUpCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Entradas</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(extratoEntradas)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <ArrowDownCircle className="h-5 w-5 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Saídas</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(extratoSaidas)}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">Saldo Atual</p>
                    <p className={`text-sm font-bold ${Number(extratoAccount?.saldo_atual) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                      {formatCurrency(Number(extratoAccount?.saldo_atual))}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Transaction list */}
            {extratoLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : extratoTransactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação no período.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extratoTransactions.map(tx => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(parseISO(tx.data_movimentacao), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {tx.tipo === "entrada"
                              ? <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              : <ArrowDownCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                            <span className="text-xs truncate max-w-[220px]">{tx.descricao}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{origemLabel(tx.origem)}</Badge>
                        </TableCell>
                        <TableCell className={`text-right text-xs font-mono font-semibold whitespace-nowrap ${tx.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                          {tx.tipo === "entrada" ? "+" : "−"} {formatCurrency(tx.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </AdminLayout>
  );
}
