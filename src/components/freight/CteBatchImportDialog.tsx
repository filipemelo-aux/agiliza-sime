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
  Users,
  FileSpreadsheet,
  AlertTriangle,
  Trash2,
  PlusCircle,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { PersonSearchInput } from "./PersonSearchInput";
import { maskName } from "@/lib/masks";
import { NaturezaCargaSearchInput } from "./NaturezaCargaSearchInput";
import { VehicleFormModal } from "@/components/VehicleFormModal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface ActorState {
  id: string | null;
  nome: string;
  cnpj: string | null;
  ie: string | null;
  endereco: string | null;
  municipio_ibge: string | null;
  uf: string | null;
}

const emptyActor: ActorState = {
  id: null,
  nome: "",
  cnpj: null,
  ie: null,
  endereco: null,
  municipio_ibge: null,
  uf: null,
};

interface ParsedRow {
  _key: string;
  data: string; // YYYY-MM-DD
  placa: string;
  motorista: string;
  pesoTon: number;
  valorCte: number;
  valorContrato: number;
  valorDiesel: number;
  litros: number;
  totalDescontado: number;
  _error?: string;
}

interface DbDupInfo {
  id: string;
  numero: number | null;
  numero_interno: number | null;
  data_carregamento: string | null;
  placa_veiculo: string | null;
  peso_bruto: number | null;
  reason: "peso_data" | "peso_placa";
}

interface ValidationState {
  internalDups: Record<string, { reason: "peso_data" | "peso_placa"; with: number[] }>; // key -> conflict rows (1-based)
  dbDups: Record<string, DbDupInfo[]>;
  missingPlates: string[]; // uppercased
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

const pesoKgOf = (r: ParsedRow) => +(r.pesoTon * 1000).toFixed(3);

export function CteBatchImportDialog({ open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { matrizId } = useUnifiedCompany();
  const [establishments, setEstablishments] = useState<Array<{ id: string; razao_social: string; cnpj: string }>>([]);
  const [selectedEstId, setSelectedEstId] = useState<string>("");
  const [remetente, setRemetente] = useState<ActorState>(emptyActor);
  const [destinatario, setDestinatario] = useState<ActorState>(emptyActor);
  const [expedidor, setExpedidor] = useState<ActorState>(emptyActor);
  const [recebedor, setRecebedor] = useState<ActorState>(emptyActor);
  const [tomadorTipo, setTomadorTipo] = useState<number>(0);
  const [naturezaCarga, setNaturezaCarga] = useState("");
  const [gerarContrato, setGerarContrato] = useState(true);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] }>({ done: 0, total: 0, errors: [] });

  // validation
  const [validation, setValidation] = useState<ValidationState | null>(null);
  const [validating, setValidating] = useState(false);

  // vehicle registration modal
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);

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
    setProgress({ done: 0, total: 0, errors: [] });
    setValidation(null);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true });
      const parsed: ParsedRow[] = [];
      let started = false;
      let idx = 0;
      for (const row of aoa) {
        if (!row || row.length === 0) continue;
        const first = row[0];
        if (!started) {
          if (typeof first === "string" && /data/i.test(first)) {
            started = true;
          }
          continue;
        }
        if (!first) continue;
        const data = excelDateToISO(row[0]);
        if (!data) continue;
        const r: ParsedRow = {
          _key: `r${++idx}-${Math.random().toString(36).slice(2, 8)}`,
          data,
          placa: String(row[1] || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
          motorista: String(row[2] || "").trim(),
          pesoTon: parseNum(row[3]),
          valorCte: parseNum(row[4]),
          valorContrato: parseNum(row[5]),
          valorDiesel: parseNum(row[6]),
          litros: parseNum(row[7]),
          totalDescontado: parseNum(row[8]),
        };
        if (r.pesoTon <= 0 || r.valorCte <= 0) {
          r._error = "Peso/Valor inválido";
        }
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
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const runValidation = async (currentRows: ParsedRow[]) => {
    setValidating(true);
    try {
      const valid = currentRows.filter((r) => !r._error);

      // 1) Internal duplicates
      const internalDups: ValidationState["internalDups"] = {};
      for (let i = 0; i < valid.length; i++) {
        const a = valid[i];
        const aKg = pesoKgOf(a);
        for (let j = i + 1; j < valid.length; j++) {
          const b = valid[j];
          const bKg = pesoKgOf(b);
          if (aKg !== bKg || aKg === 0) continue;
          let reason: "peso_data" | "peso_placa" | null = null;
          if (a.data && b.data && a.data === b.data) reason = "peso_data";
          else if (a.placa && b.placa && a.placa === b.placa) reason = "peso_placa";
          if (!reason) continue;
          const idxA = currentRows.indexOf(a) + 1;
          const idxB = currentRows.indexOf(b) + 1;
          internalDups[a._key] = {
            reason,
            with: [...(internalDups[a._key]?.with || []), idxB],
          };
          internalDups[b._key] = {
            reason,
            with: [...(internalDups[b._key]?.with || []), idxA],
          };
        }
      }

      // 2) DB duplicates — fetch existing ctes for relevant dates OR plates
      const dates = Array.from(new Set(valid.map((r) => r.data).filter(Boolean)));
      const plates = Array.from(new Set(valid.map((r) => r.placa).filter(Boolean)));
      const dbDups: ValidationState["dbDups"] = {};

      if (dates.length > 0 || plates.length > 0) {
        // We need either same date OR same plate; do two queries to keep filters simple.
        const queries: Promise<any>[] = [];
        if (dates.length > 0) {
          queries.push(
            supabase
              .from("ctes")
              .select("id, numero, numero_interno, data_carregamento, placa_veiculo, peso_bruto, tipo_talao")
              .in("data_carregamento", dates)
              .limit(2000)
          );
        }
        if (plates.length > 0) {
          queries.push(
            supabase
              .from("ctes")
              .select("id, numero, numero_interno, data_carregamento, placa_veiculo, peso_bruto, tipo_talao")
              .in("placa_veiculo", plates)
              .limit(2000)
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
            const sameData = eData && eData === r.data;
            const samePlaca = ePlaca && r.placa && ePlaca === r.placa;
            if (sameData) hits.push({ ...e, reason: "peso_data" });
            else if (samePlaca) hits.push({ ...e, reason: "peso_placa" });
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

      setValidation({ internalDups, dbDups, missingPlates });
    } catch (err: any) {
      console.warn("validação falhou:", err.message);
      setValidation({ internalDups: {}, dbDups: {}, missingPlates: [] });
    } finally {
      setValidating(false);
    }
  };

  const removeRow = (key: string) => {
    setRows((rs) => rs.filter((r) => r._key !== key));
  };

  const actorByTipo = (tipo: number): ActorState => {
    switch (tipo) {
      case 0: return remetente;
      case 1: return expedidor;
      case 2: return recebedor;
      case 3: return destinatario;
      default: return remetente;
    }
  };

  const hasBlockingIssues = useMemo(() => {
    if (!validation) return false;
    return (
      Object.keys(validation.internalDups).length > 0 ||
      Object.keys(validation.dbDups).length > 0 ||
      validation.missingPlates.length > 0
    );
  }, [validation]);

  const handleImport = async () => {
    if (!selectedEstId) {
      toast({ title: "Estabelecimento obrigatório", variant: "destructive" });
      return;
    }
    if (!remetente.id || !destinatario.id) {
      toast({ title: "Atores obrigatórios", description: "Selecione ao menos remetente e destinatário.", variant: "destructive" });
      return;
    }
    if (!naturezaCarga.trim()) {
      toast({ title: "Natureza da carga obrigatória", variant: "destructive" });
      return;
    }
    const validRows = rows.filter((r) => !r._error);
    if (validRows.length === 0) {
      toast({ title: "Nenhuma linha válida para importar", variant: "destructive" });
      return;
    }
    if (hasBlockingIssues) {
      toast({
        title: "Resolva os avisos antes de importar",
        description: "Há duplicidades ou placas sem cadastro. Use os botões abaixo para corrigir.",
        variant: "destructive",
      });
      return;
    }

    const tomador = actorByTipo(tomadorTipo);
    if (!tomador.id) {
      toast({ title: "Tomador inválido", description: "O ator selecionado como tomador precisa estar cadastrado.", variant: "destructive" });
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: validRows.length, errors: [] });
    const errors: string[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const { data: nextNum, error: numErr } = await supabase.rpc("next_cte_servico_number", {
          _establishment_id: selectedEstId,
        });
        if (numErr) throw numErr;

        let vehicleId: string | null = null;
        let ownerProfile: any = null;
        let driverProfile: any = null;
        if (r.placa) {
          const { data: v } = await supabase
            .from("vehicles")
            .select("id, owner_id, driver_id, brand, model")
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
        }

        if (!driverProfile && r.motorista) {
          const { data: m } = await supabase
            .from("profiles")
            .select("id, user_id, full_name, cnpj")
            .eq("category", "motorista")
            .ilike("full_name", r.motorista)
            .limit(1)
            .maybeSingle();
          driverProfile = m;
        }

        const dieselTotal = r.totalDescontado > 0
          ? r.totalDescontado
          : (r.litros > 0 && r.valorDiesel > 0 ? +(r.litros * r.valorDiesel).toFixed(2) : 0);

        const desconto = dieselTotal > 0
          ? { tipo: "diesel", litros: r.litros, valor_litro: r.valorDiesel, valor: dieselTotal }
          : null;

        const pesoKg = pesoKgOf(r);
        const valorTon = pesoKg > 0 ? +(r.valorCte / (pesoKg / 1000)).toFixed(2) : 0;

        const cteInsert: Record<string, any> = {
          tipo_talao: "servico",
          status: "rascunho",
          establishment_id: selectedEstId,
          numero_interno: nextNum,
          tomador_id: tomador.id,
          tomador_tipo: tomadorTipo,
          remetente_nome: maskName(remetente.nome),
          remetente_cnpj: remetente.cnpj,
          remetente_ie: remetente.ie,
          remetente_endereco: remetente.endereco,
          remetente_municipio_ibge: remetente.municipio_ibge,
          remetente_uf: remetente.uf,
          destinatario_nome: maskName(destinatario.nome),
          destinatario_cnpj: destinatario.cnpj,
          destinatario_ie: destinatario.ie,
          destinatario_endereco: destinatario.endereco,
          destinatario_municipio_ibge: destinatario.municipio_ibge,
          destinatario_uf: destinatario.uf,
          expedidor_nome: expedidor.nome ? maskName(expedidor.nome) : null,
          expedidor_cnpj: expedidor.cnpj,
          expedidor_ie: expedidor.ie,
          expedidor_endereco: expedidor.endereco,
          expedidor_municipio_ibge: expedidor.municipio_ibge,
          expedidor_uf: expedidor.uf,
          recebedor_nome: recebedor.nome ? maskName(recebedor.nome) : null,
          recebedor_cnpj: recebedor.cnpj,
          recebedor_ie: recebedor.ie,
          recebedor_endereco: recebedor.endereco,
          recebedor_municipio_ibge: recebedor.municipio_ibge,
          recebedor_uf: recebedor.uf,
          natureza_operacao: naturezaCarga,
          produto_predominante: naturezaCarga,
          data_carregamento: r.data,
          data_emissao: `${r.data}T12:00:00`,
          motorista_id: driverProfile?.id ?? null,
          motorista_nome: r.motorista ? maskName(r.motorista) : (driverProfile?.full_name ?? null),
          placa_veiculo: r.placa || null,
          peso_bruto: pesoKg,
          valor_tonelada: valorTon,
          valor_frete: r.valorCte,
          valor_carga: r.valorCte,
          cfop: "0000",
          modal: "01",
          tp_cte: 0,
          tp_serv: 0,
          base_calculo_icms: 0,
          aliquota_icms: 0,
          valor_icms: 0,
          cst_icms: "00",
          desconto,
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
          valor: r.valorCte,
          data_prevista: r.data,
          status: "pendente" as any,
        });
        if (prevErr) console.warn("Previsão não gerada:", prevErr.message);

        if (gerarContrato && r.valorContrato > 0) {
          if (!ownerProfile?.id) {
            errors.push(`Linha ${i + 1} (${r.placa}): contrato não gerado — proprietário do veículo não encontrado.`);
          } else {
            const valorContratoFinal = +(r.valorContrato - dieselTotal).toFixed(2);
            if (valorContratoFinal !== 0) {
              const ownerName = ownerProfile.razao_social || ownerProfile.full_name || "";
              const ownerDoc = ownerProfile.cnpj || "";
              const isPJ = (ownerProfile.person_type || "").toLowerCase().startsWith("p")
                ? ownerProfile.person_type.toLowerCase() === "pj"
                : ownerDoc.replace(/\D/g, "").length === 14;
              const { error: rpcErr } = await supabase.rpc("create_freight_contract_with_payable", {
                _cte_id: cteId,
                _establishment_id: selectedEstId,
                _contratado_id: ownerProfile.id,
                _contratado_nome: maskName(ownerName),
                _contratado_documento: ownerDoc || null,
                _contratado_tipo: isPJ ? "PJ" : "PF",
                _motorista_id: driverProfile?.id ?? null,
                _motorista_nome: driverProfile?.full_name ? maskName(driverProfile.full_name) : (r.motorista ? maskName(r.motorista) : null),
                _motorista_cpf: driverProfile?.cnpj || null,
                _vehicle_id: vehicleId,
                _placa_veiculo: r.placa || null,
                _veiculo_modelo: null,
                _municipio_origem: null,
                _uf_origem: remetente.uf,
                _municipio_destino: null,
                _uf_destino: destinatario.uf,
                _natureza_carga: naturezaCarga,
                _peso_kg: pesoKg,
                _valor_tonelada: pesoKg > 0 ? +(r.valorContrato / (pesoKg / 1000)).toFixed(2) : 0,
                _valor_total: valorContratoFinal,
                _observacoes: dieselTotal > 0
                  ? `Importação lote. Desconto diesel: ${r.litros}L × R$ ${r.valorDiesel.toFixed(2)} = R$ ${dieselTotal.toFixed(2)}`
                  : "Importação lote.",
                _user_id: user?.id ?? null,
              });
              if (rpcErr) {
                errors.push(`Linha ${i + 1} (${r.placa}): contrato falhou — ${rpcErr.message}`);
              }
            }
          }
        }

        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (err: any) {
        errors.push(`Linha ${i + 1} (${r.placa || r.data}): ${err.message}`);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }

    setProgress((p) => ({ ...p, errors }));
    setImporting(false);
    toast({
      title: "Importação concluída",
      description: `${validRows.length - errors.length} de ${validRows.length} CT-e(s) importado(s).${errors.length ? ` ${errors.length} erro(s).` : ""}`,
      variant: errors.length ? "destructive" : "default",
    });
    onImported();
    if (errors.length === 0) {
      reset();
      onOpenChange(false);
    }
  };

  const totalValorCte = rows.reduce((s, r) => s + (r._error ? 0 : r.valorCte), 0);
  const totalValorContrato = rows.reduce((s, r) => s + (r._error ? 0 : r.valorContrato), 0);

  const internalCount = validation ? Object.keys(validation.internalDups).length : 0;
  const dbCount = validation ? Object.keys(validation.dbDups).length : 0;
  const missingCount = validation ? validation.missingPlates.length : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!importing) { if (!v) reset(); onOpenChange(v); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <FileSpreadsheet className="w-5 h-5" /> Importar CT-e em Lote (Serviço)
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cria talões de serviço a partir de uma planilha. Antes, defina os atores fiscais e o tomador — eles serão aplicados a todos os CT-e do lote.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Emitente */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Emitente</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectedEstId} onValueChange={setSelectedEstId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione o emitente" /></SelectTrigger>
                  <SelectContent>
                    {establishments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Atores */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Atores (válidos para todo o lote)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Remetente *", state: remetente, set: setRemetente },
                  { label: "Destinatário *", state: destinatario, set: setDestinatario },
                  { label: "Expedidor", state: expedidor, set: setExpedidor },
                  { label: "Recebedor", state: recebedor, set: setRecebedor },
                ].map((a) => (
                  <div key={a.label}>
                    <Label className="text-xs">{a.label}</Label>
                    <PersonSearchInput
                      placeholder={`Buscar ${a.label.replace(" *", "").toLowerCase()}...`}
                      selectedName={a.state.nome}
                      categories={["cliente", "fornecedor"]}
                      onSelect={(p) => a.set({
                        id: p.id,
                        nome: p.razao_social || p.full_name,
                        cnpj: p.cnpj,
                        ie: p.inscricao_estadual,
                        endereco: [p.address_street, p.address_number, p.address_neighborhood, p.address_city].filter(Boolean).join(", ") || null,
                        municipio_ibge: null,
                        uf: p.address_state,
                      })}
                      onClear={() => a.set(emptyActor)}
                    />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tomador do serviço *</Label>
                    <Select value={String(tomadorTipo)} onValueChange={(v) => setTomadorTipo(Number(v))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Remetente</SelectItem>
                        <SelectItem value="1">Expedidor</SelectItem>
                        <SelectItem value="2">Recebedor</SelectItem>
                        <SelectItem value="3">Destinatário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Natureza da carga *</Label>
                    <NaturezaCargaSearchInput value={naturezaCarga} onChange={setNaturezaCarga} />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={gerarContrato} onCheckedChange={(v) => setGerarContrato(!!v)} />
                  Gerar contrato de frete (conta a pagar) para linhas com valor de contrato &gt; 0
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
                  Colunas esperadas: DATA, PLACA, MOTORISTA, PESO (ton), VALOR DO CT-E, CONTRATO DE FRETE, VALOR DO DIESEL, LITROS, TOTAL DESCONTO.
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
                      <><AlertTriangle className="w-4 h-4 text-destructive" /> Avisos de duplicidade / cadastro</>
                    ) : (
                      <><ShieldCheck className="w-4 h-4 text-emerald-600" /> Nenhum aviso detectado</>
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
                      <span className={missingCount ? "text-destructive font-medium" : "text-muted-foreground"}>
                        Placas sem cadastro: <strong>{missingCount}</strong>
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
                        <PlusCircle className="w-3.5 h-3.5 mr-1" /> Cadastrar placa/motorista/proprietário
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Preview */}
            {rows.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Pré-visualização ({rows.filter((r) => !r._error).length} válidas)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="max-h-72 overflow-auto border rounded-md">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr className="text-left">
                          <th className="px-2 py-1">#</th>
                          <th className="px-2 py-1">Data</th>
                          <th className="px-2 py-1">Placa</th>
                          <th className="px-2 py-1">Motorista</th>
                          <th className="px-2 py-1 text-right">Ton</th>
                          <th className="px-2 py-1 text-right">CT-E</th>
                          <th className="px-2 py-1 text-right">Contrato</th>
                          <th className="px-2 py-1 text-right">Diesel</th>
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
                          return (
                            <tr
                              key={r._key}
                              className={`border-t ${
                                r._error
                                  ? "bg-destructive/10"
                                  : flagged
                                  ? "bg-amber-100/40 dark:bg-amber-500/10"
                                  : ""
                              }`}
                            >
                              <td className="px-2 py-1">{i + 1}</td>
                              <td className="px-2 py-1">{r.data || "?"}</td>
                              <td className="px-2 py-1 font-mono">{r.placa}</td>
                              <td className="px-2 py-1 truncate max-w-[120px]">{r.motorista}</td>
                              <td className="px-2 py-1 text-right">{r.pesoTon.toFixed(2)}</td>
                              <td className="px-2 py-1 text-right">{r.valorCte.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="px-2 py-1 text-right">{r.valorContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                              <td className="px-2 py-1 text-right">{(r.totalDescontado || r.litros * r.valorDiesel).toFixed(2)}</td>
                              <td className="px-2 py-1 text-[10px] text-destructive whitespace-nowrap">
                                {r._error && <div>{r._error}</div>}
                                {internal && (
                                  <div>
                                    Dup. interna ({internal.reason === "peso_data" ? "peso+data" : "peso+placa"}) c/ linha {Array.from(new Set(internal.with)).join(", ")}
                                  </div>
                                )}
                                {dbHits && dbHits.length > 0 && (
                                  <div>
                                    Já existe ({dbHits[0].reason === "peso_data" ? "peso+data" : "peso+placa"})
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
                    <span>Total CT-E: <strong>R$ {totalValorCte.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                    <span>Total Contrato: <strong>R$ {totalValorContrato.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  </div>
                </CardContent>
              </Card>
            )}

            {importing && (
              <div className="p-3 rounded-md border bg-muted/30 text-xs space-y-1">
                <div className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando {progress.done}/{progress.total}...</div>
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
                Importar {rows.filter((r) => !r._error).length} CT-e(s)
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
