import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { maskName, maskCNPJ } from "@/lib/masks";
import { formatCurrency } from "@/lib/utils";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface Row {
  numero: number;
  data: string; // YYYY-MM-DD
  cliente: string;
  pesoKg: number;
  placa: string;
  nota: string;
  motorista: string;
  valor: number;
}

type Person = { id: string; full_name: string; razao_social?: string | null; cnpj?: string | null; inscricao_estadual?: string | null; address_state?: string | null };

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

function parseNumBR(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;
}

function parseDate(v: any): string {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "";
  }
  const m = String(v || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return "";
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Placa "RSC-6E66/TO" → "RSC6E66" */
const parsePlaca = (v: any) => String(v || "").split("/")[0].replace(/[^A-Za-z0-9]/g, "").toUpperCase();

async function readMatrix(file: File): Promise<any[][]> {
  const buf = await file.arrayBuffer();
  const head = new TextDecoder("latin1").decode(buf.slice(0, 512)).toLowerCase();
  if (head.includes("<html") || head.includes("<table")) {
    const text = new TextDecoder("latin1").decode(buf);
    const doc = new DOMParser().parseFromString(text, "text/html");
    return Array.from(doc.querySelectorAll("tr")).map((tr) =>
      Array.from(tr.querySelectorAll("td,th")).map((td) => (td.textContent || "").trim()),
    );
  }
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: "" });
}

function extractRows(matrix: any[][]): { rows: Row[]; hasValor: boolean } {
  const hIdx = matrix.findIndex((r) => r.some((c) => /conh/i.test(String(c))) && r.some((c) => /emiss/i.test(String(c))));
  if (hIdx < 0) throw new Error("Cabeçalho não encontrado (esperado: Emissão, N.º Conh., Cliente, Peso, Placa…).");
  const h = matrix[hIdx].map((c) => norm(String(c)));
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const ci = {
    data: col(/EMISS/), numero: col(/CONH/), cliente: col(/CLIENTE|TOMADOR/), peso: col(/PESO/),
    placa: col(/PLACA/), nota: col(/NOTA/), motorista: col(/MOTORISTA/), valor: col(/VALOR|FRETE|TOTAL/),
  };
  const rows: Row[] = [];
  for (const r of matrix.slice(hIdx + 1)) {
    const numero = parseInt(String(r[ci.numero] ?? "").replace(/\D/g, ""), 10);
    const data = parseDate(r[ci.data]);
    if (!numero || !data) continue;
    rows.push({
      numero, data,
      cliente: String(r[ci.cliente] ?? "").trim(),
      pesoKg: ci.peso >= 0 ? parseNumBR(r[ci.peso]) : 0,
      placa: ci.placa >= 0 ? parsePlaca(r[ci.placa]) : "",
      nota: ci.nota >= 0 ? String(r[ci.nota] ?? "").trim() : "",
      motorista: ci.motorista >= 0 ? String(r[ci.motorista] ?? "").trim() : "",
      valor: ci.valor >= 0 ? parseNumBR(r[ci.valor]) : 0,
    });
  }
  return { rows, hasValor: ci.valor >= 0 };
}

export function CteServicoResumoImportDialog({ open, onOpenChange, onImported }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { establishments } = useUnifiedCompany();
  const [estId, setEstId] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [hasValor, setHasValor] = useState(true);
  const [existing, setExisting] = useState<Set<number>>(new Set());
  const [clientMap, setClientMap] = useState<Record<string, Person | null>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] as string[] });

  useEffect(() => {
    if (!open) {
      setRows([]); setFileName(""); setExisting(new Set()); setClientMap({});
      setProgress({ done: 0, total: 0, errors: [] }); setEstId("");
    }
  }, [open]);

  const clients = useMemo(() => Array.from(new Set(rows.map((r) => r.cliente).filter(Boolean))), [rows]);

  // Números já existentes no talão de serviço da empresa escolhida
  useEffect(() => {
    if (!estId || rows.length === 0) { setExisting(new Set()); return; }
    const nums = rows.map((r) => r.numero);
    (async () => {
      const found = new Set<number>();
      for (let i = 0; i < nums.length; i += 500) {
        const { data } = await supabase.from("ctes").select("numero_interno")
          .eq("establishment_id", estId).eq("tipo_talao", "servico").in("numero_interno", nums.slice(i, i + 500));
        (data || []).forEach((d: any) => d.numero_interno && found.add(d.numero_interno));
      }
      setExisting(found);
    })();
  }, [estId, rows]);

  // Casa clientes da planilha com Pessoas pela razão social / nome
  useEffect(() => {
    if (clients.length === 0) return;
    (async () => {
      const map: Record<string, Person | null> = {};
      for (const c of clients) {
        const { data } = await supabase.from("profiles")
          .select("id, full_name, razao_social, cnpj, inscricao_estadual, address_state")
          .or(`razao_social.ilike.${JSON.stringify(c)},full_name.ilike.${JSON.stringify(c)}`)
          .limit(5);
        const list = (data || []) as Person[];
        map[c] = list.find((p) => (p.cnpj || "").replace(/\D/g, "").endsWith("0001") ) ?? list[0] ?? null;
        if (list.length > 1) map[c] = list.find((p) => norm(p.razao_social || "") === norm(c)) ?? map[c];
      }
      setClientMap(map);
    })();
  }, [clients]);

  const handleFile = async (f?: File) => {
    if (!f) return;
    try {
      const { rows: rs, hasValor: hv } = extractRows(await readMatrix(f));
      if (rs.length === 0) throw new Error("Nenhum conhecimento encontrado na planilha.");
      setRows(rs); setHasValor(hv); setFileName(f.name);
    } catch (e: any) {
      toast({ title: "Planilha inválida", description: e.message, variant: "destructive" });
    }
  };

  const toImport = rows.filter((r) => !existing.has(r.numero));
  const est = establishments.find((e) => e.id === estId);
  const estLabel = (e: any) => `${e.type === "matriz" ? "Matriz" : "Filial"} — ${e.nome_fantasia || e.razao_social} (${maskCNPJ(e.cnpj)}${e.endereco_uf ? ` · ${e.endereco_uf}` : ""})`;

  const handleImport = async () => {
    if (!estId) return;
    setBusy(true);
    const errors: string[] = [];
    setProgress({ done: 0, total: toImport.length, errors });
    const vehicleCache: Record<string, string | null> = {};
    let maxNum = 0;
    for (const r of toImport) {
      try {
        const p = clientMap[r.cliente] ?? null;
        if (r.placa && !(r.placa in vehicleCache)) {
          const { data: v } = await supabase.from("vehicles").select("id").eq("plate", r.placa).maybeSingle();
          vehicleCache[r.placa] = (v as any)?.id ?? null;
        }
        const nome = maskName(p?.razao_social || p?.full_name || r.cliente);
        const obs = [r.nota && `NF ${r.nota}`, "Importado de planilha resumida."].filter(Boolean).join(" · ");
        const { data: ins, error } = await supabase.from("ctes").insert({
          tipo_talao: "servico",
          status: "rascunho",
          establishment_id: estId,
          numero_interno: r.numero,
          tomador_id: p?.id ?? null,
          tomador_tipo: 0, // Remetente
          tomador_nome: nome,
          tomador_cnpj: p?.cnpj || null,
          tomador_ie: p?.inscricao_estadual || null,
          tomador_uf: p?.address_state || null,
          remetente_nome: nome,
          remetente_cnpj: p?.cnpj || null,
          remetente_ie: p?.inscricao_estadual || null,
          remetente_uf: p?.address_state || null,
          destinatario_nome: null,
          data_carregamento: r.data,
          data_emissao: `${r.data}T12:00:00`,
          motorista_nome: r.motorista ? maskName(r.motorista) : null,
          placa_veiculo: r.placa || null,
          peso_bruto: r.pesoKg,
          valor_tonelada: r.pesoKg > 0 ? +(r.valor / (r.pesoKg / 1000)).toFixed(2) : 0,
          valor_frete: r.valor,
          valor_carga: r.valor,
          observacoes: obs,
          cfop: "0000", modal: "01", tp_cte: 0, tp_serv: 0,
          base_calculo_icms: 0, aliquota_icms: 0, valor_icms: 0, cst_icms: "00",
          created_by: user?.id ?? null,
        } as any).select("id").single();
        if (error) throw error;
        if (p?.id && r.valor > 0) {
          await supabase.from("previsoes_recebimento").insert({
            origem_tipo: "cte" as any, origem_id: ins.id, cliente_id: p.id,
            valor: r.valor, data_prevista: r.data, status: "pendente" as any,
          });
        }
        maxNum = Math.max(maxNum, r.numero);
      } catch (e: any) {
        errors.push(`Nº ${r.numero}: ${e.message}`);
      }
      setProgress((s) => ({ ...s, done: s.done + 1, errors: [...errors] }));
    }
    // Mantém o contador do talão de serviço à frente dos números importados
    if (maxNum > 0) {
      const { data: e } = await supabase.from("fiscal_establishments").select("ultimo_numero_cte_servico").eq("id", estId).maybeSingle();
      if (((e as any)?.ultimo_numero_cte_servico ?? 0) < maxNum) {
        await supabase.from("fiscal_establishments").update({ ultimo_numero_cte_servico: maxNum } as any).eq("id", estId);
      }
    }
    setBusy(false);
    const ok = toImport.length - errors.length;
    toast({ title: "Importação concluída", description: `${ok} CT-e(s) de serviço importado(s)${errors.length ? `, ${errors.length} com erro` : ""}.` });
    onImported();
    if (!errors.length) onOpenChange(false);
  };

  const semCadastro = clients.filter((c) => clientMap[c] === null);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar CT-es de serviço (planilha resumida)</DialogTitle>
          <DialogDescription className="text-xs">
            Usa a numeração, data, placa, peso e valor exatamente como estão na planilha. O cliente é tratado como tomador e remetente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Empresa emitente</Label>
            <Select value={estId} onValueChange={setEstId}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione matriz ou filial" /></SelectTrigger>
              <SelectContent>
                {establishments.map((e) => <SelectItem key={e.id} value={e.id} className="text-xs">{estLabel(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Planilha (.xls / .xlsx)</Label>
            <Input type="file" accept=".xls,.xlsx,.html,.htm" className="h-9 text-xs" onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><FileSpreadsheet className="h-4 w-4" />{fileName}</span>
              <span><b>{rows.length}</b> conhecimentos</span>
              {estId && <span className="text-success"><b>{toImport.length}</b> a importar</span>}
              {existing.size > 0 && <span className="text-muted-foreground">{existing.size} já existem no talão (serão ignorados)</span>}
            </div>

            {!hasValor && (
              <div className="flex gap-2 rounded border border-warning/50 bg-warning/10 p-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                Esta planilha não tem coluna de valor do frete. Os CT-es entram com valor R$ 0,00 e sem previsão de recebimento; ajuste depois ou exporte o relatório com a coluna de valor.
              </div>
            )}

            {semCadastro.length > 0 && (
              <div className="space-y-2 rounded border p-2">
                <p className="text-xs font-medium">Clientes não encontrados em Pessoas — vincule (opcional, o nome da planilha é usado se ficar em branco):</p>
                {semCadastro.map((c) => (
                  <div key={c} className="grid grid-cols-2 items-center gap-2 text-xs">
                    <span className="truncate">{c}</span>
                    <PersonSearchInput onSelect={(p: any) => setClientMap((m) => ({ ...m, [c]: p }))} placeholder="Buscar pessoa…" />
                  </div>
                ))}
              </div>
            )}
            {clients.filter((c) => clientMap[c]).length > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                {clients.filter((c) => clientMap[c]).length} de {clients.length} clientes vinculados ao cadastro de Pessoas.
              </p>
            )}

            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>{["Nº", "Emissão", "Cliente", "Placa", "Peso (kg)", "Valor", "NF"].map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.numero} className={existing.has(r.numero) ? "opacity-40 line-through" : ""}>
                      <td className="px-2 py-0.5 font-medium">{r.numero}</td>
                      <td className="px-2 py-0.5">{r.data.split("-").reverse().join("/")}</td>
                      <td className="px-2 py-0.5 truncate max-w-[220px]">{r.cliente}</td>
                      <td className="px-2 py-0.5">{r.placa}</td>
                      <td className="px-2 py-0.5 text-right">{r.pesoKg.toLocaleString("pt-BR")}</td>
                      <td className="px-2 py-0.5 text-right">{formatCurrency(r.valor)}</td>
                      <td className="px-2 py-0.5">{r.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {busy && <p className="text-xs">Importando {progress.done}/{progress.total}…</p>}
        {progress.errors.length > 0 && (
          <div className="max-h-32 overflow-auto rounded border border-destructive/50 p-2 text-xs text-destructive">
            {progress.errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Fechar</Button>
          <Button onClick={handleImport} disabled={busy || !estId || toImport.length === 0}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Importar {toImport.length || ""} no talão de serviço{est ? ` — ${est.type === "matriz" ? "Matriz" : est.nome_fantasia || "Filial"}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
