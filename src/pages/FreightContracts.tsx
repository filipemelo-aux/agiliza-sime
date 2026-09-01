import { useEffect, useMemo, useState } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileSignature, Printer, ExternalLink, X, Pencil, Trash2 } from "lucide-react";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { buildFullContractHtml, combineContractsHtml, openPrintWindow } from "@/components/freight/freightContractPrint";
import { FreightContractDialog } from "@/components/freight/FreightContractDialog";
import { CteDetailDialog } from "@/components/freight/CteDetailDialog";
import { useSortableTable } from "@/hooks/useSortableTable";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";
import { PeriodFilter } from "@/components/PeriodFilter";

import type { Cte } from "@/pages/FreightCte";

interface FreightContractRow {
  id: string;
  numero: number;
  data_contrato: string;
  contratado_nome: string;
  contratado_documento: string | null;
  contratado_tipo: string;
  contratado_id: string | null;
  motorista_id: string | null;
  motorista_cpf: string | null;
  vehicle_id: string | null;
  motorista_nome: string | null;
  placa_veiculo: string | null;
  veiculo_modelo: string | null;
  municipio_origem: string | null;
  uf_origem: string | null;
  municipio_destino: string | null;
  uf_destino: string | null;
  natureza_carga: string | null;
  peso_kg: number;
  valor_tonelada: number;
  valor_total: number;
  observacoes: string | null;
  cte_id: string;
  expense_id: string | null;
  cte?: {
    numero: number | null;
    serie: number | null;
    tipo_talao?: string | null;
    remetente_nome?: string | null;
    recebedor_nome?: string | null;
    destinatario_nome?: string | null;
  } | null;
  payable?: { status: string; data_pagamento: string | null } | null;
}

export default function FreightContracts() {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [rows, setRows] = useState<FreightContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [editing, setEditing] = useState<{ contractId: string; cte: Cte } | null>(null);
  const [detailCte, setDetailCte] = useState<Cte | null>(null);

  const openCteDetail = async (cteId: string) => {
    const { data } = await supabase.from("ctes").select("*").eq("id", cteId).maybeSingle();
    if (data) setDetailCte(data as any);
    else toast({ title: "CT-e não encontrado", variant: "destructive" });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const runQuery = () =>
      supabase
        .from("freight_contracts")
        .select(`
          id, numero, data_contrato,
          contratado_id, contratado_nome, contratado_documento, contratado_tipo,
          motorista_id, motorista_nome, motorista_cpf,
          vehicle_id, placa_veiculo, veiculo_modelo,
          municipio_origem, uf_origem, municipio_destino, uf_destino,
          natureza_carga, peso_kg, valor_tonelada, valor_total, observacoes,
          cte_id, expense_id, establishment_id,
          cte:ctes!freight_contracts_cte_id_fkey(numero, serie, tipo_talao, remetente_nome, recebedor_nome, destinatario_nome),
          payable:expenses!freight_contracts_expense_id_fkey(status, data_pagamento)
        `)
        .order("data_contrato", { ascending: false })
        .order("numero", { ascending: false })
        .limit(200);

    let lastError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data, error } = await runQuery();
        if (error) throw error;
        setRows((data as any) || []);
        setLoading(false);
        return;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || "");
        const transient = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch");
        if (!transient || attempt === 2) break;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    toast({ title: "Erro ao carregar contratos", description: lastError?.message, variant: "destructive" });
    setLoading(false);
  };

  const firstTwoWords = (s?: string | null) => (s || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  const truncTo = (s?: string | null, n = 38) => {
    const t = (s || "").trim();
    return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos") {
        const st = r.payable?.status || "sem_titulo";
        if (statusFilter !== st) return false;
      }
      if (dateFrom && r.data_contrato < dateFrom) return false;
      if (dateTo && r.data_contrato > dateTo) return false;
      if (!s) return true;
      const hay = [
        String(r.numero),
        r.contratado_nome,
        r.contratado_documento,
        r.motorista_nome,
        r.placa_veiculo,
        r.municipio_origem,
        r.municipio_destino,
        r.natureza_carga,
        r.cte?.remetente_nome,
        r.cte?.recebedor_nome,
        r.cte?.destinatario_nome,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search, statusFilter, dateFrom, dateTo]);

  type ContractSortKey = "numero" | "data" | "contratado" | "trecho" | "placa" | "valor" | "status";
  const { sort, toggle, sorted } = useSortableTable<FreightContractRow, ContractSortKey>(
    filtered,
    { key: "data", direction: "desc" },
    {
      numero: (r) => r.numero,
      data: (r) => r.data_contrato || "",
      contratado: (r) => r.contratado_nome || "",
      trecho: (r) => `${r.cte?.remetente_nome || r.municipio_origem || ""} ${r.cte?.recebedor_nome || r.cte?.destinatario_nome || r.municipio_destino || ""}`,
      placa: (r) => r.placa_veiculo || "",
      valor: (r) => Number(r.valor_total) || 0,
      status: (r) => r.payable?.status || "sem_titulo",
    },
  );

  const totals = useMemo(() => {
    const totalValor = filtered.reduce((sum, r) => sum + Number(r.valor_total || 0), 0);
    const totalPeso = filtered.reduce((sum, r) => sum + Number(r.peso_kg || 0), 0);
    return { totalValor, totalPeso, count: filtered.length };
  }, [filtered]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("todos");
    setDateFrom("");
    setDateTo("");
  };

  const buildHtml = async (r: FreightContractRow) => {
    const html = await buildFullContractHtml({
      numero: r.numero,
      data_contrato: r.data_contrato,
      contratado_id: (r as any).contratado_id ?? null,
      contratado_nome: r.contratado_nome,
      contratado_documento: r.contratado_documento,
      contratado_tipo: r.contratado_tipo,
      motorista_id: (r as any).motorista_id ?? null,
      motorista_nome: r.motorista_nome,
      motorista_cpf: (r as any).motorista_cpf ?? null,
      vehicle_id: (r as any).vehicle_id ?? null,
      placa_veiculo: r.placa_veiculo,
      veiculo_modelo: r.veiculo_modelo,
      municipio_origem: r.municipio_origem,
      uf_origem: r.uf_origem,
      municipio_destino: r.municipio_destino,
      uf_destino: r.uf_destino,
      remetente_nome: r.cte?.remetente_nome || null,
      recebedor_nome: r.cte?.recebedor_nome || r.cte?.destinatario_nome || null,
      natureza_carga: r.natureza_carga,
      peso_kg: Number(r.peso_kg) || 0,
      valor_tonelada: Number(r.valor_tonelada) || 0,
      valor_total: Number(r.valor_total) || 0,
      observacoes: r.observacoes,
      cte_id: (r as any).cte_id ?? null,
      establishment_id: (r as any).establishment_id ?? null,
      cte: r.cte ? { numero: r.cte.numero, serie: r.cte.serie, tipo_talao: r.cte.tipo_talao } : null,
    });
    return html;
  };

  const handlePrintSelected = async () => {
    const rowsToPrint = selectedRows;
    if (rowsToPrint.length === 0) return;
    const htmls: string[] = [];
    for (const r of rowsToPrint) htmls.push(await buildHtml(r));
    openPrintWindow(combineContractsHtml(htmls));
  };

  const renderPayableStatus = (r: FreightContractRow) => {
    const st = r.payable?.status;
    if (!st) return <Badge variant="outline">Sem título</Badge>;
    const map: Record<string, string> = {
      pago: "bg-emerald-500/10 text-emerald-600",
      pendente: "bg-amber-500/10 text-amber-600",
      atrasado: "bg-destructive/10 text-destructive",
      parcial: "bg-blue-500/10 text-blue-600",
      cancelado: "bg-muted text-muted-foreground",
    };
    return <Badge className={map[st] || ""}>{st}</Badge>;
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedRows = sorted.filter((r) => selectedIds.has(r.id));
  const single = selectedRows.length === 1 ? selectedRows[0] : null;
  const deletable = selectedRows.filter(
    (r) => r.payable?.status !== "pago" && r.payable?.status !== "parcial"
  );

  const handleBatchDelete = async () => {
    if (deletable.length === 0) return;
    const ok = await confirm({
      title: "Excluir contrato(s) de frete",
      description: `Excluir ${deletable.length} contrato(s)?\n\nAs contas a pagar pendentes vinculadas serão removidas.\nOs CT-e NÃO serão afetados.`,
      variant: "destructive",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    for (const r of deletable) {
      const { error } = await supabase.from("freight_contracts").delete().eq("id", r.id);
      if (error) {
        toast({ title: "Erro ao excluir contrato", description: error.message, variant: "destructive" });
        return;
      }
    }
    toast({ title: `${deletable.length} contrato(s) excluído(s)` });
    setSelectedIds(new Set());
    fetchData();
  };

  const contractColumns: DataGridColumn<FreightContractRow>[] = [
    {
      key: "numero", header: "Nº", width: "90px",
      sortValue: (r) => r.numero,
      cell: (r) => <span className="font-mono text-muted-foreground">#{String(r.numero).padStart(6, "0")}</span>,
    },
    {
      key: "data", header: "Data", width: "100px",
      sortValue: (r) => r.data_contrato,
      cell: (r) => <span className="tabular-nums whitespace-nowrap">{formatDateBR(r.data_contrato)}</span>,
    },
    {
      key: "contratado", header: "Contratado",
      sortValue: (r) => r.contratado_nome,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{r.contratado_nome}</div>
          <div className="text-[10px] text-muted-foreground truncate">{r.contratado_documento || ""}</div>
        </div>
      ),
    },
    {
      key: "trecho", header: "Trecho",
      sortValue: (r) => `${r.municipio_origem || ""}${r.municipio_destino || ""}`,
      cell: (r) => (
        <span className="text-muted-foreground truncate block">
          {firstTwoWords(r.cte?.remetente_nome) || r.municipio_origem || "—"} → {truncTo(r.cte?.recebedor_nome || r.cte?.destinatario_nome) || r.municipio_destino || "—"}
        </span>
      ),
    },
    {
      key: "placa", header: "Placa", width: "90px",
      sortValue: (r) => r.placa_veiculo || "",
      cell: (r) => <span className="tabular-nums">{r.placa_veiculo || "—"}</span>,
    },
    {
      key: "valor", header: "Valor", width: "120px", align: "right",
      sortValue: (r) => r.valor_total,
      cell: (r) => <span className="tabular-nums font-medium">{formatCurrency(r.valor_total)}</span>,
    },
    {
      key: "status", header: "Status", width: "110px", align: "center",
      sortValue: (r) => r.payable?.status || "",
      cell: (r) => renderPayableStatus(r),
    },
  ];


  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileSignature className="w-5 h-5" /> Contratos de Frete
            </h1>
            <p className="text-xs text-muted-foreground">
              Contratos de fretamento vinculados a CT-e com geração de conta a pagar.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <div className="md:col-span-4 relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8 h-9"
                  placeholder="Nº, contratado, motorista, placa, trecho..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Status do pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="sem_titulo">Sem título</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-4">
                <PeriodFilter
                  inicio={dateFrom}
                  fim={dateTo}
                  allowClear
                  onChange={(i, f) => { setDateFrom(i); setDateTo(f); }}
                />
              </div>
              <div className="md:col-span-1">
                <Button variant="outline" className="h-9 w-full gap-1" onClick={clearFilters}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-2">
              <span><b>{totals.count}</b> contrato(s)</span>
              <span>Peso total: <b>{(totals.totalPeso / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t</b></span>
              <span>Valor total: <b className="text-foreground">{formatCurrency(totals.totalValor)}</b></span>
            </div>
          </CardContent>
        </Card>

        {/* Toolbar + Lista */}
        <GlobalToolbar
          actions={[
            {
              key: "edit", label: "Editar", icon: Pencil, mode: "single",
              disabled: !single || single.payable?.status === "pago" || single.payable?.status === "parcial",
              onClick: async () => {
                if (!single) return;
                const { data: cteData } = await supabase.from("ctes").select("*").eq("id", single.cte_id).maybeSingle();
                if (cteData) setEditing({ contractId: single.id, cte: cteData as any });
              },
            },
            {
              key: "print", label: "Imprimir", icon: Printer, mode: "single+batch",
              disabled: selectedRows.length === 0,
              onClick: handlePrintSelected,
            },
            {
              key: "cte", label: "CT-e vinculado", icon: ExternalLink, mode: "single",
              disabled: !single,
              onClick: () => single && openCteDetail(single.cte_id),
            },
            {
              key: "delete", label: "Excluir", icon: Trash2, mode: "single+batch", variant: "destructive",
              disabled: deletable.length === 0,
              onClick: handleBatchDelete,
            },
          ]}
          selectedCount={selectedIds.size}
        >
          {selectedIds.size > 0 && (
            <span className="text-[11px] font-mono text-primary">
              {formatCurrency(selectedRows.reduce((s, r) => s + r.valor_total, 0))}
            </span>
          )}
        </GlobalToolbar>

        <DataGrid
          rows={sorted}
          columns={contractColumns}
          rowId={(r) => r.id}
          selected={selectedIds}
          rowClassName={(r) => rowToneClass(r.payable?.status === "pago" ? "resolved" : r.payable?.status === "atrasado" ? "overdue" : "pending")}
          onSelectedChange={setSelectedIds}
          loading={loading}
          minWidth={900}
          emptyMessage="Nenhum contrato encontrado."
        />

        <StatusLegend className="px-1" items={[{ tone: "pending", label: "A pagar / parcial" }, { tone: "resolved", label: "Pago" }, { tone: "overdue", label: "Atrasado" }]} />

      </div>

      <FreightContractDialog
        open={!!editing}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        cte={editing?.cte ?? null}
        contractId={editing?.contractId ?? null}
        onSaved={() => { setEditing(null); fetchData(); }}
      />

      {detailCte && (
        <CteDetailDialog
          open={!!detailCte}
          onOpenChange={(o) => !o && setDetailCte(null)}
          cte={detailCte}
          onUpdated={fetchData}
          onEdit={async (cte) => {
            const { data } = await supabase.from("freight_contracts").select("id").eq("cte_id", cte.id).maybeSingle();
            setDetailCte(null);
            if (data) setEditing({ contractId: data.id, cte });
          }}
          onDeleted={() => { setDetailCte(null); fetchData(); }}
        />
      )}
      {ConfirmDialog}
    </AdminLayout>
  );
}

