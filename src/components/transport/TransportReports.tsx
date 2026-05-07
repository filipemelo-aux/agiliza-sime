import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Printer, Loader2, FileSpreadsheet, Search } from "lucide-react";
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

type GroupBy = "none" | "status" | "cliente" | "motorista" | "veiculo" | "origem_destino" | "tipo" | "fornecedor" | "fazenda";

interface Filters {
  dataInicio: string;
  dataFim: string;
  status: string;
  clienteId: string;
  motoristaId: string;
  vehicleId: string;
  groupBy: GroupBy;
}

interface Row {
  id: string;
  data: string;
  titulo: string;
  subtitulo: string;
  pessoa: string;
  veiculo: string;
  status: string;
  valor: number;
  groupKey: { cliente?: string; motorista?: string; veiculo?: string; origem_destino?: string; tipo?: string; fornecedor?: string; fazenda?: string };
}

const initial = (): Filters => ({
  dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  status: "todos",
  clienteId: "todos",
  motoristaId: "todos",
  vehicleId: "todos",
  groupBy: "status",
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

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, nome_fantasia, razao_social, category").order("full_name").then(({ data }) => setProfiles(data || []));
    supabase.from("vehicles").select("id, plate, brand, model").order("plate").then(({ data }) => setVehicles(data || []));
  }, []);

  const handleTab = (t: string) => {
    setReportType(t as ReportType);
    setFilters(initial());
    setRows([]);
  };

  const updateFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  const profileName = (id?: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p ? (p.nome_fantasia || p.razao_social || p.full_name) : "—";
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result: Row[] = [];
      if (reportType === "cte") {
        let q: any = supabase.from("ctes").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("tomador_id", filters.clienteId);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const od = `${c.municipio_origem_nome || c.uf_origem || "—"} → ${c.municipio_destino_nome || c.uf_destino || "—"}`;
          return {
            id: c.id,
            data: c.data_emissao,
            titulo: `CT-e ${c.numero || "—"} • ${c.tomador_nome || profileName(c.tomador_id)}`,
            subtitulo: `${od} • ${c.placa_veiculo || "—"}`,
            pessoa: c.tomador_nome || profileName(c.tomador_id),
            veiculo: c.placa_veiculo || "—",
            status: c.status,
            valor: Number(c.valor_frete || 0),
            groupKey: { cliente: c.tomador_nome || profileName(c.tomador_id), motorista: profileName(c.motorista_id), veiculo: c.placa_veiculo || "—", origem_destino: od },
          };
        });
      } else if (reportType === "mdfe") {
        let q: any = supabase.from("mdfe").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => {
          const od = `${m.uf_carregamento || "—"} → ${m.uf_descarregamento || "—"}`;
          const qtdCtes = Array.isArray(m.lista_ctes) ? m.lista_ctes.length : 0;
          return {
            id: m.id,
            data: m.data_emissao,
            titulo: `MDF-e ${m.numero || "—"}/${m.serie || ""}`,
            subtitulo: `${od} • ${m.placa_veiculo || "—"} • ${qtdCtes} CT-e(s)`,
            pessoa: profileName(m.motorista_id),
            veiculo: m.placa_veiculo || "—",
            status: m.status,
            valor: 0,
            groupKey: { motorista: profileName(m.motorista_id), veiculo: m.placa_veiculo || "—", origem_destino: od },
          };
        });
      } else if (reportType === "contratos") {
        let q: any = supabase.from("freight_contracts").select("*");
        if (filters.dataInicio) q = q.gte("data_contrato", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_contrato", filters.dataFim);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        const { data, error } = await q.order("data_contrato", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const od = `${c.municipio_origem || "—"} → ${c.municipio_destino || "—"}`;
          return {
            id: c.id,
            data: c.data_contrato,
            titulo: `Contrato ${c.numero || "—"} • ${c.contratado_nome || "—"}`,
            subtitulo: `${od} • ${c.placa_veiculo || "—"} • ${(c.peso_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: c.contratado_nome || "—",
            veiculo: c.placa_veiculo || "—",
            status: "—",
            valor: Number(c.valor_total || 0),
            groupKey: { motorista: c.motorista_nome || "—", veiculo: c.placa_veiculo || "—", origem_destino: od, fornecedor: c.contratado_nome || "—" },
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
          titulo: `${h.farm_name || "Fazenda"} • ${profileName(h.client_id)}`,
          subtitulo: `${h.location || "—"} • ${h.total_third_party_vehicles || 0} veíc. • Período: ${formatDateBR(h.harvest_period_start)} a ${formatDateBR(h.harvest_period_end)}`,
          pessoa: profileName(h.client_id),
          veiculo: "—",
          status: h.status,
          valor: Number(h.payment_value || h.monthly_value || 0),
          groupKey: { cliente: profileName(h.client_id), fazenda: h.farm_name || "—" },
        }));
      } else if (reportType === "ordens_carregamento") {
        let q: any = supabase.from("freight_applications").select("*, freight:freight_id(origin_city, origin_state, destination_city, destination_state, value_brl, weight_kg, cargo_type)");
        if (filters.dataInicio) q = q.gte("applied_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("applied_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        const { data, error } = await q.order("applied_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((a: any) => {
          const f = a.freight || {};
          const od = `${f.origin_city || "—"}/${f.origin_state || ""} → ${f.destination_city || "—"}/${f.destination_state || ""}`;
          return {
            id: a.id,
            data: a.applied_at,
            titulo: `OC • ${f.cargo_type || "Carga"} ${a.cte_number ? `• CT-e ${a.cte_number}` : ""}`,
            subtitulo: `${od} • ${(f.weight_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: profileName(a.user_id),
            veiculo: "—",
            status: a.status,
            valor: Number(f.value_brl || 0),
            groupKey: { motorista: profileName(a.user_id), origem_destino: od },
          };
        });
      } else if (reportType === "ordens_abastecimento") {
        let q: any = supabase.from("fuel_orders").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((o: any) => ({
          id: o.id,
          data: o.created_at,
          titulo: `OA ${o.order_number || "—"} • ${o.supplier_name || "—"}`,
          subtitulo: `${o.fuel_type || "—"} • ${o.fill_mode || "—"} • ${o.liters ? `${o.liters} L` : "—"}`,
          pessoa: o.requester_name || "—",
          veiculo: o.vehicle_plate || "—",
          status: o.status,
          valor: 0,
          groupKey: { veiculo: o.vehicle_plate || "—", fornecedor: o.supplier_name || "—", tipo: o.fuel_type || "—" },
        }));
      } else if (reportType === "cotacoes") {
        let q: any = supabase.from("quotations").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("client_id", filters.clienteId);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const od = `${c.origem_cidade || "—"}/${c.origem_uf || ""} → ${c.destino_cidade || "—"}/${c.destino_uf || ""}`;
          return {
            id: c.id,
            data: c.created_at,
            titulo: `Cotação ${c.numero || "—"} • ${profileName(c.client_id)}`,
            subtitulo: `${od} • ${c.produto || "—"} • ${(c.peso_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: profileName(c.client_id),
            veiculo: "—",
            status: c.status,
            valor: Number(c.valor_frete || c.valor_mensal_por_caminhao || 0),
            groupKey: { cliente: profileName(c.client_id), tipo: c.type || "—", origem_destino: od },
          };
        });
      } else if (reportType === "manutencoes") {
        let q: any = supabase.from("maintenances").select("*");
        if (filters.dataInicio) q = q.gte("data_manutencao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_manutencao", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        const { data, error } = await q.order("data_manutencao", { ascending: false }).limit(2000);
        if (error) throw error;
        const vMap = new Map(vehicles.map((v) => [v.id, v]));
        result = (data || []).map((m: any) => {
          const v = vMap.get(m.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: m.id,
            data: m.data_manutencao,
            titulo: `${m.tipo_manutencao || "Manutenção"} • ${placa}`,
            subtitulo: `${m.descricao || "—"} • Odôm.: ${m.odometro?.toLocaleString("pt-BR") || "—"} km`,
            pessoa: m.fornecedor || "—",
            veiculo: placa,
            status: m.status,
            valor: Number(m.custo_total || 0),
            groupKey: { veiculo: placa, fornecedor: m.fornecedor || "—", tipo: m.tipo_manutencao || "—" },
          };
        });
      } else if (reportType === "abastecimentos") {
        let q: any = supabase.from("fuelings").select("*").is("deleted_at", null);
        if (filters.dataInicio) q = q.gte("data_abastecimento", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_abastecimento", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status_faturamento", filters.status);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("veiculo_id", filters.vehicleId);
        const { data, error } = await q.order("data_abastecimento", { ascending: false }).limit(2000);
        if (error) throw error;
        const vMap = new Map(vehicles.map((v) => [v.id, v]));
        result = (data || []).map((f: any) => {
          const v = vMap.get(f.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: f.id,
            data: f.data_abastecimento,
            titulo: `${f.tipo_combustivel || "Combustível"} • ${placa}`,
            subtitulo: `${f.quantidade_litros || 0} L × ${formatCurrency(f.valor_por_litro || 0)} • ${f.posto_combustivel || "—"}`,
            pessoa: profileName(f.motorista_id),
            veiculo: placa,
            status: f.status_faturamento || "—",
            valor: Number(f.valor_total || 0),
            groupKey: { veiculo: placa, motorista: profileName(f.motorista_id), tipo: f.tipo_combustivel || "—", fornecedor: f.posto_combustivel || "—" },
          };
        });
      }
      setRows(result);
    } catch (e: any) {
      toast.error("Erro ao gerar relatório", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [reportType, filters, profiles, vehicles]);

  const grouped = useMemo(() => {
    const gb = filters.groupBy;
    if (gb === "none") return [{ key: "Todos", rows }];
    const map = new Map<string, Row[]>();
    rows.forEach((r) => {
      const k = (r.groupKey as any)[gb] || (gb === "status" ? r.status : "—");
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, rs]) => ({ key, rows: rs }));
  }, [rows, filters.groupBy]);

  const totals = useMemo(() => ({ total: rows.reduce((s, r) => s + r.valor, 0), count: rows.length }), [rows]);

  const groupOptions = useMemo<{ value: GroupBy; label: string }[]>(() => {
    const base: { value: GroupBy; label: string }[] = [
      { value: "none", label: "Sem agrupamento" },
      { value: "status", label: "Status" },
    ];
    const k = reportType;
    if (["cte", "colheita", "cotacoes"].includes(k)) base.push({ value: "cliente", label: "Cliente" });
    if (["cte", "mdfe", "contratos", "ordens_carregamento", "abastecimentos"].includes(k)) base.push({ value: "motorista", label: "Motorista/Solicitante" });
    if (["cte", "mdfe", "contratos", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(k)) base.push({ value: "veiculo", label: "Veículo" });
    if (["cte", "mdfe", "contratos", "ordens_carregamento", "cotacoes"].includes(k)) base.push({ value: "origem_destino", label: "Origem → Destino" });
    if (["ordens_abastecimento", "manutencoes", "abastecimentos", "cotacoes"].includes(k)) base.push({ value: "tipo", label: "Tipo" });
    if (["contratos", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(k)) base.push({ value: "fornecedor", label: "Fornecedor" });
    if (k === "colheita") base.push({ value: "fazenda", label: "Fazenda" });
    return base;
  }, [reportType]);

  const showCliente = ["cte", "colheita", "cotacoes"].includes(reportType);
  const showMotorista = ["cte", "mdfe", "contratos", "abastecimentos"].includes(reportType);
  const showVehicle = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);

  const handlePrint = async () => {
    if (!rows.length) return toast.warning("Nenhum dado para imprimir");
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

    const FONT = "'Exo','Segoe UI','Trebuchet MS',Arial,sans-serif";
    const logoUrl = "https://agiliza-sime.lovable.app/favicon.png";
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

    const showValor = reportType !== "mdfe" && reportType !== "ordens_abastecimento";

    const sectionsHtml = grouped
      .map((g) => {
        const subtotal = g.rows.reduce((s, r) => s + r.valor, 0);
        const tableRows = g.rows
          .map(
            (r, i) => `<tr style="border-bottom:1px solid #f0f2f5">
        <td style="padding:6px 8px;font-size:10px;color:#888;text-align:center;width:24px">${i + 1}</td>
        <td style="padding:6px 8px;font-size:10px;color:#555;white-space:nowrap">${formatDateBR(r.data)}</td>
        <td style="padding:6px 8px;font-size:10px;color:#333">
          <div style="font-weight:600">${r.titulo}</div>
          <div style="font-size:9px;color:#888;margin-top:1px">${r.subtitulo}</div>
        </td>
        <td style="padding:6px 8px;text-align:center">${statusBadge(r.status)}</td>
        ${showValor ? `<td style="padding:6px 10px;text-align:right;font-weight:700;color:#2B4C7E;white-space:nowrap;font-size:11px">${formatCurrency(r.valor)}</td>` : ""}
      </tr>`,
          )
          .join("");
        const colSpanHeader = showValor ? 5 : 4;
        const groupHeader =
          filters.groupBy !== "none"
            ? `<tr style="background:#eef2f7"><td colspan="${colSpanHeader}" style="padding:6px 10px;font-size:10px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:0.3px">${g.key} <span style="color:#888;font-weight:400">(${g.rows.length})</span></td></tr>`
            : "";
        const subtotalRow =
          filters.groupBy !== "none" && showValor
            ? `<tr style="background:#fafbfc"><td colspan="4" style="padding:5px 10px;text-align:right;font-size:10px;color:#666;font-weight:600">Subtotal</td><td style="padding:5px 10px;text-align:right;font-weight:700;color:#2B4C7E;font-size:11px">${formatCurrency(subtotal)}</td></tr>`
            : "";
        return groupHeader + tableRows + subtotalRow;
      })
      .join("");

    const totalLine = showValor
      ? `<tr style="background:#f0f4f8"><td colspan="4" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total Geral</td><td style="padding:10px;text-align:right;font-size:14px;font-weight:800;color:#2B4C7E">${formatCurrency(totals.total)}</td></tr>`
      : `<tr style="background:#f0f4f8"><td colspan="4" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total: ${rows.length} registro(s)</td></tr>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${TITLES[reportType]}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;700;800&display=swap');
@media print { @page { margin: 8mm 6mm; size: A4 landscape; } html,body{margin:0!important;padding:0!important;background:#fff!important} }
</style></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:${FONT}">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:10px 8px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:1100px;font-family:${FONT}">
<tr><td style="background:#fff;border-radius:10px;padding:16px 20px;border-left:4px solid #2B4C7E">
<table width="100%"><tr>
<td style="width:48px"><img src="${logoUrl}" width="42" height="42" style="border-radius:6px"/></td>
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
<td style="padding:7px 8px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase;text-align:center">Status</td>
${showValor ? `<td style="padding:7px 10px;font-size:9px;font-weight:700;color:#888;text-transform:uppercase;text-align:right">Valor</td>` : ""}
</tr>
${sectionsHtml}
${totalLine}
</table></td></tr>
<tr><td style="height:10px"></td></tr>
<tr><td style="background:#2B4C7E;border-radius:10px;padding:10px 20px;text-align:center">
<div style="font-size:10px;color:rgba(255,255,255,0.85)">SIME TRANSPORTES${estName ? ` — ${estName}` : ""}</div>
<div style="font-size:10px;color:rgba(255,255,255,0.85)">Documento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
</td></tr>
</table></td></tr></table></body></html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { win.focus(); win.print(); };
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

  const exportCsv = () => {
    if (!rows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Título", "Detalhes", "Pessoa", "Veículo", "Status", "Valor"];
    const lines = [header.join(";")];
    rows.forEach((r) => {
      lines.push([
        formatDateBR(r.data),
        r.titulo.replace(/;/g, ","),
        r.subtitulo.replace(/;/g, ","),
        r.pessoa.replace(/;/g, ","),
        r.veiculo,
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

  const motoristaList = useMemo(() => {
    const term = motoristaSearch.trim().toLowerCase();
    const base = profiles.filter((p) => p.category === "motorista" || p.category === "colaborador");
    if (!term) return base;
    return base.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)));
  }, [profiles, motoristaSearch]);

  const clienteList = useMemo(() => {
    const term = clienteSearch.trim().toLowerCase();
    const base = profiles.filter((p) => p.category === "cliente");
    if (!term) return base;
    return base.filter((p) => [p.nome_fantasia, p.razao_social, p.full_name].some((n) => (n || "").toLowerCase().includes(term)));
  }, [profiles, clienteSearch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-foreground">Relatórios de Transporte</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!rows.length} className="gap-1">
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
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={filters.status} onValueChange={(v) => updateFilter("status", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS[reportType].map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
                        <SelectItem value="todos" className="text-xs">Todos</SelectItem>
                        {vehicles.map((v) => <SelectItem key={v.id} value={v.id} className="text-xs">{v.plate} • {v.brand} {v.model}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Agrupar por</Label>
                  <Select value={filters.groupBy} onValueChange={(v) => updateFilter("groupBy", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupOptions.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
                <div className="text-sm font-bold text-primary">Total: {formatCurrency(totals.total)}</div>
              </div>

              {isMobile ? (
                <div className="grid grid-cols-1 gap-2">
                  {grouped.map((g) => (
                    <div key={g.key} className="space-y-2">
                      {filters.groupBy !== "none" && (
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-bold text-primary uppercase">{g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span></span>
                          <span className="text-[11px] font-bold text-primary tabular-nums">{formatCurrency(g.rows.reduce((s, r) => s + r.valor, 0))}</span>
                        </div>
                      )}
                      {g.rows.map((r) => (
                        <Card key={r.id}>
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">{r.titulo}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">{r.status}</Badge>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1 text-muted-foreground truncate">
                                <span>{formatDateBR(r.data)}</span>
                                <span className="truncate">· {r.subtitulo}</span>
                              </div>
                              <span className="font-mono font-bold tabular-nums text-foreground">{formatCurrency(r.valor)}</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-border rounded-md overflow-hidden bg-card">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <th className="px-3 py-2 font-medium whitespace-nowrap w-[110px]">Data</th>
                          <th className="px-3 py-2 font-medium">Descrição</th>
                          <th className="px-2 py-2 font-medium text-center w-[120px]">Status</th>
                          <th className="px-2 py-2 font-medium text-right w-[140px]">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.map((g) => (
                          <Fragment key={g.key}>
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/40 border-t border-border">
                                <td colSpan={4} className="px-3 py-1.5 text-xs font-bold text-primary uppercase">
                                  {g.key} <span className="text-muted-foreground font-normal">({g.rows.length})</span>
                                </td>
                              </tr>
                            )}
                            {g.rows.map((r) => (
                              <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{formatDateBR(r.data)}</td>
                                <td className="px-3 py-2">
                                  <div className="font-medium truncate max-w-[520px]">{r.titulo}</div>
                                  <div className="text-[10px] text-muted-foreground truncate max-w-[520px]">{r.subtitulo}</div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground">{formatCurrency(r.valor)}</td>
                              </tr>
                            ))}
                            {filters.groupBy !== "none" && (
                              <tr className="bg-muted/20 border-t border-border">
                                <td colSpan={3} className="px-3 py-1.5 text-right text-xs font-semibold">Subtotal</td>
                                <td className="px-2 py-1.5 text-right text-xs font-bold text-primary tabular-nums">
                                  {formatCurrency(g.rows.reduce((s, r) => s + r.valor, 0))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
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
