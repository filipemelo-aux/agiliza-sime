import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer, Loader2, FileSpreadsheet, Search } from "lucide-react";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
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
  cliente: string;
  motorista: string;
  veiculo: string;
  proprietario: string;
}

interface Row {
  id: string;
  data: string;
  titulo: string;
  subtitulo: string;
  pessoa: string;
  veiculo: string;
  proprietario: string;
  status: string;
  valor: number;
}

const initial = (): Filters => ({
  dataInicio: format(startOfMonth(new Date()), "yyyy-MM-dd"),
  dataFim: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  status: "",
  cliente: "",
  motorista: "",
  veiculo: "",
  proprietario: "",
});

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

  useEffect(() => {
    supabase.from("profiles").select("id, full_name, nome_fantasia, razao_social, category").order("full_name").then(({ data }) => setProfiles(data || []));
    supabase.from("vehicles").select("id, plate, brand, model, owner_id").order("plate").then(({ data }) => setVehicles(data || []));
  }, []);

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
      if (v.plate) m.set(v.plate, profileName(v.owner_id));
    });
    return m;
  }, [vehicles, profileName]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result: Row[] = [];
      if (reportType === "cte") {
        let q: any = supabase.from("ctes").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const od = `${c.municipio_origem_nome || c.uf_origem || "—"} → ${c.municipio_destino_nome || c.uf_destino || "—"}`;
          const placa = c.placa_veiculo || "—";
          return {
            id: c.id,
            data: c.data_emissao,
            titulo: `CT-e ${c.numero || "—"} • ${c.tomador_nome || profileName(c.tomador_id)}`,
            subtitulo: `${od} • ${placa}`,
            pessoa: c.tomador_nome || profileName(c.tomador_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            status: c.status,
            valor: Number(c.valor_frete || 0),
          };
        });
      } else if (reportType === "mdfe") {
        let q: any = supabase.from("mdfe").select("*");
        if (filters.dataInicio) q = q.gte("data_emissao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_emissao", filters.dataFim + "T23:59:59");
        const { data, error } = await q.order("data_emissao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => {
          const od = `${m.uf_carregamento || "—"} → ${m.uf_descarregamento || "—"}`;
          const qtdCtes = Array.isArray(m.lista_ctes) ? m.lista_ctes.length : 0;
          const placa = m.placa_veiculo || "—";
          return {
            id: m.id,
            data: m.data_emissao,
            titulo: `MDF-e ${m.numero || "—"}/${m.serie || ""}`,
            subtitulo: `${od} • ${placa} • ${qtdCtes} CT-e(s)`,
            pessoa: profileName(m.motorista_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            status: m.status,
            valor: 0,
          };
        });
      } else if (reportType === "contratos") {
        let q: any = supabase.from("freight_contracts").select("*");
        if (filters.dataInicio) q = q.gte("data_contrato", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_contrato", filters.dataFim);
        const { data, error } = await q.order("data_contrato", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((c: any) => {
          const od = `${c.municipio_origem || "—"} → ${c.municipio_destino || "—"}`;
          const placa = c.placa_veiculo || "—";
          return {
            id: c.id,
            data: c.data_contrato,
            titulo: `Contrato ${c.numero || "—"} • ${c.contratado_nome || "—"}`,
            subtitulo: `${od} • ${placa} • ${(c.peso_kg || 0).toLocaleString("pt-BR")} kg`,
            pessoa: c.contratado_nome || "—",
            veiculo: placa,
            proprietario: c.contratado_nome || ownerByPlate.get(placa) || "—",
            status: "—",
            valor: Number(c.valor_total || 0),
          };
        });
      } else if (reportType === "colheita") {
        let q: any = supabase.from("harvest_jobs").select("*");
        if (filters.dataInicio) q = q.gte("harvest_period_start", filters.dataInicio);
        if (filters.dataFim) q = q.lte("harvest_period_start", filters.dataFim);
        const { data, error } = await q.order("harvest_period_start", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((h: any) => ({
          id: h.id,
          data: h.harvest_period_start,
          titulo: `${h.farm_name || "Fazenda"} • ${profileName(h.client_id)}`,
          subtitulo: `${h.location || "—"} • ${h.total_third_party_vehicles || 0} veíc. • Período: ${formatDateBR(h.harvest_period_start)} a ${formatDateBR(h.harvest_period_end)}`,
          pessoa: profileName(h.client_id),
          veiculo: "—",
          proprietario: "—",
          status: h.status,
          valor: Number(h.payment_value || h.monthly_value || 0),
        }));
      } else if (reportType === "ordens_carregamento") {
        let q: any = supabase.from("freight_applications").select("*, freight:freight_id(origin_city, origin_state, destination_city, destination_state, value_brl, weight_kg, cargo_type)");
        if (filters.dataInicio) q = q.gte("applied_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("applied_at", filters.dataFim + "T23:59:59");
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
            proprietario: "—",
            status: a.status,
            valor: Number(f.value_brl || 0),
          };
        });
      } else if (reportType === "ordens_abastecimento") {
        let q: any = supabase.from("fuel_orders").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
        const { data, error } = await q.order("created_at", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((o: any) => {
          const placa = o.vehicle_plate || "—";
          return {
            id: o.id,
            data: o.created_at,
            titulo: `OA ${o.order_number || "—"} • ${o.supplier_name || "—"}`,
            subtitulo: `${o.fuel_type || "—"} • ${o.fill_mode || "—"} • ${o.liters ? `${o.liters} L` : "—"}`,
            pessoa: o.requester_name || "—",
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            status: o.status,
            valor: 0,
          };
        });
      } else if (reportType === "cotacoes") {
        let q: any = supabase.from("quotations").select("*");
        if (filters.dataInicio) q = q.gte("created_at", filters.dataInicio);
        if (filters.dataFim) q = q.lte("created_at", filters.dataFim + "T23:59:59");
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
            proprietario: "—",
            status: c.status,
            valor: Number(c.valor_frete || c.valor_mensal_por_caminhao || 0),
          };
        });
      } else if (reportType === "manutencoes") {
        let q: any = supabase.from("maintenances").select("*");
        if (filters.dataInicio) q = q.gte("data_manutencao", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_manutencao", filters.dataFim);
        const { data, error } = await q.order("data_manutencao", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((m: any) => {
          const v = vehicleMap.get(m.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: m.id,
            data: m.data_manutencao,
            titulo: `${m.tipo_manutencao || "Manutenção"} • ${placa}`,
            subtitulo: `${m.descricao || "—"} • Odôm.: ${m.odometro?.toLocaleString("pt-BR") || "—"} km`,
            pessoa: m.fornecedor || "—",
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
            status: m.status,
            valor: Number(m.custo_total || 0),
          };
        });
      } else if (reportType === "abastecimentos") {
        let q: any = supabase.from("fuelings").select("*").is("deleted_at", null);
        if (filters.dataInicio) q = q.gte("data_abastecimento", filters.dataInicio);
        if (filters.dataFim) q = q.lte("data_abastecimento", filters.dataFim);
        const { data, error } = await q.order("data_abastecimento", { ascending: false }).limit(2000);
        if (error) throw error;
        result = (data || []).map((f: any) => {
          const v = vehicleMap.get(f.veiculo_id);
          const placa = v ? v.plate : "—";
          return {
            id: f.id,
            data: f.data_abastecimento,
            titulo: `${f.tipo_combustivel || "Combustível"} • ${placa}`,
            subtitulo: `${f.quantidade_litros || 0} L × ${formatCurrency(f.valor_por_litro || 0)} • ${f.posto_combustivel || "—"}`,
            pessoa: profileName(f.motorista_id),
            veiculo: placa,
            proprietario: ownerByPlate.get(placa) || "—",
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
  }, [reportType, filters.dataInicio, filters.dataFim, profileName, vehicleMap, ownerByPlate]);

  useEffect(() => {
    const t = setTimeout(() => { fetchData(); }, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const norm = (s: string) => (s || "").toLowerCase().trim();
    const fStatus = norm(filters.status);
    const fCliente = norm(filters.cliente);
    const fMotorista = norm(filters.motorista);
    const fVeiculo = norm(filters.veiculo);
    const fProprietario = norm(filters.proprietario);
    return rows.filter((r) => {
      if (fStatus && !norm(r.status).includes(fStatus)) return false;
      if (fCliente && !(norm(r.pessoa).includes(fCliente) || norm(r.titulo).includes(fCliente))) return false;
      if (fMotorista && !(norm(r.pessoa).includes(fMotorista) || norm(r.subtitulo).includes(fMotorista))) return false;
      if (fVeiculo && !norm(r.veiculo).includes(fVeiculo)) return false;
      if (fProprietario && !norm(r.proprietario).includes(fProprietario)) return false;
      return true;
    });
  }, [rows, filters.status, filters.cliente, filters.motorista, filters.veiculo, filters.proprietario]);

  const totals = useMemo(() => ({ total: filteredRows.reduce((s, r) => s + r.valor, 0), count: filteredRows.length }), [filteredRows]);

  const showCliente = ["cte", "colheita", "cotacoes"].includes(reportType);
  const showMotorista = ["cte", "mdfe", "contratos", "abastecimentos"].includes(reportType);
  const showVehicle = ["cte", "mdfe", "contratos", "ordens_carregamento", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);
  const showProprietario = ["cte", "mdfe", "contratos", "ordens_abastecimento", "manutencoes", "abastecimentos"].includes(reportType);

  const handlePrint = async () => {
    if (!filteredRows.length) return toast.warning("Nenhum dado para imprimir");
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

    const tableRows = filteredRows
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

    const totalLine = showValor
      ? `<tr style="background:#f0f4f8"><td colspan="4" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total Geral</td><td style="padding:10px;text-align:right;font-size:14px;font-weight:800;color:#2B4C7E">${formatCurrency(totals.total)}</td></tr>`
      : `<tr style="background:#f0f4f8"><td colspan="4" style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:#2B4C7E;text-transform:uppercase">Total: ${filteredRows.length} registro(s)</td></tr>`;

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
<div style="font-size:11px;color:#888;margin-top:4px">Período: ${periodoLabel} • ${filteredRows.length} registro(s)</div>
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
${tableRows}
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
    if (!filteredRows.length) return toast.warning("Nenhum dado para exportar");
    const header = ["Data", "Título", "Detalhes", "Pessoa", "Veículo", "Proprietário", "Status", "Valor"];
    const lines = [header.join(";")];
    filteredRows.forEach((r) => {
      lines.push([
        formatDateBR(r.data),
        r.titulo.replace(/;/g, ","),
        r.subtitulo.replace(/;/g, ","),
        r.pessoa.replace(/;/g, ","),
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
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filteredRows.length} className="gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={handlePrint} disabled={!filteredRows.length} className="gap-1">
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
                {showCliente && (
                  <div className="space-y-1">
                    <Label className="text-xs">Cliente</Label>
                    <Input className="h-8 text-xs" placeholder="Digite o cliente..." value={filters.cliente} onChange={(e) => updateFilter("cliente", e.target.value)} />
                  </div>
                )}
                {showMotorista && (
                  <div className="space-y-1">
                    <Label className="text-xs">Motorista</Label>
                    <Input className="h-8 text-xs" placeholder="Digite o motorista..." value={filters.motorista} onChange={(e) => updateFilter("motorista", e.target.value)} />
                  </div>
                )}
                {showVehicle && (
                  <div className="space-y-1">
                    <Label className="text-xs">Veículo (placa)</Label>
                    <Input className="h-8 text-xs" placeholder="Digite a placa..." value={filters.veiculo} onChange={(e) => updateFilter("veiculo", e.target.value)} />
                  </div>
                )}
                {showProprietario && (
                  <div className="space-y-1">
                    <Label className="text-xs">Proprietário</Label>
                    <Input className="h-8 text-xs" placeholder="Digite o proprietário..." value={filters.proprietario} onChange={(e) => updateFilter("proprietario", e.target.value)} />
                  </div>
                )}
                <div className="space-y-1 flex flex-col justify-end">
                  <Button size="sm" onClick={fetchData} disabled={loading} className="gap-1 h-8">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Gerar
                  </Button>
                </div>
              </div>

              {filteredRows.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-muted/40 px-3 py-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{filteredRows.length} registro(s)</span>
                    <span className="font-bold text-primary">{formatCurrency(totals.total)}</span>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/20 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-1.5 font-semibold">Data</th>
                          <th className="text-left px-3 py-1.5 font-semibold">Descrição</th>
                          <th className="text-left px-3 py-1.5 font-semibold">Proprietário</th>
                          <th className="text-left px-3 py-1.5 font-semibold">Status</th>
                          <th className="text-right px-3 py-1.5 font-semibold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((r) => (
                          <tr key={r.id} className="border-t hover:bg-muted/30">
                            <td className="px-3 py-1.5 whitespace-nowrap">{formatDateBR(r.data)}</td>
                            <td className="px-3 py-1.5">
                              <div className="font-medium">{r.titulo}</div>
                              <div className="text-[10px] text-muted-foreground">{r.subtitulo}</div>
                            </td>
                            <td className="px-3 py-1.5">{r.proprietario}</td>
                            <td className="px-3 py-1.5">{r.status}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-primary whitespace-nowrap">{formatCurrency(r.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
