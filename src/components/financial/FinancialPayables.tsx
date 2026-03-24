import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Check, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { PaymentDischargeDialog } from "./PaymentDischargeDialog";

interface Expense {
  id: string;
  descricao: string;
  tipo_despesa: string;
  categoria_financeira_id: string | null;
  centro_custo: string;
  valor_total: number;
  valor_pago: number;
  data_emissao: string;
  data_vencimento: string | null;
  status: string;
  forma_pagamento: string | null;
  favorecido_nome: string | null;
  favorecido_id: string | null;
  documento_fiscal_numero: string | null;
  chave_nfe: string | null;
  observacoes: string | null;
  veiculo_placa: string | null;
  litros: number | null;
  km_odometro: number | null;
  numero_multa: string | null;
  origem: string;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  parcial: { label: "Parcial", variant: "secondary" },
};

const TIPO_MAP: Record<string, string> = {
  combustivel: "Combustível",
  manutencao: "Manutenção",
  pedagio: "Pedágio",
  multa: "Multa",
  administrativo: "Administrativo",
  frete_terceiro: "Frete Terceiro",
  imposto: "Imposto",
  outros: "Outros",
};

export function FinancialPayables() {
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");

  // Dialog states
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentExpense, setPaymentExpense] = useState<Expense | null>(null);

  const fetchData = async () => {
    setLoading(true);

    // Get empresa_id (first establishment)
    const { data: estab } = await supabase.from("fiscal_establishments").select("id").limit(1).maybeSingle();
    const eid = estab?.id || "";
    setEmpresaId(eid);

    const [{ data: expData }, { data: catData }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("financial_categories")
        .select("id, name")
        .eq("type", "payable" as any)
        .eq("active", true),
    ]);

    setItems((expData as any) || []);
    setCategories((catData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (item: Expense) => {
    setEditingExpense(item);
    setFormOpen(true);
  };

  const handleNew = () => {
    setEditingExpense(null);
    setFormOpen(true);
  };

  const handleDelete = async (item: Expense) => {
    if (!confirm("Deseja excluir esta despesa?")) return;
    const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Despesa excluída");
    fetchData();
  };

  const handlePayment = (item: Expense) => {
    setPaymentExpense(item);
    setPaymentOpen(true);
  };

  const getCategoryName = (id: string | null) => categories.find(c => c.id === id)?.name || "—";

  const filtered = items.filter(i => {
    const matchSearch = !search ||
      i.descricao.toLowerCase().includes(search.toLowerCase()) ||
      (i.favorecido_nome || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.veiculo_placa || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    const matchTipo = filterTipo === "all" || i.tipo_despesa === filterTipo;
    return matchSearch && matchStatus && matchTipo;
  });

  const totalPendente = filtered.filter(i => i.status !== "pago").reduce((s, i) => s + (Number(i.valor_total) - Number(i.valor_pago)), 0);
  const totalPago = filtered.reduce((s, i) => s + Number(i.valor_pago), 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pendente</p>
            <p className="text-xl font-bold text-orange-600">R$ {totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pago</p>
            <p className="text-xl font-bold text-emerald-600">R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card className="hidden md:block">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Registros</p>
            <p className="text-xl font-bold text-foreground">{filtered.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Despesas</CardTitle>
          <Button size="sm" onClick={handleNew}><Plus className="h-4 w-4 mr-1" /> Nova Despesa</Button>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                {Object.entries(TIPO_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma despesa encontrada</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Favorecido</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.descricao}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{TIPO_MAP[item.tipo_despesa] || item.tipo_despesa}</Badge>
                      </TableCell>
                      <TableCell>{item.favorecido_nome || "—"}</TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {Number(item.valor_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        {item.valor_pago > 0 && item.status !== "pago" && (
                          <div className="text-xs text-muted-foreground">
                            Pago: R$ {Number(item.valor_pago).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{item.data_vencimento ? format(new Date(item.data_vencimento + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[item.status]?.variant || "outline"}>
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {item.status !== "pago" && (
                            <Button variant="ghost" size="icon" title="Baixa de pagamento" onClick={() => handlePayment(item)}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <ExpenseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        expense={editingExpense}
        empresaId={empresaId}
        categories={categories}
        onSaved={fetchData}
      />

      {/* Payment Discharge Dialog */}
      {paymentExpense && (
        <PaymentDischargeDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          expenseId={paymentExpense.id}
          valorTotal={paymentExpense.valor_total}
          valorPago={paymentExpense.valor_pago}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
