import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Search, ArrowUpCircle, ArrowDownCircle, RotateCcw, Filter, Landmark } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { getLocalDateISO } from "@/lib/date";
import { format, parseISO } from "date-fns";

interface Transaction {
  id: string;
  conta_bancaria_id: string;
  tipo: string;
  valor: number;
  data_movimentacao: string;
  descricao: string;
  categoria_financeira_id: string | null;
  plano_contas_id: string | null;
  origem: string;
  origem_id: string | null;
  status: string;
  observacoes: string | null;
  empresa_id: string;
  unidade_id: string | null;
  created_at: string;
  bank_accounts?: { nome: string } | null;
  chart_of_accounts?: { nome: string; codigo: string } | null;
  fiscal_establishments?: { nome_fantasia: string | null; razao_social: string } | null;
}

interface BankAccount {
  id: string;
  nome: string;
  tipo: string;
  saldo_atual: number;
  ativo: boolean;
  empresa_id: string;
  permitir_multiplas_unidades: boolean;
}

interface BankAccountUnit {
  conta_bancaria_id: string;
  unidade_id: string;
}

interface ChartAccount {
  id: string;
  nome: string;
  codigo: string;
}

interface FinancialCategory {
  id: string;
  name: string;
  type: string;
}

interface Establishment {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  type: string;
}

const ORIGENS = [
  { value: "manual", label: "Manual" },
  { value: "ajuste", label: "Ajuste" },
  { value: "conta_pagar", label: "Conta a Pagar" },
  { value: "conta_receber", label: "Conta a Receber" },
];

const origemLabel = (o: string) => ORIGENS.find(x => x.value === o)?.label ?? o;

const emptyForm = {
  conta_bancaria_id: "",
  tipo: "entrada" as string,
  valor: "",
  data_movimentacao: getLocalDateISO(),
  descricao: "",
  categoria_financeira_id: "",
  plano_contas_id: "",
  origem: "manual",
  observacoes: "",
  empresa_id: "",
  unidade_id: "",
};

export default function AdminFinancialTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [bankAccountUnits, setBankAccountUnits] = useState<BankAccountUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterConta, setFilterConta] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");
  const [filterUnidade, setFilterUnidade] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { ConfirmDialog, confirm } = useConfirmDialog();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [txRes, baRes, caRes, estRes, fcRes, bauRes] = await Promise.all([
      supabase
        .from("financial_transactions")
        .select("*, bank_accounts(nome), chart_of_accounts:plano_contas_id(nome, codigo), fiscal_establishments:unidade_id(nome_fantasia, razao_social)")
        .order("data_movimentacao", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("bank_accounts").select("id, nome, tipo, saldo_atual, ativo, empresa_id, permitir_multiplas_unidades").eq("ativo", true).order("nome"),
      supabase.from("chart_of_accounts").select("id, nome, codigo").eq("ativo", true).order("codigo"),
      supabase.from("fiscal_establishments").select("id, razao_social, nome_fantasia, type").eq("active", true),
      supabase.from("financial_categories").select("id, name, type").eq("active", true).order("name"),
      supabase.from("bank_account_units").select("conta_bancaria_id, unidade_id"),
    ]);
    if (txRes.data) setTransactions(txRes.data as any);
    if (baRes.data) setBankAccounts(baRes.data as any);
    if (caRes.data) setChartAccounts(caRes.data);
    if (estRes.data) setEstablishments(estRes.data as any);
    if (fcRes.data) setFinancialCategories(fcRes.data);
    if (bauRes.data) setBankAccountUnits(bauRes.data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleOpen = () => {
    setForm({
      ...emptyForm,
      empresa_id: establishments[0]?.id ?? "",
    });
    setOpen(true);
  };

  // Get valid units for a given bank account
  const getValidUnits = (contaId: string) => {
    const ba = bankAccounts.find(b => b.id === contaId);
    if (!ba) return establishments;
    if (!ba.permitir_multiplas_unidades) {
      // Only the owner establishment
      return establishments.filter(e => e.id === ba.empresa_id);
    }
    const linkedIds = bankAccountUnits
      .filter(u => u.conta_bancaria_id === contaId)
      .map(u => u.unidade_id);
    // If no units linked, treat as global
    if (linkedIds.length === 0) return establishments;
    return establishments.filter(e => linkedIds.includes(e.id));
  };

  const handleSave = async () => {
    if (!form.conta_bancaria_id || !form.descricao.trim() || !form.valor) {
      toast.error("Preencha conta, descrição e valor.");
      return;
    }
    if (!form.unidade_id) {
      toast.error("Selecione a unidade.");
      return;
    }
    if (!form.categoria_financeira_id) {
      toast.error("Selecione a categoria financeira.");
      return;
    }
    if (!form.plano_contas_id) {
      toast.error("Selecione o plano de contas.");
      return;
    }
    if (!form.data_movimentacao) {
      toast.error("Informe a data da movimentação.");
      return;
    }

    // Validate unit is linked to the account
    const validUnits = getValidUnits(form.conta_bancaria_id);
    if (!validUnits.find(u => u.id === form.unidade_id)) {
      toast.error("Unidade não vinculada a esta conta bancária.");
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sessão expirada."); setSaving(false); return; }

    const valor = Number(unmaskCurrency(form.valor));
    if (valor <= 0) { toast.error("Valor deve ser maior que zero."); setSaving(false); return; }

    const payload = {
      conta_bancaria_id: form.conta_bancaria_id,
      tipo: form.tipo,
      valor,
      data_movimentacao: form.data_movimentacao,
      descricao: form.descricao.trim(),
      categoria_financeira_id: form.categoria_financeira_id || null,
      plano_contas_id: form.plano_contas_id || null,
      origem: form.origem,
      status: "confirmado",
      observacoes: form.observacoes?.trim() || null,
      empresa_id: form.empresa_id,
      unidade_id: form.unidade_id,
      created_by: user.id,
    };

    const { error } = await supabase.from("financial_transactions").insert(payload);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
    } else {
      toast.success("Movimentação registrada!");
      setOpen(false);
      fetchAll();
    }
    setSaving(false);
  };

  const handleEstorno = async (tx: Transaction) => {
    if (tx.status !== "confirmado") {
      toast.error("Apenas movimentações confirmadas podem ser estornadas.");
      return;
    }
    const ok = await confirm({ title: "Estornar movimentação", description: "Será criada uma movimentação inversa. Deseja continuar?" });
    if (!ok) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sessão expirada."); return; }

    const { error } = await supabase.from("financial_transactions").insert({
      conta_bancaria_id: tx.conta_bancaria_id,
      tipo: tx.tipo === "entrada" ? "saida" : "entrada",
      valor: tx.valor,
      data_movimentacao: getLocalDateISO(),
      descricao: `Estorno: ${tx.descricao}`,
      plano_contas_id: tx.plano_contas_id,
      origem: "ajuste",
      origem_id: tx.id,
      status: "confirmado",
      observacoes: `Estorno da movimentação de ${format(parseISO(tx.data_movimentacao), "dd/MM/yyyy")}`,
      empresa_id: tx.empresa_id,
      created_by: user.id,
    });

    if (error) {
      toast.error("Erro ao estornar: " + error.message);
    } else {
      toast.success("Estorno realizado!");
      fetchAll();
    }
  };

  const filtered = transactions.filter(tx => {
    if (filterConta !== "all" && tx.conta_bancaria_id !== filterConta) return false;
    if (filterTipo !== "all" && tx.tipo !== filterTipo) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!tx.descricao.toLowerCase().includes(s) && !(tx.bank_accounts as any)?.nome?.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const totalEntradas = filtered.filter(t => t.tipo === "entrada" && t.status === "confirmado").reduce((s, t) => s + Number(t.valor), 0);
  const totalSaidas = filtered.filter(t => t.tipo === "saida" && t.status === "confirmado").reduce((s, t) => s + Number(t.valor), 0);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Movimentações Financeiras</h1>
          <Button onClick={handleOpen} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Movimentação
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowUpCircle className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Entradas</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(totalEntradas)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ArrowDownCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Saídas</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalSaidas)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Landmark className="h-8 w-8 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Saldo Período</p>
                <p className={`text-lg font-bold ${totalEntradas - totalSaidas >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatCurrency(totalEntradas - totalSaidas)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por descrição..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterConta} onValueChange={setFilterConta}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Conta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Contas</SelectItem>
              {bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="saida">Saídas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-muted-foreground text-center py-8">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">Nenhuma movimentação encontrada.</p>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(parseISO(tx.data_movimentacao), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.tipo === "entrada"
                          ? <ArrowUpCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />}
                        <span className="truncate max-w-[250px]">{tx.descricao}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{(tx.bank_accounts as any)?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{origemLabel(tx.origem)}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium whitespace-nowrap ${tx.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                      {tx.tipo === "entrada" ? "+" : "−"} {formatCurrency(tx.valor)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.status === "confirmado" ? "default" : "secondary"} className="text-xs">
                        {tx.status === "confirmado" ? "Confirmado" : "Pendente"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {tx.status === "confirmado" && tx.origem !== "ajuste" && (
                        <Button variant="ghost" size="icon" title="Estornar" onClick={() => handleEstorno(tx)} className="h-8 w-8">
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* New Transaction Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Movimentação</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {establishments.length > 1 && (
              <div>
                <Label>Empresa</Label>
                <Select value={form.empresa_id} onValueChange={v => setForm(f => ({ ...f, empresa_id: v, conta_bancaria_id: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {establishments.map(e => <SelectItem key={e.id} value={e.id}>{e.nome_fantasia || e.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Conta Bancária *</Label>
              <Select value={form.conta_bancaria_id} onValueChange={v => {
                const ba = bankAccounts.find(b => b.id === v);
                setForm(f => ({ ...f, conta_bancaria_id: v, empresa_id: ba?.empresa_id || f.empresa_id }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts
                    .filter(ba => !form.empresa_id || ba.empresa_id === form.empresa_id)
                    .map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.nome} ({formatCurrency(ba.saldo_atual)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor *</Label>
                <Input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: maskCurrency(e.target.value) }))} placeholder="0,00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data *</Label>
                <Input type="date" value={form.data_movimentacao} onChange={e => setForm(f => ({ ...f, data_movimentacao: e.target.value }))} />
              </div>
              <div>
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={v => setForm(f => ({ ...f, origem: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="ajuste">Ajuste</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Aporte sócio, Saque, Ajuste de saldo" />
            </div>
            <div>
              <Label>Categoria Financeira *</Label>
              <Select value={form.categoria_financeira_id} onValueChange={v => setForm(f => ({ ...f, categoria_financeira_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                <SelectContent>
                  {financialCategories
                    .filter(fc => form.tipo === "entrada" ? fc.type === "receita" : fc.type === "despesa")
                    .map(fc => <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>)}
                  {financialCategories
                    .filter(fc => fc.type !== "receita" && fc.type !== "despesa")
                    .map(fc => <SelectItem key={fc.id} value={fc.id}>{fc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plano de Contas *</Label>
              <Select value={form.plano_contas_id} onValueChange={v => setForm(f => ({ ...f, plano_contas_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o plano" /></SelectTrigger>
                <SelectContent>
                  {chartAccounts.map(ca => <SelectItem key={ca.id} value={ca.id}>{ca.codigo} - {ca.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </AdminLayout>
  );
}
