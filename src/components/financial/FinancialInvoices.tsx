import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FileText, Search, Eye } from "lucide-react";
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

interface Invoice {
  id: string;
  invoice_number: number;
  debtor_name: string;
  total_amount: number;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
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

export function FinancialInvoices() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [search, setSearch] = useState("");

  // Create invoice state
  const [availableCtes, setAvailableCtes] = useState<Cte[]>([]);
  const [selectedCteIds, setSelectedCteIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [cteSearch, setCteSearch] = useState("");

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
    // Fetch authorized CTEs that are NOT already in an invoice
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
    setSelectedCteIds(new Set());
    setDueDate("");
    setNotes("");
    setCteSearch("");
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

  // When a tomador is selected, filter CTEs to same tomador
  const selectedTomador = getSelectedTomador();
  const displayCtes = selectedTomador
    ? filteredCtes.filter(c => (c.tomador_nome || c.tomador_cnpj) === selectedTomador || selectedCteIds.has(c.id))
    : filteredCtes;

  const totalSelected = availableCtes
    .filter(c => selectedCteIds.has(c.id))
    .reduce((s, c) => s + Number(c.valor_frete), 0);

  const handleCreateInvoice = async () => {
    if (selectedCteIds.size === 0) return toast.error("Selecione ao menos um CT-e");
    const tomadorName = getSelectedTomador();
    if (!tomadorName) return toast.error("CT-e sem tomador identificado");

    // 1. Create invoice
    const { data: inv, error: invErr } = await supabase.from("financial_invoices").insert({
      debtor_name: tomadorName,
      total_amount: totalSelected,
      due_date: dueDate || null,
      notes: notes.trim() || null,
      created_by: user?.id,
    } as any).select().single();

    if (invErr || !inv) return toast.error(invErr?.message || "Erro ao criar fatura");

    // 2. Create invoice items
    const items = Array.from(selectedCteIds).map(cteId => ({
      invoice_id: (inv as any).id,
      cte_id: cteId,
      amount: availableCtes.find(c => c.id === cteId)?.valor_frete || 0,
    }));

    const { error: itemsErr } = await supabase.from("financial_invoice_items").insert(items as any);
    if (itemsErr) return toast.error(itemsErr.message);

    // 3. Create account receivable linked to invoice
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">Faturas (Agrupamento de CT-es)</CardTitle>
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
                    <TableHead>Tomador</TableHead>
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
            <DialogTitle>Nova Fatura — Selecione CT-es Autorizados</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar tomador, CNPJ ou número..." value={cteSearch} onChange={(e) => setCteSearch(e.target.value)} className="pl-8" />
            </div>

            {selectedTomador && (
              <p className="text-sm text-muted-foreground">
                Filtrando CT-es do tomador: <strong>{selectedTomador}</strong>
              </p>
            )}

            <div className="border rounded-md max-h-[250px] overflow-y-auto">
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

            <Button onClick={handleCreateInvoice} className="w-full" disabled={selectedCteIds.size === 0}>
              Gerar Fatura
            </Button>
          </div>
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
                <div><span className="text-muted-foreground">Tomador:</span> {selectedInvoice.debtor_name}</div>
                <div><span className="text-muted-foreground">Status:</span> {STATUS_MAP[selectedInvoice.status]?.label || selectedInvoice.status}</div>
                <div><span className="text-muted-foreground">Valor:</span> R$ {Number(selectedInvoice.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                <div><span className="text-muted-foreground">Vencimento:</span> {selectedInvoice.due_date ? format(new Date(selectedInvoice.due_date + "T12:00:00"), "dd/MM/yyyy") : "—"}</div>
              </div>
              {selectedInvoice.notes && (
                <p className="text-sm text-muted-foreground">{selectedInvoice.notes}</p>
              )}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
