import { useCallback, useEffect, useMemo, useState } from "react";
import { FileWarning, FolderOpen, RefreshCw, Search, ShieldAlert, Truck, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { PageTitle } from "@/components/PageTitle";
import { SummaryCard } from "@/components/SummaryCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { SearchFilterCard, FilterField } from "@/components/ui/search-filter-card";
import { rowToneClass, StatusLegend, RowTone } from "@/components/ui/status-row";
import { VehicleDocumentsTab } from "@/components/fleet/VehicleDocumentsTab";
import { DetranConsultaDialog } from "@/components/fleet/DetranConsultaDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import {
  FleetDocLike, FleetDocTipo, abertoPorAno, ANO_INICIAL_ABERTOS, FleetSituacao, ResumoTipo, resumoPorTipo, situacaoVeiculo,
} from "@/lib/fleet/fleetDocumentStatus";

interface VehicleRow {
  id: string;
  plate: string;
  brand: string;
  model: string;
  renavam: string;
  unit_category: string | null;
}

interface Linha extends VehicleRow {
  ipva: ResumoTipo;
  licenciamento: ResumoTipo;
  seguro: ResumoTipo;
  multas: ResumoTipo;
  situacao: FleetSituacao;
  porAno: Record<number, number>;
}

const hojeIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const TONE: Record<FleetSituacao, RowTone> = {
  vencido: "overdue", a_vencer: "pending", em_dia: "resolved", sem_registro: "neutral",
};
const LABEL: Record<FleetSituacao, string> = {
  vencido: "Vencido", a_vencer: "A vencer", em_dia: "Em dia", sem_registro: "Sem registro",
};

function CelulaDoc({ r }: { r: ResumoTipo }) {
  if (r.situacao === "sem_registro") return <span className="text-muted-foreground">—</span>;
  return (
    <div className="leading-tight">
      <div className="font-medium">{LABEL[r.situacao]}</div>
      {r.vencimento && <div className="text-[10px] opacity-80">{formatDateBR(r.vencimento)}</div>}
    </div>
  );
}

export default function AdminFleetDocuments() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [docs, setDocs] = useState<(FleetDocLike & { veiculo_id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"all" | FleetSituacao>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);
  const [detranOpen, setDetranOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const vRes = await supabase
      .from("vehicles")
      .select("id, plate, brand, model, renavam, unit_category")
      .eq("is_active", true)
      .eq("fleet_type", "propria")
      .order("plate");
    if (vRes.error) {
      toast.error("Erro ao carregar veículos: " + vRes.error.message);
      setLoading(false);
      return;
    }
    const vs = (vRes.data || []) as VehicleRow[];
    const ids = vs.map((v) => v.id);
    let ds: any[] = [];
    if (ids.length) {
      const dRes = await supabase
        .from("veiculo_documentos")
        .select("veiculo_id, tipo_documento, data_vencimento, status_pagamento, valor_total, ano_exercicio")
        .in("veiculo_id", ids);
      if (dRes.error) toast.error("Erro ao carregar documentos: " + dRes.error.message);
      ds = dRes.data || [];
    }
    setVehicles(vs);
    setDocs(ds);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const linhas: Linha[] = useMemo(() => {
    const hoje = hojeIso();
    const porVeiculo = new Map<string, FleetDocLike[]>();
    for (const d of docs) {
      const arr = porVeiculo.get(d.veiculo_id) || [];
      arr.push(d);
      porVeiculo.set(d.veiculo_id, arr);
    }
    return vehicles.map((v) => {
      const ds = porVeiculo.get(v.id) || [];
      const r = (t: FleetDocTipo) => resumoPorTipo(ds, t, hoje);
      const ipva = r("IPVA"), licenciamento = r("Licenciamento"), seguro = r("Seguro"), multas = r("Multa");
      return { ...v, ipva, licenciamento, seguro, multas, situacao: situacaoVeiculo([ipva, licenciamento, seguro, multas]), porAno: abertoPorAno(ds as any) };
    });
  }, [vehicles, docs]);

  const filtradas = useMemo(() => {
    const q = search.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "");
    return linhas.filter((l) => {
      if (filtroSituacao !== "all" && l.situacao !== filtroSituacao) return false;
      if (!q) return true;
      return `${l.plate} ${l.brand} ${l.model} ${l.renavam}`.toUpperCase().replace(/[^A-Z0-9 ]/g, "").includes(q);
    });
  }, [linhas, search, filtroSituacao]);

  const totais = useMemo(() => ({
    vencidos: linhas.filter((l) => l.situacao === "vencido").length,
    aVencer: linhas.filter((l) => l.situacao === "a_vencer").length,
    multas: linhas.reduce((s, l) => s + l.multas.abertos, 0),
    valorMultas: linhas.reduce((s, l) => s + l.multas.valorAberto, 0),
  }), [linhas]);

  const single = selected.size === 1 ? linhas.find((l) => selected.has(l.id)) : undefined;

  const anoAtual = Number(hojeIso().slice(0, 4));
  const anos = Array.from({ length: Math.max(0, anoAtual - ANO_INICIAL_ABERTOS + 1) }, (_, i) => ANO_INICIAL_ABERTOS + i);
  const colunasAno: DataGridColumn<Linha>[] = anos.map((a) => ({
    key: `ano${a}`, header: `Aberto ${a}`, width: "105px", align: "right" as const,
    cell: (l: Linha) => l.porAno[a] ? <span className="font-mono">{formatCurrency(l.porAno[a])}</span> : <span className="text-muted-foreground">—</span>,
    sortValue: (l: Linha) => l.porAno[a] || 0,
    footer: <span className="font-mono font-semibold">{formatCurrency(filtradas.reduce((t, l) => t + (l.porAno[a] || 0), 0))}</span>,
  }));

  const columns: DataGridColumn<Linha>[] = [
    { key: "plate", header: "Placa", width: "100px", cell: (l) => <span className="font-mono font-semibold">{l.plate}</span>, sortValue: (l) => l.plate },
    { key: "veiculo", header: "Veículo", width: "180px", cell: (l) => <span className="truncate">{[l.brand, l.model].filter(Boolean).join(" ")}</span>, sortValue: (l) => `${l.brand} ${l.model}` },
    { key: "renavam", header: "RENAVAM", width: "120px", cell: (l) => <span className="font-mono">{l.renavam || "—"}</span> },
    { key: "ipva", header: "IPVA", width: "110px", cell: (l) => <CelulaDoc r={l.ipva} />, sortValue: (l) => l.ipva.vencimento },
    { key: "lic", header: "Licenciamento", width: "120px", cell: (l) => <CelulaDoc r={l.licenciamento} />, sortValue: (l) => l.licenciamento.vencimento },
    { key: "seguro", header: "Seguro", width: "110px", cell: (l) => <CelulaDoc r={l.seguro} />, sortValue: (l) => l.seguro.vencimento },
    { key: "multas", header: "Multas em aberto", width: "130px", align: "right", sortValue: (l) => l.multas.valorAberto,
      cell: (l) => l.multas.abertos === 0 ? <span className="text-muted-foreground">—</span> : (
        <div className="leading-tight text-right">
          <div className="font-mono font-medium">{formatCurrency(l.multas.valorAberto)}</div>
          <div className="text-[10px] opacity-80">{l.multas.abertos} {l.multas.abertos === 1 ? "multa" : "multas"}</div>
        </div>
      ) },
    ...colunasAno,
    { key: "sit", header: "Situação", width: "110px", cell: (l) => <span className="font-medium">{LABEL[l.situacao]}</span>, sortValue: (l) => l.situacao },
  ];

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <PageTitle>Documentos e Multas</PageTitle>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={Truck} label="Veículos da frota própria" value={linhas.length} />
          <SummaryCard icon={ShieldAlert} label="Com documento vencido" value={totais.vencidos} />
          <SummaryCard icon={AlertTriangle} label="Vencendo em 30 dias" value={totais.aVencer} />
          <SummaryCard icon={FileWarning} label={`Multas em aberto (${totais.multas})`} value={formatCurrency(totais.valorMultas)} valueColor="primary" />
        </div>

        <SearchFilterCard>
          <FilterField label="Busca" className="min-w-[210px] flex-1">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Placa, veículo ou RENAVAM" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
          </FilterField>
          <FilterField label="Situação">
            <Select value={filtroSituacao} onValueChange={(v) => setFiltroSituacao(v as any)}>
              <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
                <SelectItem value="a_vencer">A vencer</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="sem_registro">Sem registro</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
        </SearchFilterCard>

        <GlobalToolbar
          actions={[
            { key: "manage", label: "Documentos e multas da placa", icon: FolderOpen, mode: "single", variant: "default", disabled: !single, onClick: () => single && setManageOpen(true) },
            { key: "sync", label: "Consultar débitos no Detran", icon: RefreshCw, mode: "single", disabled: !single, onClick: () => single && setDetranOpen(true) },
          ]}
          selectedCount={selected.size}
        />

        <DataGrid
          rows={filtradas}
          columns={columns}
          rowId={(l) => l.id}
          selected={selected}
          onSelectedChange={setSelected}
          singleSelection
          loading={loading}
          minWidth={1180 + anos.length * 105}
          rowClassName={(l) => rowToneClass(TONE[l.situacao])}
          emptyMessage="Nenhum veículo da frota própria encontrado"
        />

        <StatusLegend className="px-1" items={[
          { tone: "overdue", label: "Vencido" },
          { tone: "pending", label: "Vence em até 30 dias" },
          { tone: "resolved", label: "Em dia" },
          { tone: "neutral", label: "Sem registro" },
        ]} />

        <Dialog open={manageOpen} onOpenChange={(o) => { setManageOpen(o); if (!o) load(); }}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Documentos e multas — {single?.plate}</DialogTitle>
            </DialogHeader>
            {single && <VehicleDocumentsTab vehicleId={single.id} vehiclePlate={single.plate} />}
          </DialogContent>
        </Dialog>
        <DetranConsultaDialog open={detranOpen} onOpenChange={setDetranOpen} vehicle={single ?? null} />
      </div>
    </AdminLayout>
  );
}
