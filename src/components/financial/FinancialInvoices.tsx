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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Search, Eye, Sprout } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Cte {
  id: string;
  numero: number | null;
  tomador_nome: string | null;
  tomador_cnpj: string | null;
  valor_frete: number;
  data_emissao: string | null;
  status: string;
}

interface HarvestJob {
  id: string;
  farm_name: string;
  client_name: string | null;
  client_id: string | null;
  monthly_value: number;
  totalLiquido: number;
  invoicedAmount: number;
  remaining: number;
}

interface Invoice {
  id: string;
  invoice_number: number;
  debtor_name: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  source_type: string;
  harvest_job_id: string | null;
}

interface InvoiceItem {
  id: string;
  cte_id: string;
  amount: number;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  aberta: { label: "Aberta", variant: "outline" },
  paga: { label: "Paga", variant: "default" },
  cancelada: { label: "Cancelada", variant: "secondary" },
};

const SOURCE_LABELS: Record<string, string> = {
  cte: "CT-e",
  harvest: "Colheita",
};

export function FinancialInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [search, setSearch] = useState("");

  // Create invoice state - CT-e tab
  const [availableCtes, setAvailableCtes] = useState<Cte[]>([]);
  const [selectedCteIds, setSelectedCteIds] = useState<Set<string>>(new Set());
  const [cteSearch, setCteSearch] = useState("");

  // Create invoice state - Harvest tab
  const [availableHarvests, setAvailableHarvests] = useState<HarvestJob[]>([]);
  const [selectedHarvestId, setSelectedHarvestId] = useState<string | null>(null);
  const [harvestInvoiceAmount, setHarvestInvoiceAmount] = useState("");

  // Shared
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [createTab, setCreateTab] = useState("cte");

  const fetchInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setInvoices((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, []);

  const openCreateDialog = async () => {
    // Fetch CT-es
    const { data: existingItems } = await supabase
      .from("financial_invoice_items")
      .select("cte_id");
    const usedCteIds = new Set((existingItems as any[] || []).map((i: any) => i.cte_id));

    const { data: ctes } = await supabase
      .from("ctes")
      .select("id, numero, tomador_nome, tomador_cnpj, valor_frete, data_emissao, status")
      .eq("status", "autorizado")
      .order("data_emissao", { ascending: false });

    const available = ((ctes as any[]) || []).filter((c: Cte) => !usedCteIds.has(c.id));
    setAvailableCtes(available);

    // Fetch harvest jobs with remaining amounts
    const { data: jobs } = await supabase
      .from("harvest_jobs")
      .select("id, farm_name, monthly_value, harvest_period_start, harvest_period_end, client_id, status")
      .eq("status", "active" as any);

    const harvestJobs: HarvestJob[] = [];
    if (jobs && jobs.length > 0) {
      const { data: harvestInvoices } = await supabase
        .from("financial_invoices")
        .select("harvest_job_id, total_amount, status")
        .eq("source_type", "harvest" as any)
        .neq("status", "cancelada" as any);

      const invoicedByJob = new Map<string, number>();
      for (const inv of (harvestInvoices as any[] || [])) {
        if (inv.harvest_job_id) {
          invoicedByJob.set(inv.harvest_job_id, (invoicedByJob.get(inv.harvest_job_id) || 0) + Number(inv.total_amount));
        }
      }

      for (const job of jobs) {
        let clientName: string | null = null;
        if (job.client_id) {
          const { data: client } = await supabase
            .from("profiles")
            .select("full_name, nome_fantasia")
            .eq("id", job.client_id)
            .maybeSingle();
          clientName = client?.nome_fantasia || client?.full_name || null;
        }

        const { data: assignments } = await supabase
          .from("harvest_assignments")
          .select("id, start_date, end_date, discounts, company_discounts")
          .eq("harvest_job_id", job.id);

        if (!assignments || assignments.length === 0) continue;

        const today = new Date().toISOString().split("T")[0];
        const dvCliente = job.monthly_value / 30;
        let totalLiquido = 0;

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
        }

        const invoiced = invoicedByJob.get(job.id) || 0;
        const remaining = totalLiquido - invoiced;

        if (remaining > 0) {
          harvestJobs.push({
            id: job.id,
            farm_name: job.farm_name,
            client_name: clientName,
            client_id: job.client_id,
            monthly_value: job.monthly_value,
            totalLiquido,
            invoicedAmount: invoiced,
            remaining,
          });
        }
      }
    }
    setAvailableHarvests(harvestJobs);

    // Reset state
    setSelectedCteIds(new Set());
    setSelectedHarvestId(null);
    setHarvestInvoiceAmount("");
    setDueDate("");
    setNotes("");
    setCteSearch("");
    setCreateTab("cte");
    setCreateOpen(true);
  };

  const toggleCte = (id: string) => {
    setSelectedCteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const getSelectedTomador = () => {
    if (selectedCteIds.size === 0) return null;
    const first = availableCtes.find(c => selectedCteIds.has(c.id));
    return first?.tomador_nome || first?.tomador_cnpj || null;
  };

  const filteredCtes = availableCtes.filter(c => {
    if (!cteSearch) return true;
    const q = cteSearch.toLowerCase();
    return (c.tomador_nome || "").toLowerCase().includes(q) ||
      (c.tomador_cnpj || "").includes(q) ||
      String(c.numero || "").includes(q);
  });

  const selectedTomador = getSelectedTomador();
  const displayCtes = selectedTomador
    ? filteredCtes.filter(c => (c.tomador_nome || c.tomador_cnpj) === selectedTomador || selectedCteIds.has(c.id))
    : filteredCtes;

  const totalSelected = availableCtes
    .filter(c => selectedCteIds.has(c.id))
    .reduce((s, c) => s + Number(c.valor_frete), 0);

  const handleCreateCteInvoice = async () => {
    if (selectedCteIds.size === 0) return toast.error("Selecione ao menos um CT-e");
    const tomadorName = getSelectedTomador();
    if (!tomadorName) return toast.error("CT-e sem tomador identificado");

    const { data: inv, error: invErr } = await supabase.from("financial_invoices").insert({
      debtor_name: tomadorName,
      total_amount: totalSelected,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      created_by: user?.id,
      source_type: "cte",
    } as any).select().single();

    if (invErr || !inv) return toast.error(invErr?.message || "Erro ao criar fatura");

    const items = Array.from(selectedCteIds).map(cteId => ({
      invoice_id: (inv as any).id,
      cte_id: cteId,
      amount: availableCtes.find(c => c.id === cteId)?.valor_frete || 0,
    }));

    const { error: itemsErr } = await supabase.from("financial_invoice_items").insert(items as any);
    if (itemsErr) return toast.error(itemsErr.message);

    const { error: arErr } = await supabase.from("accounts_receivable").insert({
      description: `Fatura #${(inv as any).invoice_number} - ${tomadorName}`,
      amount: totalSelected,
      due_date: dueDate || null,
      debtor_name: tomadorName,
      invoice_id: (inv as any).id,
      created_by: user?.id,
    } as any);

    if (arErr) console.error("Erro ao criar conta a receber:", arErr);

    toast.success(`Fatura #${(inv as any).invoice_number} criada com ${selectedCteIds.size} CT-e(s)`);
    setCreateOpen(false);
    fetchInvoices();
  };

  const handleCreateHarvestInvoice = async () => {
    if (!selectedHarvestId) return toast.error("Selecione um serviço de colheita");
    const harvest = availableHarvests.find(h => h.id === selectedHarvestId);
    if (!harvest) return toast.error("Serviço não encontrado");

    const invoiceAmount = Number(harvestInvoiceAmount);
    if (!invoiceAmount || invoiceAmount <= 0) return toast.error("Informe o valor da fatura");
    if (invoiceAmount > harvest.remaining + 0.01) return toast.error(`Valor excede o saldo restante de R$ ${harvest.remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

    const debtorName = harvest.client_name || harvest.farm_name;

    const { data: inv, error: invErr } = await supabase.from("financial_invoices").insert({
      debtor_name: debtorName,
      total_amount: invoiceAmount,
      due_date: dueDate || null,
      notes: notes.trim() || `Colheita — ${harvest.farm_name}`,
      created_by: user?.id,
      source_type: "harvest",
      harvest_job_id: harvest.id,
    } as any).select().single();

    if (invErr || !inv) return toast.error(invErr?.message || "Erro ao criar fatura");

    const { error: arErr } = await supabase.from("accounts_receivable").insert({
      description: `Fatura #${(inv as any).invoice_number} - ${debtorName} (Colheita)`,
      amount: invoiceAmount,
      due_date: dueDate || null,
      debtor_name: debtorName,
      invoice_id: (inv as any).id,
      created_by: user?.id,
    } as any);

    if (arErr) console.error("Erro ao criar conta a receber:", arErr);

    toast.success(`Fatura #${(inv as any).invoice_number} criada — ${debtorName}`);
    setCreateOpen(false);
    fetchInvoices();
  };

  const viewInvoiceDetail = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const { data } = await supabase
      .from("financial_invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id);
    setInvoiceItems((data as any) || []);
    setDetailOpen(true);
  };

  const filtered = invoices.filter(i =>
    !search || i.debtor_name.toLowerCase().includes(search.toLowerCase()) || String(i.invoice_number).includes(search)
  );

  const selectedHarvest = availableHarvests.find(h => h.id === selectedHarvestId);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Faturas</CardTitle>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" /> Nova Fatura
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por tomador ou número..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma fatura criada</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Tomador/Cliente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono">#{inv.invoice_number}</TableCell>
                      <TableCell className="font-medium">{inv.debtor_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {inv.source_type === "harvest" ? <Sprout className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                          {SOURCE_LABELS[inv.source_type] || "CT-e"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        R$ {Number(inv.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>{inv.due_date ? format(new Date(inv.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[inv.status]?.variant || "outline"}>
                          {STATUS_MAP[inv.status]?.label || inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => viewInvoiceDetail(inv)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Fatura</DialogTitle>
          </DialogHeader>

          <Tabs value={createTab} onValueChange={setCreateTab}>
            <TabsList className="w-full">
              <TabsTrigger value="cte" className="flex-1 gap-1">
                <FileText className="h-3.5 w-3.5" /> CT-es
              </TabsTrigger>
              <TabsTrigger value="harvest" className="flex-1 gap-1">
                <Sprout className="h-3.5 w-3.5" /> Colheita
              </TabsTrigger>
            </TabsList>

            {/* CT-e Tab */}
            <TabsContent value="cte" className="space-y-4 mt-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar tomador, CNPJ ou número..." value={cteSearch} onChange={(e) => setCteSearch(e.target.value)} className="pl-8" />
              </div>

              {selectedTomador && (
                <p className="text-sm text-muted-foreground">
                  Filtrando CT-es do tomador: <strong>{selectedTomador}</strong>
                </p>
              )}

              <div className="border rounded-md max-h-[200px] overflow-y-auto">
                {displayCtes.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">Nenhum CT-e autorizado disponível</p>
                ) : (
                  displayCtes.map((cte) => (
                    <label key={cte.id} className="flex items-center gap-3 p-3 border-b last:border-0 hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={selectedCteIds.has(cte.id)}
                        onCheckedChange={() => toggleCte(cte.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">CT-e #{cte.numero}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{cte.tomador_nome || cte.tomador_cnpj || "—"}</p>
                      </div>
                      <span className="font-mono text-sm shrink-0">
                        R$ {Number(cte.valor_frete).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </span>
                    </label>
                  ))
                )}
              </div>

              {selectedCteIds.size > 0 && (
                <div className="bg-muted/50 rounded-md p-3 flex justify-between items-center">
                  <span className="text-sm">{selectedCteIds.size} CT-e(s) selecionado(s)</span>
                  <span className="font-bold">R$ {totalSelected.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <Button onClick={handleCreateCteInvoice} className="w-full" disabled={selectedCteIds.size === 0}>
                Gerar Fatura de CT-es
              </Button>
            </TabsContent>

            {/* Harvest Tab */}
            <TabsContent value="harvest" className="space-y-4 mt-4">
              <div>
                <Label>Serviço de Colheita</Label>
                <Select value={selectedHarvestId || ""} onValueChange={setSelectedHarvestId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a colheita..." /></SelectTrigger>
                  <SelectContent>
                    {availableHarvests.length === 0 ? (
                      <SelectItem value="_none" disabled>Nenhuma colheita com saldo</SelectItem>
                    ) : (
                      availableHarvests.map(h => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.farm_name} — {h.client_name || "Sem cliente"} (Saldo: R$ {h.remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedHarvest && (
                <div className="bg-muted/50 rounded-md p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor líquido total:</span>
                    <span className="font-mono">R$ {selectedHarvest.totalLiquido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Já faturado:</span>
                    <span className="font-mono">R$ {selectedHarvest.invoicedAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Saldo disponível:</span>
                    <span className="font-mono">R$ {selectedHarvest.remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              <div>
                <Label>Valor da Fatura (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={harvestInvoiceAmount}
                  onChange={(e) => setHarvestInvoiceAmount(e.target.value)}
                  placeholder={selectedHarvest ? `Máx: ${selectedHarvest.remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "0,00"}
                />
                {selectedHarvest && (
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 h-auto text-xs"
                    onClick={() => setHarvestInvoiceAmount(selectedHarvest.remaining.toFixed(2))}
                  >
                    Usar saldo total
                  </Button>
                )}
              </div>

              <div>
                <Label>Vencimento</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <Button onClick={handleCreateHarvestInvoice} className="w-full" disabled={!selectedHarvestId || !harvestInvoiceAmount}>
                Gerar Fatura de Colheita
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fatura #{selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> {selectedInvoice.debtor_name}</div>
                <div><span className="text-muted-foreground">Status:</span> {STATUS_MAP[selectedInvoice.status]?.label || selectedInvoice.status}</div>
                <div><span className="text-muted-foreground">Valor:</span> R$ {Number(selectedInvoice.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                <div><span className="text-muted-foreground">Vencimento:</span> {selectedInvoice.due_date ? format(new Date(selectedInvoice.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Origem:</span>{" "}
                  <Badge variant="outline" className="text-xs ml-1">
                    {SOURCE_LABELS[selectedInvoice.source_type] || "CT-e"}
                  </Badge>
                </div>
              </div>
              {selectedInvoice.notes && (
                <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>
              )}
              {invoiceItems.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2">CT-es na Fatura ({invoiceItems.length})</h4>
                  <div className="border rounded-md divide-y">
                    {invoiceItems.map((item) => (
                      <div key={item.id} className="p-2 flex justify-between text-sm">
                        <span>CT-e vinculado</span>
                        <span className="font-mono">R$ {Number(item.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
