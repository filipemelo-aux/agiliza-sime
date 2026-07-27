import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSortableTable, type SortState } from "@/hooks/useSortableTable";
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
import { Upload, Trash2, FileText, Check, ChevronsUpDown, Search, Plus, Users, Layers, ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle } from "lucide-react";
import { exportToCsv } from "@/lib/csvExport";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { parseOfx, parseParcelaFromDescription, type OfxTransaction } from "@/lib/ofxParser";
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

interface ChartAccount { id: string; codigo: string; nome: string; tipo: string; conta_pai_id: string | null; centro_custo_default?: string | null; }

const stripParcelaSuffix = (desc: string) =>
  (desc || "").replace(/\s*[-–]?\s*\(?\d{1,2}\s*\/\s*\d{1,2}\)?\s*$/, "").trim();

const normalizeDesc = (desc: string) =>
  stripParcelaSuffix(desc).toLowerCase().replace(/\s+/g, " ").trim();

const DUPLICATE_AMOUNT_TOLERANCE = 1;

const normalizeInstallmentText = (desc: string) =>
  (desc || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, " ")
    .replace(/\(?\b\d{1,2}\s*\/\s*\d{1,2}\b\)?/g, " ")
    .replace(/\([^)]*\d{3,}[^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getItemParcelaInfo = (item: Pick<ItemRow, "description" | "parcela_atual" | "parcela_total">) => ({
  atual: Number(item.parcela_atual || parseParcelaFromDescription(item.description || "")?.atual || 0),
  total: Number(item.parcela_total || parseParcelaFromDescription(item.description || "")?.total || 0),
});

const cents = (value: number) => Math.round(Number(value || 0) * 100);

const amountDiff = (a: number, b: number) => Math.abs(Number(a || 0) - Number(b || 0));

const amountsEqual = (a: number, b: number) => cents(a) === cents(b);

const amountsClose = (a: number, b: number) => amountDiff(a, b) <= DUPLICATE_AMOUNT_TOLERANCE;

const isSameInstallment = (a: Pick<ItemRow, "description" | "parcela_atual" | "parcela_total">, b: Pick<ItemRow, "description" | "parcela_atual" | "parcela_total">) => {
  const ai = getItemParcelaInfo(a);
  const bi = getItemParcelaInfo(b);
  return ai.atual > 0 && ai.total > 0 && ai.atual === bi.atual && ai.total === bi.total;
};

const findDuplicateItem = (candidate: ItemRow, pool: ItemRow[]) => {
  const candidateNorm = normalizeInstallmentText(candidate.description);
  const scored = pool
    .map((existing, index) => {
      const existingNorm = normalizeInstallmentText(existing.description);
      const sameFitid = !!candidate.fitid && !!existing.fitid && candidate.fitid === existing.fitid;
      const sameDate = candidate.posted_date === existing.posted_date;
      const sameNorm = !!candidateNorm && candidateNorm === existingNorm;
      const sameInstallment = isSameInstallment(candidate, existing);
      const exactAmount = amountsEqual(candidate.amount, existing.amount);
      const closeAmount = amountsClose(candidate.amount, existing.amount);

      if (sameFitid) return { existing, index, reason: "fitid" as const, diff: 0, score: 0 };
      if (sameDate && exactAmount) return { existing, index, reason: "data_valor" as const, diff: 0, score: 1 };
      if (sameNorm && exactAmount) return { existing, index, reason: "descricao_valor" as const, diff: 0, score: sameInstallment ? 2 : 3 };
      if (sameNorm && closeAmount && (sameInstallment || sameDate)) {
        return { existing, index, reason: "descricao_valor_aproximado" as const, diff: amountDiff(candidate.amount, existing.amount), score: sameInstallment ? 4 : 5 };
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.score - b.score || a.diff - b.diff);

  return scored[0] || null;
};

const buildParcelaPatch = (source: ItemRow, target: ItemRow): Partial<ItemRow> => {
  const info = getItemParcelaInfo(source);
  if (!info.atual || !info.total) return {};
  const patch: Partial<ItemRow> = {};
  if (!target.parcela_atual || target.parcela_atual !== info.atual) patch.parcela_atual = info.atual;
  if (!target.parcela_total || target.parcela_total !== info.total) patch.parcela_total = info.total;
  return patch;
};

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
  parcelas_expandidas: boolean;
  possible_duplicate?: boolean;
  duplicate_note?: string;
}

interface VehicleOption { id: string; plate: string; }


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  invoiceId?: string | null;
}

function SortHeader<K extends string>({ label, sortKey, sort, toggle }: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  toggle: (key: K) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => toggle(sortKey)}
      className="flex items-center gap-1 w-full text-left font-medium hover:text-primary transition-colors focus-visible:outline-none"
    >
      {label}
      {active ? (
        sort.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 text-muted-foreground/60" />
      )}
    </button>
  );
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
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState<{ current: number; total: number; message: string }>({ current: 0, total: 0, message: "" });

  // Ordenação da tabela de lançamentos (mantém o índice original para seleção/atualização)
  type SortableColumn = "date" | "favorecido" | "description" | "parcelas" | "amount" | "plano_contas" | "centro_custo" | "veiculo";
  interface ItemRowRef { item: ItemRow; originalIdx: number; }
  const itemRows = useMemo<ItemRowRef[]>(() => items.map((item, originalIdx) => ({ item, originalIdx })), [items]);
  const { sort, toggle, sorted: sortedItemRows } = useSortableTable<ItemRowRef, SortableColumn>(
    itemRows,
    { key: "date", direction: "desc" },
    {
      date: (row) => row.item.posted_date,
      favorecido: (row) => row.item.favorecido_nome?.toLowerCase(),
      description: (row) => row.item.description?.toLowerCase(),
      parcelas: (row) => {
        const total = Number(row.item.parcela_total || 0);
        const atual = Number(row.item.parcela_atual || 0);
        // Itens sem parcelas (total = 0) ficam agrupados no início/fim.
        // Ordena primeiro pela parcela atual ("1/2", "1/3" juntos), depois pelo total.
        if (total === 0) return 0;
        return atual * 1000 + total;
      },
      amount: (row) => row.item.amount,
      plano_contas: (row) => {
        const acc = despesaLeaves.find((a) => a.id === row.item.plano_contas_id);
        return acc?.nome?.toLowerCase() || "";
      },
      centro_custo: (row) => {
        const opt = CENTRO_CUSTO_OPTIONS.find((c) => c.value === row.item.centro_custo);
        return opt?.label?.toLowerCase() || "";
      },
      veiculo: (row) => {
        const v = vehicles.find((x) => x.id === row.item.veiculo_id);
        return v?.plate?.toLowerCase() || "";
      },
    }
  );
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const isEditing = !!invoiceId;

  // Load chart of accounts (despesa, leaves only) + vehicles (frota própria)
  useEffect(() => {
    if (!open) return;
    supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, tipo, conta_pai_id, centro_custo_default")
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
        parcelas_expandidas: !!r.parcelas_expandidas,
      }));
      setItems(mapped);
      setOriginalItems(mapped);

    })();
  }, [open, invoiceId]);

  const total = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);
  const selectedSum = useMemo(
    () => items.reduce((s, it, i) => (selectedIdxs.has(i) ? s + Number(it.amount || 0) : s), 0),
    [items, selectedIdxs]
  );
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
      const parcelaInfo = parseParcelaFromDescription(desc);
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
        parcela_atual: parcelaInfo?.atual ?? null,
        parcela_total: parcelaInfo?.total ?? null,
        parcelas_expandidas: false,
      };
    });

    const parcelasDetected = newRows.filter((r) => r.parcela_total).length;

    // Dedup 1: dentro da fatura atual.
    // Exatos (fitid, data+valor, descrição+valor) → ignora silenciosamente e mantém o original.
    // Aproximados (descrição equivalente + valor próximo) → importa mesmo assim e sinaliza para revisão.
    const patchedExisting = [...items];
    const dedupePool = [...patchedExisting];
    const filtered: ItemRow[] = [];
    let skippedFitid = 0;
    let skippedDateAmount = 0;
    let skippedDescAmount = 0;
    let flaggedApprox = 0;
    let parcelaMetadataUpdated = 0;

    for (const row of newRows) {
      const duplicate = findDuplicateItem(row, dedupePool);
      const isExact = duplicate && (duplicate.reason === "fitid" || duplicate.reason === "data_valor" || duplicate.reason === "descricao_valor");

      if (duplicate && isExact) {
        if (duplicate.reason === "fitid") skippedFitid++;
        else if (duplicate.reason === "data_valor") skippedDateAmount++;
        else skippedDescAmount++;

        const patch = buildParcelaPatch(row, duplicate.existing);
        if (Object.keys(patch).length > 0) {
          dedupePool[duplicate.index] = { ...duplicate.existing, ...patch };
          if (duplicate.index < patchedExisting.length) {
            patchedExisting[duplicate.index] = { ...patchedExisting[duplicate.index], ...patch };
          }
          parcelaMetadataUpdated++;
        }
        continue;
      }

      let rowToPush = row;
      if (duplicate && !isExact) {
        // Aproximado — importa e sinaliza para revisão manual
        const diff = amountDiff(row.amount, duplicate.existing.amount);
        rowToPush = {
          ...row,
          possible_duplicate: true,
          duplicate_note: `Possível duplicidade nesta fatura: "${duplicate.existing.description}" (${formatCurrency(duplicate.existing.amount)}) — diferença ${formatCurrency(diff)}. Revise e exclua se for o mesmo lançamento.`,
        };
        flaggedApprox++;
      }
      dedupePool.push(rowToPush);
      filtered.push(rowToPush);
    }

    // Dedup 2: contra outras faturas do mesmo cartão/banco no banco de dados.
    // Também ignora somente exatos; aproximados são importados com sinalização.
    let skippedInDb = 0;
    let flaggedApproxDb = 0;
    if (filtered.length > 0 && cardName.trim()) {
      let invQ = supabase
        .from("credit_card_invoices" as any)
        .select("id, reference_month")
        .eq("card_name", cardName.trim())
        .is("deleted_at", null);
      if (bankPersonId) invQ = invQ.eq("bank_person_id", bankPersonId);
      const { data: invs } = await invQ;
      const invList = ((invs as any[]) || []).filter((i) => i.id !== invoiceId);
      const invIds = invList.map((i) => i.id);
      const invRefMap = new Map<string, string>(invList.map((i) => [i.id, i.reference_month || ""]));
      if (invIds.length > 0) {
        const { data: dbItems } = await supabase
          .from("credit_card_invoice_items" as any)
          .select("invoice_id, posted_date, amount, description, fitid, parcela_atual, parcela_total, parcelas_expandidas")
          .in("invoice_id", invIds);
        const dbRows: (ItemRow & { invoice_id?: string })[] = ((dbItems as any[]) || []).map((r) => ({
          fitid: r.fitid || "",
          posted_date: r.posted_date,
          description: r.description || "",
          amount: Number(r.amount || 0),
          plano_contas_id: null,
          centro_custo: "",
          favorecido_id: null,
          favorecido_nome: "",
          veiculo_id: null,
          observacoes: "",
          parcela_atual: r.parcela_atual ?? null,
          parcela_total: r.parcela_total ?? null,
          parcelas_expandidas: !!r.parcelas_expandidas,
          invoice_id: r.invoice_id,
        }));
        const rebuilt: ItemRow[] = [];
        for (const r of filtered) {
          const dup = findDuplicateItem(r, dbRows);
          if (!dup) { rebuilt.push(r); continue; }
          const isExact = dup.reason === "fitid" || dup.reason === "data_valor" || dup.reason === "descricao_valor";
          if (isExact) { skippedInDb++; continue; }
          const invRef = invRefMap.get((dup.existing as any).invoice_id) || "outra fatura";
          const diff = amountDiff(r.amount, dup.existing.amount);
          rebuilt.push({
            ...r,
            possible_duplicate: true,
            duplicate_note: `${r.duplicate_note ? r.duplicate_note + " • " : ""}Possível duplicidade em ${invRef}: "${dup.existing.description}" (${formatCurrency(dup.existing.amount)}) — diferença ${formatCurrency(diff)}.`,
          });
          flaggedApproxDb++;
        }
        filtered.splice(0, filtered.length, ...rebuilt);
      }
    }

    const merged = [...patchedExisting, ...filtered].sort((a, b) => a.posted_date.localeCompare(b.posted_date));
    setItems(merged);
    setOriginalItems(merged);

    const skippedInDialog = skippedFitid + skippedDateAmount + skippedDescAmount;
    if (skippedInDialog > 0) {
      toast.info(`${skippedInDialog} lançamento(s) idêntico(s) já existiam nesta fatura e foram mantidos.`);
    }
    if (parcelaMetadataUpdated > 0) {
      toast.info(`${parcelaMetadataUpdated} lançamento(s) existente(s) tiveram a numeração de parcelas conferida/preenchida.`);
    }
    if (skippedInDb > 0) {
      toast.info(`${skippedInDb} lançamento(s) idêntico(s) já existem em outras faturas — ignorados.`);
    }
    const totalFlagged = flaggedApprox + flaggedApproxDb;
    if (totalFlagged > 0) {
      toast.warning(`${totalFlagged} lançamento(s) importado(s) com possível duplicidade (valor/descrição próximos). Revise as linhas destacadas em âmbar e exclua as duplicadas se necessário.`, { duration: 12000 });
    }
    if (parcelasDetected > 0) {
      toast.success(`${filtered.length} lançamento(s) importado(s) — ${parcelasDetected} com parcelas detectadas automaticamente.`);
    } else {
      toast.success(`${filtered.length} lançamento(s) importado(s).`);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const updateItem = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, ...patch };
      // Auto-fill centro de custo padrão do plano de contas (só se estiver vazio)
      if (patch.plano_contas_id && patch.plano_contas_id !== it.plano_contas_id && !next.centro_custo) {
        const acc = chartAccounts.find((a) => a.id === patch.plano_contas_id);
        if (acc?.centro_custo_default) next.centro_custo = acc.centro_custo_default;
      }
      return next;
    }));
  }, [chartAccounts]);

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
    const acc = chartAccounts.find((a) => a.id === planoContasId);
    const ccDefault = acc?.centro_custo_default || "";
    setItems((prev) => prev.map((it, i) => (
      selectedIdxs.has(i)
        ? { ...it, plano_contas_id: planoContasId, centro_custo: it.centro_custo || ccDefault }
        : it
    )));
    toast.success(`Plano de contas aplicado em ${selectedIdxs.size} lançamento(s).`);
  }, [selectedIdxs, chartAccounts]);

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

  const removeSelected = useCallback(async () => {
    if (selectedIdxs.size === 0) return;
    const ok = await confirm({
      title: "Remover selecionados?",
      description: `${selectedIdxs.size} lançamento(s) serão removidos da fatura. Você poderá salvar depois para efetivar.`,
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    setItems((prev) => prev.filter((_, i) => !selectedIdxs.has(i)));
    setOriginalItems((prev) => prev.filter((_, i) => !selectedIdxs.has(i)));
    setSelectedIdxs(new Set());
    toast.success("Lançamentos removidos.");
  }, [selectedIdxs, confirm]);

  // Reconciliação com valor real da fatura: encontra um subconjunto cuja soma
  // equivale à diferença entre o total atual e o valor informado, e o seleciona
  // para que o usuário revise e decida excluir.
  const [reconcileTarget, setReconcileTarget] = useState<string>("");
  const suggestRemovalsForTarget = useCallback(() => {
    const target = Number(String(reconcileTarget).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(target) || target <= 0) {
      toast.error("Informe o valor real da fatura (ex.: 33971,38).");
      return;
    }
    const currentTotal = items.reduce((s, i) => s + Number(i.amount || 0), 0);
    const diffCents = Math.round((currentTotal - target) * 100);
    if (diffCents === 0) {
      toast.success("Total já bate com o valor informado. Nada a remover.");
      return;
    }
    if (diffCents < 0) {
      toast.error(`Total atual (${formatCurrency(currentTotal)}) é MENOR que o valor informado. Faltam lançamentos, não sobram.`);
      return;
    }
    // Subset-sum sobre valores em centavos (ignora créditos/valores <=0)
    const candidates = items
      .map((it, i) => ({ idx: i, cents: Math.round(Number(it.amount || 0) * 100) }))
      .filter((c) => c.cents > 0 && c.cents <= diffCents);
    if (candidates.length === 0) {
      toast.error("Nenhum lançamento compatível com a diferença.");
      return;
    }
    // Tolerância de 1 centavo (arredondamento)
    const TOL = 1;
    // DP com backtracking (limitado por diffCents)
    const N = candidates.length;
    const cap = diffCents;
    // Para performance, se cap grande, cai em busca gulosa.
    let solution: number[] | null = null;
    if (cap * N <= 4_000_000) {
      const dp: Uint8Array[] = [new Uint8Array(cap + 1)];
      dp[0][0] = 1;
      for (let i = 0; i < N; i++) {
        const prev = dp[i];
        const next = new Uint8Array(cap + 1);
        const c = candidates[i].cents;
        for (let s = 0; s <= cap; s++) {
          if (prev[s]) {
            next[s] = 1;
            if (s + c <= cap) next[s + c] = 1;
          }
        }
        dp.push(next);
      }
      // Encontra soma alvo mais próxima
      let best = -1;
      for (let s = cap; s >= Math.max(0, cap - TOL); s--) if (dp[N][s]) { best = s; break; }
      if (best < 0) for (let s = cap; s >= 0; s--) if (dp[N][s]) { best = s; break; }
      if (best >= 0) {
        solution = [];
        let s = best;
        for (let i = N; i >= 1; i--) {
          if (!dp[i - 1][s] && dp[i][s]) {
            solution.push(candidates[i - 1].idx);
            s -= candidates[i - 1].cents;
          }
        }
      }
    }
    if (!solution) {
      // Guloso: ordena decrescente e vai somando enquanto não estoura
      const sorted = [...candidates].sort((a, b) => b.cents - a.cents);
      let remaining = cap;
      const picked: number[] = [];
      for (const c of sorted) {
        if (c.cents <= remaining + TOL) {
          picked.push(c.idx);
          remaining -= c.cents;
          if (remaining <= TOL) break;
        }
      }
      solution = picked;
    }
    if (!solution || solution.length === 0) {
      toast.error("Não foi possível encontrar uma combinação de lançamentos para a diferença.");
      return;
    }
    const pickedSum = solution.reduce((s, i) => s + Number(items[i].amount || 0), 0);
    setSelectedIdxs(new Set(solution));
    const diffLeft = Math.abs(currentTotal - pickedSum - target);
    toast.success(
      `${solution.length} lançamento(s) selecionados (${formatCurrency(pickedSum)}). ` +
      (diffLeft <= 0.01
        ? "Bate exatamente com a diferença. Revise e clique em Excluir selecionados."
        : `Restariam ${formatCurrency(diffLeft)} de diferença. Revise e ajuste manualmente se necessário.`),
      { duration: 6000 }
    );
  }, [reconcileTarget, items]);

  // ============ EXPANSÃO DE PARCELAS ============
  const shiftYM = (ym: string, offset: number) => {
    const [y, m] = ym.split("-").map(Number);
    const total = y * 12 + (m - 1) + offset;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${ny}-${String(nm).padStart(2, "0")}`;
  };
  const shiftDate = (iso: string, monthOffset: number) => {
    if (!iso) return iso;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1 + monthOffset, d);
    // Clamp day overflow (JS may roll over)
    if (dt.getDate() !== d) dt.setDate(0);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };

  const buildDescription = (baseDesc: string, atual: number, total: number) => {
    // Remove qualquer sufixo XX/YY existente e recoloca o novo
    const cleaned = baseDesc.replace(/\s*[-–]?\s*\(?\d{1,2}\s*\/\s*\d{1,2}\)?\s*$/, "").trim();
    return `${cleaned} ${String(atual).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  };

  const estornarFaturaSePaga = async (invoice: any): Promise<boolean> => {
    if (!invoice?.expense_id) return true;
    const { data: exp } = await supabase
      .from("expenses")
      .select("id, status, valor_pago")
      .eq("id", invoice.expense_id)
      .maybeSingle();
    if (!exp) return true;
    const isPaid = (exp as any).status === "pago" || Number((exp as any).valor_pago || 0) > 0;
    if (!isPaid && (exp as any).status !== "pago") {
      // Só reabre invoice se estava fechada
      if (invoice.status === "fechada") {
        await supabase.from("credit_card_invoices" as any).update({ status: "aberta" }).eq("id", invoice.id);
      }
      return true;
    }
    // Estornar pagamentos (triggers cuidam das movimentações bancárias)
    await supabase.from("expense_payments").delete().eq("expense_id", invoice.expense_id);
    await supabase.from("expenses").update({ status: "pendente", valor_pago: 0 }).eq("id", invoice.expense_id);
    await supabase.from("credit_card_invoices" as any).update({ status: "aberta" }).eq("id", invoice.id);
    return true;
  };

  // Validates a single item before expansion. Returns error message or null.
  const validateItemForExpansion = (item: ItemRow): string | null => {
    const cur = Number(item.parcela_atual || 0);
    const totalP = Number(item.parcela_total || 0);
    if (!cur || !totalP || totalP < 2 || cur < 1 || cur > totalP) {
      return "Informe corretamente a parcela atual e o total (ex: 5 de 10).";
    }
    if (!item.plano_contas_id) return "Selecione o plano de contas antes de gerar as parcelas.";
    if (!item.centro_custo || !item.centro_custo.trim()) return "Selecione o centro de custo antes de gerar as parcelas.";
    return null;
  };

  const ensureCurrentInvoiceId = async (): Promise<string> => {
    if (invoiceId) return invoiceId;
    const payload: any = {
      empresa_id: matrizId || null,
      card_name: cardName.trim(),
      bank_person_id: bankPersonId,
      reference_label: formatReferenceLabel(referenceYM) || null,
      due_date: dueDate,
      closing_date: closingDate || null,
      total_amount: total,
      status: "aberta",
      ofx_file_name: ofxFileName || null,
      ofx_bank_name: ofxBank || null,
      ofx_account_id: ofxAccountId || null,
      observacoes: observacoes.trim() || null,
      created_by: user?.id,
    };
    const { data: newInv, error } = await supabase
      .from("credit_card_invoices" as any).insert(payload).select("id").single();
    if (error) throw error;
    return (newInv as any).id;
  };

  // Runs the expansion of a single item. Reports progress via onStep(delta, message).
  const runItemExpansion = async (
    item: ItemRow,
    idx: number,
    currentInvoiceId: string,
    onStep: (delta: number, message: string) => void,
  ): Promise<{ createdCount: number; reusedCount: number; estornoCount: number }> => {
    const cur = Number(item.parcela_atual || 0);
    const totalP = Number(item.parcela_total || 0);
    const missing: Array<{ parcela: number; offset: number }> = [];
    for (let p = 1; p <= totalP; p++) {
      if (p === cur) continue;
      missing.push({ parcela: p, offset: p - cur });
    }

    const baseDesc = item.description;
    const newDescCurrent = buildDescription(baseDesc, cur, totalP);
    onStep(1, `Salvando parcela atual (${cur}/${totalP})...`);
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, description: newDescCurrent } : it));

    if (item.id) {
      const { error: updErr } = await supabase
        .from("credit_card_invoice_items" as any)
        .update({
          description: newDescCurrent,
          plano_contas_id: item.plano_contas_id,
          centro_custo: item.centro_custo || null,
          favorecido_id: item.favorecido_id,
          favorecido_nome: item.favorecido_nome?.trim() || null,
          veiculo_id: item.veiculo_id,
          observacoes: item.observacoes?.trim() || null,
          parcela_atual: cur,
          parcela_total: totalP,
          parcelas_expandidas: true,
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    } else {
      const { data: insertedCur, error: insErr } = await supabase
        .from("credit_card_invoice_items" as any)
        .insert({
          invoice_id: currentInvoiceId,
          posted_date: item.posted_date,
          description: newDescCurrent,
          amount: item.amount,
          fitid: item.fitid || null,
          plano_contas_id: item.plano_contas_id,
          centro_custo: item.centro_custo || null,
          favorecido_id: item.favorecido_id,
          favorecido_nome: item.favorecido_nome?.trim() || null,
          veiculo_id: item.veiculo_id,
          observacoes: item.observacoes?.trim() || null,
          parcela_atual: cur,
          parcela_total: totalP,
          parcelas_expandidas: true,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      const newId = (insertedCur as any).id;
      setItems((prev) => prev.map((it, i) => i === idx ? { ...it, id: newId, parcelas_expandidas: true } : it));
    }
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, parcelas_expandidas: true } : it));

    let createdCount = 0;
    let reusedCount = 0;
    let estornoCount = 0;

    for (const { parcela, offset } of missing) {
      onStep(1, `"${(baseDesc || "").slice(0, 24)}": parcela ${parcela}/${totalP}...`);
      const targetYM = shiftYM(referenceYM, offset);
      const targetRefLabel = formatReferenceLabel(targetYM);
      const targetDue = shiftDate(dueDate, offset);
      const targetClosing = closingDate ? shiftDate(closingDate, offset) : null;
      const targetPosted = shiftDate(item.posted_date, offset);

      let query = supabase
        .from("credit_card_invoices" as any)
        .select("id, status, expense_id, due_date, closing_date")
        .eq("card_name", cardName.trim())
        .eq("reference_label", targetRefLabel)
        .is("deleted_at", null)
        .limit(1);
      if (bankPersonId) query = query.eq("bank_person_id", bankPersonId);

      const { data: found } = await query;
      let targetInvoice: any = (found as any[])?.[0] || null;

      if (targetInvoice) {
        const wasPaid = targetInvoice.status === "fechada" && !!targetInvoice.expense_id;
        await estornarFaturaSePaga(targetInvoice);
        if (wasPaid) estornoCount++;
        reusedCount++;
      } else {
        const payload: any = {
          empresa_id: matrizId || null,
          card_name: cardName.trim(),
          bank_person_id: bankPersonId,
          reference_label: targetRefLabel,
          due_date: targetDue,
          closing_date: targetClosing,
          total_amount: 0,
          status: "aberta",
          observacoes: observacoes.trim() || null,
          created_by: user?.id,
        };
        const { data: created, error } = await supabase
          .from("credit_card_invoices" as any).insert(payload).select("id").single();
        if (error) throw error;
        targetInvoice = { id: (created as any).id };
        createdCount++;
      }

      // Verifica se já existe lançamento equivalente na fatura destino
      // (mesmo valor + descrição base normalizada). Evita duplicação quando
      // as parcelas já foram lançadas manualmente em faturas anteriores.
      const { data: existingRows } = await supabase
        .from("credit_card_invoice_items" as any)
        .select("id, posted_date, description, amount, fitid, parcela_atual, parcela_total, parcelas_expandidas")
        .eq("invoice_id", targetInvoice.id);

      const targetItem: ItemRow = {
        fitid: "",
        posted_date: targetPosted,
        description: buildDescription(baseDesc, parcela, totalP),
        amount: item.amount,
        plano_contas_id: item.plano_contas_id,
        centro_custo: item.centro_custo || "",
        favorecido_id: item.favorecido_id,
        favorecido_nome: item.favorecido_nome?.trim() || "",
        veiculo_id: item.veiculo_id,
        observacoes: item.observacoes?.trim() || "",
        parcela_atual: parcela,
        parcela_total: totalP,
        parcelas_expandidas: true,
      };

      const existingItems: ItemRow[] = ((existingRows as any[]) || []).map((r) => ({
        id: r.id,
        fitid: r.fitid || "",
        posted_date: r.posted_date,
        description: r.description || "",
        amount: Number(r.amount || 0),
        plano_contas_id: null,
        centro_custo: "",
        favorecido_id: null,
        favorecido_nome: "",
        veiculo_id: null,
        observacoes: "",
        parcela_atual: r.parcela_atual ?? null,
        parcela_total: r.parcela_total ?? null,
        parcelas_expandidas: !!r.parcelas_expandidas,
      }));
      const existingMatch = findDuplicateItem(targetItem, existingItems);

      const itemPayload: any = {
        invoice_id: targetInvoice.id,
        posted_date: targetItem.posted_date,
        description: targetItem.description,
        amount: targetItem.amount,
        fitid: null,
        plano_contas_id: targetItem.plano_contas_id,
        centro_custo: targetItem.centro_custo || null,
        favorecido_id: targetItem.favorecido_id,
        favorecido_nome: targetItem.favorecido_nome || null,
        veiculo_id: targetItem.veiculo_id,
        observacoes: targetItem.observacoes || null,
        parcela_atual: targetItem.parcela_atual,
        parcela_total: targetItem.parcela_total,
        parcelas_expandidas: targetItem.parcelas_expandidas,
      };

      if (existingMatch) {
        // Já existe: apenas corrige numeração/marcação de parcela, mantém o lançamento original
        // e seu valor original (inclusive se houver diferença de centavos).
        const { error: updExErr } = await supabase
          .from("credit_card_invoice_items" as any)
          .update({
            description: buildDescription(existingMatch.existing.description || baseDesc, parcela, totalP),
            parcela_atual: parcela,
            parcela_total: totalP,
            parcelas_expandidas: true,
          })
          .eq("id", existingMatch.existing.id);
        if (updExErr) throw updExErr;
      } else {
        const { error: itemErr } = await supabase.from("credit_card_invoice_items" as any).insert(itemPayload);
        if (itemErr) throw itemErr;
      }

      const { data: sumRows } = await supabase
        .from("credit_card_invoice_items" as any)
        .select("amount")
        .eq("invoice_id", targetInvoice.id);
      const newTotal = ((sumRows as any[]) || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      await supabase.from("credit_card_invoices" as any)
        .update({ total_amount: newTotal }).eq("id", targetInvoice.id);
    }

    return { createdCount, reusedCount, estornoCount };
  };

  const reloadCurrentInvoiceItems = async () => {
    if (!invoiceId) return;
    const { data: rows } = await supabase
      .from("credit_card_invoice_items" as any)
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("posted_date");
    const mapped = ((rows as any[]) || []).map((r: any) => ({
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
      parcelas_expandidas: !!r.parcelas_expandidas,
    }));
    setItems(mapped);
    setOriginalItems(mapped);
  };

  const expandParcelas = async (idx: number) => {
    const item = items[idx];
    if (!item) return;
    const errMsg = validateItemForExpansion(item);
    if (errMsg) { toast.error(errMsg); return; }
    if (!cardName.trim()) { toast.error("Selecione o banco/cartão antes de expandir."); return; }
    if (!dueDate) { toast.error("Informe o vencimento antes de expandir."); return; }

    const cur = Number(item.parcela_atual || 0);
    const totalP = Number(item.parcela_total || 0);
    const missingCount = totalP - 1;

    const ok = await confirm({
      title: `Gerar parcelas ${1}/${totalP} a ${totalP}/${totalP}?`,
      description:
        `Este lançamento será replicado em ${missingCount} outra(s) fatura(s) do cartão "${cardName}", ajustando apenas o número da parcela e as datas.\n\n` +
        `• Faturas anteriores: ${cur - 1}\n• Faturas posteriores: ${totalP - cur}\n\n` +
        `Se alguma fatura destino já estiver fechada e quitada no Contas a Pagar, ela será ESTORNADA automaticamente para receber o lançamento.`,
      confirmLabel: "Gerar parcelas",
    });
    if (!ok) return;

    const totalSteps = 1 + missingCount + 1;
    let currentStep = 0;
    setExpanding(true);
    setExpandProgress({ current: 0, total: totalSteps, message: "Preparando..." });
    try {
      const currentInvoiceId = await ensureCurrentInvoiceId();
      const onStep = (delta: number, message: string) => {
        currentStep += delta;
        setExpandProgress({ current: currentStep, total: totalSteps, message });
      };
      const { createdCount, reusedCount, estornoCount } = await runItemExpansion(item, idx, currentInvoiceId, onStep);
      toast.success(
        `Parcelas geradas: ${createdCount} fatura(s) criada(s), ${reusedCount} existente(s)` +
        (estornoCount ? `, ${estornoCount} estornada(s)` : "") + "."
      );
      onSaved();
      setExpandProgress({ current: totalSteps, total: totalSteps, message: "Atualizando fatura..." });
      await reloadCurrentInvoiceItems();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao gerar parcelas.");
    } finally {
      setExpanding(false);
      setExpandProgress({ current: 0, total: 0, message: "" });
    }
  };

  const expandParcelasBatch = async () => {
    if (selectedIdxs.size === 0) return;
    if (!cardName.trim()) { toast.error("Selecione o banco/cartão antes de expandir."); return; }
    if (!dueDate) { toast.error("Informe o vencimento antes de expandir."); return; }

    const selectedItems = Array.from(selectedIdxs)
      .sort((a, b) => a - b)
      .map((i) => ({ idx: i, item: items[i] }))
      .filter((x) => !!x.item);

    const alreadyExpanded = selectedItems.filter(({ item }) => item.parcelas_expandidas);
    if (alreadyExpanded.length > 0) {
      const nomes = alreadyExpanded
        .map(({ item }) => `"${(item.description || "").slice(0, 40)}"`)
        .join(", ");
      toast.warning(
        `${alreadyExpanded.length} lançamento(s) selecionado(s) já tiveram parcelas geradas (${nomes}). A operação prosseguirá: parcelas ainda existentes serão mantidas (sem duplicar) e apenas faturas faltantes (ex.: excluídas) serão recriadas.`,
        { duration: 8000 },
      );
    }

    const targets: Array<{ idx: number; item: ItemRow }> = [];
    const skipped: string[] = [];
    for (const { idx, item: it } of selectedItems) {
      const errMsg = validateItemForExpansion(it);
      if (errMsg) { skipped.push(`"${(it.description || "").slice(0, 30)}": ${errMsg}`); continue; }
      targets.push({ idx, item: it });
    }

    if (targets.length === 0) {
      toast.error("Nenhum lançamento válido para expansão. Verifique parcelas, plano de contas e centro de custo.");
      return;
    }

    const totalMissing = targets.reduce((s, t) => s + (Number(t.item.parcela_total || 0) - 1), 0);
    const ok = await confirm({
      title: `Gerar parcelas em lote — ${targets.length} lançamento(s)?`,
      description:
        `Serão processados ${targets.length} lançamento(s), gerando ${totalMissing} parcela(s) em faturas anteriores/posteriores do cartão "${cardName}".\n\n` +
        (skipped.length > 0 ? `${skipped.length} lançamento(s) selecionado(s) serão IGNORADOS (já expandidos ou sem dados obrigatórios).\n\n` : "") +
        `Faturas destino já fechadas e quitadas no Contas a Pagar serão ESTORNADAS automaticamente para receber os lançamentos.`,
      confirmLabel: "Gerar em lote",
    });
    if (!ok) return;

    const totalSteps = targets.reduce((s, t) => s + 1 + (Number(t.item.parcela_total || 0) - 1), 0) + 1;
    let currentStep = 0;
    setExpanding(true);
    setExpandProgress({ current: 0, total: totalSteps, message: "Preparando lote..." });

    let createdSum = 0, reusedSum = 0, estornoSum = 0, doneItems = 0;
    try {
      const currentInvoiceId = await ensureCurrentInvoiceId();
      for (const { idx, item } of targets) {
        const onStep = (delta: number, message: string) => {
          currentStep += delta;
          setExpandProgress({
            current: currentStep,
            total: totalSteps,
            message: `[${doneItems + 1}/${targets.length}] ${message}`,
          });
        };
        try {
          const { createdCount, reusedCount, estornoCount } = await runItemExpansion(item, idx, currentInvoiceId, onStep);
          createdSum += createdCount;
          reusedSum += reusedCount;
          estornoSum += estornoCount;
        } catch (e: any) {
          console.error("Falha ao expandir item", idx, e);
          toast.error(`Falha em "${(item.description || "").slice(0, 30)}": ${e.message || e}`);
        }
        doneItems++;
      }
      toast.success(
        `Lote concluído: ${doneItems}/${targets.length} — ${createdSum} fatura(s) criada(s), ${reusedSum} existente(s)` +
        (estornoSum ? `, ${estornoSum} estornada(s)` : "") +
        (skipped.length ? ` • ${skipped.length} ignorado(s).` : ".")
      );
      onSaved();
      setExpandProgress({ current: totalSteps, total: totalSteps, message: "Atualizando fatura..." });
      await reloadCurrentInvoiceItems();
      setSelectedIdxs(new Set());
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao gerar parcelas em lote.");
    } finally {
      setExpanding(false);
      setExpandProgress({ current: 0, total: 0, message: "" });
    }
  };


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

      // Preserve "fechada" when editing an already-closed invoice via "Salvar rascunho".
      // A closed invoice already has a linked expense in Contas a Pagar; downgrading it
      // to "aberta" silently would break the audit trail and hide the card from filters.
      const preservedStatus =
        !closeNow && existingStatus === "fechada" ? "fechada" : (closeNow ? "fechada" : "aberta");

      const payload: any = {
        empresa_id: matrizId || null,
        card_name: cardName.trim(),
        bank_person_id: bankPersonId,
        reference_label: formatReferenceLabel(referenceYM) || null,
        due_date: dueDate,
        closing_date: closingDate || null,
        total_amount: total,
        status: preservedStatus,
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
          parcelas_expandidas: it.parcelas_expandidas,


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
    <Dialog open={open} onOpenChange={(o) => { if (expanding) return; onOpenChange(o); }}>
      <DialogContent
        className="max-w-[95vw] xl:max-w-[1400px] p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (expanding) e.preventDefault(); }}
      >
        {expanding && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-lg px-6">
            <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <div className="text-sm font-medium">Gerando parcelas, aguarde...</div>
            <div className="w-full max-w-md space-y-2">
              <Progress
                value={expandProgress.total > 0 ? (expandProgress.current / expandProgress.total) * 100 : 0}
                className="h-2"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">{expandProgress.message || "Iniciando..."}</span>
                <span className="tabular-nums shrink-0 ml-2">
                  {expandProgress.current}/{expandProgress.total}
                  {expandProgress.total > 0 && ` (${Math.round((expandProgress.current / expandProgress.total) * 100)}%)`}
                </span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Não feche esta janela até a conclusão.</div>
          </div>
        )}

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs ml-auto gap-1"
              disabled={items.length === 0}
              onClick={() => {
                const chartById = new Map(chartAccounts.map((c) => [c.id, c] as const));
                const rows = items.map((it) => {
                  const p = it.plano_contas_id ? chartById.get(it.plano_contas_id) : null;
                  const total = Number(it.parcela_total || 0);
                  const atual = Number(it.parcela_atual || 0);
                  return {
                    data: it.posted_date ? formatDateBR(it.posted_date) : "",
                    descricao: it.description,
                    parcela: total > 0 ? `${atual}/${total}` : "",
                    favorecido: it.favorecido_nome || "",
                    plano_contas: p ? `${p.codigo} ${p.nome}` : "",
                    centro_custo: it.centro_custo || "",
                    valor: Number(it.amount || 0).toFixed(2).replace(".", ","),
                    observacoes: it.observacoes || "",
                  };
                });
                const label = (cardName || "cartao").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
                exportToCsv(`fatura-${label}-${referenceYM}.csv`, rows, [
                  { key: "data", label: "Data" },
                  { key: "descricao", label: "Descrição" },
                  { key: "parcela", label: "Parcela" },
                  { key: "favorecido", label: "Favorecido" },
                  { key: "plano_contas", label: "Plano de Contas" },
                  { key: "centro_custo", label: "Centro de Custo" },
                  { key: "valor", label: "Valor" },
                  { key: "observacoes", label: "Observações" },
                ]);
              }}
            >
              <Download className="w-3 h-3" /> Exportar CSV
            </Button>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-muted/40">
                <span className="text-[10px] uppercase text-muted-foreground">Valor real da fatura</span>
                <Input
                  value={reconcileTarget}
                  onChange={(e) => setReconcileTarget(e.target.value)}
                  placeholder="33.971,38"
                  className="h-7 w-28 text-xs px-2"
                  inputMode="decimal"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  onClick={suggestRemovalsForTarget}
                  title="Seleciona lançamentos cuja soma equivale à diferença entre o total atual e o valor informado"
                >
                  <Search className="w-3 h-3 mr-1" /> Sugerir remoções
                </Button>
                {reconcileTarget && (() => {
                  const t = Number(String(reconcileTarget).replace(/\./g, "").replace(",", "."));
                  if (!Number.isFinite(t) || t <= 0) return null;
                  const diff = total - t;
                  return (
                    <span className={cn("text-[10px] tabular-nums", Math.abs(diff) < 0.01 ? "text-success" : "text-warning")}>
                      Δ {formatCurrency(diff)}
                    </span>
                  );
                })()}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Total: <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>


          {items.length > 0 ? (
            <div className="space-y-2">
              {/* Batch toolbar */}
              <div className="flex items-center gap-2 flex-wrap p-2 border rounded-md bg-muted/40">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs whitespace-nowrap">
                  {selectedIdxs.size > 0 ? (
                    <>
                      <span className="text-muted-foreground">{selectedIdxs.size} selecionado(s) •</span>{" "}
                      <span className="font-bold text-primary text-sm tabular-nums">{formatCurrency(selectedSum)}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Clique nas linhas para selecionar e editar em lote</span>
                  )}
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
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      disabled={isClosed || expanding}
                      onClick={expandParcelasBatch}
                      title="Gerar parcelas anteriores e posteriores para todos os lançamentos selecionados"
                    >
                      <Layers className="w-3 h-3 mr-1" /> Gerar parcelas em lote
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setSelectedIdxs(new Set())}
                    >
                      Limpar seleção
                    </Button>
                  </>
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
                      <TableHead style={{ width: 72 }} className="px-1 text-[11px]">
                        <SortHeader label="Data" sortKey="date" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 160 }} className="px-1 text-[11px]">
                        <SortHeader label="Favorecido" sortKey="favorecido" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[28%]">
                        <SortHeader label="Descrição" sortKey="description" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 92 }} className="px-1 text-[11px]">
                        <SortHeader label="Parcelas" sortKey="parcelas" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 80 }} className="px-1 text-right text-[11px]">
                        <SortHeader label="Valor" sortKey="amount" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[22%]">
                        Conferência
                      </TableHead>
                      <TableHead style={{ width: 180 }} className="px-1 text-[11px]">
                        <SortHeader label="Plano de Contas" sortKey="plano_contas" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 104 }} className="px-1 text-[11px]">
                        <SortHeader label="C. Custo" sortKey="centro_custo" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 88 }} className="px-1 text-[11px]">
                        <SortHeader label="Veículo" sortKey="veiculo" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead style={{ width: 32 }} className="px-1"></TableHead>

                    </TableRow>
                  </TableHeader>


                  <TableBody>
                    {sortedItemRows.map(({ item, originalIdx }) => (
                      <InvoiceItemRow
                        key={`${item.fitid}-${originalIdx}`}
                        idx={originalIdx}
                        item={item}
                        isClosed={isClosed}
                        despesaLeaves={despesaLeaves}
                        vehicles={vehicles}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                        searchOpen={searchPersonOpenIdx === originalIdx}
                        onSearchOpenChange={(o) => setSearchPersonOpenIdx(o ? originalIdx : null)}
                        onOpenCreate={() => setCreatePersonOpenIdx(originalIdx)}
                        wasEdited={hasRowChanged(originalIdx)}
                        selected={selectedIdxs.has(originalIdx)}
                        onToggleSelected={() => toggleSelected(originalIdx)}
                        onExpandParcelas={() => expandParcelas(originalIdx)}
                        expanding={expanding}
                        referenceYM={referenceYM}
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
                {existingStatus === "fechada" ? (
                  <Button
                    size="sm"
                    onClick={() => persistInvoice(true)}
                    disabled={saving || closing || items.length === 0}
                    className="h-9 text-xs"
                    title="A fatura permanece fechada e o Contas a Pagar é atualizado."
                  >
                    {closing ? "Salvando..." : "Salvar alterações (mantém fechada)"}
                  </Button>
                ) : (
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
      {ConfirmDialog}
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
  onExpandParcelas: () => void;
  expanding: boolean;
  referenceYM: string;
}

const InvoiceItemRow = memo(function InvoiceItemRow({
  idx, item, isClosed, despesaLeaves, vehicles,
  onUpdate, onRemove, searchOpen, onSearchOpenChange, onOpenCreate, wasEdited,
  selected, onToggleSelected, onExpandParcelas, expanding, referenceYM,
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
    <TableRow
      className={cn(
        item.possible_duplicate ? "bg-amber-100/60 dark:bg-amber-900/20 ring-2 ring-amber-500/60" : (wasEdited ? "bg-success/10" : "bg-warning/10"),
        selected && "ring-1 ring-primary/40",
        !isClosed && "cursor-pointer"
      )}
      title={item.possible_duplicate ? item.duplicate_note : undefined}
      onClick={(e) => {
        if (isClosed) return;
        const el = e.target as HTMLElement;
        // Ignore clicks on interactive controls inside the row
        if (el.closest('input, textarea, button, a, select, label, [role="combobox"], [role="button"], [role="option"], [data-radix-popper-content-wrapper]')) return;
        onToggleSelected();
      }}
    >
      <TableCell className="px-1 py-1.5 align-middle">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          disabled={isClosed}
          aria-label="Selecionar lançamento"
          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </TableCell>
      <TableCell className="text-xs px-1 py-1.5 align-middle whitespace-nowrap">
        {(() => {
          const refFirst = referenceYM ? `${referenceYM}-01` : "";
          const posted = item.posted_date || "";
          let daysDiff = 0;
          if (refFirst && posted) {
            const rf = new Date(`${refFirst}T12:00:00`).getTime();
            const pd = new Date(`${posted}T12:00:00`).getTime();
            daysDiff = Math.round((rf - pd) / 86400000);
          }
          const misaligned = daysDiff > 30;
          return (
            <div className="flex items-center gap-1">
              <span>{formatDateBR(item.posted_date)}</span>
              {misaligned && !isClosed && (
                <button
                  type="button"
                  onClick={() => onUpdate(idx, { posted_date: refFirst })}
                  title={`Data original ${daysDiff} dias antes da fatura ${referenceYM}. Clique para ajustar para ${formatDateBR(refFirst)} (competência da fatura).`}
                  className="inline-flex items-center justify-center h-5 w-5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600"
                >
                  <AlertTriangle className="h-3 w-3" />
                </button>
              )}
              {misaligned && isClosed && (
                <span
                  title={`Data original ${daysDiff} dias antes da fatura ${referenceYM}.`}
                  className="inline-flex items-center justify-center h-5 w-5 text-amber-600"
                >
                  <AlertTriangle className="h-3 w-3" />
                </span>
              )}
            </div>
          );
        })()}
      </TableCell>
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
          className="h-7 text-[11px] w-full min-w-0"
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
      <TableCell className="px-1 py-1.5 align-middle">
        <div className="flex items-center gap-1 justify-end">
          <div className="flex items-center gap-1 shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
            <Input
              type="text"
              inputMode="numeric"
              maxLength={3}
              className="h-7 text-[11px] w-10 px-1 text-center"
              value={item.parcela_atual ?? ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                onUpdate(idx, { parcela_atual: raw === "" ? null : parseInt(raw, 10) });
              }}
              disabled={isClosed || item.parcelas_expandidas}
              title="Parcela atual"
              placeholder="00"
            />
            <span>/</span>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={3}
              className="h-7 text-[11px] w-10 px-1 text-center"
              value={item.parcela_total ?? ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                onUpdate(idx, { parcela_total: raw === "" ? null : parseInt(raw, 10) });
              }}
              disabled={isClosed || item.parcelas_expandidas}
              title="Total de parcelas"
              placeholder="00"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={
              isClosed || expanding ||
              item.parcelas_expandidas ||
              !item.parcela_atual || !item.parcela_total ||
              (item.parcela_total ?? 0) < 2
            }
            onClick={onExpandParcelas}
            title={item.parcelas_expandidas ? "Parcelas já geradas para este lançamento" : "Gerar parcelas anteriores e posteriores nas faturas correspondentes"}
          >
            <Layers className="w-3 h-3" />
          </Button>
        </div>
      </TableCell>

      <TableCell className="text-right text-xs font-medium px-1 py-1.5 align-middle whitespace-nowrap">
        {formatCurrency(item.amount)}
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle">
        {item.possible_duplicate ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-1.5">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-600 shrink-0" />
              <div className="min-w-0 space-y-1">
                <div className="text-[10px] text-amber-800 dark:text-amber-200 leading-tight">
                  {item.duplicate_note}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] border-amber-300 hover:bg-amber-100 text-amber-900"
                    disabled={isClosed}
                    onClick={() => onRemove(idx)}
                    title="Remover este lançamento importado (já existe outro igual)"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Excluir
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] border-amber-300 hover:bg-amber-100 text-amber-900"
                    disabled={isClosed}
                    onClick={() => onUpdate(idx, { possible_duplicate: false, duplicate_note: undefined })}
                    title="Manter este lançamento (não é duplicidade)"
                  >
                    <Check className="w-3 h-3 mr-1" /> Manter
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
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


