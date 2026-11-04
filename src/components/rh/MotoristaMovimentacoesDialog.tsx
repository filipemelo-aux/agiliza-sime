import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { ArrowDownCircle, ArrowUpCircle, HandCoins, Percent, Receipt, Trash2, UserMinus } from "lucide-react";
import { ComissoesTab } from "@/components/rh/ComissoesTab";
import { DescontosTab } from "@/components/rh/DescontosTab";
import { toast } from "@/lib/notice";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { labelQuinzena, type AcertoPeriod } from "@/lib/rhAcertoPeriod";
import {
  adicionarAoAcerto,
  loadMovimentosEDisponiveis,
  removerDoAcerto,
  type ColaboradorRH,
  type Expense,
  type MovMotorista,
  type MovNatureza,
  type Comissao,
} from "@/services/rh";

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const formatDate = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

type Natureza = MovNatureza;
type Mov = MovMotorista;

const NAT_LABEL: Record<Natureza, string> = { comissao: "Comissão", reembolso: "Reembolso", vale: "Vale / Adiantamento", desconto: "Desconto" };

type Lancar = null | "comissao" | "reembolso" | "vale" | "desconto";

interface Props {
  colaborador: ColaboradorRH | null;
  adiantExpenses: Expense[];
  periodo: AcertoPeriod;
  /** acerto gerado: movimentações somente leitura */
  bloqueado?: boolean;
  onClose: () => void;
}

/** Extrato de entradas (créditos) e saídas (débitos) do motorista na quinzena escolhida na grade. */
export function MotoristaMovimentacoesDialog({ colaborador, adiantExpenses, periodo, bloqueado = false, onClose }: Props) {
  const [rows, setRows] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lancar, setLancar] = useState<Lancar>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [disp, setDisp] = useState<Mov[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [criarNovo, setCriarNovo] = useState(false);

  const load = useCallback(async () => {
    if (!colaborador) return;
    setLoading(true);
    try {
      const r = await loadMovimentosEDisponiveis(colaborador.id, periodo, adiantExpenses);
      setRows(r.incluidas);
      setDisp(r.disponiveis);
    } catch (e: any) {
      toast.error("Erro ao carregar movimentações: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [colaborador?.id, periodo.inicio, periodo.fim, adiantExpenses]);

  useEffect(() => { setSelected(new Set()); load(); }, [load]);

  const totalEntrada = rows.reduce((s, r) => s + r.entrada, 0);
  const totalSaida = rows.reduce((s, r) => s + r.saida, 0);
  const saldo = totalEntrada - totalSaida;
  const sel = rows.filter((r) => selected.has(r.id));
  const lista = useMemo(() => (colaborador ? [colaborador] : []), [colaborador]);
  const dispLancar = lancar ? disp.filter((d) => d.natureza === lancar) : [];

  const abrir = (l: Exclude<Lancar, null>) => { setPick(new Set()); setCriarNovo(false); setLancar(l); };

  const adicionar = async () => {
    if (!colaborador) return;
    const itens = dispLancar.filter((d) => pick.has(d.id));
    if (!itens.length) return;
    try {
      await adicionarAoAcerto(colaborador.id, periodo, itens);
      toast.success(itens.length === 1 ? "Adicionado à movimentação" : `${itens.length} lançamentos adicionados`);
      setLancar(null);
      load();
    } catch (e: any) {
      toast.error("Erro ao adicionar: " + e.message);
    }
  };

  const adicionarComissoes = async (comissoes: Comissao[]) => {
    if (!colaborador || bloqueado) return;
    await adicionarAoAcerto(colaborador.id, periodo, comissoes.map((c) => ({
      id: `c-${c.id}`, origemId: c.id, origemTipo: "comissao" as const,
      natureza: "comissao" as const, data: c.data_referencia,
      descricao: c.observacoes || "Comissão de viagem", entrada: Number(c.valor_calculado),
      saida: 0, removivel: true,
    })));
    toast.success("Comissões adicionadas à movimentação");
    setLancar(null);
    await load();
  };

  const excluir = async () => {
    if (!sel.length || bloqueado || !colaborador) return;
    const ok = await confirm({ title: "Remover da movimentação", description: `Remover ${sel.length === 1 ? "este lançamento" : `${sel.length} lançamentos`} do acerto da quinzena? O lançamento original (Contas a Pagar, comissão ou desconto) não é apagado e volta a ficar disponível.`, confirmLabel: "Remover" } as any);
    if (!ok) return;
    try {
      await removerDoAcerto(colaborador.id, periodo, sel);
      toast.success("Removido da movimentação");
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
      load();
    }
  };

  const actions: ToolbarAction[] = [
    { key: "in-com", label: "Entrada: Comissão", icon: Percent, mode: "create", variant: "default", disabled: bloqueado, onClick: () => abrir("comissao") },
    { key: "in-reemb", label: "Entrada: Reembolso", icon: Receipt, mode: "create", disabled: bloqueado, onClick: () => abrir("reembolso") },
    { key: "out-vale", label: "Saída: Vale / Adiantamento", icon: HandCoins, mode: "create", disabled: bloqueado, onClick: () => abrir("vale") },
    { key: "out-desc", label: "Saída: Desconto", icon: UserMinus, mode: "create", disabled: bloqueado, onClick: () => abrir("desconto") },
    { key: "del", label: "Remover", icon: Trash2, mode: "batch", variant: "destructive", disabled: bloqueado, onClick: excluir },
  ];

  const columns: DataGridColumn<Mov>[] = [
    { key: "data", header: "Data", width: "95px", sortValue: (r) => r.data, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.data)}</span> },
    {
      key: "tipo", header: "Tipo", width: "170px", sortValue: (r) => r.natureza,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.entrada > 0 ? <ArrowUpCircle className="h-3.5 w-3.5 text-success" /> : <ArrowDownCircle className="h-3.5 w-3.5 text-destructive" />}
          <Badge variant="outline" className="text-[10px]">{NAT_LABEL[r.natureza]}</Badge>
        </span>
      ),
    },
    { key: "desc", header: "Descrição", sortValue: (r) => r.descricao, cell: (r) => <span className="truncate block" title={r.descricao}>{r.descricao}</span> },
    { key: "entrada", header: "Entrada (crédito)", width: "130px", align: "right", sortValue: (r) => r.entrada, cell: (r) => <span className="font-mono text-success whitespace-nowrap">{r.entrada ? formatBRL(r.entrada) : ""}</span> },
    { key: "saida", header: "Saída (débito)", width: "130px", align: "right", sortValue: (r) => r.saida, cell: (r) => <span className="font-mono text-destructive whitespace-nowrap">{r.saida ? formatBRL(r.saida) : ""}</span> },
  ];

  const lancarTitle: Record<Exclude<Lancar, null>, string> = {
    comissao: "Entrada — Comissões de viagem",
    reembolso: "Entrada — Reembolsos",
    vale: "Saída — Vales / Adiantamentos",
    desconto: "Saída — Descontos",
  };

  return (
    <>
      <Dialog open={!!colaborador} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-6xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>Movimentações — {colaborador?.full_name}</DialogTitle>
            <DialogDescription>{labelQuinzena(periodo)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {bloqueado && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                Acerto desta quinzena já gerado e enviado para a Folha de Pagamento. Para alterar, use “Editar acerto” na lista de motoristas.
              </div>
            )}
            <GlobalToolbar actions={actions} selectedCount={selected.size} />
            <DataGrid
              rows={rows}
              columns={columns}
              rowId={(r) => r.id}
              selected={selected}
              onSelectedChange={setSelected}
              loading={loading}
              minWidth={760}
              rowClassName={(r) => rowToneClass(r.entrada > 0 ? "resolved" : "pending")}
              emptyMessage="Movimentação em branco. Use os botões de entrada e saída para adicionar lançamentos."
              footer={
                <div className="flex flex-wrap items-center justify-end gap-4 text-xs">
                  <span>Entradas: <span className="font-mono font-semibold text-success">{formatBRL(totalEntrada)}</span></span>
                  <span>Saídas: <span className="font-mono font-semibold text-destructive">{formatBRL(totalSaida)}</span></span>
                  <span>Saldo do acerto: <span className={`font-mono font-bold ${saldo < 0 ? "text-destructive" : "text-foreground"}`}>{formatBRL(saldo)}</span></span>
                </div>
              }
            />
            <StatusLegend className="px-1" items={[{ tone: "resolved", label: "Entrada (crédito)" }, { tone: "pending", label: "Saída (débito)" }]} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lancar} onOpenChange={(o) => { if (!o) { setLancar(null); load(); } else load(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>{lancar ? lancarTitle[lancar] : ""}</DialogTitle>
            <DialogDescription>{colaborador?.full_name} · {labelQuinzena(periodo)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-xs">
            {(lancar !== "comissao" || dispLancar.length > 0) && <div className="border rounded-md divide-y max-h-[50vh] overflow-y-auto">
              {dispLancar.length === 0 && (
                <div className="p-3 text-center text-muted-foreground">Nenhum lançamento disponível nesta quinzena.</div>
              )}
              {dispLancar.map((r) => (
                <label key={r.id} className="flex items-center gap-3 p-2 cursor-pointer hover:bg-muted/50">
                  <Checkbox checked={pick.has(r.id)} onCheckedChange={(v) => setPick((prev) => { const n = new Set(prev); v ? n.add(r.id) : n.delete(r.id); return n; })} />
                  <span className="w-20">{formatDate(r.data)}</span>
                  <span className="flex-1 truncate" title={r.descricao}>{r.descricao}</span>
                  <span className={`font-mono ${r.entrada ? "text-success" : "text-destructive"}`}>{formatBRL(r.entrada || r.saida)}</span>
                </label>
              ))}
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {dispLancar.length > 0 && (
                  <Button variant="outline" onClick={() => setPick(pick.size === dispLancar.length ? new Set() : new Set(dispLancar.map((d) => d.id)))}>
                    {pick.size === dispLancar.length ? "Desmarcar todos" : "Marcar todos"}
                  </Button>
                )}
                {lancar === "desconto" && (
                  <Button variant="outline" onClick={() => { if (criarNovo) load(); setCriarNovo((v) => !v); }}>
                    Lançar novo desconto
                  </Button>
                )}
              </div>
              {(lancar !== "comissao" || dispLancar.length > 0) && <Button disabled={!pick.size} onClick={adicionar}>Adicionar à movimentação ({pick.size})</Button>}
            </div>
            {(lancar === "reembolso" || lancar === "vale") && (
              <p className="text-muted-foreground">
                {lancar === "reembolso"
                  ? "Reembolsos nascem no Contas a Pagar com “Pago pelo colaborador (Reembolso)” marcado para este motorista."
                  : "Vales e adiantamentos nascem no Contas a Pagar, no plano de adiantamento, com este motorista como favorecido."}
              </p>
            )}
            {lancar === "comissao" && <ComissoesTab colaboradores={lista} periodo={periodo} onAdicionar={adicionarComissoes} />}
            {criarNovo && lancar === "desconto" && <div className="border-t pt-2"><DescontosTab colaboradores={lista} /></div>}
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </>
  );
}
