import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/masks";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { CreditCardImportDialog } from "./CreditCardImportDialog";
import { printCreditCardInvoice } from "./printCreditCardInvoice";
import { GlobalToolbar, ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectedRows = useMemo(
    () => invoices.filter((i) => selected.has(i.id)),
    [invoices, selected]
  );

  const handleNew = () => {
    setEditingId(null);
    setOpenDialog(true);
  };

  const handleEdit = () => {
    const inv = selectedRows[0];
    if (!inv) return;
    setEditingId(inv.id);
    setOpenDialog(true);
  };

  const handlePrint = () => {
    selectedRows.forEach((inv) => printCreditCardInvoice(inv.id));
  };

  const handleDelete = async () => {
    if (selectedRows.length === 0) return;
    const hasExpense = selectedRows.some((i) => i.expense_id);
    const ok = await confirm({
      title: selectedRows.length > 1 ? `Excluir ${selectedRows.length} faturas?` : "Excluir fatura?",
      description: hasExpense
        ? "Alguma fatura selecionada já gerou uma despesa em Contas a Pagar — ela NÃO será excluída automaticamente. Continuar?"
        : "As faturas e seus lançamentos serão removidos.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase
      .from("credit_card_invoices" as any)
      .update({ deleted_at: new Date().toISOString() })
      .in("id", selectedRows.map((i) => i.id));
    if (error) return toast.error(error.message);
    toast.success("Fatura(s) excluída(s).");
    load();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const actions: ToolbarAction[] = [
    { key: "new", label: "Nova Fatura", icon: Plus, mode: "always", variant: "default", onClick: handleNew },
    { key: "edit", label: "Editar", icon: Pencil, mode: "single", onClick: handleEdit },
    { key: "print", label: "Imprimir", icon: Printer, mode: "single+batch", onClick: handlePrint },
    { key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", onClick: handleDelete },
  ];

  const columns: DataGridColumn<InvoiceRow>[] = [
    {
      key: "card_name",
      header: "Cartão",
      width: "220px",
      sortValue: (r) => r.card_name,
      cell: (r) => <span className="font-medium text-foreground">{r.card_name}</span>,
    },
    {
      key: "reference_label",
      header: "Referência",
      width: "140px",
      sortValue: (r) => r.reference_label || "",
      cell: (r) => r.reference_label || "—",
    },
    {
      key: "closing_date",
      header: "Fechamento",
      width: "110px",
      sortValue: (r) => r.closing_date || "",
      cell: (r) => formatDate(r.closing_date),
    },
    {
      key: "due_date",
      header: "Vencimento",
      width: "110px",
      sortValue: (r) => r.due_date,
      cell: (r) => formatDate(r.due_date),
    },
    {
      key: "ofx_file_name",
      header: "OFX",
      sortValue: (r) => r.ofx_file_name || "",
      cell: (r) => <span className="truncate block max-w-[220px]">{r.ofx_file_name || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      align: "center",
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge variant={r.status === "fechada" ? "default" : "secondary"} className="text-[10px] uppercase">
          {r.status}
        </Badge>
      ),
    },
    {
      key: "total_amount",
      header: "Total",
      width: "130px",
      align: "right",
      sortValue: (r) => Number(r.total_amount),
      cell: (r) => <span className="font-mono font-semibold">{formatCurrency(Number(r.total_amount))}</span>,
    },
  ];

  const totalSelecionado = selectedRows.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalGeral = invoices.reduce((s, i) => s + Number(i.total_amount), 0);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-bold text-foreground">Cartão de Crédito</h1>
        <p className="text-xs text-muted-foreground">Importe arquivos OFX e classifique os lançamentos para gerar uma despesa única no Contas a Pagar.</p>
      </div>

      <GlobalToolbar actions={actions} selectedCount={selected.size} />

      <DataGrid
        rows={invoices}
        columns={columns}
        rowId={(r) => r.id}
        selected={selected}
        onSelectedChange={setSelected}
        loading={loading}
        minWidth={980}
        emptyMessage='Nenhuma fatura registrada. Clique em "Nova Fatura" para começar.'
        footer={
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{invoices.length} fatura(s)</span>
            <span className="font-mono">
              {selected.size > 0 && (
                <span className="mr-4 text-primary">Selecionado: {formatCurrency(totalSelecionado)}</span>
              )}
              Total: {formatCurrency(totalGeral)}
            </span>
          </div>
        }
      />

      <CreditCardImportDialog
        open={openDialog}
        onOpenChange={(o) => {
          setOpenDialog(o);
          if (!o) load();
        }}
        invoiceId={editingId}
        onSaved={load}
      />
      {ConfirmDialog}
    </div>
  );
}
