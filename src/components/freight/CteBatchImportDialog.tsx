import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Upload,
  Building2,
  FileSpreadsheet,
  AlertTriangle,
  Trash2,
  PlusCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { maskName } from "@/lib/masks";
import { VehicleFormModal } from "@/components/VehicleFormModal";
import { lookupCnpj } from "@/lib/cnpjLookup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

type ActorRole = "remetente" | "expedidor" | "destinatario" | "recebedor";

interface ParsedActor {
  nome: string;
  doc: string; // digits only (CPF/CNPJ) — may be empty
}

interface ParsedRow {
  _key: string;
  data: string; // YYYY-MM-DD
  remetente: ParsedActor;
  expedidor: ParsedActor;
  destinatario: ParsedActor;
  recebedor: ParsedActor;
  natureza: string;
  placa: string;
  pesoTon: number;
  valorFrete: number;
  _error?: string;
  _missingWeight?: boolean;
}

interface DbDupInfo {
  id: string;
  numero: number | null;
  numero_interno: number | null;
  data_carregamento: string | null;
  placa_veiculo: string | null;
  peso_bruto: number | null;
  reason: "peso_data_placa";
}

interface ValidationState {
  internalDups: Record<string, { reason: "peso_data_placa"; with: number[] }>;
  dbDups: Record<string, DbDupInfo[]>;
  missingPlates: string[];
  missingActors: { key: string; nome: string; doc: string }[]; // unique
  missingNaturezas: string[];
}

function excelDateToISO(v: any): string {
  if (!v) return "";
  if (v instanceof Date) {
    const d = v;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number") {
    const utc = XLSX.SSF.parse_date_code(v);
    if (!utc) return "";
    return `${utc.y}-${String(utc.m).padStart(2, "0")}-${String(utc.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const onlyDigits = (s: any) => String(s ?? "").replace(/\D/g, "");
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const phoneForProfile = (value: any): string | null => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11 ? digits : null;
};
const emailForProfile = (value: any): string | null => {
  const email = String(value ?? "").trim().toLowerCase();
  return email && email !== "null" ? email : null;
};

const pesoKgOf = (r: ParsedRow) => +(r.pesoTon * 1000).toFixed(3);

const ROLE_LABEL: Record<ActorRole, string> = {
  remetente: "Remetente",
  expedidor: "Expedidor",
  destinatario: "Destinatário",
  recebedor: "Recebedor",
};

export function CteBatchImportDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { matrizId } = useUnifiedCompany();
  const [establishments, setEstablishments] = useState<Array<{ id: string; razao_social: string; cnpj: string }>>([]);
  const [selectedEstId, setSelectedEstId] = useState<string>("");
  const [tomadorRole, setTomadorRole] = useState<ActorRole>("destinatario");
  const [gerarContrato, setGerarContrato] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[]; step: string }>({ done: 0, total: 0, errors: [], step: "" });

  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [validating, setValidating] = useState(false);

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(false);
  const [ignoreMissingWeight, setIgnoreMissingWeight] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("fiscal_establishments")
      .select("id, razao_social, cnpj")
      .eq("active", true)
      .order("type")
      .order("razao_social")
      .then(({ data }) => {
        if (data) {
          setEstablishments(data as any);
          if (matrizId && !selectedEstId) setSelectedEstId(matrizId);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, matrizId]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setProgress({ done: 0, total: 0, errors: [], step: "" });
    setValidation(null);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });

      // Locate header row: row containing "DATA" in column 0
      let headerIdx = -1;
      for (let i = 0; i < aoa.length; i++) {
        const cell = aoa[i]?.[0];
        if (typeof cell === "string" && /^\s*data\s*$/i.test(cell)) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) {
        toast({ title: "Cabeçalho não encontrado", description: "A planilha deve ter 'DATA' como primeira coluna.", variant: "destructive" });
        return;
      }

      // Expected column order (per template):
      // DATA | REMETENTE | CNPJ | EXPEDIDOR | CNPJ | DESTINATARIO | CNPJ | RECEBEDOR | CNPJ | NATUREZA | PLACA | PESO | VALOR DO FRETE
      // Expedidor e Recebedor são OPCIONAIS: podem estar em branco ou ausentes da planilha.
      const headerCells = (aoa[headerIdx] || []).map((c) =>
        String(c ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase()
      );

      // Mapeia colunas por cabeçalho (tolerante à ausência de EXPEDIDOR/RECEBEDOR)
      const findCol = (...patterns: RegExp[]) => {
        for (const p of patterns) {
          const i = headerCells.findIndex((h) => p.test(h));
          if (i >= 0) return i;
        }
        return -1;
      };
      const docAfter = (nameIdx: number) => {
        if (nameIdx < 0) return -1;
        const next = headerCells[nameIdx + 1] ?? "";
        return /cnpj|cpf|doc/.test(next) ? nameIdx + 1 : -1;
      };

      const cRemet = findCol(/^remetente/);
      const cExped = findCol(/^expedidor/);
      const cDest = findCol(/^destinat/);
      const cReceb = findCol(/^recebedor/);
      const cNat = findCol(/natureza|produto|carga/);
      const cPlaca = findCol(/placa/);
      const cPeso = findCol(/peso/);
      const cValor = findCol(/valor/);

      const useHeaderMap = cRemet >= 0 && cDest >= 0 && cPlaca >= 0 && cValor >= 0;

      const COL = useHeaderMap
        ? {
            data: 0,
            remet: cRemet,
            remetDoc: docAfter(cRemet),
            exped: cExped,
            expedDoc: docAfter(cExped),
            dest: cDest,
            destDoc: docAfter(cDest),
            receb: cReceb,
            recebDoc: docAfter(cReceb),
            nat: cNat,
            placa: cPlaca,
            peso: cPeso,
            valor: cValor,
          }
        : {
            data: 0,
            remet: 1,
            remetDoc: 2,
            exped: 3,
            expedDoc: 4,
            dest: 5,
            destDoc: 6,
            receb: 7,
            recebDoc: 8,
            nat: 9,
            placa: 10,
            peso: 11,
            valor: 12,
          };

      const cell = (row: any[], i: number) => (i >= 0 ? row[i] : "");

      const parsed: ParsedRow[] = [];
      let idx = 0;
      for (let i = headerIdx + 1; i < aoa.length; i++) {
        const row = aoa[i];
        if (!row || row.length === 0) continue;
        const data = excelDateToISO(row[COL.data]);
        if (!data) continue;

        const remetente: ParsedActor = { nome: String(cell(row, COL.remet) || "").trim(), doc: onlyDigits(cell(row, COL.remetDoc)) };
        const expedidor: ParsedActor = { nome: String(cell(row, COL.exped) || "").trim(), doc: onlyDigits(cell(row, COL.expedDoc)) };
        const destinatario: ParsedActor = { nome: String(cell(row, COL.dest) || "").trim(), doc: onlyDigits(cell(row, COL.destDoc)) };
        const recebedor: ParsedActor = { nome: String(cell(row, COL.receb) || "").trim(), doc: onlyDigits(cell(row, COL.recebDoc)) };
        const natureza = String(cell(row, COL.nat) || "").trim();
        const placa = String(cell(row, COL.placa) || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const pesoTon = parseNum(cell(row, COL.peso));
        const valorFrete = parseNum(cell(row, COL.valor));

        const r: ParsedRow = {
          _key: `r${++idx}-${Math.random().toString(36).slice(2, 8)}`,
          data,
          remetente,
          expedidor,
          destinatario,
          recebedor,
          natureza,
          placa,
          pesoTon,
          valorFrete,
        };

        const missing: string[] = [];
        if (!remetente.nome) missing.push("remetente");
        if (!destinatario.nome) missing.push("destinatário");
        if (!natureza) missing.push("natureza");
        if (!placa) missing.push("placa");
        if (pesoTon <= 0) r._missingWeight = true;
        if (valorFrete <= 0) missing.push("valor frete");
        if (missing.length) r._error = `Faltando: ${missing.join(", ")}`;

        parsed.push(r);
      }

      setRows(parsed);
      setValidation(null);
      toast({ title: "Arquivo lido", description: `${parsed.length} linha(s) detectada(s).` });
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err.message, variant: "destructive" });
    }
  };

  // Re-validate whenever rows change
  useEffect(() => {
    if (rows.length === 0) {
      setValidation(null);
      return;
    }
    const handle = setTimeout(() => {
      runValidation(rows);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const runValidation = async (currentRows: ParsedRow[]) => {
    setValidating(true);
    try {
      const valid = currentRows.filter((r) => !r._error);

      // 1) Internal duplicates (same as before)
      const internalDups: ValidationState["internalDups"] = {};
      for (let i = 0; i < valid.length; i++) {
        const a = valid[i];
        const aKg = pesoKgOf(a);
        for (let j = i + 1; j < valid.length; j++) {
          const b = valid[j];
          const bKg = pesoKgOf(b);
          if (aKg !== bKg || aKg === 0) continue;
          // Duplicidade só quando peso + placa + data + valor são idênticos
          if (!a.data || !b.data || a.data !== b.data) continue;
          if (!a.placa || !b.placa || a.placa !== b.placa) continue;
          if (Math.abs((a.valorFrete || 0) - (b.valorFrete || 0)) > 0.01) continue;
          const reason = "peso_data_placa" as const;
          const idxA = currentRows.indexOf(a) + 1;
          const idxB = currentRows.indexOf(b) + 1;
          internalDups[a._key] = { reason, with: [...(internalDups[a._key]?.with || []), idxB] };
          internalDups[b._key] = { reason, with: [...(internalDups[b._key]?.with || []), idxA] };
        }
      }

      // 2) DB duplicates
      const dates = Array.from(new Set(valid.map((r) => r.data).filter(Boolean)));
      const plates = Array.from(new Set(valid.map((r) => r.placa).filter(Boolean)));
      const dbDups: ValidationState["dbDups"] = {};

      if (dates.length > 0 || plates.length > 0) {
        const queries: Promise<any>[] = [];
        if (dates.length > 0) {
          queries.push(
            Promise.resolve(
              supabase
                .from("ctes")
                .select("id, numero, numero_interno, data_carregamento, placa_veiculo, peso_bruto, valor_frete, tipo_talao")
                .in("data_carregamento", dates)
                .limit(2000)
            )
          );
        }
        if (plates.length > 0) {
          queries.push(
            Promise.resolve(
              supabase
                .from("ctes")
                .select("id, numero, numero_interno, data_carregamento, placa_veiculo, peso_bruto, valor_frete, tipo_talao")
                .in("placa_veiculo", plates)
                .limit(2000)
            )
          );
        }
        const results = await Promise.all(queries);
        const existing = new Map<string, any>();
        for (const res of results) {
          if (res.data) for (const row of res.data) existing.set(row.id, row);
        }
        const existingArr = Array.from(existing.values());
        for (const r of valid) {
          const kg = pesoKgOf(r);
          if (kg === 0) continue;
          const hits: DbDupInfo[] = [];
          for (const e of existingArr) {
            const ePeso = Number(e.peso_bruto || 0);
            if (Math.abs(ePeso - kg) > 0.5) continue;
            const eData = e.data_carregamento ? String(e.data_carregamento).slice(0, 10) : "";
            const ePlaca = String(e.placa_veiculo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
            const sameData = !!eData && eData === r.data;
            const samePlaca = !!ePlaca && !!r.placa && ePlaca === r.placa;
            const sameValor = Math.abs(Number(e.valor_frete || 0) - Number(r.valorFrete || 0)) <= 0.01;
            if (sameData && samePlaca && sameValor) hits.push({ ...e, reason: "peso_data_placa" });
          }
          if (hits.length > 0) dbDups[r._key] = hits.slice(0, 5);
        }
      }

      // 3) Missing plates
      const missingPlates: string[] = [];
      if (plates.length > 0) {
        const { data: vehs } = await supabase
          .from("vehicles")
          .select("plate")
          .in("plate", plates);
        const registered = new Set((vehs || []).map((v: any) => String(v.plate || "").toUpperCase()));
        for (const p of plates) {
          if (!registered.has(p)) missingPlates.push(p);
        }
      }

      // 4) Missing actors & naturezas (informational — auto-created on import)
      const actorMap = new Map<string, { nome: string; doc: string }>();
      const naturezaSet = new Set<string>();
      for (const r of valid) {
        for (const a of [r.remetente, r.expedidor, r.destinatario, r.recebedor]) {
          if (!a.nome) continue;
          const key = a.doc ? `d:${a.doc}` : `n:${normName(a.nome)}`;
          if (!actorMap.has(key)) actorMap.set(key, { nome: a.nome, doc: a.doc });
        }
        if (r.natureza) naturezaSet.add(r.natureza.trim());
      }

      const allDocs = Array.from(actorMap.values()).map((a) => a.doc).filter(Boolean);
      const allNames = Array.from(actorMap.values()).filter((a) => !a.doc).map((a) => a.nome);

      const foundDocs = new Set<string>();
      const foundNames = new Set<string>();
      if (allDocs.length > 0) {
        const { data } = await supabase.from("profiles").select("cnpj").in("cnpj", allDocs);
        (data || []).forEach((p: any) => p.cnpj && foundDocs.add(String(p.cnpj)));
      }
      if (allNames.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name")
          .in("category", ["cliente", "fornecedor"] as any)
          .in("full_name", allNames);
        (data || []).forEach((p: any) => p.full_name && foundNames.add(normName(String(p.full_name))));
      }

      const missingActors: ValidationState["missingActors"] = [];
      for (const [key, a] of actorMap.entries()) {
        const exists = a.doc ? foundDocs.has(a.doc) : foundNames.has(normName(a.nome));
        if (!exists) missingActors.push({ key, nome: a.nome, doc: a.doc });
      }

      const naturezas = Array.from(naturezaSet);
      const foundNat = new Set<string>();
      if (naturezas.length > 0) {
        const { data } = await supabase
          .from("cargas")
          .select("produto_predominante")
          .in("produto_predominante", naturezas);
        (data || []).forEach((c: any) => foundNat.add(String(c.produto_predominante).toLowerCase()));
      }
      const missingNaturezas = naturezas.filter((n) => !foundNat.has(n.toLowerCase()));

      setValidation({ internalDups, dbDups, missingPlates, missingActors, missingNaturezas });
    } catch (err: any) {
      console.warn("validação falhou:", err.message);
      setValidation({ internalDups: {}, dbDups: {}, missingPlates: [], missingActors: [], missingNaturezas: [] });
    } finally {
      setValidating(false);
    }
  };

  const removeRow = (key: string) => {
    setRows((rs) => rs.filter((r) => r._key !== key));
  };

  // Resolve or create profile actor, caching results.
  const resolveActor = async (
    actor: ParsedActor,
    cache: Map<string, any>
  ): Promise<any | null> => {
    if (!actor.nome) return null;
    const nameKey = `n:${normName(actor.nome)}`;
    const cacheKey = actor.doc ? `d:${actor.doc}` : nameKey;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    if (cache.has(nameKey)) return cache.get(nameKey);

    const SELECT = "id, user_id, full_name, razao_social, cnpj, person_type, address_state";

    // 1) Try DB lookup by document
    let profile: any = null;
    if (actor.doc) {
      const { data } = await supabase
        .from("profiles")
        .select(SELECT)
        .eq("cnpj", actor.doc)
        .maybeSingle();
      profile = data;
    }

    // 2) Fallback: lookup by name (full_name / razao_social / nome_fantasia)
    if (!profile) {
      const raw = actor.nome.trim().replace(/\s+/g, " ");
      const esc = raw.replace(/[%_,]/g, " ");
      const { data } = await supabase
        .from("profiles")
        .select(SELECT)
        .or(
          `full_name.ilike.${esc},razao_social.ilike.${esc},nome_fantasia.ilike.${esc}`
        )
        .limit(20);

      const target = normName(raw);
      profile =
        (data || []).find(
          (p: any) =>
            normName(String(p.full_name || "")) === target ||
            normName(String(p.razao_social || "")) === target
        ) || (data || [])[0] || null;
    }

    if (profile) {
      cache.set(cacheKey, profile);
      cache.set(nameKey, profile);
      if (profile.cnpj) cache.set(`d:${String(profile.cnpj)}`, profile);
      return profile;
    }


    // 2) Create profile
    const isPJ = actor.doc.length === 14;
    const isPF = actor.doc.length === 11;
    let payload: any = {
      user_id: crypto.randomUUID(),
      full_name: actor.nome,
      category: "cliente",
      person_type: isPF ? "cpf" : "cnpj",
      cnpj: actor.doc || null,
      phone: null,
      email: null,
    };

    if (isPJ) {
      try {
        const cnpjData = await lookupCnpj(actor.doc);
        payload = {
          ...payload,
          razao_social: cnpjData.razao_social || actor.nome,
          full_name: cnpjData.razao_social || actor.nome,
          nome_fantasia: cnpjData.nome_fantasia,
          address_street: cnpjData.logradouro,
          address_number: cnpjData.numero,
          address_complement: cnpjData.complemento,
          address_neighborhood: cnpjData.bairro,
          address_city: cnpjData.municipio,
          address_state: cnpjData.uf,
          address_zip: cnpjData.cep,
          phone: phoneForProfile(cnpjData.ddd_telefone_1),
          email: emailForProfile(cnpjData.email),
        };
      } catch {
        // CNPJ lookup failed — proceed with simple cadastro
      }
    }

    const { data: inserted, error } = await supabase
      .from("profiles")
      .insert(payload)
      .select("id, user_id, full_name, razao_social, cnpj, person_type, address_state")
      .single();
    if (error) throw new Error(`Falha ao cadastrar ${actor.nome}: ${error.message}`);
    cache.set(cacheKey, inserted);
    return inserted;
  };

  const resolveNatureza = async (nome: string, cache: Map<string, boolean>) => {
    const key = nome.trim().toLowerCase();
    if (cache.has(key)) return;
    const { data } = await supabase
      .from("cargas")
      .select("id")
      .ilike("produto_predominante", nome.trim())
      .limit(1)
      .maybeSingle();
    if (data) {
      cache.set(key, true);
      return;
    }
    const { error } = await supabase.from("cargas").insert({
      produto_predominante: nome.trim(),
      peso_bruto: 0,
      valor_carga: 0,
      unidade: "KG",
      ativo: true,
      created_by: user?.id,
    } as any);
    if (error) throw new Error(`Falha ao cadastrar natureza "${nome}": ${error.message}`);
    cache.set(key, true);
  };

  const hasDuplicateWarnings = useMemo(() => {
    if (!validation) return false;
    return (
      Object.keys(validation.internalDups).length > 0 ||
      Object.keys(validation.dbDups).length > 0
    );
  }, [validation]);

  const hasMissingWeightWarnings = useMemo(() => rows.some((r) => r._missingWeight && !r._error), [rows]);

  const isImportable = (r: ParsedRow) => !r._error && (!r._missingWeight || ignoreMissingWeight);

  const hasBlockingIssues = useMemo(() => {
    if (!validation) return false;
    if (validation.missingPlates.length > 0) return true;
    if (!ignoreDuplicates && hasDuplicateWarnings) return true;
    if (!ignoreMissingWeight && hasMissingWeightWarnings) return true;
    return false;
  }, [validation, ignoreDuplicates, hasDuplicateWarnings, ignoreMissingWeight, hasMissingWeightWarnings]);

  const handleImport = async () => {
    if (!selectedEstId) {
      toast({ title: "Estabelecimento obrigatório", variant: "destructive" });
      return;
    }
    const validRows = rows.filter(isImportable);
    if (validRows.length === 0) {
      toast({ title: "Nenhuma linha válida para importar", variant: "destructive" });
      return;
    }
    if (hasBlockingIssues) {
      toast({
        title: "Resolva os avisos antes de importar",
        description: "Há duplicidades ou placas sem cadastro.",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: validRows.length, errors: [], step: "Cadastrando atores ausentes..." });
    const errors: string[] = [];

    const actorCache = new Map<string, any>();
    const naturezaCache = new Map<string, boolean>();

    // Pre-create missing actors & naturezas
    try {
      const uniqueActors = new Map<string, ParsedActor>();
      const uniqueNats = new Set<string>();
      for (const r of validRows) {
        for (const a of [r.remetente, r.expedidor, r.destinatario, r.recebedor]) {
          if (!a.nome) continue;
          const k = a.doc ? `d:${a.doc}` : `n:${normName(a.nome)}`;
          if (!uniqueActors.has(k)) uniqueActors.set(k, a);
        }
        if (r.natureza) uniqueNats.add(r.natureza);
      }
      let i = 0;
      for (const [, a] of uniqueActors) {
        i++;
        setProgress((p) => ({ ...p, step: `Resolvendo atores ${i}/${uniqueActors.size}: ${a.nome}` }));
        try {
          await resolveActor(a, actorCache);
        } catch (err: any) {
          errors.push(err.message);
        }
      }
      i = 0;
      for (const n of uniqueNats) {
        i++;
        setProgress((p) => ({ ...p, step: `Naturezas ${i}/${uniqueNats.size}: ${n}` }));
        try {
          await resolveNatureza(n, naturezaCache);
        } catch (err: any) {
          errors.push(err.message);
        }
      }
    } catch (err: any) {
      errors.push(`Pre-processo: ${err.message}`);
    }

    setProgress((p) => ({ ...p, step: "Gerando CT-e..." }));

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const remetente = await resolveActor(r.remetente, actorCache);
        const expedidor = r.expedidor.nome ? await resolveActor(r.expedidor, actorCache) : null;
        const destinatario = await resolveActor(r.destinatario, actorCache);
        const recebedor = r.recebedor.nome ? await resolveActor(r.recebedor, actorCache) : null;

        const tomadorMap: Record<ActorRole, any> = {
          remetente,
          expedidor: expedidor || remetente,
          destinatario,
          recebedor: recebedor || destinatario,
        };
        const tomador = tomadorMap[tomadorRole];
        if (!tomador?.id) throw new Error(`Tomador (${tomadorRole}) não pôde ser resolvido.`);

        const { data: nextNum, error: numErr } = await supabase.rpc("next_cte_servico_number", {
          _establishment_id: selectedEstId,
        });
        if (numErr) throw numErr;

        // Vehicle / driver / owner
        let vehicleId: string | null = null;
        let ownerProfile: any = null;
        let driverProfile: any = null;
        const { data: v } = await supabase
          .from("vehicles")
          .select("id, owner_id, driver_id")
          .eq("plate", r.placa)
          .maybeSingle();
        if (v) {
          vehicleId = (v as any).id;
          if ((v as any).owner_id) {
            const { data: p } = await supabase
              .from("profiles")
              .select("id, user_id, full_name, razao_social, cnpj, person_type")
              .eq("user_id", (v as any).owner_id)
              .maybeSingle();
            ownerProfile = p;
          }
          if ((v as any).driver_id) {
            const { data: d } = await supabase
              .from("profiles")
              .select("id, user_id, full_name, cnpj")
              .eq("user_id", (v as any).driver_id)
              .maybeSingle();
            driverProfile = d;
          }
        }

        const pesoKg = pesoKgOf(r);
        const valorTon = pesoKg > 0 ? +(r.valorFrete / (pesoKg / 1000)).toFixed(2) : 0;

        const actorPayload = (p: any) => p ? {
          nome: maskName(p.razao_social || p.full_name || ""),
          cnpj: p.cnpj || null,
          ie: p.inscricao_estadual || null,
          endereco: null,
          uf: p.address_state || null,
        } : { nome: null, cnpj: null, ie: null, endereco: null, uf: null };

        const rem = actorPayload(remetente);
        const dst = actorPayload(destinatario);
        const exp = actorPayload(expedidor);
        const rec = actorPayload(recebedor);

        const tomadorTipoNum =
          tomadorRole === "remetente" ? 0 :
          tomadorRole === "expedidor" ? 1 :
          tomadorRole === "recebedor" ? 2 : 3;

        const cteInsert: Record<string, any> = {
          tipo_talao: "servico",
          status: "rascunho",
          establishment_id: selectedEstId,
          numero_interno: nextNum,
          tomador_id: tomador.id,
          tomador_tipo: tomadorTipoNum,
          remetente_nome: rem.nome,
          remetente_cnpj: rem.cnpj,
          remetente_ie: rem.ie,
          remetente_uf: rem.uf,
          destinatario_nome: dst.nome,
          destinatario_cnpj: dst.cnpj,
          destinatario_ie: dst.ie,
          destinatario_uf: dst.uf,
          expedidor_nome: exp.nome,
          expedidor_cnpj: exp.cnpj,
          expedidor_ie: exp.ie,
          expedidor_uf: exp.uf,
          recebedor_nome: rec.nome,
          recebedor_cnpj: rec.cnpj,
          recebedor_ie: rec.ie,
          recebedor_uf: rec.uf,
          natureza_operacao: r.natureza,
          produto_predominante: r.natureza,
          data_carregamento: r.data,
          data_emissao: `${r.data}T12:00:00`,
          motorista_id: driverProfile?.id ?? null,
          motorista_nome: driverProfile?.full_name ? maskName(driverProfile.full_name) : null,
          placa_veiculo: r.placa,
          peso_bruto: pesoKg,
          valor_tonelada: valorTon,
          valor_frete: r.valorFrete,
          valor_carga: r.valorFrete,
          cfop: "0000",
          modal: "01",
          tp_cte: 0,
          tp_serv: 0,
          base_calculo_icms: 0,
          aliquota_icms: 0,
          valor_icms: 0,
          cst_icms: "00",
          created_by: user?.id ?? null,
        };

        const { data: insertedCte, error: insErr } = await supabase
          .from("ctes")
          .insert(cteInsert as any)
          .select("id")
          .single();
        if (insErr) throw insErr;
        const cteId = insertedCte.id;

        const { error: prevErr } = await supabase.from("previsoes_recebimento").insert({
          origem_tipo: "cte" as any,
          origem_id: cteId,
          cliente_id: tomador.id,
          valor: r.valorFrete,
          data_prevista: r.data,
          status: "pendente" as any,
        });
        if (prevErr) console.warn("Previsão não gerada:", prevErr.message);

        if (gerarContrato) {
          if (!ownerProfile?.id) {
            errors.push(`Linha ${i + 1} (${r.placa}): contrato não gerado — proprietário do veículo não encontrado.`);
          } else {
            const ownerName = ownerProfile.razao_social || ownerProfile.full_name || "";
            const ownerDoc = ownerProfile.cnpj || "";
            const isPJ = (ownerProfile.person_type || "").toLowerCase() === "cnpj"
              || ownerDoc.replace(/\D/g, "").length === 14;
            const { error: rpcErr } = await supabase.rpc("create_freight_contract_with_payable", {
              _cte_id: cteId,
              _establishment_id: selectedEstId,
              _contratado_id: ownerProfile.id,
              _contratado_nome: maskName(ownerName),
              _contratado_documento: ownerDoc || null,
              _contratado_tipo: isPJ ? "PJ" : "PF",
              _motorista_id: driverProfile?.id ?? null,
              _motorista_nome: driverProfile?.full_name ? maskName(driverProfile.full_name) : null,
              _motorista_cpf: driverProfile?.cnpj || null,
              _vehicle_id: vehicleId,
              _placa_veiculo: r.placa,
              _veiculo_modelo: null,
              _municipio_origem: null,
              _uf_origem: rem.uf,
              _municipio_destino: null,
              _uf_destino: dst.uf,
              _natureza_carga: r.natureza,
              _peso_kg: pesoKg,
              _valor_tonelada: valorTon,
              _valor_total: r.valorFrete,
              _observacoes: "Importação em lote.",
              _user_id: user?.id ?? null,
            });
            if (rpcErr) errors.push(`Linha ${i + 1} (${r.placa}): contrato falhou — ${rpcErr.message}`);
          }
        }

        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err: any) {
        errors.push(`Linha ${i + 1} (${r.placa || r.data}): ${err.message}`);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setProgress((p) => ({ ...p, errors, step: "" }));
    setImporting(false);
    toast({
      title: "Importação concluída",
      description: `${validRows.length - errors.length} de ${validRows.length} CT-e(s) importado(s).${errors.length ? ` ${errors.length} aviso(s).` : ""}`,
      variant: errors.length ? "destructive" : "default",
    });
    onImported();
    if (errors.length === 0) {
      reset();
      onOpenChange(false);
    }
  };

  const totalValorFrete = rows.reduce((s, r) => s + (isImportable(r) ? r.valorFrete : 0), 0);
  const internalCount = validation ? Object.keys(validation.internalDups).length : 0;
  const dbCount = validation ? Object.keys(validation.dbDups).length : 0;
  const missingPlatesCount = validation ? validation.missingPlates.length : 0;
  const missingActorsCount = validation ? validation.missingActors.length : 0;
  const missingNatCount = validation ? validation.missingNaturezas.length : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!importing) { if (!v) reset(); onOpenChange(v); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <FileSpreadsheet className="w-5 h-5" /> Importar CT-e em Lote (Serviço)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cada linha da planilha já traz remetente, expedidor, destinatário, recebedor, natureza e placa.
              Atores ou naturezas não cadastrados serão criados automaticamente. Você só precisa escolher o emitente,
              qual papel é o tomador e se deve gerar contrato de frete.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Emitente + opções globais */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Emitente & opções</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Emitente *</Label>
                  <Select value={selectedEstId} onValueChange={setSelectedEstId}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione o emitente" /></SelectTrigger>
                    <SelectContent>
                      {establishments.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Quem é o tomador/cliente em cada CT-e? *</Label>
                  <Select value={tomadorRole} onValueChange={(v) => setTomadorRole(v as ActorRole)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remetente">Remetente</SelectItem>
                      <SelectItem value="expedidor">Expedidor</SelectItem>
                      <SelectItem value="destinatario">Destinatário</SelectItem>
                      <SelectItem value="recebedor">Recebedor</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    O sistema usará o ator dessa coluna em cada linha como tomador/cliente da nota.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={gerarContrato} onCheckedChange={(v) => setGerarContrato(!!v)} />
                  Gerar contrato de frete (conta a pagar) usando o valor do frete e o proprietário do veículo
                </label>
              </CardContent>
            </Card>

            {/* Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Planilha (.xlsx)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Colunas esperadas (cabeçalho começa com "DATA"): DATA, REMETENTE, CPF/CNPJ, EXPEDIDOR, CPF/CNPJ,
                  DESTINATÁRIO, CPF/CNPJ, RECEBEDOR, CPF/CNPJ, NATUREZA DA CARGA, PLACA, PESO, VALOR DO FRETE.
                </p>
                {fileName && <p className="text-xs">{fileName} — <strong>{rows.length}</strong> linhas</p>}
              </CardContent>
            </Card>

            {/* Validação */}
            {rows.length > 0 && (
              <Card className={hasBlockingIssues ? "border-destructive/50" : ""}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {validating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Validando…</>
                    ) : hasBlockingIssues ? (
                      <><AlertTriangle className="w-4 h-4 text-destructive" /> Há avisos a revisar</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4 text-emerald-600" /> Pronto para importar</>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {validation && (
                    <div className="flex gap-3 flex-wrap text-[11px]">
                      <span className={internalCount ? "text-destructive font-medium" : "text-muted-foreground"}>
                        Duplicatas internas: <strong>{internalCount}</strong>
                      </span>
                      <span className={dbCount ? "text-destructive font-medium" : "text-muted-foreground"}>
                        Já existem no sistema: <strong>{dbCount}</strong>
                      </span>
                      <span className={missingPlatesCount ? "text-destructive font-medium" : "text-muted-foreground"}>
                        Placas sem cadastro: <strong>{missingPlatesCount}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Atores a cadastrar: <strong>{missingActorsCount}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        Naturezas a cadastrar: <strong>{missingNatCount}</strong>
                      </span>
                    </div>
                  )}

                  {validation && validation.missingPlates.length > 0 && (
                    <div className="border rounded-md p-2 bg-muted/30 space-y-1.5">
                      <p className="text-[11px] font-semibold">Cadastre as placas abaixo antes de importar:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {validation.missingPlates.map((p) => (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border text-[11px] font-mono">
                            {p}
                          </span>
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 mt-1"
                        onClick={() => setVehicleModalOpen(true)}
                      >
                        <PlusCircle className="w-3.5 h-3.5 mr-1" /> Cadastrar placa
                      </Button>
                    </div>
                  )}

                  {validation && hasDuplicateWarnings && (
                    <div className="border border-amber-400/60 rounded-md p-2 bg-amber-50 dark:bg-amber-500/10 space-y-1.5">
                      <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5" /> Foram detectadas possíveis duplicidades
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {internalCount > 0 && <>Duplicatas dentro da planilha: <strong>{internalCount}</strong>. </>}
                        {dbCount > 0 && <>Linhas que já existem no sistema: <strong>{dbCount}</strong>.</>}
                      </p>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={ignoreDuplicates} onCheckedChange={(v) => setIgnoreDuplicates(!!v)} />
                        Estou ciente e desejo importar mesmo assim (duplicidades serão criadas)
                      </label>
                    </div>
                  )}

                  {hasMissingWeightWarnings && (
                    <div className="border border-amber-400/60 rounded-md p-2 bg-amber-50 dark:bg-amber-500/10 space-y-1.5">
                      <p className="text-[11px] font-semibold flex items-center gap-1 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5" /> Linhas sem peso informado
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Foram detectadas <strong>{rows.filter((r) => r._missingWeight && !r._error).length}</strong> linha(s) sem peso. Caso prossiga, o CT-e será importado com peso zero e considerará apenas o valor do frete.
                      </p>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={ignoreMissingWeight} onCheckedChange={(v) => setIgnoreMissingWeight(!!v)} />
                        Estou ciente e desejo importar mesmo assim (peso será gravado como 0)
                      </label>
                    </div>
                  )}




                  {validation && (validation.missingActors.length > 0 || validation.missingNaturezas.length > 0) && (
                    <div className="border rounded-md p-2 bg-blue-50 dark:bg-blue-950/20 space-y-2">
                      <p className="text-[11px] font-semibold flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Serão cadastrados automaticamente:
                      </p>
                      {validation.missingActors.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">Atores (clientes/fornecedores):</p>
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
                            {validation.missingActors.slice(0, 50).map((a) => (
                              <span key={a.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border text-[10px]">
                                {a.nome}{a.doc ? ` (${a.doc.length === 14 ? "CNPJ" : "CPF"})` : ""}
                              </span>
                            ))}
                            {validation.missingActors.length > 50 && (
                              <span className="text-[10px] text-muted-foreground">+{validation.missingActors.length - 50}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {validation.missingNaturezas.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground mb-1">Naturezas de carga:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {validation.missingNaturezas.map((n) => (
                              <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-background border text-[10px]">
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Preview */}
            {rows.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Pré-visualização ({rows.filter(isImportable).length} válidas)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-80 overflow-auto border rounded-md">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr className="text-left">
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">Data</th>
                          <th className="px-2 py-1">Remetente</th>
                          <th className="px-2 py-1">Destinatário</th>
                          <th className="px-2 py-1">Tomador ({ROLE_LABEL[tomadorRole]})</th>
                          <th className="px-2 py-1">Natureza</th>
                          <th className="px-2 py-1">Placa</th>
                          <th className="px-2 py-1 text-right">Ton</th>
                          <th className="px-2 py-1 text-right">Valor Frete</th>
                          <th className="px-2 py-1">Avisos</th>
                          <th className="px-2 py-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const internal = validation?.internalDups[r._key];
                          const dbHits = validation?.dbDups[r._key];
                          const missingPlate = validation?.missingPlates.includes(r.placa);
                          const flagged = !!internal || !!dbHits || missingPlate;
                          const tomadorActor = r[tomadorRole];
                          return (
                            <tr
                              key={r._key}
                              className={`border-t ${
                                r._error ? "bg-destructive/10" : flagged ? "bg-amber-100/40 dark:bg-amber-500/10" : ""
                              }`}
                            >
                              <td className="px-2 py-1">{i + 1}</td>
                              <td className="px-2 py-1 whitespace-nowrap">{r.data || "?"}</td>
                              <td className="px-2 py-1 truncate max-w-[140px]" title={r.remetente.nome}>{r.remetente.nome}</td>
                              <td className="px-2 py-1 truncate max-w-[140px]" title={r.destinatario.nome}>{r.destinatario.nome}</td>
                              <td className="px-2 py-1 truncate max-w-[140px]" title={tomadorActor.nome}>{tomadorActor.nome || "—"}</td>
                              <td className="px-2 py-1 truncate max-w-[120px]" title={r.natureza}>{r.natureza}</td>
                              <td className="px-2 py-1 font-mono">{r.placa}</td>
                              <td className="px-2 py-1 text-right">{r.pesoTon.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">{r.valorFrete.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="px-2 py-1 text-[10px] text-destructive whitespace-nowrap">
                                {r._error && <div>{r._error}</div>}
                                {internal && (
                                  <div>
                                    Dup. interna (peso+placa+data+valor) c/ linha {Array.from(new Set(internal.with)).join(", ")}
                                  </div>
                                )}
                                {dbHits && dbHits.length > 0 && (
                                  <div>
                                    Já existe (peso+placa+data+valor)
                                    {dbHits[0].numero || dbHits[0].numero_interno ? ` Nº ${dbHits[0].numero ?? dbHits[0].numero_interno}` : ""}
                                  </div>
                                )}
                                {missingPlate && <div>Placa sem cadastro</div>}
                              </td>
                              <td className="px-2 py-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => removeRow(r._key)}
                                  title="Remover linha"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>{rows.filter(isImportable).length} válidas / {rows.length} totais</span>
                    <span>Total Frete: <strong>R$ {totalValorFrete.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  </div>
                </CardContent>
              </Card>
            )}

            {importing && (
              <div className="p-3 rounded-md border bg-muted/30 text-xs space-y-1">
                <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {progress.step || `Importando ${progress.done}/${progress.total}...`}</div>
                {progress.total > 0 && <div className="text-[10px] text-muted-foreground">CT-e: {progress.done}/{progress.total}</div>}
              </div>
            )}

            {progress.errors.length > 0 && !importing && (
              <div className="p-3 rounded-md border border-destructive/40 bg-destructive/5 text-xs space-y-1 max-h-40 overflow-auto">
                <p className="font-semibold text-destructive">Avisos/Erros:</p>
                {progress.errors.map((e, i) => <p key={i}>• {e}</p>)}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={importing}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || rows.length === 0 || validating || hasBlockingIssues}
              >
                {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Importar {rows.filter(isImportable).length} CT-e(s)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <VehicleFormModal
        open={vehicleModalOpen}
        onOpenChange={setVehicleModalOpen}
        onSaved={() => {
          setVehicleModalOpen(false);
          runValidation(rows);
        }}
      />
    </>
  );
}
