import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Printer, Loader2, FileSpreadsheet, Search, Share2 } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

type ReportType =
  | "cte"
  | "mdfe"
  | "contratos"
  | "colheita"
  | "ordens_carregamento"
  | "ordens_abastecimento"
  | "cotacoes"
  | "manutencoes"
  | "abastecimentos";

interface Filters {
  dataInicio: string;
  dataFim: string;
  status: string;
  clienteId: string;
  motoristaId: string;
  vehicleId: string;
  proprietarioId: string;
}

interface Row {
  id: string;
  data: string;
  titulo: string;
  subtitulo: string;
  pessoa: string;
  veiculo: string;
  proprietario: string;
  origem: string;
  destino: string;
  status: string;
  valor: number;
}

const initial = (): Filters => ({
  dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  status: "todos",
  clienteId: "todos",
  motoristaId: "todos",
  vehicleId: "todos",
  proprietarioId: "todos",
});

const STATUS_OPTIONS: Record<ReportType, { value: string; label: string }[]> = {
  cte: [
    { value: "todos", label: "Todos" },
    { value: "rascunho", label: "Rascunho" },
    { value: "autorizado", label: "Autorizado" },
    { value: "rejeitado", label: "Rejeitado" },
    { value: "cancelado", label: "Cancelado" },
  ],
  mdfe: [
    { value: "todos", label: "Todos" },
    { value: "rascunho", label: "Rascunho" },
    { value: "autorizado", label: "Autorizado" },
    { value: "encerrado", label: "Encerrado" },
    { value: "cancelado", label: "Cancelado" },
  ],
  contratos: [{ value: "todos", label: "Todos" }],
  colheita: [
    { value: "todos", label: "Todos" },
    { value: "ativa", label: "Ativa" },
    { value: "encerrada", label: "Encerrada" },
  ],
  ordens_carregamento: [
    { value: "todos", label: "Todos" },
    { value: "aberta", label: "Aberta" },
    { value: "concluida", label: "Concluída" },
    { value: "cancelada", label: "Cancelada" },
  ],
  ordens_abastecimento: [
    { value: "todos", label: "Todos" },
    { value: "pendente", label: "Pendente" },
    { value: "aprovada", label: "Aprovada" },
    { value: "concluida", label: "Concluída" },
    { value: "cancelada", label: "Cancelada" },
  ],
  cotacoes: [
    { value: "todos", label: "Todos" },
    { value: "rascunho", label: "Rascunho" },
    { value: "enviada", label: "Enviada" },
    { value: "aprovada", label: "Aprovada" },
    { value: "rejeitada", label: "Rejeitada" },
    { value: "expirada", label: "Expirada" },
  ],
  manutencoes: [
    { value: "todos", label: "Todos" },
    { value: "agendada", label: "Agendada" },
    { value: "em_andamento", label: "Em andamento" },
    { value: "concluida", label: "Concluída" },
    { value: "cancelada", label: "Cancelada" },
  ],
  abastecimentos: [
    { value: "todos", label: "Todos" },
    { value: "nao_faturado", label: "Não Faturado" },
    { value: "faturado", label: "Faturado" },
  ],
};

const TITLES: Record<ReportType, string> = {
  cte: "RELATÓRIO DE CT-e",
  mdfe: "RELATÓRIO DE MDF-e",
  contratos: "RELATÓRIO DE CONTRATOS DE FRETE",
  colheita: "RELATÓRIO DE COLHEITA",
  ordens_carregamento: "RELATÓRIO DE ORDENS DE CARREGAMENTO",
  ordens_abastecimento: "RELATÓRIO DE ORDENS DE ABASTECIMENTO",
  cotacoes: "RELATÓRIO DE COTAÇÕES",
  manutencoes: "RELATÓRIO DE MANUTENÇÕES",
  abastecimentos: "RELATÓRIO DE ABASTECIMENTOS",
};

export function TransportReports() {
  const isMobile = useIsMobile();
  const [reportType, setReportType] = useState<ReportType>("cte");
  const [filters, setFilters] = useState<Filters>(initial());
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [clienteSearch, setClienteSearch] = useState("");
  const [motoristaSearch, setMotoristaSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [proprietarioSearch, setProprietarioSearch] = useState("");

  useEffect(() => {
    supabase.from("profiles").select("id, user_id, full_name, nome_fantasia, razao_social, category, is_owner").order("full_name").then(({ data }) => setProfiles(data || []));
    supabase.from("vehicles").select("id, plate, brand, model, owner_id").order("plate").then(({ data }) => setVehicles(data || []));
  }, []);

  const ownerName = useCallback((userId?: string | null) => {
    if (!userId) return "—";
    const p = profiles.find((x) => x.user_id === userId);
    return p ? (p.nome_fantasia || p.razao_social || p.full_name) : "—";
  }, [profiles]);

  const handleTab = (t: string) => {
    setReportType(t as ReportType);
    setFilters(initial());
    setRows([]);
  };

  const updateFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const profileName = useCallback((id?: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p ? (p.nome_fantasia || p.razao_social || p.full_name) : "—";
  }, [profiles]);

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const ownerByPlate = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => {
      if (v.plate) m.set(v.plate, ownerName(v.owner_id));
    });
    return m;
  }, [vehicles, ownerName]);

  /** Plates owned by a given proprietário profile id */
  const platesByOwnerId = useMemo(() => {
    const m = new Map<string, Set<string>>();
    vehicles.forEach((v) => {
      if (!v.owner_id || !v.plate) return;
      if (!m.has(v.owner_id)) m.set(v.owner_id, new Set());
      m.get(v.owner_id)!.add(v.plate);
    });
    return m;
  }, [vehicles]);

  const vehicleIdsByOwnerId = useMemo(() => {
    const m = new Map<string, Set<string>>();
    vehicles.forEach((v) => {
      if (!v.owner_id) return;
      if (!m.has(v.owner_id)) m.set(v.owner_id, new Set());
      m.get(v.owner_id)!.add(v.id);
    });
    return m;
  }, [vehicles]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result: Row[] = [];
      const ownedPlates = filters.proprietarioId !== "todos" ? platesByOwnerId.get(filters.proprietarioId) : null;
      const ownedVehicleIds = filters.proprietarioId !== "todos" ? vehicleIdsByOwnerId.get(filters.proprietarioId) : null;

      if (reportType === "cte") {
        let q: any = supabase.from("ctes").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("tomador_id", filters.clienteId);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        if (ownedPlates && ownedPlates.size > 0) q = q.in("placa_veiculo", Array.from(ownedPlates));
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const trunc = (s?: string | null, n = 22) => {
            const t = (s || "").trim();
            return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
          };
          const origemRaw = c.remetente_nome || c.expedidor_nome || c.municipio_origem_nome || c.uf_origem || "";
          const destinoRaw = c.recebedor_nome || c.destinatario_nome || c.municipio_destino_nome || c.uf_destino || "";
          const origem = trunc(origemRaw) || "—";
          const destino = trunc(destinoRaw) || "—";
          const placa = c.placa_veiculo || "—";
          const isServ = c.tipo_talao === "servico";
          const numExib = isServ ? (c.numero_interno ?? c.numero) : c.numero;
          const pesoTxt = c.peso_bruto ? `${Number(c.peso_bruto).toLocaleString("pt-BR")} kg` : "";
          const descBase = c.produto_predominante || c.natureza_operacao || "—";
          return {
            id: c.id,
            data: c.data_emissao,
            titulo: `CT-e ${isServ ? "Serviço" : "Produção"} Nº ${numExib ?? "—"}`,
            subtitulo: pesoTxt ? `${descBase} • ${pesoTxt}` : descBase,
            pessoa: c.tomador_nome || profileName(c.tomador_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem,
            destino,
            status: c.status,
            valor: Number(c.valor_frete || c.valor_receber || 0),
          };
        });
      } else if (reportType === "mdfe") {
        let q: any = supabase.from("mdfe").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        if (ownedPlates && ownedPlates.size > 0) q = q.in("placa_veiculo", Array.from(ownedPlates));
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => {
          const qtdCtes = Array.isArray(m.lista_ctes) ? m.lista_ctes.length : 0;
          const placa = m.placa_veiculo || "—";
          return {
            id: m.id,
            data: m.data_emissao,
            titulo: `MDF-e ${m.numero || "—"}/${m.serie || ""}`,
            subtitulo: `${qtdCtes} CT-e(s) vinculado(s)`,
            pessoa: profileName(m.motorista_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem: m.uf_carregamento || "—",
            destino: m.uf_descarregamento || "—",
            status: m.status,
            valor: 0,
          };
        });
      } else if (reportType === "contratos") {
        let q: any = supabase.from("freight_contracts").select("*");
        if (filters.dataInicio) q = q.gte("data_contrato", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_contrato", filters.dataFim);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        if (ownedVehicleIds && ownedVehicleIds.size > 0) q = q.in("vehicle_id", Array.from(ownedVehicleIds));
        const { data, error } = await q.order("data_contrato", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const placa = c.placa_veiculo || "—";
          return {
            id: c.id,
            data: c.data_contrato,
            titulo: `Contrato ${c.numero || "—"}`,
            subtitulo: `${c.contratado_nome || "—"} • ${(c.peso_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: c.contratado_nome || "—",
            veiculo: placa,
            proprietario: c.contratado_nome || ownerByPlate.get(placa) || "—",
            origem: c.municipio_origem || "—",
            destino: c.municipio_destino || "—",
            status: "—",
            valor: Number(c.valor_total || 0),
          };
        });
      } else if (reportType === "colheita") {
        let q: any = supabase.from("harvest_jobs").select("*");
        if (filters.dataInicio) q = q.gte("harvest_period_start", filters.dataInicio);
        if (filters.dataFim) q = q.lte("harvest_period_start", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("client_id", filters.clienteId);
        const { data, error } = await q.order("harvest_period_start", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((h: any) => ({
          id: h.id,
          data: h.harvest_period_start,
          titulo: `${h.farm_name || "Fazenda"}`,
          subtitulo: `${h.total_third_party_vehicles || 0} veíc. • Período: ${formatDateBR(h.harvest_period_start)} a ${formatDateBR(h.harvest_period_end)}`,
          pessoa: profileName(h.client_id),
          veiculo: "—",
          proprietario: "—",
          origem: h.location || "—",
          destino: "—",
          status: h.status,
          valor: Number(h.payment_value || h.monthly_value || 0),
        }));
      } else if (reportType === "ordens_carregamento") {
        let q: any = supabase.from("freight_applications").select("*, freight:freight_id(origin_city, origin_state, destination_city, destination_state, value_brl, weight_kg, cargo_type)");
        if (filters.dataInicio) q = q.gte("applied_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("applied_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        if (ownedVehicleIds && ownedVehicleIds.size > 0) q = q.in("vehicle_id", Array.from(ownedVehicleIds));
        const { data, error } = await q.order("applied_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((a: any) => {
          const f = a.freight || {};
          return {
            id: a.id,
            data: a.applied_at,
            titulo: `OC ${a.cte_number ? `• CT-e ${a.cte_number}` : ""}`,
            subtitulo: `${f.cargo_type || "Carga"} • ${(f.weight_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: profileName(a.user_id),
            veiculo: "—",
            proprietario: "—",
            origem: `${f.origin_city || "—"}/${f.origin_state || ""}`,
            destino: `${f.destination_city || "—"}/${f.destination_state || ""}`,
            status: a.status,
            valor: Number(f.value_brl || 0),
          };
        });
      } else if (reportType === "ordens_abastecimento") {
        let q: any = supabase.from("fuel_orders").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        if (ownedVehicleIds && ownedVehicleIds.size > 0) q = q.in("vehicle_id", Array.from(ownedVehicleIds));
        const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((o: any) => {
          const placa = o.vehicle_plate || "—";
          return {
            id: o.id,
            data: o.created_at,
            titulo: `OA ${o.order_number || "—"}`,
            subtitulo: `${o.fuel_type || "—"} • ${o.fill_mode || "—"} • ${o.liters ? `${o.liters} L` : "—"}`,
            pessoa: o.requester_name || "—",
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem: o.supplier_name || "—",
            destino: "—",
            status: o.status,
            valor: 0,
          };
        });
      } else if (reportType === "cotacoes") {
        let q: any = supabase.from("quotations").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("client_id", filters.clienteId);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => ({
          id: c.id,
          data: c.created_at,
          titulo: `Cotação ${c.numero || "—"}`,
          subtitulo: `${c.produto || "—"} • ${(c.peso_kg || 0).toLocaleString("pt-BR")} kg`,
          pessoa: profileName(c.client_id),
          veiculo: "—",
          proprietario: "—",
          origem: `${c.origem_cidade || "—"}/${c.origem_uf || ""}`,
          destino: `${c.destino_cidade || "—"}/${c.destino_uf || ""}`,
          status: c.status,
          valor: Number(c.valor_frete || c.valor_mensal_por_caminhao || 0),
        }));
      } else if (reportType === "manutencoes") {
        let q: any = supabase.from("maintenances").select("*");
        if (filters.dataInicio) q = q.gte("data_manutencao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_manutencao", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        if (ownedVehicleIds && ownedVehicleIds.size > 0) q = q.in("veiculo_id", Array.from(ownedVehicleIds));
        const { data, error } = await q.order("data_manutencao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => {
          const v = vehicleMap.get(m.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: m.id,
            data: m.data_manutencao,
            titulo: `${m.tipo_manutencao || "Manutenção"}`,
            subtitulo: `${m.descricao || "—"} • Odôm.: ${m.odometro?.toLocaleString("pt-BR") || "—"} km`,
            pessoa: m.fornecedor || "—",
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem: "—",
            destino: "—",
            status: m.status,
            valor: Number(m.custo_total || 0),
          };
        });
      } else if (reportType === "abastecimentos") {
        let q: any = supabase.from("fuelings").select("*").is("deleted_at", null);
        if (filters.dataInicio) q = q.gte("data_abastecimento", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_abastecimento", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status_faturamento", filters.status);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        if (ownedVehicleIds && ownedVehicleIds.size > 0) q = q.in("veiculo_id", Array.from(ownedVehicleIds));
        const { data, error } = await q.order("data_abastecimento", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((f: any) => {
          const v = vehicleMap.get(f.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: f.id,
            data: f.data_abastecimento,
            titulo: `${f.tipo_combustivel || "Combustível"}`,
            subtitulo: `${f.quantidade_litros || 0} L × ${formatCurrency(f.valor_por_litro || 0)}`,
            pessoa: profileName(f.motorista_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem: f.posto_combustivel || "—",
            destino: "—",
            status: f.status_faturamento || "—",
            valor: Number(f.valor_total || 0),
          };
        });
      }
      setRows(result);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [reportType, filters, profileName, vehicleMap, ownerByPlate, platesByOwnerId, vehicleIdsByOwnerId]);

  const totals = useMemo(() => ({ total: rows.reduce((s, r) => s + r.valor, 0), count: rows.length }), [rows]);

  const showCliente = ["cte", "colheita", "cotacoes"].includes(reportType);
  const showMotorista = ["cte", "mdfe", "contratos", "abastecimentos"].includes(reportType);
  const showVehicle = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);
  const showProprietario = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);
  const showStatus = reportType !== "contratos";
  const showValor = reportType !== "mdfe" && reportType !== "ordens_abastecimento";

  const clienteList = useMemo(() => {
    const term = clienteSearch.trim().toLowerCase();
    const base = profiles.filter((p) => p.category === "cliente");
    return term ? base.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term))) : base;
  }, [profiles, clienteSearch]);

  const motoristaList = useMemo(() => {
    const term = motoristaSearch.trim().toLowerCase();
    const base = profiles.filter((p) => p.category === "motorista" || p.category === "colaborador");
    return term ? base.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term))) : base;
  }, [profiles, motoristaSearch]);

  const proprietarioList = useMemo(() => {
    const term = proprietarioSearch.trim().toLowerCase();
    const ownerUserIds = new Set(vehicles.map((v) => v.owner_id).filter(Boolean));
    const base = profiles.filter((p) => p.user_id && (p.is_owner || ownerUserIds.has(p.user_id)));
    return term ? base.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term))) : base;
  }, [profiles, vehicles, proprietarioSearch]);

  const vehicleList = useMemo(() => {
    const term = vehicleSearch.trim().toLowerCase();
    return term ? vehicles.filter((v) => [v.plate, v.brand, v.model].some((n) => (n || "").toLowerCase().includes(term))) : vehicles;
  }, [vehicles, vehicleSearch]);

  const getReportMeta = async () => {
    let estName = "";
    let estCnpj = "";
    try {
      const { data } = await supabase.from("fiscal_establishments").select("razao_social,cnpj,type").eq("active", true).order("type");
      if (data && data.length > 0) {
        const matriz = data.find((e: any) => e.type === "matriz") || data[0];
        estName = matriz?.razao_social || "";
        estCnpj = data
          .map((e: any) => {
            const c = e.cnpj;
            return c ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : "";
          })
          .filter(Boolean)
          .join(" / ");
      }
    } catch {}

    return { estName, estCnpj };
  };

  const buildReportHtml = ({ estName, estCnpj }: { estName: string; estCnpj: string }) => {
    const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
    const periodoLabel = `${formatDateBR(filters.dataInicio)} a ${formatDateBR(filters.dataFim)}`;

    const statusBadge = (s: string) => {
      const colors: Record<string, { bg: string; fg: string }> = {
        autorizado: { bg: "#d4edda", fg: "#155724" },
        encerrado: { bg: "#d4edda", fg: "#155724" },
        concluida: { bg: "#d4edda", fg: "#155724" },
        aprovada: { bg: "#d4edda", fg: "#155724" },
        faturado: { bg: "#cce5ff", fg: "#004085" },
        rascunho: { bg: "#fff3cd", fg: "#856404" },
        pendente: { bg: "#fff3cd", fg: "#856404" },
        aberta: { bg: "#fff3cd", fg: "#856404" },
        ativa: { bg: "#fff3cd", fg: "#856404" },
        agendada: { bg: "#fff3cd", fg: "#856404" },
        em_andamento: { bg: "#cce5ff", fg: "#004085" },
        rejeitado: { bg: "#f8d7da", fg: "#721c24" },
        rejeitada: { bg: "#f8d7da", fg: "#721c24" },
        cancelado: { bg: "#f8d7da", fg: "#721c24" },
        cancelada: { bg: "#f8d7da", fg: "#721c24" },
        expirada: { bg: "#f8d7da", fg: "#721c24" },
        nao_faturado: { bg: "#e9ecef", fg: "#495057" },
      };
      const c = colors[s] || { bg: "#e9ecef", fg: "#495057" };
      return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${c.bg};color:${c.fg}">${s}</span>`;
    };

    const tableRows = rows
      .map(
        (r, i) => `<tr style="border-bottom:1px solid #f0f2f5">
      <td style="padding:6px 8px;font-size:10px;color:#888;text-align:center;width:24px">${i + 1}</td>
      <td style="padding:6px 8px;font-size:10px;color:#555;white-space:nowrap">${formatDateBR(r.data)}</td>
      <td style="padding:6px 8px;font-size:10px;color:#333">
        <div style="font-weight:600">${r.titulo}</div>
        <div style="font-size:9px;color:#888;margin-top:1px">${r.subtitulo}</div>
      </td>
      <td style="padding:6px 8px;font-size:10px;color:#555">${r.origem !== "—" || r.destino !== "—" ? `${r.origem} → ${r.destino}` : "—"}</td>
      <td style="padding:6px 8px;font-size:10px;color:#333">${r.veiculo}<div style="font-size:9px;color:#888">${r.proprietario}</div></td>
      <td style="padding:6px 8px;text-align:center">${statusBadge(r.status)}</td>
      ${showValor ? `<td style="padding:6px 10px;text-align:right;font-weight:700;color:#2B4C7E;white-space:nowrap;font-size:11px">${formatCurrency(r.valor)}</td>` : ""}
    </tr>`,
      )
      .join("");

    const colspan = showValor ? 6 : 6;
    const totalLine = showValor
      ? `<tr style="background:#f0f4f8"><td colspan="${colspan}" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total Geral</td><td style="padding:10px;text-align:right;font-size:14px;font-weight:800;color:#2B4C7E">${formatCurrency(totals.total)}</td></tr>`
      : `<tr style="background:#f0f4f8"><td colspan="${colspan}" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total: ${rows.length} registro(s)</td></tr>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${TITLES[reportType]}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print { @page { margin: 10mm 8mm; size: A4 portrait; } html,body{margin:0!important;padding:0!important;background:#fff!important} .no-print{display:none!important} }
.toolbar{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 16px;display:flex;gap:8px;justify-content:flex-end;box-shadow:0 1px 4px rgba(0,0,0,0.05)}
.toolbar button{font-family:${FONT};font-size:12px;font-weight:600;padding:8px 14px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#2B4C7E;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.toolbar button.primary{background:#2B4C7E;color:#fff;border-color:#2B4C7E}
.toolbar button:hover{opacity:0.9}
</style></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:${FONT}">
<div class="toolbar no-print">
  <button onclick="window.print()" class="primary">🖨️ Imprimir</button>
  <button onclick="(window.opener&&window.opener.__shareTransportPdf)?window.opener.__shareTransportPdf():alert('Não foi possível compartilhar')">📤 Compartilhar PDF</button>
</div>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 8px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:800px;font-family:${FONT}">
<tr><td style="background:#fff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E">
<table width="100%"><tr>
<td style="width:48px"><div style="width:42px;height:42px;border-radius:6px;background:#2B4C7E;color:#F5C518;font-weight:800;font-size:18px;text-align:center;line-height:42px;font-family:${FONT}">ST</div></td>
<td><div style="font-weight:800;font-size:18px;color:#2B4C7E">SIME <span style="color:#F5C518">TRANSPORTES</span></div>
<div style="font-size:11px;color:#666">${estName}</div>
${estCnpj ? estCnpj.split(" / ").map((c) => `<div style="font-size:11px;color:#666">CNPJ: ${c}</div>`).join("") : ""}
</td></tr></table></td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="background:#fff;border-radius:10px;padding:10px 20px;text-align:center">
<div style="font-size:17px;font-weight:700;color:#2B4C7E">${TITLES[reportType]}</div>
<div style="font-size:11px;color:#888;margin-top:4px">Período: ${periodoLabel} • ${rows.length} registro(s)</div>
</td></tr>
<tr><td style="height:8px"></td></tr>
<tr><td style="background:#fff;border-radius:10px;overflow:hidden">
<table width="100%" cellpadding="0" cellspacing="0">
<tr style="background:#f5f7fa">
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase;text-align:center;width:24px">#</td>
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase">Data</td>
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase">Descrição</td>

<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase">Origem → Destino</td>
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase">Veículo / Proprietário</td>
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase;text-align:center">Status</td>
${showValor ? `<td style="padding:7px 10px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase;text-align:right">Valor</td>` : ""}
</tr>
${tableRows}
${totalLine}
</table></td></tr>
<tr><td style="height:10px"></td></tr>
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
<div style="font-size:10px;color:rgba(255,255,255,0.85)">SIME TRANSPORTES${estName ? ` — ${estName}` : ""}</div>
<div style="font-size:10px;color:rgba(255,255,255,0.85)">Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
</td></tr>
</table></td></tr></table></body></html>`;
  };

  const handlePrint = async () => {
    if (!rows.length) return toast.warning("Nenhum dado para imprimir");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Não foi possível abrir a impressão", { description: "Libere pop-ups para gerar o PDF na tela." });

    try {
      (window as any).__shareTransportPdf = () => { handleShare(); };
      const html = buildReportHtml(await getReportMeta());
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
    } catch (e: any) {
      printWindow.close();
      toast.error("Erro ao abrir impressão", { description: e?.message });
    }
  };

  const generatePdfBlob = async ({ estName, estCnpj }: { estName: string; estCnpj: string }) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const cols = showValor
      ? [7, 18, 45, 50, 38, 18, 28]
      : [8, 20, 55, 60, 45, 24];
    const headers = showValor
      ? ["#", "Data", "Descrição", "Origem → Destino", "Veículo / Proprietário", "Status", "Valor"]
      : ["#", "Data", "Descrição", "Origem → Destino", "Veículo / Proprietário", "Status"];
    const x = cols.reduce<number[]>((acc, w, i) => (i ? [...acc, acc[i - 1] + cols[i - 1]] : [margin]), []);

    const addHeader = () => {
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      doc.setFillColor(43, 76, 126);
      doc.roundedRect(margin, 8, 42, 15, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(245, 197, 24);
      doc.text("ST", margin + 4, 18);
      doc.setTextColor(43, 76, 126);
      doc.text("SIME TRANSPORTES", margin + 48, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(95, 95, 95);
      if (estName) doc.text(estName, margin + 48, 19);
      if (estCnpj) doc.text(estCnpj.split(" / ").map((c) => `CNPJ: ${c}`).join("   "), margin + 48, 23);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(43, 76, 126);
      doc.text(TITLES[reportType], pageWidth / 2, 34, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Período: ${formatDateBR(filters.dataInicio)} a ${formatDateBR(filters.dataFim)} • ${rows.length} registro(s)`, pageWidth / 2, 39, { align: "center" });

      doc.setFillColor(245, 247, 250);
      doc.rect(margin, 44, cols.reduce((s, w) => s + w, 0), 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      headers.forEach((h, i) => doc.text(h, x[i] + 1.5, 48.5));
      return 52;
    };

    let y = addHeader();
    rows.forEach((r, idx) => {
      const row = [
        String(idx + 1),
        formatDateBR(r.data),
        `${r.titulo}\n${r.subtitulo}`,
        r.origem !== "—" || r.destino !== "—" ? `${r.origem} → ${r.destino}` : "—",
        `${r.veiculo}\n${r.proprietario}`,
        r.status,
        ...(showValor ? [formatCurrency(r.valor)] : []),
      ];
      const wrapped = row.map((value, i) => doc.splitTextToSize(value || "—", cols[i] - 3));
      const rowHeight = Math.max(7, ...wrapped.map((lines) => lines.length * 3.4 + 2));
      if (y + rowHeight > pageHeight - 18) {
        doc.addPage();
        y = addHeader();
      }
      doc.setDrawColor(235, 238, 242);
      doc.line(margin, y + rowHeight, margin + cols.reduce((s, w) => s + w, 0), y + rowHeight);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(55, 55, 55);
      wrapped.forEach((lines, i) => {
        if (showValor && i === wrapped.length - 1) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(43, 76, 126);
          doc.text(lines, x[i] + cols[i] - 1.5, y + 3.8, { align: "right" });
          doc.setFont("helvetica", "normal");
          doc.setTextColor(55, 55, 55);
        } else {
          doc.text(lines, x[i] + 1.5, y + 3.8);
        }
      });
      y += rowHeight;
    });

    if (showValor) {
      if (y + 10 > pageHeight - 18) {
        doc.addPage();
        y = addHeader();
      }
      doc.setFillColor(240, 244, 248);
      doc.rect(margin, y, cols.reduce((s, w) => s + w, 0), 9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(43, 76, 126);
      doc.text("Total Geral", margin + cols.reduce((s, w) => s + w, 0) - 58, y + 6);
      doc.text(formatCurrency(totals.total), margin + cols.reduce((s, w) => s + w, 0) - 2, y + 6, { align: "right" });
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(`Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, margin, pageHeight - 8);
      doc.text(`Página ${page}/${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    return doc.output("blob");
  };

  const handleShare = async () => {
    if (!rows.length) return toast.warning("Nenhum dado para compartilhar");

    try {
      const filename = `relatorio-transporte-${reportType}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      const pdfBlob = await generatePdfBlob(await getReportMeta());
      const file = new File([pdfBlob], filename, { type: "application/pdf" });
      const nav: any = navigator;

      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: TITLES[reportType] });
        return;
      }

      const url = URL.createObjectURL(pdfBlob);
      const opened = window.open(url, "_blank");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      toast.error("Erro ao compartilhar PDF", { description: e?.message });
    }
  };

  const exportCsv = () => {
    if (!rows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Título", "Detalhes", "Pessoa", "Origem", "Destino", "Veículo", "Proprietário", "Status", "Valor"];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push([
        formatDateBR(r.data),
        r.titulo.replace(/;/g, ","),
        r.subtitulo.replace(/;/g, ","),
        r.pessoa.replace(/;/g, ","),
        r.origem.replace(/;/g, ","),
        r.destino.replace(/;/g, ","),
        r.veiculo,
        r.proprietario.replace(/;/g, ","),
        r.status,
        r.valor.toFixed(2).replace(".", ","),
      ].join(";"));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-transporte-${reportType}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-foreground">Relatórios de Transporte</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={!rows.length} className="gap-1">
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </Button>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={handleTab}>
        <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
          <TabsTrigger value="cte">CT-e</TabsTrigger>
          <TabsTrigger value="mdfe">MDF-e</TabsTrigger>
          <TabsTrigger value="contratos">Contratos</TabsTrigger>
          <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
          <TabsTrigger value="abastecimentos">Abastecimentos</TabsTrigger>
        </TabsList>

        <TabsContent value={reportType} className="mt-4">
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data Inicial</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataInicio} onChange={(e) => updateFilter("dataInicio", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data Final</Label>
                  <Input type="date" className="h-8 text-xs" value={filters.dataFim} onChange={(e) => updateFilter("dataFim", e.target.value)} />
                </div>
                {showStatus && (
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showCliente && (
                  <div className="space-y-1">
                    <Label className="text-xs">Cliente</Label>
                    <Select value={filters.clienteId} onValueChange={(v) => updateFilter("clienteId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input value={clienteSearch} onChange={(e) => setClienteSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Buscar..." className="h-7 text-xs pl-7" />
                          </div>
                        </div>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {clienteList.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                        {clienteList.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showMotorista && (
                  <div className="space-y-1">
                    <Label className="text-xs">Motorista</Label>
                    <Select value={filters.motoristaId} onValueChange={(v) => updateFilter("motoristaId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input value={motoristaSearch} onChange={(e) => setMotoristaSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Buscar..." className="h-7 text-xs pl-7" />
                          </div>
                        </div>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {motoristaList.slice(0, 100).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                        {motoristaList.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showVehicle && (
                  <div className="space-y-1">
                    <Label className="text-xs">Veículo</Label>
                    <Select value={filters.vehicleId} onValueChange={(v) => updateFilter("vehicleId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Buscar placa..." className="h-7 text-xs pl-7" />
                          </div>
                        </div>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {vehicleList.slice(0, 100).map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.plate} • {v.brand} {v.model}</SelectItem>)}
                        {vehicleList.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showProprietario && (
                  <div className="space-y-1">
                    <Label className="text-xs">Proprietário</Label>
                    <Select value={filters.proprietarioId} onValueChange={(v) => updateFilter("proprietarioId", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <div className="sticky top-0 z-10 bg-popover p-1.5 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                            <Input value={proprietarioSearch} onChange={(e) => setProprietarioSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Buscar..." className="h-7 text-xs pl-7" />
                          </div>
                        </div>
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {proprietarioList.slice(0, 100).map((p) => <SelectItem key={p.user_id} value={p.user_id} className="text-xs">{p.nome_fantasia || p.razao_social || p.full_name}</SelectItem>)}
                        {proprietarioList.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum encontrado</div>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1 flex flex-col justify-end">
                  <Button size="sm" onClick={fetchData} disabled={loading} className="gap-1 h-8">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Gerar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {rows.length > 0 && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground">{rows.length} registro(s)</div>
                {showValor && <div className="text-sm font-bold text-primary">Total: {formatCurrency(totals.total)}</div>}
              </div>

              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {rows.map((r) => (
                    <Card key={r.id}>
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">{r.titulo}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{r.subtitulo}</div>
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex flex-col text-muted-foreground truncate">
                            <span>{formatDateBR(r.data)} · {r.pessoa}</span>
                            <span className="truncate">{r.origem} → {r.destino}</span>
                            <span className="truncate">{r.veiculo} · {r.proprietario}</span>
                          </div>
                          {showValor && (
                            <span className="font-mono font-bold tabular-nums text-foreground">{formatCurrency(r.valor)}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium whitespace-nowrap w-[100px]">Data</th>
                          <th className="px-3 py-2 font-medium">Descrição</th>
                          <th className="px-3 py-2 font-medium">Pessoa</th>
                          <th className="px-3 py-2 font-medium">Origem → Destino</th>
                          <th className="px-3 py-2 font-medium">Veículo / Proprietário</th>
                          <th className="px-2 py-2 font-medium text-center w-[110px]">Status</th>
                          {showValor && <th className="px-2 py-2 font-medium text-right w-[130px]">Valor</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                            <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(r.data)}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{r.titulo}</div>
                              <div className="text-[10px] text-muted-foreground">{r.subtitulo}</div>
                            </td>
                            <td className="px-3 py-2">{r.pessoa}</td>
                            <td className="px-3 py-2 text-[11px]">
                              {r.origem === "—" && r.destino === "—" ? "—" : `${r.origem} → ${r.destino}`}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium">{r.veiculo}</div>
                              <div className="text-[10px] text-muted-foreground">{r.proprietario}</div>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                            </td>
                            {showValor && (
                              <td className="px-2 py-2 text-right tabular-nums font-medium">
                                {formatCurrency(r.valor)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
