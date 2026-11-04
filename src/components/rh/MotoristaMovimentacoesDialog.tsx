import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
  deleteComissao,
  deleteDescontoFolha,
  loadMovimentosMotorista,
  type ColaboradorRH,
  type Expense,
  type MovMotorista,
  type MovNatureza,
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

  const load = useCallback(async () => {
    if (!colaborador) return;
    setLoading(true);
    try {
      const list = await loadMovimentosMotorista(colaborador.id, periodo, adiantExpenses);
      setRows(list);
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
  const reembolsosPend = rows.filter((r) => r.natureza === "reembolso");
  const valesCP = rows.filter((r) => r.natureza === "vale" && r.id.startsWith("v-"));

  const excluir = async () => {
    if (!sel.length || bloqueado) return;
    const bloqueadas = sel.filter((r) => !r.removivel);
    if (bloqueadas.length) {
      toast.error(bloqueadas.some((r) => r.natureza === "reembolso" || (r.natureza === "vale" && r.id.startsWith("v-")))
        ? "Reembolsos e vales do Contas a Pagar não são excluídos aqui. Para alterar, edite a despesa lá. Desmarque-os e tente de novo."
        : "Há comissão já enviada para a folha na seleção; ela não pode ser excluída aqui.");
      return;
    }
    const total = sel.reduce((s, r) => s + r.entrada + r.saida, 0);
    const ok = await confirm({ title: "Excluir movimentações", description: sel.length === 1 ? `Excluir ${NAT_LABEL[sel[0].natureza].toLowerCase()} de ${formatBRL(total)}?` : `Excluir ${sel.length} movimentações (${formatBRL(total)})?`, confirmLabel: "Excluir" } as any);
    if (!ok) return;
    try {
      for (const r of sel) {
        if (r.natureza === "comissao") await deleteComissao(r.origemId);
        else await deleteDescontoFolha(r.origemId);
      }
      toast.success(sel.length === 1 ? "Movimentação excluída" : `${sel.length} movimentações excluídas`);
      setSelected(new Set());
      load();
    } catch (e: any) {
      toast.error("Erro ao excluir: " + e.message);
      load();
    }
  };

  const actions: ToolbarAction[] = [
    { key: "in-com", label: "Entrada: Comissão", icon: Percent, mode: "create", variant: "default", disabled: bloqueado, onClick: () => setLancar("comissao") },
    { key: "in-reemb", label: "Entrada: Reembolso", icon: Receipt, mode: "create", disabled: bloqueado, onClick: () => setLancar("reembolso") },
    { key: "out-vale", label: "Saída: Vale / Adiantamento", icon: HandCoins, mode: "create", disabled: bloqueado, onClick: () => setLancar("vale") },
    { key: "out-desc", label: "Saída: Desconto", icon: UserMinus, mode: "create", disabled: bloqueado, onClick: () => setLancar("desconto") },
    { key: "del", label: "Excluir", icon: Trash2, mode: "batch", variant: "destructive", disabled: bloqueado, onClick: excluir },
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
              emptyMessage="Nenhuma movimentação nesta quinzena. Use os botões de entrada e saída acima."
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

      <Dialog open={!!lancar} onOpenChange={(o) => { if (!o) { setLancar(null); load(); } }}>
        <DialogContent className="max-w-5xl max-h-[92vh]">
          <DialogHeader>
            <DialogTitle>{lancar ? lancarTitle[lancar] : ""}</DialogTitle>
            <DialogDescription>{colaborador?.full_name} · {labelQuinzena(periodo)}</DialogDescription>
          </DialogHeader>
          {lancar === "comissao" && <ComissoesTab colaboradores={lista} periodo={periodo} />}
          {lancar === "desconto" && <DescontosTab colaboradores={lista} />}
          {(lancar === "reembolso" || lancar === "vale") && (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">
                {lancar === "reembolso"
                  ? "Reembolsos nascem no Contas a Pagar: ao lançar a despesa, marque “Pago pelo colaborador (Reembolso)” e escolha este motorista. Eles entram aqui como crédito e são quitados junto com o pagamento da folha."
                  : "Vales e adiantamentos são uma saída real de caixa e nascem no Contas a Pagar, no plano de adiantamento, com este motorista como favorecido. Eles entram aqui como débito."}
              </p>
              <div className="border rounded-md divide-y">
                {(lancar === "reembolso" ? reembolsosPend : valesCP).length === 0 && (
                  <div className="p-3 text-center text-muted-foreground">Nenhum lançamento nesta quinzena.</div>
                )}
                {(lancar === "reembolso" ? reembolsosPend : valesCP).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-2">
                    <span className="w-20">{formatDate(r.data)}</span>
                    <span className="flex-1 truncate">{r.descricao}</span>
                    <span className={`font-mono ${r.entrada ? "text-success" : "text-destructive"}`}>{formatBRL(r.entrada || r.saida)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </>
  );
}
