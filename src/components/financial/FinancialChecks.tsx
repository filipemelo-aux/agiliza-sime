import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { EmpresaFilter, EmpresaBadge } from "./EmpresaControls";
import { CheckIssueStandaloneDialog } from "./CheckIssueStandaloneDialog";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";
import { toast } from "sonner";
import { CalendarDays, CheckCircle2, Plus, RefreshCw, Search, WalletCards, XCircle } from "lucide-react";

interface CheckRow {
  id: string;
  empresa_id: string | null;
  numero_cheque: string | null;
  valor: number;
  favorecido_nome: string;
  data_emissao: string;
  data_vencimento: string | null;
  historico: string | null;
  vinculo_tipo: string;
  status: string;
  expense_id: string | null;
  freight_contract_id: string | null;
  movimentacao_id: string | null;
  conta_bancaria_id: string | null;
}

const typeLabel: Record<string, string> = { conta_pagar: "Conta a pagar", contrato_frete: "Contrato de frete", movimentacao: "Movimentação", avulso: "Avulso" };
const statusLabel: Record<string, string> = { emitido: "Emitido", compensado: "Compensado", cancelado: "Cancelado" };

export function FinancialChecks({ reportMode = false }: { reportMode?: boolean }) {
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [type, setType] = useState("todos");
  const [empresa, setEmpresa] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("cheques" as any).select("*").order("data_emissao", { ascending: false }).order("created_at", { ascending: false }).limit(5000);
    if (error) toast.error("Não foi possível carregar os cheques", { description: error.message });
    setRows(((data as unknown) as CheckRow[]) || []);
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "todos" && row.status !== status) return false;
      if (type !== "todos" && row.vinculo_tipo !== type) return false;
      if (empresa && row.empresa_id !== empresa) return false;
      if (!term) return true;
      return [row.numero_cheque, row.favorecido_nome, row.historico, typeLabel[row.vinculo_tipo], row.status].some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [rows, search, status, type, empresa]);

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.id)), [rows, selected]);
  const cancelSelected = async () => {
    const active = selectedRows.filter((row) => row.status !== "cancelado");
    if (!active.length) return;
    const { error } = await supabase.from("cheques" as any).update({ status: "cancelado" }).in("id", active.map((row) => row.id));
    if (error) return toast.error("Não foi possível cancelar os cheques", { description: error.message });
    toast.success(`${active.length} cheque(s) cancelado(s)`);
    await load();
  };

  const actions: ToolbarAction[] = [
    ...(!reportMode ? [{ key: "new", label: "Novo cheque", icon: Plus, mode: "create" as const, variant: "default" as const, onClick: () => setDialogOpen(true) }] : []),
    { key: "refresh", label: "Atualizar", icon: RefreshCw, mode: "always", variant: "outline", onClick: () => { void load(); } },
    ...(!reportMode ? [{ key: "cancel", label: "Cancelar cheque", icon: XCircle, mode: "single+batch" as const, variant: "destructive" as const, onClick: () => { void cancelSelected(); } }] : []),
  ];

  const columns: DataGridColumn<CheckRow>[] = [
    { key: "numero", header: "Cheque", width: "100px", cell: (row) => <span className="font-mono text-xs font-medium">{row.numero_cheque || "Sem número"}</span>, sortValue: (row) => row.numero_cheque || "" },
    { key: "data", header: "Emissão", width: "100px", cell: (row) => <span className="whitespace-nowrap text-xs">{formatDateBR(row.data_emissao)}</span>, sortValue: (row) => row.data_emissao },
    { key: "favorecido", header: "Favorecido / Origem", cell: (row) => <div className="min-w-0"><div className="truncate text-xs font-medium" title={row.favorecido_nome}>{row.favorecido_nome || "—"}</div><div className="truncate text-[10px] text-muted-foreground" title={row.historico || ""}>{row.historico || "Sem descrição"}</div></div>, sortValue: (row) => row.favorecido_nome },
    { key: "tipo", header: "Vínculo", width: "130px", cell: (row) => <span className="text-xs">{typeLabel[row.vinculo_tipo] || row.vinculo_tipo}</span>, sortValue: (row) => typeLabel[row.vinculo_tipo] || row.vinculo_tipo },
    { key: "empresa", header: "Empresa", width: "90px", cell: (row) => <EmpresaBadge empresaId={row.empresa_id} /> },
    { key: "valor", header: "Valor", width: "110px", align: "right", cell: (row) => <span className="font-mono text-xs font-medium">{formatCurrency(Number(row.valor))}</span>, sortValue: (row) => Number(row.valor) },
    { key: "status", header: "Situação", width: "110px", cell: (row) => <Badge variant={row.status === "cancelado" ? "destructive" : row.status === "compensado" ? "default" : "outline"} className="text-[10px]">{statusLabel[row.status] || row.status}</Badge>, sortValue: (row) => row.status },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><div><h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><WalletCards className="h-5 w-5 text-primary" /> {reportMode ? "Relatório de Cheques" : "Emissor de Cheques"}</h1><p className="text-[11px] text-muted-foreground">Acompanhe emissão, favorecido, origem e conta relacionada.</p></div><div className="hidden items-center gap-2 sm:flex"><span className="text-xs text-muted-foreground">{filtered.length} registro(s)</span><CheckCircle2 className="h-4 w-4 text-muted-foreground" /></div></div>
      <GlobalToolbar actions={actions} selectedCount={selected.size} filtersFirstOnMobile iconOnlyOnDesktop>
        <div className="relative"><Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input className="h-8 w-[190px] pl-7 text-xs" placeholder="Buscar cheque, favorecido..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-8 w-[118px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos" className="text-xs">Todas situações</SelectItem><SelectItem value="emitido" className="text-xs">Emitidos</SelectItem><SelectItem value="compensado" className="text-xs">Compensados</SelectItem><SelectItem value="cancelado" className="text-xs">Cancelados</SelectItem></SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos" className="text-xs">Todos os vínculos</SelectItem><SelectItem value="conta_pagar" className="text-xs">Conta a pagar</SelectItem><SelectItem value="contrato_frete" className="text-xs">Contrato de frete</SelectItem><SelectItem value="movimentacao" className="text-xs">Movimentação</SelectItem></SelectContent></Select>
        <EmpresaFilter value={empresa} onChange={setEmpresa} />
        <span className="hidden items-center gap-1 text-[10px] text-muted-foreground xl:inline-flex"><CalendarDays className="h-3 w-3" /> Ordenado por emissão</span>
      </GlobalToolbar>
      <DataGrid rows={filtered} columns={columns} rowId={(row) => row.id} selected={selected} onSelectedChange={setSelected} loading={loading} emptyMessage="Nenhum cheque registrado" minWidth={900} />
      <CheckIssueStandaloneDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={() => { setDialogOpen(false); void load(); }} />
    </div>
  );
}
