import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSortableTable, type SortState } from "@/hooks/useSortableTable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Upload, Trash2, FileText, Check, ChevronsUpDown, Search, Plus, Users, Layers, ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle, Split, X, Pencil } from "lucide-react";
import { exportToCsv } from "@/lib/csvExport";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { parseOfx, parseParcelaFromDescription, type OfxTransaction } from "@/lib/ofxParser";
import { formatCurrency, maskCurrency, unmaskCurrency } from "@/lib/masks";
import { getLocalDateISO, formatDateBR, safeParseDateISO } from "@/lib/date";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { MonthPicker } from "@/components/MonthPicker";
import { cn } from "@/lib/utils";
import { PlanoContasCombobox as SharedPlanoContasCombobox } from "./PlanoContasCombobox";
import { FiscalDocImportDialog, type FiscalDocResult } from "./FiscalDocImportDialog";
import { LinkPayableDialog } from "./LinkPayableDialog";
import { registerCardDischarge, revertCardDischarge, type OpenPayableOption } from "@/services/creditCardPayableLink";



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

import VehicleRateioEditor from "./VehicleRateioEditor";
import { type RateioRow, validateRateio, sumRateio, distribuirIgualmente } from "@/lib/rateio";
import ManualItemsEditor, { type ManualItem, newManualUid, gruposInvalidosManual, somaItens, rateioFromItens } from "./ManualItemsEditor";

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
  /** Apenas da sessão: indica que a data informada já foi convertida antes do INSERT. */
  data_matriz_aplicada?: boolean;
  // Vínculo fiscal (NF-e / NFS-e) — a obrigação de pagamento permanece na fatura do cartão
  documento_fiscal_tipo?: string | null;
  documento_fiscal_numero?: string | null;
  chave_nfe?: string | null;
  fornecedor_cnpj?: string | null;
  itens_nota?: any;
  xml_original?: string | null;
  rateio_veiculos?: RateioRow[] | null;
  possible_duplicate?: boolean;
  duplicate_note?: string;
  /** Vínculo com Contas a Pagar: a conta é quitada sem caixa e a dívida vive na fatura. */
  origem_expense_id?: string | null;
  origem_payment_id?: string | null;
  origem_installment_id?: string | null;
  origem_tipo?: string | null;
  /** Apenas da sessão: rótulo da conta vinculada e estado pendente de gravação. */
  origem_descricao?: string | null;
  origem_pendente?: boolean;
}


interface VehicleOption { id: string; plate: string; }

/** Alteração manual de Data de Emissão em um item que pertence a um parcelamento. */
interface DateChange {
  item: ItemRow;
  oldDate: string;
  newDate: string;
}


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
  /** Confirmação de replicação de Data de Emissão entre parcelas do mesmo agrupamento. */
  const [cascadeAsk, setCascadeAsk] = useState<{ closeNow: boolean; changes: DateChange[] } | null>(null);
  const [cascadeRunning, setCascadeRunning] = useState(false);
  const [emissaoAsk, setEmissaoAsk] = useState<{
    row: ItemRow;
    informada: string;
    parcelaAtual: number;
    parcelaTotal: number;
  } | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);

  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [existingExpenseId, setExistingExpenseId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string>("aberta");
  const [createPersonOpenIdx, setCreatePersonOpenIdx] = useState<number | null>(null);
  
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [batchPickerOpen, setBatchPickerOpen] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [expandProgress, setExpandProgress] = useState<{ current: number; total: number; message: string }>({ current: 0, total: 0, message: "" });
  /** Guarda o id da fatura criada durante a geração automática de parcelas (evita duplicar a fatura no save). */
  const createdInvoiceIdRef = useRef<string | null>(null);

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
        data_matriz_aplicada: true,
        documento_fiscal_tipo: r.documento_fiscal_tipo ?? null,
        documento_fiscal_numero: r.documento_fiscal_numero ?? null,
        chave_nfe: r.chave_nfe ?? null,
        fornecedor_cnpj: r.fornecedor_cnpj ?? null,
        itens_nota: r.itens_nota ?? null,
        xml_original: r.xml_original ?? null,
        rateio_veiculos: (r.rateio_veiculos as any) ?? null,
        origem_expense_id: r.origem_expense_id ?? null,
        origem_payment_id: r.origem_payment_id ?? null,
        origem_installment_id: r.origem_installment_id ?? null,
        origem_tipo: r.origem_tipo ?? null,
        origem_descricao: null as string | null,
      }));

      // Rótulo das contas a pagar vinculadas (para exibição na coluna de conferência)
      const origemIds = Array.from(
        new Set(mapped.map((m) => m.origem_expense_id).filter(Boolean) as string[]),
      );
      if (origemIds.length > 0) {
        const { data: exps } = await supabase
          .from("expenses")
          .select("id, descricao")
          .in("id", origemIds);
        const byId = new Map(((exps as any[]) || []).map((e) => [e.id, e.descricao]));
        mapped.forEach((m) => {
          if (m.origem_expense_id) m.origem_descricao = byId.get(m.origem_expense_id) || null;
        });
      }

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
        data_matriz_aplicada: false,
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

  /** Vincula o lançamento do cartão a uma conta a pagar em aberto (baixa efetivada ao salvar). */
  const linkPayable = useCallback((idx: number, opt: OpenPayableOption) => {
    setItems((prev) => prev.map((it, i) => i !== idx ? it : {
      ...it,
      origem_expense_id: opt.expense_id,
      origem_installment_id: opt.installment_id,
      origem_payment_id: it.origem_payment_id ?? null,
      origem_tipo: "vinculo",
      origem_descricao: opt.descricao,
      origem_pendente: !it.origem_payment_id,
      plano_contas_id: it.plano_contas_id || opt.plano_contas_id,
      centro_custo: it.centro_custo || (opt.centro_custo || ""),
      favorecido_id: it.favorecido_id || opt.favorecido_id,
      favorecido_nome: it.favorecido_nome || (opt.favorecido_nome || ""),
    }));
    toast.success("Conta vinculada. A baixa (sem caixa) será efetivada ao salvar a fatura.");
  }, []);

  /** Remove o vínculo — a conta volta ao Contas a Pagar quando a fatura for salva. */
  const unlinkPayable = useCallback((idx: number) => {
    setItems((prev) => prev.map((it, i) => i !== idx ? it : {
      ...it,
      origem_expense_id: null,
      origem_installment_id: null,
      origem_payment_id: null,
      origem_tipo: null,
      origem_descricao: null,
      origem_pendente: false,
    }));
    toast.message("Vínculo removido. A conta será reaberta ao salvar a fatura.");
  }, []);



  // Modal de novo lançamento manual
  interface ManualForm {
    posted_date: string;
    description: string;
    amount: string; // masked currency string
    amount_mode: "parcela" | "total";
    parcela_atual: string;
    parcela_total: string;
    plano_contas_id: string | null;
    favorecido_id: string | null;
    favorecido_nome: string;
  }
  const emptyManualForm = (): ManualForm => {
    const [y, m] = referenceYM.split("-").map(Number);
    const today = new Date();
    const defaultDate =
      y && m && (today.getFullYear() !== y || today.getMonth() + 1 !== m)
        ? `${y}-${String(m).padStart(2, "0")}-${String(Math.min(today.getDate(), 28)).padStart(2, "0")}`
        : getLocalDateISO();
    return {
      posted_date: defaultDate,
      description: "",
      amount: "",
      amount_mode: "parcela",
      parcela_atual: "",
      parcela_total: "",
      plano_contas_id: null,
      favorecido_id: null,
      favorecido_nome: "",
    };
  };
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  /** null = criando novo lançamento; número = editando o item nesse índice. */
  const [manualEditIdx, setManualEditIdx] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState<ManualForm>(emptyManualForm);
  const [manualItens, setManualItens] = useState<ManualItem[]>([]);
  const [manualItemSel, setManualItemSel] = useState<string[]>([]);
  const [manualNovoItem, setManualNovoItem] = useState({ desc: "", qtd: "1", valor: "" });

  // Quando o usuário informa o valor TOTAL da compra, calcula o valor da parcela
  const manualParcelaCalc = useMemo(() => {
    const valor = Number(unmaskCurrency(manualForm.amount)) || 0;
    const nParcelas = Number(manualForm.parcela_total) || 0;
    const atual = Number(manualForm.parcela_atual) || 0;
    if (manualForm.amount_mode !== "total" || valor <= 0 || nParcelas <= 0) {
      return { valorParcela: valor, valorTotal: valor * (nParcelas || 1), ajustada: false };
    }
    const totalCents = Math.round(valor * 100);
    const baseCents = Math.floor(totalCents / nParcelas);
    const restoCents = totalCents - baseCents * nParcelas;
    const isUltima = atual > 0 && atual === nParcelas;
    const parcelaCents = isUltima ? baseCents + restoCents : baseCents;
    return {
      valorParcela: parcelaCents / 100,
      valorTotal: valor,
      ajustada: isUltima && restoCents > 0,
    };
  }, [manualForm.amount, manualForm.amount_mode, manualForm.parcela_total, manualForm.parcela_atual]);

  /** Valor efetivamente lançado nesta fatura (o que os itens precisam fechar) */
  const manualValorLancado = useMemo(() => {
    const informado = Number(unmaskCurrency(manualForm.amount)) || 0;
    return manualForm.amount_mode === "total" ? manualParcelaCalc.valorParcela : informado;
  }, [manualForm.amount, manualForm.amount_mode, manualParcelaCalc]);

  const manualItensOk = useMemo(() => {
    if (manualItens.length === 0) return true;
    if (gruposInvalidosManual(manualItens).length > 0) return false;
    return Math.abs(somaItens(manualItens) - Number(manualValorLancado.toFixed(2))) < 0.01;
  }, [manualItens, manualValorLancado]);

  const addManualItem = useCallback(() => {
    setManualEditIdx(null);
    setManualForm(emptyManualForm());
    setManualItens([]);
    setManualItemSel([]);
    setManualNovoItem({ desc: "", qtd: "1", valor: "" });
    setManualDialogOpen(true);
  }, [referenceYM]);

  /** Abre o mesmo modal em modo de edição, carregando os dados do lançamento selecionado. */
  const editManualItem = useCallback((idx: number) => {
    const item = items[idx];
    if (!item) return;
    setManualEditIdx(idx);
    setManualForm({
      posted_date: item.posted_date,
      description: item.description || "",
      amount: maskCurrency(Number(item.amount || 0).toFixed(2).replace(".", ",")),
      amount_mode: "parcela",
      parcela_atual: item.parcela_atual ? String(item.parcela_atual) : "",
      parcela_total: item.parcela_total ? String(item.parcela_total) : "",
      plano_contas_id: item.plano_contas_id,
      favorecido_id: item.favorecido_id,
      favorecido_nome: item.favorecido_nome || "",
    });
    const itens = Array.isArray(item.itens_nota) ? (item.itens_nota as any[]) : [];
    setManualItens(
      itens.map((i: any): ManualItem => ({
        uid: newManualUid("edit"),
        descricao: i.descricao || "",
        quantidade: Number(i.quantidade || 1),
        valor_unitario: Number(i.valor_unitario || 0),
        valor_total: Number(i.valor_total || 0),
        veiculo_id: i.veiculo_id || null,
      }))
    );
    setManualItemSel([]);
    setManualNovoItem({ desc: "", qtd: "1", valor: "" });
    setManualDialogOpen(true);
  }, [items]);




  const confirmManualItem = useCallback(() => {
    const desc = manualForm.description.trim();
    if (!desc) { toast.error("Informe a descrição do lançamento."); return; }
    const informado = Number(unmaskCurrency(manualForm.amount));
    if (!informado || informado <= 0) { toast.error("Informe um valor válido."); return; }
    if (!manualForm.posted_date) { toast.error("Informe a data do lançamento."); return; }
    const parcelaAtual = manualForm.parcela_atual ? Number(manualForm.parcela_atual) : null;
    const parcelaTotal = manualForm.parcela_total ? Number(manualForm.parcela_total) : null;
    if ((parcelaAtual && !parcelaTotal) || (!parcelaAtual && parcelaTotal)) {
      toast.error("Preencha parcela atual e total juntos (ou deixe ambos em branco).");
      return;
    }
    if (parcelaAtual && parcelaTotal && parcelaAtual > parcelaTotal) {
      toast.error("Parcela atual não pode ser maior que o total.");
      return;
    }
    if (manualForm.amount_mode === "total" && !parcelaTotal) {
      toast.error("Informe o total de parcelas para calcular o valor da parcela.");
      return;
    }
    const amountNum = manualForm.amount_mode === "total" ? manualParcelaCalc.valorParcela : informado;
    if (!amountNum || amountNum <= 0) { toast.error("Valor da parcela inválido."); return; }
    if (manualItens.length > 0) {
      if (gruposInvalidosManual(manualItens).length > 0) {
        toast.error("As quantidades desmembradas não conferem com o item original.");
        return;
      }
      if (Math.abs(somaItens(manualItens) - Number(amountNum.toFixed(2))) >= 0.01) {
        toast.error("A soma dos itens precisa ser igual ao valor do lançamento.");
        return;
      }
    }
    const rateio = manualItens.length > 0 ? rateioFromItens(manualItens, amountNum) : [];
    const dataInformada = safeParseDateISO(manualForm.posted_date);
    if (!dataInformada) { toast.error("Informe uma data válida para o lançamento."); return; }

    const itensNota = manualItens.length > 0
      ? manualItens.map((i) => ({
          descricao: i.descricao,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          valor_total: i.valor_total,
          veiculo_id: i.veiculo_id || null,
        }))
      : null;

    if (manualEditIdx !== null) {
      // Edição: mantém a data exatamente como informada (sem recalcular Data Matriz em registro existente).
      const idx = manualEditIdx;
      setItems((prev) => prev.map((it, i) => i === idx ? {
        ...it,
        posted_date: manualForm.posted_date,
        description: desc,
        amount: amountNum,
        plano_contas_id: manualForm.plano_contas_id,
        favorecido_id: manualForm.favorecido_id,
        favorecido_nome: manualForm.favorecido_nome,
        parcela_atual: parcelaAtual,
        parcela_total: parcelaTotal,
        itens_nota: itensNota ?? it.itens_nota ?? null,
        rateio_veiculos: rateio.length > 0 ? rateio : it.rateio_veiculos ?? null,
      } : it));
      setManualDialogOpen(false);
      setManualEditIdx(null);
      toast.success("Lançamento atualizado. Salve a fatura para gravar.");
      return;
    }

    // Sem correção automática: a data informada é preservada. Se for parcela > 1,
    // o usuário confirma se a data informada é a correta e se vale para todas as parcelas.
    const newRow: ItemRow = {
      fitid: `manual-${crypto.randomUUID()}`,
      posted_date: manualForm.posted_date,
      description: desc,
      amount: amountNum,
      plano_contas_id: manualForm.plano_contas_id,
      centro_custo: "",
      favorecido_id: manualForm.favorecido_id,
      favorecido_nome: manualForm.favorecido_nome,
      veiculo_id: null,
      observacoes: "",
      parcela_atual: parcelaAtual,
      parcela_total: parcelaTotal,
      parcelas_expandidas: false,
      data_matriz_aplicada: true,
      itens_nota: itensNota,
      rateio_veiculos: rateio.length > 0 ? rateio : null,
    };

    if (parcelaAtual && parcelaAtual > 1) {
      setEmissaoAsk({
        row: newRow,
        informada: manualForm.posted_date,
        parcelaAtual,
        parcelaTotal: parcelaTotal || 0,
      });
      setManualDialogOpen(false);
      return;
    }

    setItems((prev) => [newRow, ...prev]);
    setManualDialogOpen(false);
    toast.success("Lançamento adicionado à fatura.");
  }, [manualForm, manualParcelaCalc, manualItens, manualEditIdx]);

  // ----- Nota Fiscal (NF-e / NFS-e) vinculada ao lançamento do cartão -----
  const [fiscalDialogOpen, setFiscalDialogOpen] = useState(false);
  const [fiscalAttachIdx, setFiscalAttachIdx] = useState<number | null>(null);
  const [rateioIdx, setRateioIdx] = useState<number | null>(null);
  const [linkIdx, setLinkIdx] = useState<number | null>(null);

  const [pendingExpandFitid, setPendingExpandFitid] = useState<string | null>(null);

  const handleFiscalConfirm = useCallback((data: FiscalDocResult) => {
    const fiscalPatch = {
      documento_fiscal_tipo: data.tipo,
      documento_fiscal_numero: data.numero || null,
      chave_nfe: data.chave || null,
      fornecedor_cnpj: data.fornecedor_cnpj || null,
      itens_nota: data.itens.length ? data.itens : null,
      xml_original: data.xml_original || null,
      rateio_veiculos: data.rateio && data.rateio.length > 0 ? data.rateio : null,
    };

    if (fiscalAttachIdx !== null) {
      setItems((prev) => prev.map((it, i) => (
        i === fiscalAttachIdx
          ? {
              ...it,
              ...fiscalPatch,
              veiculo_id: data.rateio && data.rateio.length > 0 ? null : it.veiculo_id,
              favorecido_id: it.favorecido_id || data.fornecedor_id,
              favorecido_nome: it.favorecido_nome?.trim() || data.fornecedor_nome,
              observacoes: it.observacoes?.trim()
                || `${data.tipo === "nfse" ? "NFS-e" : "NF-e"} ${data.numero}`,
            }
          : it
      )));
      setFiscalAttachIdx(null);
      toast.success("Nota fiscal vinculada ao lançamento.");
      return;
    }

    const fitid = `fiscal-${crypto.randomUUID()}`;
    const newRow: ItemRow = {
      fitid,
      posted_date: data.data_emissao,
      description: data.descricao,
      amount: data.valor_parcela,
      plano_contas_id: data.plano_contas_id,
      centro_custo: data.centro_custo || "",
      favorecido_id: data.fornecedor_id,
      favorecido_nome: data.fornecedor_nome || "",
      veiculo_id: null,
      observacoes: `${data.tipo === "nfse" ? "NFS-e" : "NF-e"} ${data.numero}`,
      parcela_atual: data.parcela_atual,
      parcela_total: data.parcela_total,
      parcelas_expandidas: false,
      data_matriz_aplicada: true,
      ...fiscalPatch,
    };
    setItems((prev) => [newRow, ...prev]);
    toast.success("Lançamento fiscal adicionado à fatura.");
    if (data.expandir) setPendingExpandFitid(fitid);
  }, [fiscalAttachIdx]);



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

  /** Identifica todos os ids do banco que pertencem ao mesmo agrupamento de parcelas. */
  const findInstallmentGroupIds = async (anchor: ItemRow): Promise<string[]> => {
    const totalP = Number(anchor.parcela_total || 0);
    if (totalP <= 1) return anchor.id ? [anchor.id] : [];
    const { data, error } = await supabase
      .from("credit_card_invoice_items" as any)
      .select("id, description, amount, favorecido_id, favorecido_nome, parcela_total")
      .eq("parcela_total", totalP);
    if (error) throw error;
    const targetNorm = normalizeInstallmentText(anchor.description);
    const targetFav = (anchor.favorecido_id || anchor.favorecido_nome || "").toLowerCase().trim();
    return ((data as any[]) || [])
      .filter((r) => {
        if (normalizeInstallmentText(r.description || "") !== targetNorm) return false;
        const fav = (r.favorecido_id || r.favorecido_nome || "").toLowerCase().trim();
        if (targetFav && fav && fav !== targetFav) return false;
        return amountsClose(Number(r.amount || 0), Number(anchor.amount || 0));
      })
      .map((r) => r.id as string);
  };

  const removeSelected = useCallback(async () => {
    if (selectedIdxs.size === 0) return;

    const selectedItems = Array.from(selectedIdxs).map((i) => items[i]).filter(Boolean);
    const parcelados = selectedItems.filter((it) => Number(it.parcela_total || 0) > 1);

    if (parcelados.length > 0) {
      const ok = await confirm({
        title: "Excluir parcelas do agrupamento?",
        description:
          `${parcelados.length} lançamento(s) selecionado(s) faz(em) parte de parcelamentos.\n\n` +
          `Deseja excluir TODAS as parcelas desses grupos em todas as faturas do cartão, ` +
          `ou apenas os itens selecionados nesta fatura?`,
        confirmLabel: "Todas as parcelas",
        cancelLabel: "Apenas selecionados",
        variant: "destructive",
      });

      if (ok) {
        // Excluir todas as parcelas de cada agrupamento distinto.
        const processedKeys = new Set<string>();
        let totalDeleted = 0;
        try {
          for (const it of parcelados) {
            const key = `${(it.favorecido_id || it.favorecido_nome || "").toLowerCase().trim()}|${normalizeInstallmentText(it.description)}|${it.parcela_total}|${Math.round(Number(it.amount || 0) * 100)}`;
            if (processedKeys.has(key)) continue;
            processedKeys.add(key);
            const ids = await findInstallmentGroupIds(it);
            if (ids.length > 0) {
              const { error } = await supabase.from("credit_card_invoice_items" as any).delete().in("id", ids);
              if (error) throw error;
              totalDeleted += ids.length;
            }
          }
          toast.success(`${totalDeleted} parcela(s) removida(s) do agrupamento.`);
          setItems((prev) => prev.filter((_, i) => !selectedIdxs.has(i)));
          setOriginalItems((prev) => prev.filter((_, i) => !selectedIdxs.has(i)));
          setSelectedIdxs(new Set());
          await reloadCurrentInvoiceItems();
          onSaved();
          return;
        } catch (err: any) {
          console.error(err);
          toast.error(err.message || "Erro ao excluir parcelas do agrupamento.");
          return;
        }
      }
      // Se "Apenas selecionados", continua para a confirmação normal abaixo.
    }

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
  }, [selectedIdxs, confirm, items]);

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
    if (createdInvoiceIdRef.current) return createdInvoiceIdRef.current;
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
    createdInvoiceIdRef.current = (newInv as any).id;
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

    // A fórmula é exclusiva de lançamentos novos. Registros persistidos nunca
    // têm sua data histórica recalculada durante uma expansão posterior.
    const matrixPosted = !item.id && !item.data_matriz_aplicada
      ? shiftDate(item.posted_date, -(cur - 1))
      : item.posted_date;

    const baseDesc = item.description;
    const newDescCurrent = buildDescription(baseDesc, cur, totalP);
    onStep(1, `Salvando parcela atual (${cur}/${totalP})...`);
    setItems((prev) => prev.map((it, i) => i === idx
      ? { ...it, description: newDescCurrent, posted_date: matrixPosted, data_matriz_aplicada: true }
      : it));


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
          documento_fiscal_tipo: item.documento_fiscal_tipo || null,
          documento_fiscal_numero: item.documento_fiscal_numero || null,
          chave_nfe: item.chave_nfe || null,
          fornecedor_cnpj: item.fornecedor_cnpj || null,
          itens_nota: item.itens_nota ?? null,
          xml_original: item.xml_original || null,
          rateio_veiculos: (item.rateio_veiculos && item.rateio_veiculos.length > 0) ? (item.rateio_veiculos as any) : null,
        })
        .eq("id", item.id);
      if (updErr) throw updErr;
    } else {
      const { data: insertedCur, error: insErr } = await supabase
        .from("credit_card_invoice_items" as any)
        .insert({
          invoice_id: currentInvoiceId,
          posted_date: matrixPosted,
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
          documento_fiscal_tipo: item.documento_fiscal_tipo || null,
          documento_fiscal_numero: item.documento_fiscal_numero || null,
          chave_nfe: item.chave_nfe || null,
          fornecedor_cnpj: item.fornecedor_cnpj || null,
          itens_nota: item.itens_nota ?? null,
          xml_original: item.xml_original || null,
          rateio_veiculos: (item.rateio_veiculos && item.rateio_veiculos.length > 0) ? (item.rateio_veiculos as any) : null,
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
      // Emissão estática: todas as parcelas herdam a Data Matriz.
      const targetPosted = matrixPosted;

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
        documento_fiscal_tipo: item.documento_fiscal_tipo || null,
        documento_fiscal_numero: item.documento_fiscal_numero || null,
        chave_nfe: item.chave_nfe || null,
        fornecedor_cnpj: item.fornecedor_cnpj || null,
        itens_nota: item.itens_nota ?? null,
        xml_original: item.xml_original || null,
        rateio_veiculos: (item.rateio_veiculos && item.rateio_veiculos.length > 0) ? item.rateio_veiculos : null,
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
        documento_fiscal_tipo: targetItem.documento_fiscal_tipo || null,
        documento_fiscal_numero: targetItem.documento_fiscal_numero || null,
        chave_nfe: targetItem.chave_nfe || null,
        fornecedor_cnpj: targetItem.fornecedor_cnpj || null,
        itens_nota: targetItem.itens_nota ?? null,
        xml_original: targetItem.xml_original || null,
      };

      if (existingMatch) {
        // Já existe: mantém data e valor históricos; corrige somente a numeração.
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

  const reloadCurrentInvoiceItems = async (idOverride?: string): Promise<ItemRow[] | null> => {
    const targetId = idOverride || invoiceId || createdInvoiceIdRef.current;
    if (!targetId) return null;
    const { data: rows } = await supabase
      .from("credit_card_invoice_items" as any)
      .select("*")
      .eq("invoice_id", targetId)
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
      data_matriz_aplicada: true,
      documento_fiscal_tipo: r.documento_fiscal_tipo ?? null,
      documento_fiscal_numero: r.documento_fiscal_numero ?? null,
      chave_nfe: r.chave_nfe ?? null,
      fornecedor_cnpj: r.fornecedor_cnpj ?? null,
      itens_nota: r.itens_nota ?? null,
      xml_original: r.xml_original ?? null,
      rateio_veiculos: (r.rateio_veiculos as any) ?? null,
    }));
    setItems(mapped);
    setOriginalItems(mapped);
    return mapped as ItemRow[];
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

  // Após adicionar um lançamento fiscal parcelado, replica automaticamente
  // as parcelas nas faturas do cartão (mês a mês).
  useEffect(() => {
    if (!pendingExpandFitid) return;
    const idx = items.findIndex((it) => it.fitid === pendingExpandFitid);
    if (idx < 0) return;
    setPendingExpandFitid(null);
    void expandParcelas(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExpandFitid, items]);



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
    const totalAnteriores = targets.reduce((s, t) => s + Math.max(0, Number(t.item.parcela_atual || 0) - 1), 0);
    const totalPosteriores = targets.reduce(
      (s, t) => s + Math.max(0, Number(t.item.parcela_total || 0) - Number(t.item.parcela_atual || 0)),
      0,
    );
    const ok = await confirm({
      title: `Gerar parcelas em lote — ${targets.length} lançamento(s)?`,
      description:
        `Serão processados ${targets.length} lançamento(s), gerando ${totalMissing} parcela(s) no cartão "${cardName}":\n` +
        `• ${totalAnteriores} em faturas ANTERIORES\n• ${totalPosteriores} em faturas POSTERIORES\n\n` +
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

  /**
   * Lançamentos parcelados (parcela X/N com N > 1) que ainda não tiveram as
   * parcelas anteriores/posteriores geradas nas demais faturas do cartão.
   */
  const pendingInstallments = useMemo(
    () =>
      items
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) =>
          Number(item.parcela_total || 0) > 1 &&
          Number(item.parcela_atual || 0) >= 1 &&
          !item.parcelas_expandidas
        ),
    [items],
  );

  /**
   * Gera automaticamente as parcelas pendentes. Retorna a lista atualizada de itens
   * (recarregada do banco) ou null em caso de falha/validação.
   */
  const generatePendingInstallments = async (
    targets: Array<{ idx: number; item: ItemRow }>,
  ): Promise<ItemRow[] | null> => {
    const invalid = targets
      .map(({ item }) => ({ item, err: validateItemForExpansion(item) }))
      .filter((x) => !!x.err);
    if (invalid.length > 0) {
      toast.error(
        `Complete os dados antes de salvar: ${invalid
          .map(({ item, err }) => `"${(item.description || "").slice(0, 30)}" — ${err}`)
          .join(" | ")}`,
        { duration: 9000 },
      );
      return null;
    }

    const totalSteps = targets.reduce((s, t) => s + Number(t.item.parcela_total || 0), 0) + 1;
    let currentStep = 0;
    setExpanding(true);
    setExpandProgress({ current: 0, total: totalSteps, message: "Gerando parcelas..." });
    try {
      const currentInvoiceId = await ensureCurrentInvoiceId();
      let done = 0;
      for (const { idx, item } of targets) {
        await runItemExpansion(item, idx, currentInvoiceId, (delta, message) => {
          currentStep += delta;
          setExpandProgress({ current: currentStep, total: totalSteps, message: `[${done + 1}/${targets.length}] ${message}` });
        });
        done++;
      }
      setExpandProgress({ current: totalSteps, total: totalSteps, message: "Atualizando fatura..." });
      const fresh = await reloadCurrentInvoiceItems(currentInvoiceId);
      onSaved();
      return fresh;
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao gerar as parcelas.");
      return null;
    } finally {
      setExpanding(false);
      setExpandProgress({ current: 0, total: 0, message: "" });
    }
  };




  /** Itens persistidos, pertencentes a um parcelamento, cuja Data de Emissão foi alterada manualmente. */
  const getInstallmentDateChanges = useCallback((): DateChange[] => {
    const byId = new Map(originalItems.filter((o) => o.id).map((o) => [o.id as string, o]));
    return items.reduce<DateChange[]>((acc, it) => {
      if (!it.id) return acc;
      const orig = byId.get(it.id);
      if (!orig || orig.posted_date === it.posted_date) return acc;
      if (Number(it.parcela_total || 0) <= 1) return acc;
      acc.push({ item: it, oldDate: orig.posted_date, newDate: it.posted_date });
      return acc;
    }, []);
  }, [items, originalItems]);

  /**
   * Replica a nova Data de Emissão para todas as parcelas do mesmo agrupamento
   * (mesmo favorecido + mesma descrição normalizada + mesmo total de parcelas + valor equivalente),
   * em qualquer fatura. Somente sob confirmação explícita do gestor.
   */
  const applyCascadeDates = async (changes: DateChange[]) => {
    let updated = 0;
    for (const change of changes) {
      const totalP = Number(change.item.parcela_total || 0);
      if (totalP <= 1) continue;
      const { data, error } = await supabase
        .from("credit_card_invoice_items" as any)
        .select("id, description, amount, favorecido_id, favorecido_nome, parcela_total, posted_date")
        .eq("parcela_total", totalP);
      if (error) throw error;

      const targetNorm = normalizeInstallmentText(change.item.description);
      const targetFav = (change.item.favorecido_id || change.item.favorecido_nome || "").toLowerCase().trim();

      const ids = ((data as any[]) || [])
        .filter((r) => {
          if (r.id === change.item.id) return false;
          if (r.posted_date === change.newDate) return false;
          const fav = (r.favorecido_id || r.favorecido_nome || "").toLowerCase().trim();
          if (targetFav && fav && fav !== targetFav) return false;
          if (normalizeInstallmentText(r.description || "") !== targetNorm) return false;
          return amountsClose(Number(r.amount || 0), Number(change.item.amount || 0));
        })
        .map((r) => r.id as string);

      if (ids.length === 0) continue;
      const { error: upErr } = await supabase
        .from("credit_card_invoice_items" as any)
        .update({ posted_date: change.newDate })
        .in("id", ids);
      if (upErr) throw upErr;
      updated += ids.length;
    }
    return updated;
  };

  const persistInvoice = async (
    closeNow: boolean,
    cascadeMode?: "single" | "all",
    itemsOverride?: ItemRow[],
  ) => {
    const workItems = itemsOverride ?? items;
    const workTotal = workItems.reduce((s, i) => s + Number(i.amount || 0), 0);
    if (!cardName.trim()) { toast.error("Selecione o banco/cartão."); return; }
    if (!dueDate) { toast.error("Informe o vencimento da fatura."); return; }
    if (closeNow && workItems.length === 0) { toast.error("Adicione lançamentos antes de fechar."); return; }
    if (closeNow && workItems.some((i) => !i.plano_contas_id)) {
      toast.error("Classifique todos os lançamentos com plano de contas antes de fechar.");
      return;
    }

    // Bloqueio: nenhum lançamento parcelado pode ficar sem as parcelas anteriores/posteriores geradas.
    if (!itemsOverride && pendingInstallments.length > 0) {
      const anteriores = pendingInstallments.reduce((s, t) => s + Math.max(0, Number(t.item.parcela_atual || 0) - 1), 0);
      const posteriores = pendingInstallments.reduce(
        (s, t) => s + Math.max(0, Number(t.item.parcela_total || 0) - Number(t.item.parcela_atual || 0)),
        0,
      );
      const ok = await confirm({
        title: "Parcelamento pendente de geração",
        description:
          `${pendingInstallments.length} lançamento(s) parcelado(s) ainda não possuem as demais parcelas no sistema.\n` +
          `A fatura só pode ser salva após a geração automática de:\n` +
          `• ${anteriores} parcela(s) em faturas ANTERIORES\n• ${posteriores} parcela(s) em faturas POSTERIORES\n\n` +
          `Faturas destino já fechadas e quitadas serão ESTORNADAS automaticamente para receber os lançamentos.`,
        confirmLabel: "Gerar parcelas e salvar",
      });
      if (!ok) {
        toast.error("A fatura não pode ser salva com parcelamentos pendentes de geração.");
        return;
      }
      const fresh = await generatePendingInstallments(pendingInstallments);
      if (!fresh) return;
      await persistInvoice(closeNow, cascadeMode, fresh);
      return;
    }

    const dateChanges = getInstallmentDateChanges();
    if (!cascadeMode && !itemsOverride && dateChanges.length > 0) {
      setCascadeAsk({ closeNow, changes: dateChanges });
      return;
    }

    closeNow ? setClosing(true) : setSaving(true);
    try {
      let id = invoiceId || createdInvoiceIdRef.current || null;


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
        total_amount: workTotal,
        status: preservedStatus,
        ofx_file_name: ofxFileName || null,
        ofx_bank_name: ofxBank || null,
        ofx_account_id: ofxAccountId || null,
        observacoes: observacoes.trim() || null,
      };

      // ---- Vínculos com Contas a Pagar ----
      // 1) Itens removidos da fatura que quitavam uma conta → estorna a baixa.
      const keptPaymentIds = new Set(
        workItems.map((i) => i.origem_payment_id).filter(Boolean) as string[],
      );
      for (const orig of originalItems) {
        if (orig.origem_payment_id && !keptPaymentIds.has(orig.origem_payment_id)) {
          await revertCardDischarge({
            paymentId: orig.origem_payment_id,
            expenseId: orig.origem_expense_id as string,
            installmentId: orig.origem_installment_id || null,
          });
        }
      }
      // 2) Vínculos criados nesta sessão → registra a baixa (sem caixa) na conta a pagar.
      for (const it of workItems) {
        if (it.origem_pendente && it.origem_expense_id && !it.origem_payment_id) {
          it.origem_payment_id = await registerCardDischarge({
            expenseId: it.origem_expense_id,
            installmentId: it.origem_installment_id || null,
            valor: Number(it.amount || 0),
            dataPagamento: it.posted_date,
            userId: user?.id,
            observacoes: `Quitada pelo lançamento do cartão ${cardName.trim()} — ${it.description}`,
          });
          it.origem_pendente = false;
        }
      }

      const rows = workItems.map((it) => ({
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
        documento_fiscal_tipo: it.documento_fiscal_tipo || null,
        documento_fiscal_numero: it.documento_fiscal_numero || null,
        chave_nfe: it.chave_nfe || null,
        fornecedor_cnpj: it.fornecedor_cnpj || null,
        itens_nota: it.itens_nota ?? null,
        xml_original: it.xml_original || null,
        rateio_veiculos: (it.rateio_veiculos && it.rateio_veiculos.length > 0) ? it.rateio_veiculos : null,
        origem_expense_id: it.origem_expense_id || null,
        origem_payment_id: it.origem_payment_id || null,
        origem_installment_id: it.origem_installment_id || null,
        origem_tipo: it.origem_tipo || null,
      }));


      if (id) {
        const { error } = await (supabase.rpc as any)("save_credit_card_invoice_edit", {
          _invoice_id: id,
          _invoice: payload,
          _items: rows,
        });
        if (error) throw error;
      } else {
        payload.created_by = user?.id;
        const { data, error } = await supabase.from("credit_card_invoices" as any).insert(payload).select("id").single();
        if (error) throw error;
        id = (data as any).id;
        if (rows.length > 0) {
          const newRows = rows.map((row) => ({ ...row, invoice_id: id }));
          const { error: itemsErr } = await supabase.from("credit_card_invoice_items" as any).insert(newRows);
          if (itemsErr) throw itemsErr;
        }
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
          cartaoCreditoPlanoId = (cc as any)?.id || workItems[0]?.plano_contas_id || null;
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
            observacoes: `Importada via OFX (${ofxFileName || "arquivo"}). ${workItems.length} lançamento(s).`,
          };
          // Only update the total when the expense was not (partially) paid — avoids breaking payment audit.
          if (!isPaid) {
            updatePayload.valor_total = workTotal;
          }

          const { error } = await supabase.from("expenses").update(updatePayload).eq("id", existingExpenseId);
          if (error) throw error;

          if (isPaid && Number((existingExp as any)?.valor_pago || 0) !== workTotal) {
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
            valor_total: workTotal,
            data_emissao: getLocalDateISO(),
            data_vencimento: dueDate,
            forma_pagamento: "cartao_credito",
            favorecido_id: favorecidoId,
            favorecido_nome: favorecidoNome,
            observacoes: `Importada via OFX (${ofxFileName || "arquivo"}). ${workItems.length} lançamento(s).`,
            origem: "importacao",
            documento_fiscal_importado: false,
            created_by: user?.id,
          };
          const { data: exp, error: expErr } = await supabase.from("expenses").insert(expensePayload).select("id").single();
          if (expErr) throw expErr;
          await supabase.from("credit_card_invoices" as any).update({ expense_id: (exp as any).id }).eq("id", id);
        }
      }

      if (cascadeMode === "all" && dateChanges.length > 0) {
        const updated = await applyCascadeDates(dateChanges);
        toast.success(
          updated > 0
            ? `Data de emissão replicada em ${updated} parcela(s) do agrupamento.`
            : "Nenhuma outra parcela do agrupamento precisou de ajuste."
        );
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

  const singleIdx = selectedIdxs.size === 1 ? Array.from(selectedIdxs)[0] : null;
  const singleItem = singleIdx !== null ? items[singleIdx] : null;

  const exportItemsCsv = useCallback(() => {
    const chartById = new Map(chartAccounts.map((c) => [c.id, c] as const));
    const rows = items.map((it) => {
      const p = it.plano_contas_id ? chartById.get(it.plano_contas_id) : null;
      const tot = Number(it.parcela_total || 0);
      const atual = Number(it.parcela_atual || 0);
      return {
        data: it.posted_date ? formatDateBR(it.posted_date) : "",
        descricao: it.description,
        parcela: tot > 0 ? `${atual}/${tot}` : "",
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
  }, [items, chartAccounts, cardName, referenceYM]);

  /** Todos os lançamentos selecionados já tiveram as parcelas geradas automaticamente. */
  const selectionAllExpanded = useMemo(() => {
    const idxs = Array.from(selectedIdxs);
    if (idxs.length === 0) return false;
    return idxs.every((i) => !!items[i]?.parcelas_expandidas);
  }, [selectedIdxs, items]);

  const toolbarActions: ToolbarAction[] = [
    { key: "ofx", label: "Importar OFX", icon: Upload, mode: "always", disabled: isClosed, onClick: () => fileRef.current?.click() },
    { key: "novo", label: "Novo lançamento", icon: Plus, mode: "create", disabled: isClosed, onClick: addManualItem },
    { key: "xml", label: "XML / Nota de Serviço", icon: FileText, mode: "always", disabled: isClosed, onClick: () => { setFiscalAttachIdx(null); setFiscalDialogOpen(true); } },
    { key: "sugerir", label: "Sugerir remoções", icon: Search, mode: "always", disabled: isClosed || items.length === 0, onClick: suggestRemovalsForTarget },
    { key: "csv", label: "Exportar CSV", icon: Download, mode: "always", disabled: items.length === 0, onClick: exportItemsCsv },
    { key: "editar", label: "Editar lançamento", icon: Pencil, mode: "single", disabled: isClosed, onClick: () => { if (singleIdx !== null) editManualItem(singleIdx); } },
    { key: "vincular", label: "Vincular XML/NFS-e", icon: FileText, mode: "single", disabled: isClosed, onClick: () => { if (singleIdx === null) return; setFiscalAttachIdx(singleIdx); setFiscalDialogOpen(true); } },
    { key: "favorecido", label: "Cadastrar favorecido", icon: Plus, mode: "single", disabled: isClosed, onClick: () => { if (singleIdx !== null) setCreatePersonOpenIdx(singleIdx); } },
    { key: "rateio", label: "Ratear veículos", icon: Split, mode: "single", disabled: isClosed, onClick: () => { if (singleIdx !== null) setRateioIdx(singleIdx); } },
    // Geração de parcelas é automática no salvamento — sem botão manual.
    { key: "manter", label: "Não é duplicidade", icon: Check, mode: "single+batch", disabled: isClosed, hidden: !Array.from(selectedIdxs).some((i) => items[i]?.possible_duplicate), onClick: () => { selectedIdxs.forEach((i) => updateItem(i, { possible_duplicate: false, duplicate_note: undefined })); } },
    { key: "excluir", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive", disabled: isClosed, onClick: removeSelected },
    { key: "limpar", label: "Limpar seleção", icon: X, mode: "batch", variant: "ghost", onClick: () => setSelectedIdxs(new Set()) },
  ];

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

          <input
            type="file"
            accept=".ofx,.qfx,.OFX,.QFX"
            ref={fileRef}
            onChange={handleOfxUpload}
            className="hidden"
          />

          <GlobalToolbar actions={toolbarActions} selectedCount={selectedIdxs.size}>
            {ofxFileName && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 truncate max-w-[220px]">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{ofxFileName}{ofxBank ? ` • ${ofxBank}` : ""}</span>
              </span>
            )}
            <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-muted/40">
              <span className="text-[10px] uppercase text-muted-foreground">Valor real da fatura</span>
              <Input
                value={reconcileTarget}
                onChange={(e) => setReconcileTarget(e.target.value)}
                placeholder="33.971,38"
                className="h-7 w-28 text-xs px-2"
                inputMode="decimal"
              />
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
              {selectedIdxs.size > 0 && (
                <span className="mr-2">Sel.: <span className="font-semibold text-primary tabular-nums">{formatCurrency(selectedSum)}</span></span>
              )}
              Total: <span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
          </GlobalToolbar>

          {pendingInstallments.length > 0 && !isClosed && (
            <div className="flex items-start gap-2 p-2 border border-warning/50 rounded-md bg-warning/10 text-[11px] leading-relaxed">
              <Layers className="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
              <div>
                <span className="font-semibold text-foreground">
                  {pendingInstallments.length} lançamento(s) parcelado(s) sem as demais parcelas no sistema.
                </span>{" "}
                Ao salvar, serão geradas automaticamente{" "}
                {pendingInstallments.reduce((s, t) => s + Math.max(0, Number(t.item.parcela_atual || 0) - 1), 0)} parcela(s)
                em faturas anteriores e{" "}
                {pendingInstallments.reduce(
                  (s, t) => s + Math.max(0, Number(t.item.parcela_total || 0) - Number(t.item.parcela_atual || 0)),
                  0,
                )}{" "}
                em faturas posteriores. A fatura não pode ser salva sem essa geração.
                <span className="block mt-1 text-muted-foreground italic">
                  Despesa(s): {pendingInstallments.map(t => t.item.description).filter(Boolean).join("; ")}
                </span>
              </div>
            </div>
          )}




          {items.length > 0 ? (
            <div className="space-y-2">
              {/* Edição em lote (campos) */}
              <div className={cn("flex items-center gap-2 flex-wrap p-2 border rounded-md bg-muted/40", (isClosed || selectedIdxs.size === 0) && "opacity-50")}>
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {selectedIdxs.size > 0 ? `Aplicar em ${selectedIdxs.size} lançamento(s):` : "Selecione linhas para editar em lote"}
                </span>
                <div className={cn("flex-1 min-w-[200px]", (isClosed || selectedIdxs.size === 0) && "pointer-events-none")}>
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
              </div>

              <div className="border rounded-md overflow-x-auto overscroll-x-contain">
                <Table className="w-full text-[11px] min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-1 w-8">
                        <Checkbox
                          checked={items.length > 0 && selectedIdxs.size === items.length}
                          onCheckedChange={toggleSelectAll}
                          disabled={isClosed}
                          aria-label="Selecionar todos"
                          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[82px]">
                        <SortHeader label="Data" sortKey="date" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] min-w-[130px] w-[14%]">
                        <SortHeader label="Favorecido" sortKey="favorecido" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] min-w-[160px] w-[18%]">
                        <SortHeader label="Descrição" sortKey="description" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[110px]">
                        <SortHeader label="Parcelas" sortKey="parcelas" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-right text-[11px] w-[100px]">
                        <SortHeader label="Valor" sortKey="amount" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] min-w-[110px] w-[12%]">
                        Conferência
                      </TableHead>
                      <TableHead className="px-1 text-[11px] min-w-[150px] w-[14%]">
                        <SortHeader label="Plano de Contas" sortKey="plano_contas" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[120px]">
                        <SortHeader label="C. Custo" sortKey="centro_custo" sort={sort} toggle={toggle} />
                      </TableHead>
                      <TableHead className="px-1 text-[11px] w-[100px]">
                        <SortHeader label="Veículo" sortKey="veiculo" sort={sort} toggle={toggle} />
                      </TableHead>

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
                        onOpenCreate={() => setCreatePersonOpenIdx(originalIdx)}
                        wasEdited={hasRowChanged(originalIdx)}
                        selected={selectedIdxs.has(originalIdx)}
                        onToggleSelected={() => toggleSelected(originalIdx)}
                        onExpandParcelas={() => expandParcelas(originalIdx)}
                        onAttachFiscal={() => { setFiscalAttachIdx(originalIdx); setFiscalDialogOpen(true); }}
                        onOpenRateio={() => setRateioIdx(originalIdx)}
                        onLinkPayable={() => setLinkIdx(originalIdx)}
                        onUnlinkPayable={() => unlinkPayable(originalIdx)}
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

      <Dialog open={manualDialogOpen} onOpenChange={(o) => { setManualDialogOpen(o); if (!o) setManualEditIdx(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{manualEditIdx !== null ? "Editar Lançamento" : "Novo Lançamento Manual"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={manualForm.posted_date}
                  onChange={(e) => setManualForm((f) => ({ ...f, posted_date: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  {manualForm.amount_mode === "total" ? "Valor total da compra (R$)" : "Valor da parcela (R$)"} <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="0,00"
                  className="h-9"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((f) => ({ ...f, amount: maskCurrency(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-1 w-fit">
              {([
                { key: "parcela", label: "Informar valor da parcela" },
                { key: "total", label: "Informar valor total" },
              ] as const).map((opt) => (
                <Button
                  key={opt.key}
                  type="button"
                  size="sm"
                  variant={manualForm.amount_mode === opt.key ? "default" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setManualForm((f) => ({ ...f, amount_mode: opt.key }))}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Descrição <span className="text-destructive">*</span></Label>
              <Input
                className="h-9"
                placeholder="Ex: Compra loja XYZ"
                value={manualForm.description}
                onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fornecedor / Favorecido</Label>
              <PersonSearchInput
                categories={["fornecedor", "cliente", "proprietario", "colaborador"]}
                placeholder="Buscar fornecedor cadastrado..."
                selectedName={manualForm.favorecido_nome || undefined}
                onSelect={(p) => setManualForm((f) => ({
                  ...f,
                  favorecido_id: p.id,
                  favorecido_nome: p.razao_social || p.full_name || "",
                }))}
                onClear={() => setManualForm((f) => ({ ...f, favorecido_id: null, favorecido_nome: "" }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Parcela atual</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  placeholder="Ex: 1"
                  value={manualForm.parcela_atual}
                  onChange={(e) => setManualForm((f) => ({ ...f, parcela_atual: e.target.value.replace(/\D/g, "") }))}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total de parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  className="h-9"
                  placeholder="Ex: 10"
                  value={manualForm.parcela_total}
                  onChange={(e) => setManualForm((f) => ({ ...f, parcela_total: e.target.value.replace(/\D/g, "") }))}
                />
              </div>
            </div>
            {manualForm.amount_mode === "total" && (
              Number(manualForm.parcela_total) > 0 && Number(unmaskCurrency(manualForm.amount)) > 0 ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Valor desta parcela: </span>
                  <span className="font-semibold text-foreground">{formatCurrency(manualParcelaCalc.valorParcela)}</span>
                  <span className="text-muted-foreground">
                    {" "}({manualForm.parcela_atual || "?"}/{manualForm.parcela_total} de {formatCurrency(manualParcelaCalc.valorTotal)})
                  </span>
                  {manualParcelaCalc.ajustada && (
                    <span className="text-muted-foreground"> — última parcela ajustada para fechar o total.</span>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">Informe o valor total e o total de parcelas para calcular automaticamente o valor da parcela.</p>
              )
            )}
            <div>
              <Label className="text-xs text-muted-foreground">Plano de contas</Label>
              <PlanoContasCombobox
                value={manualForm.plano_contas_id}
                onChange={(v) => setManualForm((f) => ({ ...f, plano_contas_id: v }))}
                options={despesaLeaves}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Opcional — pode ser classificado depois na grade.</p>
            </div>

            <ManualItemsEditor
              itens={manualItens}
              onChange={setManualItens}
              vehicles={vehicles}
              valorAlvo={manualValorLancado}
              selectedUids={manualItemSel}
              onSelectedChange={setManualItemSel}
              novoDesc={manualNovoItem.desc}
              novoQtd={manualNovoItem.qtd}
              novoValor={manualNovoItem.valor}
              onNovoChange={(p) => setManualNovoItem((f) => ({ ...f, ...p }))}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setManualDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={confirmManualItem} disabled={!manualItensOk}>{manualEditIdx !== null ? "Salvar alterações" : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FiscalDocImportDialog
        open={fiscalDialogOpen}
        onOpenChange={(o) => { setFiscalDialogOpen(o); if (!o) setFiscalAttachIdx(null); }}
        chartAccounts={despesaLeaves as any}
        defaultDate={fiscalAttachIdx !== null ? items[fiscalAttachIdx]?.posted_date : `${referenceYM}-01`}
        attachMode={fiscalAttachIdx !== null}
        attachDescription={fiscalAttachIdx !== null ? items[fiscalAttachIdx]?.description : undefined}
        attachAmount={fiscalAttachIdx !== null ? items[fiscalAttachIdx]?.amount : undefined}
        vehicles={vehicles}
        onConfirm={handleFiscalConfirm}
      />

      {/* Rateio por veículo do lançamento do cartão */}
      <Dialog open={rateioIdx !== null} onOpenChange={(o) => { if (!o) setRateioIdx(null); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Rateio entre veículos</DialogTitle>
          </DialogHeader>
          {rateioIdx !== null && items[rateioIdx] && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                {items[rateioIdx].description} — {formatCurrency(items[rateioIdx].amount)}
              </p>
              <VehicleRateioEditor
                rows={items[rateioIdx].rateio_veiculos || []}
                onChange={(rows) => updateItem(rateioIdx, { rateio_veiculos: rows })}
                vehicles={vehicles}
                valorTotal={items[rateioIdx].amount}
              />
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { updateItem(rateioIdx, { rateio_veiculos: null }); setRateioIdx(null); }}
                >
                  Remover rateio
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const rows = items[rateioIdx].rateio_veiculos || [];
                    const err = validateRateio(rows, items[rateioIdx].amount);
                    if (err) return toast.error(err);
                    updateItem(rateioIdx, { veiculo_id: null });
                    setRateioIdx(null);
                    toast.success("Rateio definido. Salve a fatura para gravar.");
                  }}
                >
                  Confirmar rateio
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Replicação de Data de Emissão entre parcelas do mesmo agrupamento */}
      <Dialog open={!!cascadeAsk} onOpenChange={(o) => { if (!o && !cascadeRunning) setCascadeAsk(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Despesa parcelada
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Esta despesa faz parte de um parcelamento. Deseja aplicar esta nova Data de Emissão a todas as outras
              parcelas deste grupo?
            </p>
            <ul className="space-y-1">
              {(cascadeAsk?.changes || []).map((c) => (
                <li key={c.item.id} className="rounded border bg-muted/40 px-2 py-1 text-foreground">
                  <span className="font-medium">{(c.item.description || "").slice(0, 40)}</span>
                  {" — "}
                  {formatDateBR(c.oldDate)} → <span className="font-semibold">{formatDateBR(c.newDate)}</span>
                  {c.item.parcela_total ? ` (${c.item.parcela_atual || "?"}/${c.item.parcela_total})` : ""}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-10"
              disabled={cascadeRunning}
              onClick={async () => {
                const ask = cascadeAsk;
                setCascadeAsk(null);
                if (ask) await persistInvoice(ask.closeNow, "single");
              }}
            >
              Apenas nesta parcela
            </Button>
            <Button
              className="h-10"
              disabled={cascadeRunning}
              onClick={async () => {
                const ask = cascadeAsk;
                if (!ask) return;
                setCascadeRunning(true);
                try {
                  setCascadeAsk(null);
                  await persistInvoice(ask.closeNow, "all");
                } finally {
                  setCascadeRunning(false);
                }
              }}
            >
              Aplicar em todas as parcelas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação da Data de Emissão em lançamento parcelado (sem correção automática) */}
      <Dialog open={!!emissaoAsk} onOpenChange={(o) => { if (!o) setEmissaoAsk(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Confirmar Data de Emissão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Lançamento parcelado ({emissaoAsk?.parcelaAtual}/{emissaoAsk?.parcelaTotal}). A data de emissão informada é{" "}
              <span className="font-semibold text-foreground">{formatDateBR(emissaoAsk?.informada)}</span>.
            </p>
            <p>
              Ela está correta e deve ser aplicada a todas as parcelas deste agrupamento? O sistema não fará nenhuma
              correção automática.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                setEmissaoAsk(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              className="h-10"
              onClick={() => {
                const ask = emissaoAsk;
                if (!ask) return;
                setEmissaoAsk(null);
                setItems((prev) => [ask.row, ...prev]);
                toast.success("Lançamento adicionado com a data informada.");
              }}
            >
              Manter {formatDateBR(emissaoAsk?.informada)} em todas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
  onOpenCreate: () => void;
  wasEdited: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onExpandParcelas: () => void;
  onAttachFiscal: () => void;
  onOpenRateio: () => void;
  onLinkPayable: () => void;
  onUnlinkPayable: () => void;

  expanding: boolean;
  referenceYM: string;
}

const InvoiceItemRow = memo(function InvoiceItemRow({
  idx, item, isClosed, despesaLeaves, vehicles,
  onUpdate, onRemove, onOpenCreate, wasEdited,
  selected, onToggleSelected, onExpandParcelas, onAttachFiscal, onOpenRateio, expanding, referenceYM,
}: InvoiceItemRowProps) {
  // Local state for text inputs — only the row re-renders per keystroke,
  // parent is updated on blur.
  const rateioCount = (item.rateio_veiculos || []).filter((r) => r.veiculo_id).length;
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
      <TableCell className="px-1 py-1.5 align-middle w-8">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          disabled={isClosed}
          aria-label="Selecionar lançamento"
          className="h-3.5 w-3.5 border-muted-foreground/30 data-[state=checked]:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </TableCell>
      <TableCell className="text-[11px] pl-1 pr-0 py-1 align-middle whitespace-nowrap w-[82px]">
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
      <TableCell className="pl-0 pr-1 py-1 align-middle min-w-[130px] w-[14%]">
        <div className="flex items-center gap-0.5">
          <div ref={wrapperRef} className="relative flex-1 min-w-0">
            <Input
              className="h-6 text-[10px] w-full truncate pl-0 pr-1"
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
        </div>
      </TableCell>
      <TableCell className="px-1 py-1 align-middle min-w-[160px] w-[18%]">
        <div className="flex items-center gap-1 min-w-0">
          <Input
            className="h-6 text-[10px] w-full min-w-0 truncate px-1"
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
        </div>
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle w-[110px]">
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
        </div>
      </TableCell>

      <TableCell className="text-right text-xs font-medium px-1 py-1.5 align-middle whitespace-nowrap w-[100px]">
        {formatCurrency(item.amount)}
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle min-w-[110px] w-[12%]">
        {item.possible_duplicate ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-1.5">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 text-amber-600 shrink-0" />
              <div className="min-w-0 space-y-1">
                <div className="text-[10px] text-amber-800 dark:text-amber-200 leading-tight truncate" title={item.duplicate_note}>
                  {item.duplicate_note}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle min-w-[150px] w-[14%]">

        <PlanoContasCombobox
          value={item.plano_contas_id}
          onChange={(v) => onUpdate(idx, { plano_contas_id: v })}
          options={despesaLeaves}
          disabled={isClosed}
        />
      </TableCell>
      <TableCell className="px-1 py-1.5 align-middle w-[120px]">
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
      <TableCell className="px-1 py-1.5 align-middle w-[100px]">
        {rateioCount > 0 ? (
          <button
            type="button"
            onClick={onOpenRateio}
            className="flex items-center gap-1 w-full h-7 px-1.5 rounded border border-primary/40 bg-primary/10 text-[10px] text-primary truncate"
            title="Rateio entre veículos"
          >
            <Split className="h-3 w-3 shrink-0" /> {rateioCount} veíc.
          </button>
        ) : (
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </TableCell>
    </TableRow>
  );
});


