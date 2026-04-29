import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { CreditCardImportDialog } from "./CreditCardImportDialog";

interface InvoiceRow {
  id: string;
  card_name: string;
  reference_label: string | null;
  due_date: string;
  closing_date: string | null;
  total_amount: number;
  status: string;
  expense_id: string | null;
  ofx_file_name: string | null;
  created_at: string;
}

export function CreditCardInvoices() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("credit_card_invoices" as any)
      .select("id, card_name, reference_label, due_date, closing_date, total_amount, status, expense_id, ofx_file_name, created_at")
      .is("deleted_at", null)
      .order("due_date", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setInvoices((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleNew = () => {
    setEditingId(null);
    setOpenDialog(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setOpenDialog(true);
  };

  const handleDelete = async (inv: InvoiceRow) => {
    const ok = await confirm({
      title: "Excluir fatura?",
      description: inv.expense_id
        ? "Esta fatura já gerou uma despesa em Contas a Pagar — ela NÃO será excluída automaticamente. Continuar?"
        : "A fatura e seus lançamentos serão removidos.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase
      .from("credit_card_invoices" as any)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Fatura excluída.");
    load();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-foreground">Cartão de Crédito</h1>
          <p className="text-xs text-muted-foreground">Importe arquivos OFX e classifique os lançamentos para gerar uma despesa única no Contas a Pagar.</p>
        </div>
        <Button onClick={handleNew} className="h-10">
          <Plus className="w-4 h-4 mr-2" /> Nova Fatura
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-xs text-muted-foreground">
            <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Nenhuma fatura registrada. Clique em "Nova Fatura" para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {invoices.map((inv) => (
            <Card key={inv.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{inv.card_name}</h3>
                    {inv.reference_label && (
                      <p className="text-xs text-muted-foreground truncate">{inv.reference_label}</p>
                    )}
                  </div>
                  <Badge variant={inv.status === "fechada" ? "default" : "secondary"} className="text-[10px] uppercase">
                    {inv.status}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Vencimento: <span className="text-foreground">{formatDate(inv.due_date)}</span></div>
                  {inv.closing_date && <div>Fechamento: <span className="text-foreground">{formatDate(inv.closing_date)}</span></div>}
                  {inv.ofx_file_name && <div className="truncate">OFX: <span className="text-foreground">{inv.ofx_file_name}</span></div>}
                </div>
                <div className="text-base font-bold text-foreground pt-1">{formatCurrency(Number(inv.total_amount))}</div>
                <div className="flex items-center gap-1 pt-2 border-t">
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleEdit(inv.id)}>
                    <Pencil className="w-3 h-3 mr-1" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(inv)}>
                    <Trash2 className="w-3 h-3 mr-1" /> Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreditCardImportDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        invoiceId={editingId}
        onSaved={load}
      />
      {ConfirmDialog}
    </div>
  );
}
