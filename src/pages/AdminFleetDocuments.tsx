import { useCallback, useEffect, useMemo, useState } from "react";
import { FileWarning, FolderOpen, RefreshCw, Search, ShieldAlert, Truck, AlertTriangle, FileSearch, Printer, BadgeDollarSign } from "lucide-react";
import { ProcessingOverlay } from "@/components/ui/processing-overlay";
import { agruparConjuntos, agruparPorTipo, type OrdemRelacao, exportFleetRelacaoPdf, OPCOES_PADRAO, type RelacaoOpcoes } from "@/lib/fleet/fleetRelacaoPdf";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
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
import { FipeDialog } from "@/components/fleet/FipeDialog";
import { DetranDetalhesDialog } from "@/components/fleet/DetranDetalhesDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/notice";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import {
  FleetDocLike, FleetDocTipo, abertoPorAno, ANO_INICIAL_ABERTOS, FleetSituacao, ResumoTipo, resumoPorTipo, situacaoComConsulta, situacaoVeiculo,
} from "@/lib/fleet/fleetDocumentStatus";
import { extrairAlienacao, type Alienacao } from "@/lib/fleet/alienacao";
import { consultaSemDebitosConfirmados } from "../../supabase/functions/vehicle-debts-sync/resultado";

interface VehicleRow {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  owner_id: string | null;
  renavam: string;
  chassis: string | null;
  unit_category: string | null;
  fipe_marca_id: string | null;
  fipe_modelo_id: string | null;
  fipe_ano_id: string | null;
  fipe_valor: number | null;
  fipe_descricao: string | null;
  fipe_referencia: string | null;
}

interface Linha extends VehicleRow {
  ipva: ResumoTipo;
  licenciamento: ResumoTipo;
  seguro: ResumoTipo;
  multas: ResumoTipo;
  situacao: FleetSituacao;
  ipvaAno: Record<number, number>;
  licAno: Record<number, number>;
  multasTotal: number;
  ipvaAnteriores: number;
  licTotal: number;
  multasAno: Record<number, number>;
  total: number;
  alienacao: Alienacao | null;
  /** UF de registro: a da última consulta ao Detran, senão o estado do proprietário. */
  uf: string | null;
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
  const [consultasLimpas, setConsultasLimpas] = useState<Set<string>>(new Set());
  const [alienacoes, setAlienacoes] = useState<Map<string, Alienacao>>(new Map());
  const [ufPorVeiculo, setUfPorVeiculo] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<"all" | FleetSituacao>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);
  const [detranOpen, setDetranOpen] = useState(false);
  const [fipeOpen, setFipeOpen] = useState(false);
  const [detalhesOpen, setDetalhesOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printOp, setPrintOp] = useState<RelacaoOpcoes>(OPCOES_PADRAO);
  const [printOrdem, setPrintOrdem] = useState<OrdemRelacao>("conjuntos");

  const load = useCallback(async () => {
    setLoading(true);
    const vRes = await supabase
      .from("vehicles")
      .select("id, plate, brand, model, year, owner_id, renavam, chassis, unit_category, fipe_marca_id, fipe_modelo_id, fipe_ano_id, fipe_valor, fipe_descricao, fipe_referencia")
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
    const limpas = new Set<string>();
    const alien = new Map<string, Alienacao>();
    const ufConsulta = new Map<string, string>();
    const ufDono = new Map<string, string>();
    if (ids.length) {
      const dRes = await supabase
        .from("veiculo_documentos")
        .select("veiculo_id, tipo_documento, data_vencimento, status_pagamento, valor_total, ano_exercicio")
        .in("veiculo_id", ids);
      if (dRes.error) toast.error("Erro ao carregar documentos: " + dRes.error.message);
      ds = dRes.data || [];
      // Última consulta ao Detran por veículo: sem débitos em aberto = documentos em dia
      const cRes = await supabase
        .from("vehicle_debt_consultas" as any)
        .select("vehicle_id, importacao, response, created_at, uf")
        .in("vehicle_id", ids)
        .order("created_at", { ascending: false });
      const vistos = new Set<string>();
      for (const c of (cRes.data || []) as any[]) {
        if (!alien.has(c.vehicle_id)) { const a = extrairAlienacao(c.response); if (a) alien.set(c.vehicle_id, a); } // mais recente que informou gravame
        if (!ufConsulta.has(c.vehicle_id) && c.uf) ufConsulta.set(c.vehicle_id, String(c.uf).toUpperCase()); // UF da consulta mais recente
        if (vistos.has(c.vehicle_id)) continue; // já é a mais recente deste veículo
        const debitos = c.importacao?.debitos;
        if (!Array.isArray(debitos)) continue; // consulta unificada não lista débitos
        vistos.add(c.vehicle_id);
        if (consultaSemDebitosConfirmados(c.importacao)) limpas.add(c.vehicle_id);
      }
      // UF de registro do proprietário: o estado do cadastro da empresa/dono (mesma regra da consulta ao Detran).
      const donos = [...new Set(vs.map((v) => v.owner_id).filter(Boolean))] as string[];
      if (donos.length) {
        const [pId, pUsr] = await Promise.all([
          supabase.from("profiles").select("id, address_state").in("id", donos),
          supabase.from("profiles").select("user_id, address_state").in("user_id", donos),
        ]);
        for (const p of [...(pId.data || []), ...(pUsr.data || [])] as any[]) {
          const st = String(p.address_state ?? "").trim().toUpperCase();
          if (!st) continue;
          if (p.id) ufDono.set(p.id, st);
          if (p.user_id) ufDono.set(p.user_id, st);
        }
      }
    }
    const ufVec = new Map<string, string>();
    for (const v of vs) ufVec.set(v.id, ufConsulta.get(v.id) || (v.owner_id ? ufDono.get(v.owner_id) : "") || "");
    setVehicles(vs);
    setDocs(ds);
    setConsultasLimpas(limpas);
    setAlienacoes(alien);
    setUfPorVeiculo(ufVec);
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
      const situacao = situacaoComConsulta(situacaoVeiculo([ipva, licenciamento, seguro, multas]), consultasLimpas.has(v.id));
      return { ...v, alienacao: alienacoes.get(v.id) || null, uf: ufPorVeiculo.get(v.id) || null, ipva, licenciamento, seguro, multas, situacao, ...(() => {
        const ipvaAno = abertoPorAno(ds as any, "IPVA"), licAno = abertoPorAno(ds as any, "Licenciamento");
        const multasTotal = Object.values(abertoPorAno(ds as any, "Multa")).reduce((t, x) => t + x, 0);
        const soma = (o: Record<number, number>) => Object.values(o).reduce((t, x) => t + x, 0);
        const total = Math.round((soma(ipvaAno) + soma(licAno) + multasTotal) * 100) / 100;
        const corte = Number(hojeIso().slice(0, 4)) - 2;
        const r2 = (v: number) => Math.round(v * 100) / 100;
        const ipvaAnteriores = r2(Object.entries(ipvaAno).reduce((t, [a, v]) => (Number(a) <= corte ? t + v : t), 0));
        return { ipvaAno, licAno, multasAno: abertoPorAno(ds as any, "Multa"), ipvaAnteriores, licTotal: r2(soma(licAno)), multasTotal: r2(multasTotal), total };
      })() };
    });
  }, [vehicles, docs, consultasLimpas, alienacoes, ufPorVeiculo]);

  const filtradas = useMemo(() => {
    const q = search.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "");
    return linhas.filter((l) => {
      if (filtroSituacao !== "all" && l.situacao !== filtroSituacao) return false;
      if (!q) return true;
      return `${l.plate} ${l.brand} ${l.model} ${l.renavam} ${l.year ?? ""} ${l.uf ?? ""}`.toUpperCase().replace(/[^A-Z0-9 ]/g, "").includes(q);
    });
  }, [linhas, search, filtroSituacao]);

  const totais = useMemo(() => ({
    vencidos: linhas.filter((l) => l.situacao === "vencido").length,
    aVencer: linhas.filter((l) => l.situacao === "a_vencer").length,
    multas: linhas.reduce((s, l) => s + l.multas.abertos, 0),
    valorMultas: linhas.reduce((s, l) => s + l.multas.valorAberto, 0),
  }), [linhas]);

  const single = selected.size === 1 ? linhas.find((l) => selected.has(l.id)) : undefined;

  const imprimirRelacao = async () => {
    const sel = filtradas.filter((l) => selected.has(l.id));
    if (!sel.length) return;
    setPrintOpen(false); setPrinting(true);
    try {
      // Vínculos entre as placas: conjuntos ativos e placas de implemento do cadastro.
      const ids = sel.map((l) => l.id);
      const [aRes, vRes] = await Promise.all([
        supabase.from("vehicle_assignments").select("vehicle_id, implement_ids").is("ended_at", null),
        supabase.from("vehicles").select("id, plate, unit_category, trailer_plate_1, trailer_plate_2, trailer_plate_3").in("id", ids),
      ]);
      const placaPorId = new Map<string, string>(sel.map((l) => [l.id, l.plate]));
      const vinculos: [string, string][] = [];
      const tracao = new Set<string>();
      for (const a of (aRes.data || []) as any[]) {
        const p = placaPorId.get(a.vehicle_id);
        for (const imp of a.implement_ids || []) { const q = placaPorId.get(imp); if (p && q) { vinculos.push([p, q]); tracao.add(p); } }
        const imps = (a.implement_ids || []).map((x: string) => placaPorId.get(x)).filter(Boolean) as string[];
        for (let i = 1; i < imps.length; i++) vinculos.push([imps[0], imps[i]]);
      }
      for (const v of (vRes.data || []) as any[]) {
        if (!["semirreboque", "dolly", "reboque"].includes(v.unit_category)) tracao.add(v.plate);
        for (const t of [v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3]) if (t) vinculos.push([v.plate, t]);
      }
      const categoriaPorPlaca = new Map<string, string>(((vRes.data || []) as any[]).map((v) => [v.plate, v.unit_category]));
      const linhasRel = sel.map((l) => {
        const porAno: Record<number, number> = {};
        for (const a of anosCol) porAno[a] = Math.round((l.ipvaAno[a] || 0) * 100) / 100;
        return { plate: l.plate, veiculo: `${l.brand || ""} ${l.model || ""}`.trim(), ano: l.year ? String(l.year) : "", uf: l.uf || "", renavam: l.renavam || "", chassi: l.chassis || "",
          alienacao: l.alienacao ? (l.alienacao.status === "alienado" ? `Alienado – ${l.alienacao.texto}` : "Livre") : "—",
          situacao: LABEL[l.situacao], porAno, ipvaAnteriores: l.ipvaAnteriores, licenciamento: l.licTotal, multas: l.multasTotal, total: l.total, fipe: Number(l.fipe_valor || 0),
          cavalo: !!(vRes.data || []).find((v: any) => v.id === l.id && !['semirreboque', 'dolly', 'reboque'].includes(v.unit_category)),
          ipvaPorAnoTodos: l.ipvaAno, licPorAno: l.licAno, multasPorAno: l.multasAno };
      });
      await exportFleetRelacaoPdf(printOrdem === "tipo" ? agruparPorTipo(linhasRel, categoriaPorPlaca) : agruparConjuntos(linhasRel, vinculos, tracao), anosCol, printOp);
    } catch (e: any) { toast.error("Erro ao gerar relação: " + (e?.message || e)); }
    finally { setPrinting(false); }
  };

  const anoAtual = Number(hojeIso().slice(0, 4));
  const anos = Array.from({ length: Math.max(0, anoAtual - ANO_INICIAL_ABERTOS + 1) }, (_, i) => ANO_INICIAL_ABERTOS + i);
  // Colunas por ano só para os dois anos mais recentes; anteriores somam em "IPVA ant."
  const anosCol = anos.filter((a) => a > anoAtual - 2);
  const moeda = (v: number) => v ? <span className="font-mono">{formatCurrency(v)}</span> : <span className="text-muted-foreground">—</span>;
  const rodape = (f: (l: Linha) => number) => <span className="font-mono font-semibold">{formatCurrency(filtradas.reduce((t, l) => t + f(l), 0))}</span>;
  const colValor = (key: string, header: string, f: (l: Linha) => number, width = "100px"): DataGridColumn<Linha> => ({
    key, header, width, align: "right", cell: (l) => moeda(f(l)), sortValue: f, footer: rodape(f),
  });
  // Colunas por ano só com IPVA (já com juros e multa de atraso); licenciamento vai para "Multas e licenc."
  const colunasAno: DataGridColumn<Linha>[] = [...anosCol].reverse().map((a) =>
    colValor(`ipva${a}`, `IPVA ${a}`, (l) => Math.round((l.ipvaAno[a] || 0) * 100) / 100, "120px"));

  const columns: DataGridColumn<Linha>[] = [
    { key: "plate", header: "Placa", width: "100px", cell: (l) => <span className="font-mono font-semibold">{l.plate}</span>, sortValue: (l) => l.plate },
    { key: "veiculo", header: "Veículo", width: "150px", cell: (l) => <span className="truncate">{[l.brand, l.model].filter(Boolean).join(" ")}</span>, sortValue: (l) => `${l.brand} ${l.model}` },
    { key: "ano", header: "Ano", width: "60px", align: "center", cell: (l) => l.year ? <span className="font-mono">{l.year}</span> : <span className="text-muted-foreground">—</span>, sortValue: (l) => Number(l.year || 0) },
    { key: "uf", header: "UF", width: "50px", align: "center", cell: (l) => l.uf ? <span className="font-mono font-medium">{l.uf}</span> : <span className="text-muted-foreground">—</span>, sortValue: (l) => l.uf || "zz" },
    { key: "fipe", header: "Valor FIPE", width: "130px", align: "right", sortValue: (l) => Number(l.fipe_valor || 0), footer: rodape((l) => Number(l.fipe_valor || 0)),
      cell: (l) => <span title={[l.fipe_descricao, l.fipe_referencia && `Ref. ${l.fipe_referencia}`].filter(Boolean).join(" · ")}>{moeda(Number(l.fipe_valor || 0))}</span> },
    { key: "alienacao", header: "Alienação", width: "150px", sortValue: (l) => l.alienacao ? (l.alienacao.status === "alienado" ? `0${l.alienacao.texto}` : "1") : "2",
      cell: (l) => !l.alienacao ? <span className="text-muted-foreground">—</span>
        : l.alienacao.status === "livre" ? <span className="text-success font-medium">Livre</span>
        : <span className="leading-tight block truncate" title={l.alienacao.texto}><span className="text-destructive font-semibold">Alienado</span><span className="block text-[10px] truncate">{l.alienacao.texto}</span></span> },
    ...colunasAno,
    colValor("ipvaAnt", "IPVA ant.", (l) => l.ipvaAnteriores, "120px"),
    colValor("licenc", "Licenc.", (l) => l.licTotal, "120px"),
    colValor("multas", "Multas", (l) => l.multasTotal, "120px"),
    colValor("total", "Total", (l) => l.total, "110px"),
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
            { key: "details", label: "Detalhes da última consulta", icon: FileSearch, mode: "single", disabled: !single, onClick: () => single && setDetalhesOpen(true) },
            { key: "fipe", label: "Valor FIPE / mercado", icon: BadgeDollarSign, mode: "single", disabled: !single, onClick: () => single && setFipeOpen(true) },
            { key: "print", label: "Imprimir relação dos selecionados", icon: Printer, mode: "single+batch", disabled: selected.size === 0 || printing, onClick: () => setPrintOpen(true) },
          ]}
          selectedCount={selected.size}
        />

        <DataGrid
          rows={filtradas}
          columns={columns}
          rowId={(l) => l.id}
          selected={selected}
          onSelectedChange={setSelected}
          loading={loading}
          minWidth={370 + (anosCol.length + 3) * 130 + 340}
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
        <DetranConsultaDialog open={detranOpen} onOpenChange={setDetranOpen} vehicle={single ?? null} onSaved={load} />
        <Dialog open={printOpen} onOpenChange={setPrintOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>O que imprimir na relação</DialogTitle></DialogHeader>
            <div className="grid gap-1 text-xs">
              <span className="font-medium">Organizar</span>
              {([["conjuntos", "Por conjuntos (cavalo com seus implementos)"], ["tipo", "Por tipo (cavalos, depois reboques e semirreboques, depois dollys)"]] as [OrdemRelacao, string][]).map(([k, rot]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="ordem-relacao" checked={printOrdem === k} onChange={() => setPrintOrdem(k)} />{rot}
                </label>
              ))}
            </div>
            <div className="grid gap-2 text-xs">
              <span className="font-medium">Colunas</span>
              {([["veiculo", "Veículo (marca/modelo)"], ["ano", "Ano do veículo"], ["uf", "UF de registro"], ["renavam", "RENAVAM"], ["chassi", "Chassi"], ["alienacao", "Alienação"], ["situacao", "Situação"], ["debitos", "Documentos atrasados (IPVA por ano, licenciamento, multas, total)"], ["fipe", "Valor de mercado (Tabela FIPE)"], ["resumo", "Resumo no início (cavalos e demais, por ano)"]] as [keyof RelacaoOpcoes, string][]).map(([k, rot]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={!!printOp[k]} onCheckedChange={(v) => setPrintOp((o) => ({ ...o, [k]: !!v }))} />{rot}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrintOpen(false)}>Cancelar</Button>
              <Button onClick={imprimirRelacao}>Imprimir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <ProcessingOverlay open={printing} label="Gerando relação..." />
        <FipeDialog open={fipeOpen} onOpenChange={setFipeOpen} vehicle={single ?? null} onSaved={load} />
        <DetranDetalhesDialog open={detalhesOpen} onOpenChange={setDetalhesOpen} vehicle={single ?? null} />
      </div>
    </AdminLayout>
  );
}
