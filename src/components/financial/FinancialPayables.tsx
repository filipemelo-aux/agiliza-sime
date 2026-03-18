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

interface Payable {
  id: string;
  description: string;
  category_id: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  paid_amount: number | null;
  creditor_name: string | null;
  notes: string | null;
  created_at: string;
  _source?: "manual" | "harvest";
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
  previsao: { label: "Previsão", variant: "secondary" },
};

export function FinancialPayables() {
  const { user } = useAuth();
  const [items, setItems] = useState<Payable[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [creditorName, setCreditorName] = useState("");
  const [creditorId, setCreditorId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: payData }, { data: catData }] = await Promise.all([
      supabase.from("accounts_payable").select("*").neq("status", "pago" as any).order("created_at", { ascending: false }),
      supabase.from("financial_categories").select("id, name").eq("type", "payable" as any).eq("active", true),
    ]);
    const manualItems = ((payData as any) || []).map((i: any) => ({ ...i, _source: "manual" as const }));

    // Fetch harvest pending payments (assignments with unpaid periods)
    const harvestPending = await fetchHarvestPending();

    setItems([...manualItems, ...harvestPending]);
    setCategories((catData as any) || []);
    setLoading(false);
  };

  const fetchHarvestPending = async (): Promise<Payable[]> => {
    // Get active harvest jobs with assignments
    const { data: jobs } = await supabase
      .from("harvest_jobs")
      .select("id, farm_name, payment_value, monthly_value, harvest_period_start, harvest_period_end, status");
    if (!jobs || jobs.length === 0) return [];

    const result: Payable[] = [];

    for (const job of jobs) {
      const { data: assignments } = await supabase
        .from("harvest_assignments")
        .select("id, user_id, start_date, end_date, daily_value, discounts, vehicle_id")
        .eq("harvest_job_id", job.id);
      if (!assignments || assignments.length === 0) continue;

      // Get existing payments
      const { data: payments } = await supabase
        .from("harvest_payments")
        .select("filter_context, total_amount, period_start, period_end")
        .eq("harvest_job_id", job.id);

      // Group assignments by owner
      const ownerMap = new Map<string, { ownerName: string; totalLiq: number; totalPaid: number; userIds: string[] }>();

      for (const a of assignments) {
        let ownerId = "unknown";
        let ownerName = "Proprietário";
        if (a.vehicle_id) {
          const { data: veh } = await supabase.from("vehicles").select("owner_id").eq("id", a.vehicle_id).maybeSingle();
          if (veh?.owner_id) {
            ownerId = veh.owner_id;
            const { data: op } = await supabase.from("profiles").select("full_name, nome_fantasia").eq("user_id", veh.owner_id).maybeSingle();
            if (op) ownerName = op.nome_fantasia || op.full_name;
          }
        }

        const today = new Date().toISOString().split("T")[0];
        const endDate = a.end_date || today;
        const start = new Date(a.start_date + "T00:00:00");
        const end = new Date(endDate + "T00:00:00");
        const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const dv = a.daily_value || ((job.payment_value || job.monthly_value) / 30);
        const bruto = days * dv;

        const discounts = Array.isArray(a.discounts) ? a.discounts : [];
        const totalDisc = (discounts as any[]).reduce((s: number, d: any) => s + (d.value || 0), 0);
        const liq = bruto - totalDisc;

        const existing = ownerMap.get(ownerId);
        if (existing) {
          existing.totalLiq += liq;
          existing.userIds.push(a.user_id);
        } else {
          ownerMap.set(ownerId, { ownerName, totalLiq: liq, totalPaid: 0, userIds: [a.user_id] });
        }
      }

      // Calculate total paid per owner from payments
      for (const entry of ownerMap.values()) {
        const uniqueIds = [...new Set(entry.userIds)];
        for (const payment of (payments || [])) {
          const ctx = payment.filter_context || "";
          const paymentUserIds = ctx.split(",").filter(Boolean);
          // Check if this payment's context is a subset of this owner's users
          if (paymentUserIds.length > 0 && paymentUserIds.every(id => uniqueIds.includes(id))) {
            entry.totalPaid += Number(payment.total_amount);
          }
        }
      }

      // Create pending items for owners with remaining balance
      for (const [ownerId, entry] of ownerMap.entries()) {
        const remaining = entry.totalLiq - entry.totalPaid;
        if (remaining > 0.01) {
          result.push({
            id: `harvest-pending-${job.id}-${ownerId}`,
            description: `🌱 ${job.farm_name} — Pgto Agregado`,
            category_id: null,
            amount: remaining,
            due_date: null,
            status: "previsao",
            paid_at: null,
            paid_amount: null,
            creditor_name: entry.ownerName,
            notes: `Valor líq. total: R$ ${entry.totalLiq.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | Pago: R$ ${entry.totalPaid.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            created_at: new Date().toISOString(),
            _source: "harvest",
          });
        }
      }
    }

    return result;
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setDescription(""); setCategoryId(""); setAmount(""); setDueDate(""); setCreditorName(""); setCreditorId(null); setNotes(""); setEditingId(null);
  };

  const handleSave = async () => {
    if (!description.trim()) return toast.error("Informe a descrição");
    if (!amount || Number(amount) <= 0) return toast.error("Informe o valor");

    const payload: any = {
      description: description.trim(),
      category_id: categoryId || null,
      amount: Number(amount),
      due_date: dueDate || null,
      creditor_name: creditorName.trim() || null,
      creditor_id: creditorId || null,
      notes: notes.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("accounts_payable").update(payload).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Conta atualizada");
    } else {
      payload.created_by = user?.id;
      const { error } = await supabase.from("accounts_payable").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Conta criada");
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (item: Payable) => {
    setEditingId(item.id);
    setDescription(item.description);
    setCategoryId(item.category_id || "");
    setAmount(String(item.amount));
    setDueDate(item.due_date || "");
    setCreditorName(item.creditor_name || "");
    setNotes(item.notes || "");
    setDialogOpen(true);
  };

  const handleMarkPaid = async (item: Payable) => {
    const { error } = await supabase.from("accounts_payable").update({
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
    const matchSearch = !search || i.description.toLowerCase().includes(search.toLowerCase()) || (i.creditor_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPendente = filtered.filter(i => i.status === "pendente" || i.status === "previsao").reduce((s, i) => s + Number(i.amount), 0);
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
            <p className="text-xs text-muted-foreground">Total Pago</p>
            <p className="text-xl font-bold text-emerald-600">R$ {totalPago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Contas a Pagar</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nova Saída</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar" : "Nova"} Conta a Pagar</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Descrição *</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: Combustível, Manutenção..." />
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
                  <Label>Credor (Fornecedor)</Label>
                  <PersonSearchInput
                    categories={["fornecedor"]}
                    placeholder="Buscar fornecedor cadastrado..."
                    selectedName={creditorName || undefined}
                    onSelect={(person) => {
                      setCreditorName(person.full_name);
                      setCreditorId(person.id);
                    }}
                    onClear={() => {
                      setCreditorName("");
                      setCreditorId(null);
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
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma conta a pagar</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Credor</TableHead>
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
                      <TableCell>{item.creditor_name || "—"}</TableCell>
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
