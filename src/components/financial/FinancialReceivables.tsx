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
import { Plus, Pencil, Check, Search, Sprout } from "lucide-react";
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
  _source?: "manual" | "harvest";
}

interface Category {
  id: string;
  name: string;
}

interface HarvestReceivable {
  id: string;
  farm_name: string;
  client_name: string | null;
  monthly_value: number;
  totalLiquido: number;
  totalDays: number;
  status: string;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  pago: { label: "Pago", variant: "default" },
  vencido: { label: "Vencido", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "secondary" },
  previsao: { label: "Previsão Colheita", variant: "secondary" },
};

async function fetchHarvestReceivables(): Promise<HarvestReceivable[]> {
  const { data: jobs } = await supabase
    .from("harvest_jobs")
    .select("id, farm_name, monthly_value, harvest_period_start, harvest_period_end, client_id, status")
    .eq("status", "active" as any);

  if (!jobs || jobs.length === 0) return [];

  const results: HarvestReceivable[] = [];

  for (const job of jobs) {
    // Get client name
    let clientName: string | null = null;
    if (job.client_id) {
      const { data: client } = await supabase
        .from("profiles")
        .select("full_name, nome_fantasia")
        .eq("id", job.client_id)
        .maybeSingle();
      clientName = client?.nome_fantasia || client?.full_name || null;
    }

    // Get assignments
    const { data: assignments } = await supabase
      .from("harvest_assignments")
      .select("id, start_date, end_date, discounts, company_discounts")
      .eq("harvest_job_id", job.id);

    if (!assignments || assignments.length === 0) continue;

    const today = new Date().toISOString().split("T")[0];
    const dvCliente = job.monthly_value / 30;

    let totalLiquido = 0;
    let totalDays = 0;

    for (const a of assignments) {
      const startDate = new Date(a.start_date + "T00:00:00");
      const endDate = a.end_date ? new Date(a.end_date + "T00:00:00") : new Date(today + "T00:00:00");
      const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const bruto = days * dvCliente;

      const discounts = Array.isArray(a.discounts) ? a.discounts : [];
      const companyDiscounts = Array.isArray(a.company_discounts) ? a.company_discounts : [];

      const dieselDisc = (discounts as any[])
        .filter((d: any) => d.type === "diesel")
        .reduce((s: number, d: any) => s + (d.value || 0), 0);
      const companyDisc = (companyDiscounts as any[])
        .reduce((s: number, d: any) => s + (d.value || 0), 0);

      totalLiquido += bruto - dieselDisc - companyDisc;
      totalDays += days;
    }

    results.push({
      id: job.id,
      farm_name: job.farm_name,
      client_name: clientName,
      monthly_value: job.monthly_value,
      totalLiquido,
      totalDays,
      status: job.status,
    });
  }

  return results;
}

export function FinancialReceivables() {
  const { user } = useAuth();
  const [items, setItems] = useState<Receivable[]>([]);
  const [harvestItems, setHarvestItems] = useState<HarvestReceivable[]>([]);
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
  const [debtorId, setDebtorId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: recData }, { data: catData }, harvestData] = await Promise.all([
      supabase.from("accounts_receivable").select("*").order("created_at", { ascending: false }),
      supabase.from("financial_categories").select("id, name").eq("type", "receivable" as any).eq("active", true),
      fetchHarvestReceivables(),
    ]);
    setItems((recData as any) || []);
    setCategories((catData as any) || []);
    setHarvestItems(harvestData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setDescription(""); setCategoryId(""); setAmount(""); setDueDate(""); setDebtorName(""); setDebtorId(null); setNotes(""); setEditingId(null);
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
      debtor_id: debtorId || null,
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

  // Combine manual items with harvest virtual items
  const harvestAsReceivables: Receivable[] = harvestItems.map(h => ({
    id: `harvest-${h.id}`,
    description: `Colheita — ${h.farm_name}`,
    category_id: null,
    amount: h.totalLiquido,
    due_date: null,
    status: "previsao",
    paid_at: null,
    paid_amount: null,
    debtor_name: h.client_name,
    cte_id: null,
    invoice_id: null,
    notes: `${h.totalDays} dias | Valor mensal: R$ ${h.monthly_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    created_at: new Date().toISOString(),
    _source: "harvest" as const,
  }));

  const allItems = [...items.map(i => ({ ...i, _source: "manual" as const })), ...harvestAsReceivables];

  const filtered = allItems.filter(i => {
    const matchSearch = !search || i.description.toLowerCase().includes(search.toLowerCase()) || (i.debtor_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || filterStatus === "previsao"
      ? (filterStatus === "all" ? true : i.status === "previsao")
      : i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPendente = filtered.filter(i => i.status === "pendente").reduce((s, i) => s + Number(i.amount), 0);
  const totalPago = filtered.filter(i => i.status === "pago").reduce((s, i) => s + Number(i.paid_amount || i.amount), 0);
  const totalPrevisao = filtered.filter(i => i.status === "previsao").reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        {totalPrevisao > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Sprout className="h-3 w-3" /> Previsão Colheita</p>
              <p className="text-xl font-bold text-blue-600">R$ {totalPrevisao.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
        )}
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
                  <Label>Devedor (Cliente)</Label>
                  <PersonSearchInput
                    categories={["cliente"]}
                    placeholder="Buscar cliente cadastrado..."
                    selectedName={debtorName || undefined}
                    onSelect={(person) => {
                      setDebtorName(person.full_name);
                      setDebtorId(person.id);
                    }}
                    onClear={() => {
                      setDebtorName("");
                      setDebtorId(null);
                    }}
                  />
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
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="previsao">Previsão Colheita</SelectItem>
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
                    <TableRow key={item.id} className={item._source === "harvest" ? "bg-blue-500/5" : ""}>
                      <TableCell className="font-medium max-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {item._source === "harvest" && <Sprout className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                          <span className="truncate">{item.description}</span>
                        </div>
                        {item._source === "harvest" && item.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.notes}</p>
                        )}
                      </TableCell>
                      <TableCell>{item.debtor_name || "—"}</TableCell>
                      <TableCell>{item._source === "harvest" ? "Colheita" : getCategoryName(item.category_id)}</TableCell>
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
                        {item._source !== "harvest" && (
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
                        )}
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
