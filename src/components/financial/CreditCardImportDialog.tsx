import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Upload, Trash2, FileText, Check, ChevronsUpDown, Search, Plus, Users, Layers } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { parseOfx, type OfxTransaction } from "@/lib/ofxParser";
import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO, formatDateBR } from "@/lib/date";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { MonthPicker } from "@/components/MonthPicker";
import { cn } from "@/lib/utils";
import { PlanoContasCombobox as SharedPlanoContasCombobox } from "./PlanoContasCombobox";


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

// Plano de contas combobox (compartilhado)
function PlanoContasCombobox({
  value, onChange, options, disabled,
}: {
  value: string | null;
  onChange: (v: string) => void;
  options: ChartAccount[];
  disabled?: boolean;
}) {
  return (
    <SharedPlanoContasCombobox
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      size="sm"
      placeholder="Selecionar..."
    />
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
  id?: string; // db id when loaded from existing invoice
  fitid: string;
  posted_date: string;
  description: string;
  amount: number; // positive value (debit)
  plano_contas_id: string | null;
  centro_custo: string;
  favorecido_id: string | null;
  favorecido_nome: string;
  veiculo_id: string | null;
  observacoes: string;
  parcela_atual: number | null;
  parcela_total: number | null;
}

interface VehicleOption { id: string; plate: string; }


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

  const [cardName, setCardName] = useState("");
  const [bankPersonId, setBankPersonId] = useState<string | null>(null);
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
  const [originalItems, setOriginalItems] = useState<ItemRow[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [existingExpenseId, setExistingExpenseId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string>("aberta");
  const [createPersonOpenIdx, setCreatePersonOpenIdx] = useState<number | null>(null);
  const [searchPersonOpenIdx, setSearchPersonOpenIdx] = useState<number | null>(null);
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);

  const isEditing = !!invoiceId;

  // Load chart of accounts (despesa, leaves only) + vehicles (frota própria)
  useEffect(() => {
    if (!open) return;
    supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, tipo, conta_pai_id")
      .eq("ativo", true)
      .eq("tipo", "despesa")
      .order("codigo")
      .then(({ data }) => setChartAccounts((data as any) || []));
    supabase
      .from("vehicles")
      .select("id, plate")
      .eq("fleet_type", "propria")
      .order("plate")
      .then(({ data }) => {
        const seen = new Set<string>();
        const unique = ((data as any[]) || []).filter((v) => {
          const key = (v.plate || "").toUpperCase().trim();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setVehicles(unique as any);
      });
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
      setCardName(""); setBankPersonId(null); setReferenceYM(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`); setDueDate(getLocalDateISO()); setClosingDate("");
      setObservacoes(""); setOfxFileName(""); setOfxBank(""); setOfxAccountId("");
      setItems([]); setOriginalItems([]); setExistingExpenseId(null); setExistingStatus("aberta");
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
      setBankPersonId(i.bank_person_id || null);
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
      const mapped = ((rows as any[]) || []).map((r) => ({
        id: r.id,
        fitid: r.fitid || "",
        posted_date: r.posted_date,
        description: r.description,
        amount: Number(r.amount),
        plano_contas_id: r.plano_contas_id,
        centro_custo: r.centro_custo || "",
        favorecido_id: r.favorecido_id,
        favorecido_nome: r.favorecido_nome || r.description || "",
        veiculo_id: r.veiculo_id || null,
        observacoes: r.observacoes || "",
        parcela_atual: r.parcela_atual ?? null,
        parcela_total: r.parcela_total ?? null,
      }));
      setItems(mapped);
      setOriginalItems(mapped);

    })();
  }, [open, invoiceId]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const isClosed = false; // edição liberada — alterações na fatura propagam para o Contas a Pagar

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

    const newRows: ItemRow[] = debits.map((t) => {
      const desc = t.description || "Lançamento";
      return {
        fitid: t.fitid,
        posted_date: t.date,
        description: desc,
        amount: Math.abs(t.amount),
        plano_contas_id: null,
        centro_custo: "",
        favorecido_id: null,
        favorecido_nome: desc,
        veiculo_id: null,
        observacoes: "",
        parcela_atual: null,
        parcela_total: null,
      };
    });

    // Dedup apenas dentro da fatura atual (evita duplicar ao reimportar o mesmo OFX na mesma fatura)
    const existing = new Set(items.map((p) => p.fitid).filter(Boolean));
    const filtered = newRows.filter((r) => !r.fitid || !existing.has(r.fitid));
    const merged = [...items, ...filtered].sort((a, b) => a.posted_date.localeCompare(b.posted_date));
    setItems(merged);
    setOriginalItems(merged);

    const skippedInDialog = newRows.length - filtered.length;
    if (skippedInDialog > 0) {
      toast.info(`${skippedInDialog} lançamento(s) já estavam nesta fatura e foram ignorados.`);
    }
    toast.success(`${filtered.length} lançamento(s) importado(s).`);
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateItem = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const toggleSelected = useCallback((idx: number) => {
    setSelectedIdxs((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIdxs((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map((_, i) => i));
    });
  }, [items]);

  const applyFavorecidoToSelected = useCallback((favorecidoId: string | null, favorecidoNome: string) => {
    if (selectedIdxs.size === 0) return;
    setItems((prev) => prev.map((it, i) => (
      selectedIdxs.has(i) ? { ...it, favorecido_id: favorecidoId, favorecido_nome: favorecidoNome } : it
    )));
    toast.success(`Favorecido aplicado em ${selectedIdxs.size} lançamento(s).`);
  }, [selectedIdxs]);

  const applyPlanoContasToSelected = useCallback((planoContasId: string) => {
    if (selectedIdxs.size === 0 || !planoContasId) return;
    setItems((prev) => prev.map((it, i) => (
      selectedIdxs.has(i) ? { ...it, plano_contas_id: planoContasId } : it
    )));
    toast.success(`Plano de contas aplicado em ${selectedIdxs.size} lançamento(s).`);
  }, [selectedIdxs]);

  const applyCentroCustoToSelected = useCallback((centroCusto: string) => {
    if (selectedIdxs.size === 0 || !centroCusto) return;
    setItems((prev) => prev.map((it, i) => (
      selectedIdxs.has(i) ? { ...it, centro_custo: centroCusto } : it
    )));
    toast.success(`Centro de custo aplicado em ${selectedIdxs.size} lançamento(s).`);
  }, [selectedIdxs]);

  const hasRowChanged = useCallback((idx: number) => {
    const current = items[idx];
    if (!current) return false;
    // Persistent classification: row stays green if já foi classificada (favorecido, plano de contas ou centro de custo)
    const isClassified = !!(current.favorecido_id || current.plano_contas_id || (current.centro_custo && current.centro_custo.trim()));
    if (isClassified) return true;
    // Fallback: alterações na sessão atual (descrição/observações) ainda destacam
    const original = originalItems[idx];
    if (!original) return false;
    return (
      current.description !== original.description ||
      current.favorecido_nome !== original.favorecido_nome ||
      current.veiculo_id !== original.veiculo_id ||
      current.observacoes !== original.observacoes
    );
  }, [items, originalItems]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setOriginalItems((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdxs(new Set());
  }, []);

  const persistInvoice = async (closeNow: boolean) => {
    if (!cardName.trim()) { toast.error("Selecione o banco/cartão."); return; }
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
        bank_person_id: bankPersonId,
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
          veiculo_id: it.veiculo_id,
          observacoes: it.observacoes.trim() || null,
          parcela_atual: it.parcela_atual,
          parcela_total: it.parcela_total,


        }));
        const { error: itemsErr } = await supabase.from("credit_card_invoice_items" as any).insert(rows);
        if (itemsErr) throw itemsErr;
      }

      // Sync the linked expense in Contas a Pagar:
      // - If closing now → create the expense (or update existing).
      // - If editing an already-closed invoice (expense exists) → always update the expense.
      const shouldSyncExpense = closeNow || !!existingExpenseId;

      if (shouldSyncExpense) {
        // Lookup "Cartão de Crédito" plano de contas (use leaf accounts, fall back to first match)
        let cartaoCreditoPlanoId: string | null = null;
        const cartaoMatch = despesaLeaves.find(
          (a) => a.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === "cartao de credito"
        );
        if (cartaoMatch) {
          cartaoCreditoPlanoId = cartaoMatch.id;
        } else {
          const { data: cc } = await supabase
            .from("chart_of_accounts")
            .select("id")
            .eq("ativo", true)
            .ilike("nome", "Cartão de Crédito")
            .limit(1)
            .maybeSingle();
          cartaoCreditoPlanoId = (cc as any)?.id || items[0]?.plano_contas_id || null;
        }

        // Resolve favorecido (banco selecionado)
        let favorecidoId: string | null = null;
        let favorecidoNome: string | null = null;
        if (bankPersonId) {
          const { data: bank } = await supabase
            .from("profiles")
            .select("id, full_name, razao_social, nome_fantasia")
            .eq("id", bankPersonId)
            .maybeSingle();
          if (bank) {
            favorecidoId = (bank as any).id;
            favorecidoNome = (bank as any).razao_social || (bank as any).full_name || (bank as any).nome_fantasia || cardName.trim();
          }
        }
        if (!favorecidoNome) favorecidoNome = cardName.trim();

        const refLabel = formatReferenceLabel(referenceYM);
        const description = `Fatura Cartão ${cardName.trim()}${refLabel ? ` - ${refLabel}` : ""}`;

        if (existingExpenseId) {
          // Check if the expense was already paid — warn but allow updating non-financial fields safely.
          const { data: existingExp } = await supabase
            .from("expenses")
            .select("status, valor_pago")
            .eq("id", existingExpenseId)
            .maybeSingle();
          const isPaid = (existingExp as any)?.status === "pago" || Number((existingExp as any)?.valor_pago || 0) > 0;

          const updatePayload: any = {
            descricao: description,
            data_vencimento: dueDate,
            plano_contas_id: cartaoCreditoPlanoId,
            favorecido_id: favorecidoId,
            favorecido_nome: favorecidoNome,
            observacoes: `Importada via OFX (${ofxFileName || "arquivo"}). ${items.length} lançamento(s).`,
          };
          // Only update the total when the expense was not (partially) paid — avoids breaking payment audit.
          if (!isPaid) {
            updatePayload.valor_total = total;
          }

          const { error } = await supabase.from("expenses").update(updatePayload).eq("id", existingExpenseId);
          if (error) throw error;

          if (isPaid && Number((existingExp as any)?.valor_pago || 0) !== total) {
            toast.warning("Despesa já paga: valor total não foi alterado em Contas a Pagar.");
          }
        } else {
          const expensePayload: any = {
            empresa_id: matrizId || null,
            unidade_id: matrizId || null,
            descricao: description,
            tipo_despesa: "outros",
            plano_contas_id: cartaoCreditoPlanoId,
            centro_custo: "administrativo",
            valor_total: total,
            data_emissao: getLocalDateISO(),
            data_vencimento: dueDate,
            forma_pagamento: "cartao_credito",
            favorecido_id: favorecidoId,
            favorecido_nome: favorecidoNome,
            observacoes: `Importada via OFX (${ofxFileName || "arquivo"}). ${items.length} lançamento(s).`,
            origem: "importacao",
            documento_fiscal_importado: false,
            created_by: user?.id,
          };
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
      <DialogContent className="max-w-[95vw] xl:max-w-[1400px] p-0" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base">{isEditing ? "Editar Fatura de Cartão" : "Nova Fatura de Cartão"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 uppercase [&_input]:uppercase [&_textarea]:uppercase [&_input]:placeholder:normal-case [&_textarea]:placeholder:normal-case">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-start">
            <div className="space-y-1 flex flex-col">
              <Label className="text-[11px]">Cartão (Banco) *</Label>
              <PersonSearchInput
                categories={["banco"]}
                placeholder="Buscar banco cadastrado..."
                selectedName={cardName || undefined}
                onSelect={(p) => {
                  const nome = p.razao_social || p.full_name || p.nome_fantasia || "";
                  setCardName(nome);
                  setBankPersonId(p.id);
                }}
                onClear={() => { setCardName(""); setBankPersonId(null); }}
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label className="text-[11px]">Referência</Label>
              <MonthPicker
                value={referenceYM}
                onChange={(v) => setReferenceYM(v)}
                className="w-full !h-8 text-xs px-2"
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label className="text-[11px]">Fechamento</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={closingDate}
                onChange={(e) => setClosingDate(e.target.value)}
                disabled={isClosed}
              />
            </div>
            <div className="space-y-1 flex flex-col">
              <Label className="text-[11px]">Vencimento *</Label>
              <Input
                type="date"
                className="h-8 text-xs"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={isClosed}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
              className="h-8 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={isClosed}
            >
              <Upload className="w-3 h-3 mr-1" /> Importar OFX
            </Button>
            {ofxFileName && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 truncate max-w-[40%]">
                <FileText className="w-3 h-3 shrink-0" /> <span className="truncate">{ofxFileName}{ofxBank ? ` • ${ofxBank}` : ""}</span>
              </span>
            )}
            <div className="ml-auto text-[11px] text-muted-foreground">
              Total: <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
          </div>


          {items.length > 0 ? (
            <div className="space-y-2">
              {/* Batch toolbar */}
              <div className="flex items-center gap-2 flex-wrap p-2 border rounded-md bg-muted/40">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {selectedIdxs.size > 0
                    ? `${selectedIdxs.size} selecionado(s)`
                    : "Marque lançamentos para editar em lote"}
                </span>
                <div className={cn("flex-1 min-w-[200px]", (isClosed || selectedIdxs.size === 0) && "pointer-events-none opacity-50")}>
                  <PersonSearchInput
                    categories={["cliente", "proprietario", "fornecedor", "colaborador"]}
                    placeholder="Favorecido em lote..."
                    onSelect={(p) => {
                      const nome = (p as any).razao_social || p.full_name || (p as any).nome_fantasia || "";
                      applyFavorecidoToSelected(p.id, nome);
                    }}
                  />
                </div>
                <div className="w-[200px]">
                  <SharedPlanoContasCombobox
                    value={null}
                    onChange={(v) => applyPlanoContasToSelected(v)}
                    options={chartAccounts as any}
                    disabled={isClosed || selectedIdxs.size === 0}
                    size="sm"
                    placeholder="Plano de Contas..."
                  />
                </div>
                <Select
                  disabled={isClosed || selectedIdxs.size === 0}
                  onValueChange={(v) => applyCentroCustoToSelected(v)}
                >
                  <SelectTrigger className="h-8 w-[150px] text-xs px-2">
                    <SelectValue placeholder="C. Custo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CENTRO_CUSTO_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedIdxs.size > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setSelectedIdxs(new Set())}
                  >
                    Limpar seleção
                  </Button>
                )}
              </div>

              <div className="border rounded-md">
                <Table className="table-fixed w-full text-[11px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead style={{ width: 32 }} className="px-1">
                        <Checkbox
                          checked={items.length > 0 && selectedIdxs.size === items.length}
                          onCheckedChange={toggleSelectAll}
                          disabled={isClosed}
                          aria-label="Selecionar todos"
                          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </TableHead>
                      <TableHead style={{ width: 72 }} className="px-1 text-[11px]">Data</TableHead>
                      <TableHead style={{ width: 180 }} className="px-1 text-[11px]">Favorecido</TableHead>
                      <TableHead className="px-1 text-[11px]">Descrição</TableHead>
                      <TableHead style={{ width: 88 }} className="px-1 text-right text-[11px]">Valor</TableHead>
                      <TableHead style={{ width: 200 }} className="px-1 text-[11px]">Plano de Contas *</TableHead>
                      <TableHead style={{ width: 110 }} className="px-1 text-[11px]">C. Custo</TableHead>
                      <TableHead style={{ width: 92 }} className="px-1 text-[11px]">Veículo</TableHead>
                      <TableHead style={{ width: 32 }} className="px-1"></TableHead>
                    </TableRow>
                  </TableHeader>


                  <TableBody>
                    {items.map((it, idx) => (
                      <InvoiceItemRow
                        key={`${it.fitid}-${idx}`}
                        idx={idx}
                        item={it}
                        isClosed={isClosed}
                        despesaLeaves={despesaLeaves}
                        vehicles={vehicles}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                        searchOpen={searchPersonOpenIdx === idx}
                        onSearchOpenChange={(o) => setSearchPersonOpenIdx(o ? idx : null)}
                        onOpenCreate={() => setCreatePersonOpenIdx(idx)}
                        wasEdited={hasRowChanged(idx)}
                        selected={selectedIdxs.has(idx)}
                        onToggleSelected={() => toggleSelected(idx)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 border border-dashed rounded-md text-xs text-muted-foreground">
              Importe um arquivo OFX do cartão de crédito para adicionar lançamentos.
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px]">Observações</Label>
            <Textarea
              className="text-xs min-h-[40px]"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              disabled={isClosed}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-9 text-xs">
              {isClosed ? "Fechar" : "Cancelar"}
            </Button>
            {!isClosed && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => persistInvoice(false)}
                  disabled={saving || closing}
                  className="h-9 text-xs"
                >
                  {saving ? "Salvando..." : "Salvar rascunho"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => persistInvoice(true)}
                  disabled={saving || closing || items.length === 0}
                  className="h-9 text-xs"
                >
                  {closing ? "Fechando..." : "Fechar fatura e enviar ao Contas a Pagar"}
                </Button>
              </>
            )}
          </div>

        </div>
      </DialogContent>

      <PersonCreateDialog
        open={createPersonOpenIdx !== null}
        onOpenChange={(o) => { if (!o) setCreatePersonOpenIdx(null); }}
        defaultCategory="fornecedor"
        onCreated={async (createdUserId) => {
          const idx = createPersonOpenIdx;
          setCreatePersonOpenIdx(null);
          if (idx === null || !createdUserId) return;
          const { data } = await supabase
            .from("profiles")
            .select("id, full_name, razao_social, nome_fantasia")
            .eq("user_id", createdUserId)
            .maybeSingle();
          if (data) {
            const nome = (data as any).razao_social || (data as any).full_name || (data as any).nome_fantasia || "";
            updateItem(idx, { favorecido_id: (data as any).id, favorecido_nome: nome });
            toast.success("Favorecido cadastrado e vinculado.");
          }
        }}
      />
    </Dialog>
  );
}

interface InvoiceItemRowProps {
  idx: number;
  item: ItemRow;
  isClosed: boolean;
  despesaLeaves: ChartAccount[];
  vehicles: VehicleOption[];
  onUpdate: (idx: number, patch: Partial<ItemRow>) => void;
  onRemove: (idx: number) => void;
  searchOpen: boolean;
  onSearchOpenChange: (o: boolean) => void;
  onOpenCreate: () => void;
  wasEdited: boolean;
  selected: boolean;
  onToggleSelected: () => void;
}

const InvoiceItemRow = memo(function InvoiceItemRow({
  idx, item, isClosed, despesaLeaves, vehicles,
  onUpdate, onRemove, searchOpen, onSearchOpenChange, onOpenCreate, wasEdited,
  selected, onToggleSelected,
}: InvoiceItemRowProps) {
  // Local state for text inputs — only the row re-renders per keystroke,
  // parent is updated on blur.
  const [favorecidoLocal, setFavorecidoLocal] = useState(item.favorecido_nome);
  const [descriptionLocal, setDescriptionLocal] = useState(item.description);

  // Auto-search state for favorecido
  const [autoResults, setAutoResults] = useState<Array<{ id: string; full_name: string; category: string }>>([]);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const autoDebounce = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync if parent updates (e.g. pick from search, create new)
  useEffect(() => { setFavorecidoLocal(item.favorecido_nome); }, [item.favorecido_nome]);
  useEffect(() => { setDescriptionLocal(item.description); }, [item.description]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAutoOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const runAutoSearch = useCallback((q: string) => {
    if (autoDebounce.current) clearTimeout(autoDebounce.current);
    if (q.trim().length < 2) {
      setAutoResults([]);
      setAutoOpen(false);
      return;
    }
    autoDebounce.current = setTimeout(async () => {
      setAutoLoading(true);
      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, category, razao_social, nome_fantasia, cnpj, is_owner")
          .or(`category.in.(cliente,proprietario,fornecedor,colaborador),is_owner.eq.true`)
          .or(`full_name.ilike.%${q}%,razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%,cnpj.ilike.%${q}%`)
          .order("full_name")
          .limit(8);
        setAutoResults((data as any) || []);
        setAutoOpen(true);
      } catch {
        setAutoResults([]);
      } finally {
        setAutoLoading(false);
      }
    }, 300);
  }, []);

  return (
    <TableRow className={cn(wasEdited ? "bg-success/10" : "bg-warning/10", selected && "ring-1 ring-primary/40")}>
      <TableCell className="px-1 py-1.5 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          disabled={isClosed}
          aria-label="Selecionar lançamento"
          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </TableCell>
      <TableCell className="text-xs px-1 py-1.5 align-middle">{formatDateBR(item.posted_date)}</TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        <div className="flex items-center gap-1">
          <div ref={wrapperRef} className="relative flex-1 min-w-0">
            <Input
              className="h-7 text-[11px] w-full"
              value={favorecidoLocal}
              onChange={(e) => {
                const v = e.target.value;
                setFavorecidoLocal(v);
                runAutoSearch(v);
              }}
              onFocus={() => { if (autoResults.length > 0) setAutoOpen(true); }}
              onBlur={() => {
                if (favorecidoLocal !== item.favorecido_nome) {
                  onUpdate(idx, { favorecido_nome: favorecidoLocal, favorecido_id: null });
                }
              }}
              disabled={isClosed}
              title={favorecidoLocal}
              placeholder="Favorecido"
            />
            {autoOpen && (autoResults.length > 0 || autoLoading) && (
              <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {autoLoading && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>
                )}
                {!autoLoading && autoResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setFavorecidoLocal(p.full_name);
                      setAutoOpen(false);
                      onUpdate(idx, { favorecido_nome: p.full_name, favorecido_id: p.id });
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent text-xs border-b border-border last:border-0"
                  >
                    <div className="font-medium truncate">{p.full_name}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{p.category}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Popover open={searchOpen} onOpenChange={onSearchOpenChange}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 shrink-0"
                disabled={isClosed}
                title="Vincular cadastro existente"
              >
                <Search className="w-3 h-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="end">
              <PersonSearchInput
                categories={["cliente", "proprietario", "fornecedor", "colaborador"]}
                placeholder="Buscar..."
                onSelect={(p) => {
                  onUpdate(idx, { favorecido_nome: p.full_name, favorecido_id: p.id });
                  onSearchOpenChange(false);
                }}
              />
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={isClosed}
            onClick={onOpenCreate}
            title="Cadastrar novo favorecido"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        <Input
          className="h-7 text-[11px] w-full"
          value={descriptionLocal}
          onChange={(e) => setDescriptionLocal(e.target.value)}
          onBlur={() => {
            if (descriptionLocal !== item.description) {
              onUpdate(idx, { description: descriptionLocal });
            }
          }}
          disabled={isClosed}
          title={descriptionLocal}
          placeholder="Descrição do gasto"
        />
      </TableCell>
      <TableCell className="text-right text-xs font-medium px-1 py-1.5 align-middle whitespace-nowrap">
        {formatCurrency(item.amount)}
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        <PlanoContasCombobox
          value={item.plano_contas_id}
          onChange={(v) => onUpdate(idx, { plano_contas_id: v })}
          options={despesaLeaves}
          disabled={isClosed}
        />
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        <Select
          value={item.centro_custo || undefined}
          onValueChange={(v) => onUpdate(idx, { centro_custo: v })}
          disabled={isClosed}
        >
          <SelectTrigger className="h-7 text-[11px] px-2 min-w-0 w-full [&>span]:truncate [&>span]:block [&>span]:min-w-0">
            <SelectValue placeholder="Selecionar..." />
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
      <TableCell className="px-1 py-1.5 align-middle">
        <Select
          value={item.veiculo_id ?? "__none__"}
          onValueChange={(v) => onUpdate(idx, { veiculo_id: v === "__none__" ? null : v })}
          disabled={isClosed}
        >
          <SelectTrigger className="h-7 text-[11px] px-2 min-w-0 w-full [&>span]:truncate [&>span]:block [&>span]:min-w-0">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-muted-foreground">— Nenhum —</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id} className="text-xs">
                {v.plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onRemove(idx)}
          disabled={isClosed}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
});


