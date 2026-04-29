import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Upload, Trash2, FileText, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { parseOfx, type OfxTransaction } from "@/lib/ofxParser";
import { formatCurrency, maskName } from "@/lib/masks";
import { getLocalDateISO, formatDateBR } from "@/lib/date";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { MonthPicker } from "@/components/MonthPicker";
import { cn } from "@/lib/utils";

const MONTHS_PT_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatReferenceLabel = (ym: string) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  return `Fatura ${String(m).padStart(2, "0")}/${y}`;
};

const parseReferenceToYM = (label: string): string => {
  const match = label?.match(/(\d{2})\/(\d{4})/);
  if (match) return `${match[2]}-${match[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Plano de contas combobox with typeahead
function PlanoContasCombobox({
  value, onChange, options, disabled,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: ChartAccount[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between text-xs font-normal px-2"
          disabled={disabled}
        >
          <span className="truncate">
            {selected ? `${selected.codigo} — ${selected.nome}` : "Selecionar..."}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite para buscar..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>Nenhum plano encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.id}
                  value={`${opt.codigo} ${opt.nome}`}
                  onSelect={() => { onChange(opt.id); setOpen(false); }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3 w-3", value === opt.id ? "opacity-100" : "opacity-0")} />
                  {opt.codigo} — {opt.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const CENTRO_CUSTO_OPTIONS = [
  { value: "frota_propria", label: "Frota Própria" },
  { value: "frota_terceiros", label: "Frota Terceiros" },
  { value: "administrativo", label: "Administrativo" },
  { value: "operacional", label: "Operacional" },
];

interface ChartAccount { id: string; codigo: string; nome: string; tipo: string; conta_pai_id: string | null; }

interface ItemRow {
  fitid: string;
  posted_date: string;
  description: string;
  amount: number; // positive value (debit)
  plano_contas_id: string | null;
  centro_custo: string;
  favorecido_id: string | null;
  favorecido_nome: string;
  observacoes: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  invoiceId?: string | null;
}

export function CreditCardImportDialog({ open, onOpenChange, onSaved, invoiceId }: Props) {
  const { user } = useAuth();
  const { matrizId } = useUnifiedCompany();
  const fileRef = useRef<HTMLInputElement>(null);

  const [cardName, setCardName] = useState("Cartão ");
  const [referenceYM, setReferenceYM] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dueDate, setDueDate] = useState(getLocalDateISO());
  const [closingDate, setClosingDate] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [ofxFileName, setOfxFileName] = useState("");
  const [ofxBank, setOfxBank] = useState("");
  const [ofxAccountId, setOfxAccountId] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [existingExpenseId, setExistingExpenseId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string>("aberta");

  const isEditing = !!invoiceId;

  // Load chart of accounts (despesa, leaves only)
  useEffect(() => {
    if (!open) return;
    supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, tipo, conta_pai_id")
      .eq("ativo", true)
      .eq("tipo", "despesa")
      .order("codigo")
      .then(({ data }) => setChartAccounts((data as any) || []));
  }, [open]);

  const despesaLeaves = useMemo(() => {
    const all = chartAccounts;
    const parentIds = new Set(all.filter(a => a.conta_pai_id).map(a => a.conta_pai_id!));
    return all.filter(a => !parentIds.has(a.id));
  }, [chartAccounts]);

  // Load existing invoice
  useEffect(() => {
    if (!open) return;
    if (!invoiceId) {
      // reset
      setCardName("Cartão "); setReferenceYM(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setDueDate(getLocalDateISO()); setClosingDate("");
      setObservacoes(""); setOfxFileName(""); setOfxBank(""); setOfxAccountId("");
      setItems([]); setExistingExpenseId(null); setExistingStatus("aberta");
      return;
    }
    (async () => {
      const { data: inv } = await supabase
        .from("credit_card_invoices" as any)
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (!inv) return;
      const i: any = inv;
      setCardName(i.card_name || "");
      setReferenceYM(parseReferenceToYM(i.reference_label || ""));
      setDueDate(i.due_date || "");
      setClosingDate(i.closing_date || "");
      setObservacoes(i.observacoes || "");
      setOfxFileName(i.ofx_file_name || "");
      setOfxBank(i.ofx_bank_name || "");
      setOfxAccountId(i.ofx_account_id || "");
      setExistingExpenseId(i.expense_id || null);
      setExistingStatus(i.status || "aberta");

      const { data: rows } = await supabase
        .from("credit_card_invoice_items" as any)
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("posted_date");
      setItems(((rows as any[]) || []).map((r) => ({
        fitid: r.fitid || "",
        posted_date: r.posted_date,
        description: r.description,
        amount: Number(r.amount),
        plano_contas_id: r.plano_contas_id,
        centro_custo: r.centro_custo || "operacional",
        favorecido_id: r.favorecido_id,
        favorecido_nome: r.favorecido_nome || "",
        observacoes: r.observacoes || "",
      })));
    })();
  }, [open, invoiceId]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const isClosed = existingStatus === "fechada";

  const handleOfxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let parsed;
    try {
      parsed = parseOfx(text);
    } catch (err) {
      toast.error("Não foi possível ler o arquivo OFX.");
      return;
    }
    if (!parsed.transactions.length) {
      toast.error("Nenhuma transação encontrada no arquivo.");
      return;
    }
    setOfxFileName(file.name);
    setOfxBank(parsed.bankName);
    setOfxAccountId(parsed.accountId);
    // Only debits (negative amounts) — ignore credits/estornos
    const debits = parsed.transactions.filter((t: OfxTransaction) => t.amount < 0);
    if (debits.length === 0) {
      toast.warning("Arquivo importado, mas não há lançamentos de débito.");
    }

    // Check duplicates against ALL existing invoice items (any invoice) to avoid re-classifying
    const fitids = debits.map((t) => t.fitid).filter(Boolean);
    let alreadyImported = new Set<string>();
    if (fitids.length > 0) {
      const { data: dupes } = await supabase
        .from("credit_card_invoice_items" as any)
        .select("fitid, invoice_id")
        .in("fitid", fitids);
      const currentInvoice = invoiceId || null;
      ((dupes as any[]) || []).forEach((d) => {
        // ignore matches that belong to the invoice currently being edited (those are already in `items`)
        if (d.invoice_id !== currentInvoice && d.fitid) alreadyImported.add(d.fitid);
      });
    }

    const newRows: ItemRow[] = debits
      .filter((t) => !t.fitid || !alreadyImported.has(t.fitid))
      .map((t) => ({
        fitid: t.fitid,
        posted_date: t.date,
        description: t.description || "Lançamento",
        amount: Math.abs(t.amount),
        plano_contas_id: null,
        centro_custo: "operacional",
        favorecido_id: null,
        favorecido_nome: "",
        observacoes: "",
      }));

    // Merge: avoid duplicates by fitid against current dialog items as well
    let addedCount = 0;
    setItems((prev) => {
      const existing = new Set(prev.map((p) => p.fitid).filter(Boolean));
      const filtered = newRows.filter((r) => !r.fitid || !existing.has(r.fitid));
      addedCount = filtered.length;
      const merged = [...prev, ...filtered];
      return merged.sort((a, b) => a.posted_date.localeCompare(b.posted_date));
    });

    const skipped = debits.length - newRows.length;
    if (skipped > 0) {
      toast.info(`${skipped} lançamento(s) ignorado(s) por já estarem classificados em outra fatura.`);
    }
    toast.success(`${newRows.length} lançamento(s) importado(s).`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const persistInvoice = async (closeNow: boolean) => {
    if (!cardName.trim()) { toast.error("Informe o nome do cartão."); return; }
    if (!dueDate) { toast.error("Informe o vencimento da fatura."); return; }
    if (closeNow && items.length === 0) { toast.error("Adicione lançamentos antes de fechar."); return; }
    if (closeNow && items.some((i) => !i.plano_contas_id)) {
      toast.error("Classifique todos os lançamentos com plano de contas antes de fechar.");
      return;
    }

    closeNow ? setClosing(true) : setSaving(true);
    try {
      let id = invoiceId || null;

      const payload: any = {
        empresa_id: matrizId || null,
        card_name: cardName.trim(),
        reference_label: formatReferenceLabel(referenceYM) || null,
        due_date: dueDate,
        closing_date: closingDate || null,
        total_amount: total,
        status: closeNow ? "fechada" : "aberta",
        ofx_file_name: ofxFileName || null,
        ofx_bank_name: ofxBank || null,
        ofx_account_id: ofxAccountId || null,
        observacoes: observacoes.trim() || null,
      };

      if (id) {
        const { error } = await supabase.from("credit_card_invoices" as any).update(payload).eq("id", id);
        if (error) throw error;
      } else {
        payload.created_by = user?.id;
        const { data, error } = await supabase.from("credit_card_invoices" as any).insert(payload).select("id").single();
        if (error) throw error;
        id = (data as any).id;
      }

      // Replace items
      await supabase.from("credit_card_invoice_items" as any).delete().eq("invoice_id", id);
      if (items.length > 0) {
        const rows = items.map((it) => ({
          invoice_id: id,
          posted_date: it.posted_date,
          description: it.description,
          amount: it.amount,
          fitid: it.fitid || null,
          plano_contas_id: it.plano_contas_id,
          centro_custo: it.centro_custo,
          favorecido_id: it.favorecido_id,
          favorecido_nome: it.favorecido_nome.trim() || null,
          observacoes: it.observacoes.trim() || null,
        }));
        const { error: itemsErr } = await supabase.from("credit_card_invoice_items" as any).insert(rows);
        if (itemsErr) throw itemsErr;
      }

      // On close: create single expense in Contas a Pagar
      if (closeNow) {
        // Use first item's plano_contas as fallback for the umbrella expense (will not affect classification visibility on the invoice items)
        const fallbackPlano = items[0]?.plano_contas_id || null;
        const refLabel = formatReferenceLabel(referenceYM);
        const description = `Fatura Cartão ${cardName.trim()}${refLabel ? ` - ${refLabel}` : ""}`;
        const expensePayload: any = {
          empresa_id: matrizId || null,
          unidade_id: matrizId || null,
          descricao: description,
          tipo_despesa: "outros",
          plano_contas_id: fallbackPlano,
          centro_custo: "administrativo",
          valor_total: total,
          data_emissao: getLocalDateISO(),
          data_vencimento: dueDate,
          forma_pagamento: "cartao_credito",
          observacoes: `Importada via OFX (${ofxFileName || "arquivo"}). ${items.length} lançamento(s).`,
          origem: "importacao",
          documento_fiscal_importado: false,
          created_by: user?.id,
        };

        if (existingExpenseId) {
          const { error } = await supabase.from("expenses").update({
            descricao: description,
            valor_total: total,
            data_vencimento: dueDate,
            plano_contas_id: fallbackPlano,
          }).eq("id", existingExpenseId);
          if (error) throw error;
        } else {
          const { data: exp, error: expErr } = await supabase.from("expenses").insert(expensePayload).select("id").single();
          if (expErr) throw expErr;
          await supabase.from("credit_card_invoices" as any).update({ expense_id: (exp as any).id }).eq("id", id);
        }
      }

      toast.success(closeNow ? "Fatura fechada e enviada ao Contas a Pagar." : "Fatura salva.");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar fatura.");
    } finally {
      setSaving(false); setClosing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Fatura de Cartão" : "Nova Fatura de Cartão"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Cartão *</Label>
              <Input
                className="h-9 text-xs"
                value={cardName}
                onChange={(e) => setCardName(maskName(e.target.value))}
                placeholder="Ex: Itaú Black"
                disabled={isClosed}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referência</Label>
              <MonthPicker
                value={referenceYM}
                onChange={(v) => setReferenceYM(v)}
                className="w-full text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fechamento</Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                disabled={isClosed}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vencimento *</Label>
              <Input
                type="date"
                className="h-9 text-xs"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isClosed}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".ofx,.qfx,.OFX,.QFX"
              ref={fileRef}
              onChange={handleOfxUpload}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => fileRef.current?.click()}
              disabled={isClosed}
            >
              <Upload className="w-4 h-4 mr-2" /> Importar OFX
            </Button>
            {ofxFileName && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <FileText className="w-3 h-3" /> {ofxFileName}
                {ofxBank ? ` • ${ofxBank}` : ""}
              </span>
            )}
            <div className="ml-auto text-xs text-muted-foreground">
              Total da fatura: <span className="text-base font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-28 text-right">Valor</TableHead>
                    <TableHead className="w-56">Plano de Contas *</TableHead>
                    <TableHead className="w-40">Centro de Custo</TableHead>
                    <TableHead className="w-56">Favorecido</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={`${it.fitid}-${idx}`}>
                      <TableCell className="text-xs">{formatDateBR(it.posted_date)}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          value={it.description}
                          onChange={(e) => updateItem(idx, { description: e.target.value })}
                          disabled={isClosed}
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {formatCurrency(it.amount)}
                      </TableCell>
                      <TableCell>
                        <PlanoContasCombobox
                          value={it.plano_contas_id}
                          onChange={(v) => updateItem(idx, { plano_contas_id: v })}
                          options={despesaLeaves}
                          disabled={isClosed}
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={it.centro_custo}
                          onValueChange={(v) => updateItem(idx, { centro_custo: v })}
                          disabled={isClosed}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CENTRO_CUSTO_OPTIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="text-xs">
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <PersonSearchInput
                          categories={["cliente", "proprietario", "fornecedor", "colaborador"]}
                          placeholder="Opcional..."
                          selectedName={it.favorecido_nome}
                          onSelect={(p) => updateItem(idx, { favorecido_nome: p.full_name, favorecido_id: p.id })}
                          onClear={() => updateItem(idx, { favorecido_nome: "", favorecido_id: null })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeItem(idx)}
                          disabled={isClosed}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 border border-dashed rounded-md text-xs text-muted-foreground">
              Importe um arquivo OFX do cartão de crédito para adicionar lançamentos.
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Observações</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              disabled={isClosed}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10">
              {isClosed ? "Fechar" : "Cancelar"}
            </Button>
            {!isClosed && (
              <>
                <Button
                  variant="outline"
                  onClick={() => persistInvoice(false)}
                  disabled={saving || closing}
                  className="h-10"
                >
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </Button>
                <Button
                  onClick={() => persistInvoice(true)}
                  disabled={saving || closing || items.length === 0}
                  className="h-10"
                >
                  {closing ? "Fechando..." : "Fechar fatura e enviar ao Contas a Pagar"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
