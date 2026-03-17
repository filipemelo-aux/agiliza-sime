import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";

interface Receivable {
  id: string;
  description: string;
  category_id: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
  debtor_name: string | null;
  cte_id: string | null;
  invoice_id: string | null;
  notes: string | null;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  vencido: { label: "Vencido", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "secondary" },
};

export function FinancialReceivables() {
  const { user } = useAuth();
  const [items, setItems] = useState<Receivable[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Form state
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: recData }, { data: catData }] = await Promise.all([
      supabase.from("accounts_receivable").select("*").order("created_at", { ascending: false }),
      supabase.from("financial_categories").select("id, name").eq("type", "receivable" as any).eq("active", true),
    ]);
    setItems((recData as any) || []);
    setCategories((catData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setDescription(""); setCategoryId(""); setAmount(""); setDueDate(""); setDebtorName(""); setNotes(""); setEditingId(null);
  };

  const handleSave = async () => {
    if (!description.trim()) return toast.error("Informe a descrição");
    if (!amount || Number(amount) <= 0) return toast.error("Informe o valor");

    const payload: any = {
      description: description.trim(),
      category_id: categoryId || null,
      amount: Number(amount),
      due_date: dueDate || null,
      debtor_name: debtorName.trim() || null,
      notes: notes.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("accounts_receivable").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Conta atualizada");
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("accounts_receivable").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Conta criada");
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (item: Receivable) => {
    setEditingId(item.id);
    setDescription(item.description);
    setCategoryId(item.category_id || "");
    setAmount(String(item.amount));
    setDueDate(item.due_date || "");
    setDebtorName(item.debtor_name || "");
    setNotes(item.notes || "");
    setDialogOpen(true);
  };

  const handleMarkPaid = async (item: Receivable) => {
    const { error } = await supabase.from("accounts_receivable").update({
      status: "pago",
      paid_at: new Date().toISOString(),
      paid_amount: item.amount,
    } as any).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Marcado como pago");
    fetchData();
  };

  const getCategoryName = (id: string | null) => categories.find(c => c.id === id)?.name || "—";

  const filtered = items.filter(i => {
    const matchSearch = !search || i.description.toLowerCase().includes(search.toLowerCase()) || (i.debtor_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPendente = filtered.filter(i => i.status === "pendente").reduce((s, i) => s + Number(i.amount), 0);
  const totalPago = filtered.filter(i => i.status === "pago").reduce((s, i) => s + Number(i.paid_amount || i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Pendente</p>
            <p className="text-xl font-bold text-orange-600">R$ {totalPendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Recebido</p>
            <p className="text-xl font-bold text-emerald-600">R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Contas a Receber</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Entrada</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Conta a Receber</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Descrição *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Venda de gado, Frete avulso..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Valor (R$) *</Label>
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
                  </div>
                  <div>
                    <Label>Vencimento</Label>
                    <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Devedor</Label>
                  <Input value={debtorName} onChange={(e) => setDebtorName(e.target.value)} placeholder="Nome do devedor" />
                </div>
                <div>
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                </div>
                <Button onClick={handleSave} className="w-full">Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma conta a receber</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Devedor</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{item.description}</TableCell>
                      <TableCell>{item.debtor_name || "—"}</TableCell>
                      <TableCell>{getCategoryName(item.category_id)}</TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {Number(item.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{item.due_date ? format(new Date(item.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[item.status]?.variant || "outline"}>
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {item.status === "pendente" && (
                            <Button variant="ghost" size="icon" title="Marcar pago" onClick={() => handleMarkPaid(item)}>
                              <Check className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <Pencil className="h-4 w-4" />
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
    </div>
  );
}
