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
import { Printer, Loader2, FileSpreadsheet, Search } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTh } from "@/components/ui/sortable-th";
import { DragScroll } from "@/components/ui/drag-scroll";
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
  desconto?: number;
  pesoKg?: number;
  litrosDesconto?: number;
  dataPagamento?: string | null;
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
        const { data, error } = await q.order("data_emissao", { ascending: true }).limit(2000);
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
          const pesoKg = Number(c.peso_bruto || 0);
          const descBase = c.produto_predominante || c.natureza_operacao || "—";
          let descRaw: any = c.desconto;
          if (typeof descRaw === "string") { try { descRaw = JSON.parse(descRaw); } catch { descRaw = null; } }
          const descontoValor = descRaw && typeof descRaw === "object" ? Number(descRaw.valor || 0) : 0;
          const litrosDesconto = descRaw && typeof descRaw === "object" && descRaw.tipo === "diesel" ? Number(descRaw.litros || 0) : 0;
          return {
            id: c.id,
            data: c.data_emissao,
            titulo: `CT-e ${isServ ? "Serviço" : "Produção"} Nº ${numExib ?? "—"}`,
            subtitulo: descBase,
            pessoa: c.tomador_nome || profileName(c.tomador_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            origem,
            destino,
            status: c.status,
            valor: Number(c.valor_frete || c.valor_receber || 0),
            desconto: descontoValor,
            litrosDesconto,
            pesoKg,
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
        const { data, error } = await q.order("data_emissao", { ascending: true }).limit(2000);
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
        let q: any = supabase.from("freight_contracts").select(`
          *,
          cte:ctes!freight_contracts_cte_id_fkey(remetente_nome, recebedor_nome, destinatario_nome, desconto),
          payable:expenses!freight_contracts_accounts_payable_id_fkey(id, status, data_pagamento)
        `);
        if (filters.dataInicio) q = q.gte("data_contrato", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_contrato", filters.dataFim);
        if (filters.motoristaId !== "todos") q = q.eq("motorista_id", filters.motoristaId);
        if (filters.vehicleId !== "todos") q = q.eq("vehicle_id", filters.vehicleId);
        if (filters.proprietarioId !== "todos") {
          // Contratado é o proprietário do veículo; também aceita match por veículos cadastrados a ele
          const ids = ownedVehicleIds && ownedVehicleIds.size > 0 ? Array.from(ownedVehicleIds) : [];
          if (ids.length > 0) {
            q = q.or(`contratado_id.eq.${filters.proprietarioId},vehicle_id.in.(${ids.join(",")})`);
          } else {
            q = q.eq("contratado_id", filters.proprietarioId);
          }
        }
        const { data, error } = await q.order("data_contrato", { ascending: true }).limit(2000);
        if (error) throw error;

        // Para contas originais que foram agrupadas em outra despesa quitada,
        // resolver o pagamento via expense_group_items -> grupo_expense.

        const ungroupedNeedingResolve = (data || [])
          .filter((c: any) => c.payable && c.payable.status !== "pago" && c.payable.id)
          .map((c: any) => c.payable.id as string);

        const groupMap = new Map<string, { status: string; data_pagamento: string | null }>();
        if (ungroupedNeedingResolve.length > 0) {
          const { data: grupos } = await supabase
            .from("expense_group_items" as any)
            .select("original_expense_id, grupo:expenses!expense_group_items_grupo_expense_id_fkey(status, data_pagamento)")
            .in("original_expense_id", ungroupedNeedingResolve);
          ((grupos as any) || []).forEach((g: any) => {
            if (g.grupo) {
              groupMap.set(g.original_expense_id, {
                status: g.grupo.status,
                data_pagamento: g.grupo.data_pagamento,
              });
            }
          });
        }

        const firstTwoWords = (s?: string | null) => (s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
        const truncTo = (s?: string | null, n = 38) => {
          const t = (s || "").trim();
          return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
        };
        result = (data || []).map((c: any) => {
          const placa = c.placa_veiculo || "—";
          const remet = firstTwoWords(c.cte?.remetente_nome) || "—";
          const destin = truncTo(c.cte?.recebedor_nome || c.cte?.destinatario_nome) || "—";
          let payStatus = c.payable?.status;
          let payData = c.payable?.data_pagamento;
          if (payStatus !== "pago" && c.payable?.id) {
            const g = groupMap.get(c.payable.id);
            if (g && g.status === "pago") {
              payStatus = "pago";
              payData = g.data_pagamento;
            }
          }
          const isPago = payStatus === "pago";
          const rawDp = isPago ? payData : null;
          const dpStr = rawDp ? String(rawDp).slice(0, 10) : null;
          let descRaw: any = c.cte?.desconto;
          if (typeof descRaw === "string") { try { descRaw = JSON.parse(descRaw); } catch { descRaw = null; } }
          const descontoValor = descRaw && typeof descRaw === "object" ? Number(descRaw.valor || 0) : 0;
          const litrosDesconto = descRaw && typeof descRaw === "object" && descRaw.tipo === "diesel" ? Number(descRaw.litros || 0) : 0;
          return {
            id: c.id,
            data: c.data_contrato,
            titulo: `Contrato ${c.numero || "—"}`,
            subtitulo: c.contratado_nome || "—",
            pessoa: c.contratado_nome || "—",
            veiculo: placa,
            proprietario: c.contratado_nome || ownerByPlate.get(placa) || "—",
            origem: remet,
            destino: destin,
            status: isPago ? "pago" : "pendente",
            dataPagamento: dpStr,
            valor: Number(c.valor_total || 0),
            desconto: descontoValor,
            litrosDesconto,
            pesoKg: Number(c.peso_kg || 0),
          };
        });
      } else if (reportType === "colheita") {
        let q: any = supabase.from("harvest_jobs").select("*");
        if (filters.dataInicio) q = q.gte("harvest_period_start", filters.dataInicio);
        if (filters.dataFim) q = q.lte("harvest_period_start", filters.dataFim);
        if (filters.status !== "todos") q = q.eq("status", filters.status);
        if (filters.clienteId !== "todos") q = q.eq("client_id", filters.clienteId);
        const { data, error } = await q.order("harvest_period_start", { ascending: true }).limit(2000);
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
        const { data, error } = await q.order("applied_at", { ascending: true }).limit(2000);
        if (error) throw error;
        result = (data || []).map((a: any) => {
          const f = a.freight || {};
          return {
            id: a.id,
            data: a.applied_at,
            titulo: `OC ${a.cte_number ? `• CT-e ${a.cte_number}` : ""}`,
            subtitulo: `${f.cargo_type || "Carga"}`,
            pesoKg: Number(f.weight_kg || 0),
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
        const { data, error } = await q.order("created_at", { ascending: true }).limit(2000);
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
        const { data, error } = await q.order("created_at", { ascending: true }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => ({
          id: c.id,
          data: c.created_at,
          titulo: `Cotação ${c.numero || "—"}`,
          subtitulo: `${c.produto || "—"}`,
          pesoKg: Number(c.peso_kg || 0),
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
        const { data, error } = await q.order("data_manutencao", { ascending: true }).limit(2000);
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
        const { data, error } = await q.order("data_abastecimento", { ascending: true }).limit(2000);
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

  const totals = useMemo(() => ({
    total: rows.reduce((s, r) => s + r.valor, 0),
    desconto: rows.reduce((s, r) => s + (r.desconto || 0), 0),
    pesoKg: rows.reduce((s, r) => s + (r.pesoKg || 0), 0),
    litros: rows.reduce((s, r) => s + (r.litrosDesconto || 0), 0),
    count: rows.length,
  }), [rows]);

  type RowSortKey = "data" | "titulo" | "pessoa" | "rota" | "veiculo" | "status" | "valor";
  const { sort, toggle, sorted } = useSortableTable<Row, RowSortKey>(
    rows,
    { key: "data", direction: "desc" },
    {
      data: (r) => r.data || "",
      titulo: (r) => r.titulo || "",
      pessoa: (r) => r.pessoa || "",
      rota: (r) => `${r.origem} ${r.destino}`,
      veiculo: (r) => `${r.veiculo} ${r.proprietario}`,
      status: (r) => r.status || "",
      valor: (r) => r.valor || 0,
    },
  );

  const showCliente = ["cte", "colheita", "cotacoes"].includes(reportType);
  const showMotorista = ["cte", "mdfe", "contratos", "abastecimentos"].includes(reportType);
  const showVehicle = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);
  const showProprietario = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);
  const showStatus = true;
  const showValor = reportType !== "mdfe" && reportType !== "ordens_abastecimento";
  const showDesconto = reportType === "contratos" || reportType === "cte";
  const showPeso = ["cte", "contratos", "cotacoes", "ordens_carregamento"].includes(reportType);
  const showLitros = showDesconto && rows.some((r) => (r.litrosDesconto || 0) > 0);
  const fmtTon = (kg: number) => `${(kg / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} t`;
  const fmtKg = (kg: number) => `${Number(kg || 0).toLocaleString("pt-BR")} kg`;
  const fmtL = (l: number) => `${Number(l || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L`;

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

    // Compact spreadsheet style — sem badges coloridos, sem cards arredondados
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

    const colCount =
      2 /* # + Data */ +
      1 /* Descrição */ +
      1 /* Origem→Destino */ +
      1 /* Veículo/Prop */ +
      (showPeso ? 1 : 0) +
      (showLitros ? 1 : 0) +
      (showDesconto ? 1 : 0) +
      (showValor ? 1 : 0);

    const tableRows = rows
      .map((r, i) => {
        const desc = r.desconto || 0;
        const peso = r.pesoKg || 0;
        const litros = r.litrosDesconto || 0;
        return `<tr>
      <td class="c idx">${i + 1}</td>
      <td class="nowrap">${formatDateBR(r.data)}${r.dataPagamento ? `<div class="t2">Pago ${formatDateBR(r.dataPagamento)}</div>` : ""}</td>
      <td><div class="t1">${esc(r.titulo)}</div><div class="t2">${esc(r.subtitulo)}</div></td>
      <td class="t2b">${r.origem !== "—" || r.destino !== "—" ? `${esc(r.origem)} → ${esc(r.destino)}` : "—"}</td>
      <td><div class="t1">${esc(r.veiculo)}</div><div class="t2">${esc(r.proprietario)}</div></td>
      ${showPeso ? `<td class="r ${peso > 0 ? "" : "mut"}">${peso > 0 ? fmtKg(peso) : "—"}</td>` : ""}
      ${showLitros ? `<td class="r ${litros > 0 ? "neg" : "mut"}">${litros > 0 ? fmtL(litros) : "—"}</td>` : ""}
      ${showDesconto ? `<td class="r ${desc > 0 ? "neg" : "mut"}">${desc > 0 ? "− " + formatCurrency(desc) : "—"}</td>` : ""}
      ${showValor ? `<td class="r val">${formatCurrency(r.valor)}</td>` : ""}
    </tr>`;
      })
      .join("");

    const trailingCols = (showPeso ? 1 : 0) + (showLitros ? 1 : 0) + (showDesconto ? 1 : 0) + (showValor ? 1 : 0);
    const labelColspan = colCount - trailingCols;
    const totalLine = `<tr class="tot">
          <td colspan="${labelColspan}" class="r">TOTAL GERAL — ${rows.length} registro(s)</td>
          ${showPeso ? `<td class="r val">${fmtKg(totals.pesoKg)}<div class="t2" style="color:#2B4C7E">${fmtTon(totals.pesoKg)}</div></td>` : ""}
          ${showLitros ? `<td class="r neg">${fmtL(totals.litros)}</td>` : ""}
          ${showDesconto ? `<td class="r neg">− ${formatCurrency(totals.desconto)}</td>` : ""}
          ${showValor ? `<td class="r val">${formatCurrency(totals.total)}</td>` : ""}
        </tr>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${TITLES[reportType]}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Exo:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
@media print { @page { margin: 8mm 6mm; size: A4 landscape; } html,body{margin:0!important;padding:0!important;background:#fff!important} .no-print{display:none!important} .sheet{box-shadow:none!important;border:none!important} }
html,body{margin:0;padding:0;background:#f4f6f8;font-family:${FONT};color:#1f2937}
.toolbar{position:sticky;top:0;z-index:50;background:#fff;border-bottom:1px solid #e5e7eb;padding:8px 14px;display:flex;gap:8px;justify-content:flex-end}
.toolbar button{font-family:${FONT};font-size:12px;font-weight:600;padding:6px 12px;border-radius:4px;border:1px solid #d1d5db;background:#fff;color:#2B4C7E;cursor:pointer}
.toolbar button.primary{background:#2B4C7E;color:#fff;border-color:#2B4C7E}
.wrap{max-width:1280px;margin:10px auto;padding:0 10px}
.head{display:flex;align-items:center;gap:12px;padding:6px 4px 10px;border-bottom:2px solid #2B4C7E;margin-bottom:6px}
.head img{height:38px;width:auto;display:block}
.head .est{font-size:10px;color:#555;line-height:1.3}
.head h1{margin:0;font-size:13px;font-weight:700;color:#2B4C7E;text-transform:uppercase;letter-spacing:.3px;flex:1;text-align:right}
.head .per{font-size:10px;color:#666;text-align:right;margin-top:2px}
table.sheet{width:100%;border-collapse:collapse;font-size:10px;background:#fff;border:1px solid #d0d7de;table-layout:auto}
table.sheet thead th{background:#eef2f6;color:#374151;font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.3px;padding:5px 6px;border:1px solid #d0d7de;text-align:left}
table.sheet thead th.r{text-align:right}
table.sheet thead th.c{text-align:center}
table.sheet tbody td{padding:3px 6px;border:1px solid #e5e7eb;vertical-align:top;font-size:10px;line-height:1.25}
table.sheet tbody tr:nth-child(even) td{background:#fafbfc}
.nowrap{white-space:nowrap}
.c{text-align:center}
.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.idx{color:#9ca3af;font-size:9px;width:22px}
.t1{font-weight:600;color:#111827}
.t2{font-size:9px;color:#6b7280;margin-top:1px}
.t2b{font-size:10px;color:#374151}
.st{font-size:10px;font-weight:600;color:#374151;text-transform:capitalize}
.neg{color:#b91c1c;font-weight:700}
.mut{color:#9ca3af}
.val{font-weight:700;color:#111827}
tr.tot td{background:#eef2f6!important;font-weight:800;font-size:11px;color:#2B4C7E;padding:6px 8px;border-top:2px solid #2B4C7E}
tr.tot td.neg{color:#b91c1c}
tr.tot td.val{color:#2B4C7E;font-size:12px}
.foot{margin-top:6px;display:flex;justify-content:space-between;font-size:9px;color:#6b7280;padding:0 2px}
</style></head>
<body>
<div class="toolbar no-print">
  <button onclick="window.print()" class="primary">🖨️ Imprimir</button>
</div>
<div class="wrap">
  <div class="head">
    <img src="${window.location.origin}/logo.png" alt="" />
    <div class="est">
      <div style="font-weight:700;color:#2B4C7E">${esc(estName)}</div>
      ${estCnpj ? estCnpj.split(" / ").map((c) => `<div>CNPJ ${esc(c)}</div>`).join("") : ""}
    </div>
    <div style="flex:1">
      <h1>${TITLES[reportType]}</h1>
      <div class="per">Período: ${periodoLabel} • ${rows.length} registro(s)</div>
    </div>
  </div>
  <table class="sheet">
    <thead><tr>
      <th class="c" style="width:22px">#</th>
      <th style="width:70px">Data</th>
      <th>Descrição</th>
      <th>Origem → Destino</th>
      <th>Veículo / Proprietário</th>
      <th class="c" style="width:80px">Status</th>
      ${showPeso ? `<th class="r" style="width:90px">Peso</th>` : ""}
      ${showDesconto ? `<th class="r" style="width:90px">Desconto</th>` : ""}
      ${showValor ? `<th class="r" style="width:100px">Valor Líquido</th>` : ""}
    </tr></thead>
    <tbody>${tableRows}${totalLine}</tbody>
  </table>
  <div class="foot">
    <div>SIME TRANSPORTES${estName ? ` — ${esc(estName)}` : ""}</div>
    <div>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</div>
  </div>
</div>
</body></html>`;
  };

  const handlePrint = async () => {
    if (!rows.length) return toast.warning("Nenhum dado para imprimir");

    const printWindow = window.open("", "_blank");
    if (!printWindow) return toast.error("Não foi possível abrir a impressão", { description: "Libere pop-ups para gerar o PDF na tela." });

    try {
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

  const exportCsv = () => {
    if (!rows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Título", "Detalhes", "Pessoa", "Origem", "Destino", "Veículo", "Proprietário", "Status", ...(showPeso ? ["Peso (kg)"] : []), ...(showDesconto ? ["Desconto"] : []), "Valor"];
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
        ...(showPeso ? [(r.pesoKg || 0).toFixed(0)] : []),
        ...(showDesconto ? [(r.desconto || 0).toFixed(2).replace(".", ",")] : []),
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
                <div className="flex items-center gap-4 flex-wrap">
                  {showPeso && totals.pesoKg > 0 && (
                    <div className="text-sm font-semibold text-foreground">Peso: {fmtKg(totals.pesoKg)} <span className="text-primary">({fmtTon(totals.pesoKg)})</span></div>
                  )}
                  {showDesconto && totals.desconto > 0 && (
                    <div className="text-sm font-semibold text-destructive">Descontos: − {formatCurrency(totals.desconto)}</div>
                  )}
                  {showValor && <div className="text-sm font-bold text-primary">Total: {formatCurrency(totals.total)}</div>}
                </div>
              </div>

              <div className="border border-border rounded-md overflow-hidden bg-card">
                <DragScroll className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[820px]">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr className="text-left">
                          <SortableTh className="px-3 py-2 font-medium whitespace-nowrap w-[100px]" active={sort.key === "data"} direction={sort.direction} onSort={() => toggle("data")}>Data</SortableTh>
                          <SortableTh className="px-3 py-2 font-medium" active={sort.key === "titulo"} direction={sort.direction} onSort={() => toggle("titulo")}>Descrição</SortableTh>
                          <SortableTh className="px-3 py-2 font-medium" active={sort.key === "pessoa"} direction={sort.direction} onSort={() => toggle("pessoa")}>Pessoa</SortableTh>
                          <SortableTh className="px-3 py-2 font-medium" active={sort.key === "rota"} direction={sort.direction} onSort={() => toggle("rota")}>Origem → Destino</SortableTh>
                          <SortableTh className="px-3 py-2 font-medium" active={sort.key === "veiculo"} direction={sort.direction} onSort={() => toggle("veiculo")}>Veículo / Proprietário</SortableTh>
                          <SortableTh className="px-2 py-2 font-medium text-center w-[110px]" align="center" active={sort.key === "status"} direction={sort.direction} onSort={() => toggle("status")}>Status</SortableTh>
                          {showPeso && <th className="px-2 py-2 font-medium text-right w-[100px]">Peso</th>}
                          {showDesconto && <th className="px-2 py-2 font-medium text-right w-[120px]">Desconto</th>}
                          {showValor && <SortableTh className="px-2 py-2 font-medium text-right w-[130px]" align="right" active={sort.key === "valor"} direction={sort.direction} onSort={() => toggle("valor")}>Valor Líquido</SortableTh>}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r) => (
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
                            {showPeso && (
                              <td className={`px-2 py-2 text-right tabular-nums ${(r.pesoKg || 0) > 0 ? "font-medium" : "text-muted-foreground"}`}>
                                {(r.pesoKg || 0) > 0 ? fmtKg(r.pesoKg || 0) : "—"}
                              </td>
                            )}
                            {showDesconto && (
                              <td className={`px-2 py-2 text-right tabular-nums ${(r.desconto || 0) > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {(r.desconto || 0) > 0 ? `− ${formatCurrency(r.desconto || 0)}` : "—"}
                              </td>
                            )}
                            {showValor && (
                              <td className="px-2 py-2 text-right tabular-nums font-medium">
                                {formatCurrency(r.valor)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                  </table>
                </DragScroll>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
