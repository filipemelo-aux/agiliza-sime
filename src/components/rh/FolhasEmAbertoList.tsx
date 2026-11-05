/**
 * FolhasDoMes — Lista todas as folhas de pagamento do mês selecionado,
 * indicando a situação (em aberto, confirmada, paga parcialmente, paga).
 *
 * Permite:
 *   - Ver o total consolidado das folhas do mês
 *   - Filtrar por situação
 *   - Editar individualmente os valores de cada colaborador (folha em aberto)
 *   - Gerar recibo(s) dos colaboradores selecionados
 *   - Efetuar pagamento (gera as despesas em Contas a Pagar, dá baixa e
 *     registra a movimentação no Fluxo de Caixa) — da folha inteira ou individual
 *   - Excluir folha/colaborador em aberto e reabrir folha confirmada
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, FileText, BadgeDollarSign, Eye, Printer } from "lucide-react";
import { GlobalToolbar, type ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { loadMovimentosEDisponiveis, resumirMovimentos, type MovMotorista } from "@/services/rh/acertoMotoristaService";
import type { ColaboradorRH, Expense } from "@/services/rh";
import { toast } from "@/lib/notice";
import { supabase } from "@/integrations/supabase/client";
import {
  listarFolhas,
  buscarFolhaComItens,
  excluirFolhaEmAberto,
  excluirItemFolhaEmAberto,
  reabrirFolhaConfirmada,
  atualizarItemFolhaEmAberto,
  efetuarPagamentoFolha,
  type FolhaPagamento,
  type FolhaItem,
} from "@/services/rh";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { imprimirRecibosPagamento, type HoleriteItem } from "@/lib/folhaPagamentoPrint";
import { cn } from "@/lib/utils";
import { getLocalDateISO } from "@/lib/date";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const FORMA_PAGAMENTO_OPTIONS = [
  { value: "pix", label: "PIX" },
  { value: "ted", label: "TED" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cheque", label: "Cheque" },
];

type Situacao = "em_aberto" | "confirmada" | "parcial" | "paga" | "cancelada";

const SITUACAO_UI: Record<Situacao, { label: string; cls: string }> = {
  em_aberto: { label: "Em aberto", cls: "text-primary border-primary/40 bg-primary/5" },
  confirmada: { label: "Confirmada (a pagar)", cls: "text-amber-700 border-amber-300 bg-amber-50" },
  parcial: { label: "Paga parcialmente", cls: "text-sky-700 border-sky-300 bg-sky-50" },
  paga: { label: "Paga", cls: "text-emerald-700 border-emerald-300 bg-emerald-50" },
  cancelada: { label: "Cancelada", cls: "text-muted-foreground border-border bg-muted/40" },
};

interface Props {
  month: string;
  empresaId: string;
  userId: string;
  folhaAccountId?: string;
  onChanged: () => void;
  colaboradores: ColaboradorRH[];
  adiantExpenses: Expense[];
  onGerarFolha: () => void;
  gerarFolhaDisabled?: boolean;
}

type Linha = { folha: FolhaPagamento; item: FolhaItem; motorista: boolean; sit: Situacao; pago: boolean };
const fmtData = (d?: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");

type PagamentoAlvo = { grupos: { folha: FolhaPagamento; itens: FolhaItem[] }[]; label: string };

export function FolhasEmAbertoList({ month, empresaId, userId, folhaAccountId, onChanged, colaboradores, adiantExpenses, onGerarFolha, gerarFolhaDisabled }: Props) {
  const tipoPorColab = useMemo(() => new Map(colaboradores.map((c) => [c.id, c.tipo])), [colaboradores]);
  const [fechamento, setFechamento] = useState<Linha | null>(null);
  const [visualizarFolha, setVisualizarFolha] = useState<Linha | null>(null);
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [situacoes, setSituacoes] = useState<Record<string, Situacao>>({});
  const [itemPago, setItemPago] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  
  const [itensPorFolha, setItensPorFolha] = useState<Record<string, FolhaItem[]>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ folha: FolhaPagamento; item: FolhaItem } | null>(null);
  const [editForm, setEditForm] = useState({ salario_base: "0", comissoes: "0", adiantamentos: "0", descontos: "0" });
  const [pagamento, setPagamento] = useState<PagamentoAlvo | null>(null);
  const [pagData, setPagData] = useState(getLocalDateISO());
  const [pagForma, setPagForma] = useState("pix");
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      const all = await listarFolhas();
      const data = all.filter(
        (f) =>
          f.mes_referencia === month ||
          (f.data_vencimento || "").startsWith(month) ||
          (f.data_inicio || "").startsWith(month)
      );
      setFolhas(data);
      const itensCarregados = await Promise.all(
        data.map(async (f) => ({ folhaId: f.id, itens: (await buscarFolhaComItens(f.id)).itens }))
      );
      setItensPorFolha(Object.fromEntries(itensCarregados.map((r) => [r.folhaId, r.itens])));
      setSelecionados(new Set());

      const map: Record<string, Situacao> = {};
      data.forEach((f) => {
        map[f.id] = f.status === "cancelada" ? "cancelada" : f.status === "em_aberto" ? "em_aberto" : "confirmada";
      });

      // Situação de pagamento via despesas geradas
      const todosItens = itensCarregados.flatMap((r) => r.itens);
      const expIds = todosItens.flatMap(i => [i.expense_id, ...(i.reembolso_expense_ids || [])]).filter((id): id is string => !!id);
      const pagoMap: Record<string, boolean> = {};
      if (expIds.length > 0) {
        const { data: exps } = await supabase.from("expenses").select("id, status").in("id", expIds);
        const statusById = new Map(((exps as any[]) || []).map((e) => [e.id, e.status]));
        todosItens.forEach((i) => {
          const ids = [i.expense_id, ...(i.reembolso_expense_ids || [])].filter((id): id is string => !!id);
          pagoMap[i.id] = ids.length > 0 && ids.every(id => statusById.get(id) === "pago");
        });
        itensCarregados.forEach(({ folhaId, itens }) => {
          const folha = data.find((f) => f.id === folhaId);
          if (!folha || folha.status !== "confirmada") return;
          const meus = itens.flatMap(i => [i.expense_id, ...(i.reembolso_expense_ids || [])]).filter((id): id is string => !!id).map(id => statusById.get(id)).filter(Boolean) as string[];
          if (meus.length === 0) return;
          const pagos = meus.filter((s) => s === "pago").length;
          const parciais = meus.filter((s) => s === "parcial").length;
          map[folhaId] = pagos === meus.length ? "paga" : pagos > 0 || parciais > 0 ? "parcial" : "confirmada";
        });
      }
      setItemPago(pagoMap);
      setSituacoes(map);
    } catch (e: any) {
      toast.error("Erro ao carregar folhas: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const itensVisiveis = useMemo(
    () => folhas.flatMap((folha) => (itensPorFolha[folha.id] || []).map((item) => ({ folha, item }))),
    [folhas, itensPorFolha]
  );

  const toggleItem = (id: string) => setSelecionados((atual) => {
    const proximo = new Set(atual);
    proximo.has(id) ? proximo.delete(id) : proximo.add(id);
    return proximo;
  });

  const gerarRecibos = async (escolhidos: { folha: FolhaPagamento; item: FolhaItem }[], key: string) => {
    if (escolhidos.length === 0) return;
    setActing(key);
    try {
      const profileIds = Array.from(new Set(escolhidos.map(({ item }) => item.colaborador_id).filter(Boolean)));
      const { data } = await supabase.from("profiles")
        .select("id, cnpj, cargo, departamento, data_admissao, tipo_colaborador_rh")
        .in("id", profileIds);
      const perfis = new Map((data || []).map((p: any) => [p.id, p]));
      const primeiraFolha = escolhidos[0].folha;
      const recibos: HoleriteItem[] = escolhidos.map(({ item }) => {
        const p: any = perfis.get(item.colaborador_id) || {};
        return {
          colaborador_nome: item.colaborador_nome, reembolsos: Number(item.reembolsos || 0),
          salario_base: Number(item.salario_base), comissoes: Number(item.comissoes),
          adiantamentos: Number(item.adiantamentos), descontos: Number(item.descontos), liquido: Number(item.liquido),
          codigo: String(item.colaborador_id || "").slice(0, 8).toUpperCase(), cpf: p.cnpj || null,
          funcao: p.cargo || null, departamento: p.departamento || null, admissao: p.data_admissao || null, regime: "clt",
        };
      });
      imprimirRecibosPagamento({
        mes_referencia: primeiraFolha.mes_referencia, data_inicio: primeiraFolha.data_inicio,
        data_fim: primeiraFolha.data_fim, data_vencimento: primeiraFolha.data_vencimento,
        total_base: recibos.reduce((s, i) => s + i.salario_base, 0),
        total_comissoes: recibos.reduce((s, i) => s + i.comissoes, 0),
        total_adiantamentos: recibos.reduce((s, i) => s + i.adiantamentos, 0),
        total_descontos: recibos.reduce((s, i) => s + i.descontos, 0),
        total_liquido: recibos.reduce((s, i) => s + i.liquido, 0),
      }, recibos);
    } catch (e: any) {
      toast.error("Falha ao gerar recibos: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const handleSelectedReceipts = () =>
    gerarRecibos(itensVisiveis.filter(({ item }) => selecionados.has(item.id)), "recibos");

  const abrirEdicao = (folha: FolhaPagamento, item: FolhaItem) => {
    setEditForm({
      salario_base: String(Number(item.salario_base || 0)),
      comissoes: String(Number(item.comissoes || 0)),
      adiantamentos: String(Number(item.adiantamentos || 0)),
      descontos: String(Number(item.descontos || 0)),
    });
    setEditing({ folha, item });
  };

  const salvarEdicao = async () => {
    if (!editing) return;
    setActing(editing.item.id);
    try {
      await atualizarItemFolhaEmAberto(editing.folha.id, editing.item.id, {
        salario_base: Number(editForm.salario_base) || 0,
        comissoes: Number(editForm.comissoes) || 0,
        adiantamentos: Number(editForm.adiantamentos) || 0,
        descontos: Number(editForm.descontos) || 0,
      });
      toast.success("Valores atualizados.");
      setEditing(null);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const abrirPagamento = (grupos: { folha: FolhaPagamento; itens: FolhaItem[] }[], label: string) => {
    if (!folhaAccountId) {
      toast.error("Configure a conta de Folha em Configurações do RH.");
      return;
    }
    if (grupos.every((g) => g.itens.length === 0)) {
      toast.error("Nada a pagar.");
      return;
    }
    setPagData(grupos[0].folha.data_vencimento || getLocalDateISO());
    setPagForma("pix");
    setPagamento({ grupos, label });
  };

  const confirmarPagamento = async () => {
    if (!pagamento || !folhaAccountId) return;
    setActing("pagamento");
    try {
      const r = { pagos: 0, erros: [] as string[] };
      for (const g of pagamento.grupos) {
        const x = await efetuarPagamentoFolha({
          folhaId: g.folha.id,
          user_id: userId,
          folhaAccountId,
          data_pagamento: pagData,
          forma_pagamento: pagForma,
          itemIds: g.itens.map((i) => i.id),
        });
        r.pagos += x.pagos; r.erros.push(...x.erros);
      }
      if (r.erros.length > 0) toast.warning(`${r.pagos} pago(s), ${r.erros.length} falha(s): ${r.erros[0]}`);
      else toast.success(`${r.pagos} pagamento(s) registrado(s) no Contas a Pagar e no Fluxo de Caixa.`);
      setPagamento(null);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async (f: FolhaPagamento) => {
    const ok = await confirm({
      title: "Excluir folha em aberto?",
      description: "A folha será removida. Comissões e descontos vinculados voltam para 'pendente'. Nenhum lançamento financeiro será afetado.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    setActing(f.id);
    try {
      await excluirFolhaEmAberto(f.id);
      toast.success("Folha excluída.");
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const handleReopen = async (f: FolhaPagamento) => {
    const ok = await confirm({
      title: "Reabrir folha?",
      description: "A folha voltará para Em aberto e poderá ser editada, excluída e gerada novamente. A operação será bloqueada se existir pagamento efetivo.",
      confirmLabel: "Reabrir",
    });
    if (!ok) return;
    setActing(f.id);
    try {
      await reabrirFolhaConfirmada(f.id);
      toast.success("Folha reaberta.");
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const handleDeleteItem = async (folha: FolhaPagamento, item: FolhaItem) => {
    const ok = await confirm({
      title: `Excluir ${tipoPorColab.get(item.colaborador_id) === "motorista" ? "acerto" : "folha"} de ${item.colaborador_nome}?`,
      description: tipoPorColab.get(item.colaborador_id) === "motorista"
        ? "O acerto sai da folha e volta a ficar editável na tela Motoristas. A conta gerada no Contas a Pagar, se houver, é removida."
        : "O colaborador sai da folha e volta a ficar editável em Administrativo / Operacional. A conta gerada no Contas a Pagar, se houver, é removida.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    setActing(item.id);
    try {
      if (folha.status === "confirmada") await reabrirFolhaConfirmada(folha.id);
      await excluirItemFolhaEmAberto(folha.id, item.id);
      toast.success(`Folha de ${item.colaborador_nome} excluída.`);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const editLiquido = Math.max(
    0,
    (Number(editForm.salario_base) || 0) + (Number(editForm.comissoes) || 0) -
    (Number(editForm.adiantamentos) || 0) - (Number(editForm.descontos) || 0)
  );

  const linhas: Linha[] = itensVisiveis.map(({ folha, item }) => ({
    folha, item, motorista: tipoPorColab.get(item.colaborador_id) === "motorista",
    sit: situacoes[folha.id] || "em_aberto", pago: !!itemPago[item.id],
  }));
  const sel = linhas.filter((l) => selecionados.has(l.item.id));
  const one = sel.length === 1 ? sel[0] : null;
  const pagaveis = (motorista: boolean) =>
    sel.length > 0 && sel.every((l) => l.motorista === motorista && !l.pago && l.sit !== "cancelada");

  const abrirPagamentoSelecionados = (motorista: boolean) => {
    const grupos = new Map<string, { folha: FolhaPagamento; itens: FolhaItem[] }>();
    sel.forEach((l) => {
      const g = grupos.get(l.folha.id) || { folha: l.folha, itens: [] };
      g.itens.push(l.item);
      grupos.set(l.folha.id, g);
    });
    abrirPagamento(Array.from(grupos.values()), motorista
      ? (sel.length === 1 ? `Acerto de ${sel[0].item.colaborador_nome}` : `${sel.length} acertos de motoristas`)
      : (sel.length === 1 ? `Folha de ${sel[0].item.colaborador_nome}` : `Folha — ${sel.length} colaborador(es)`));
  };

  const imprimirAcerto = async () => {
    if (!one) return;
    setActing("acerto-pdf");
    try { await baixarAcertoPdfLinha(one); } catch (e: any) { toast.error("Falha ao gerar o PDF: " + e.message); } finally { setActing(null); }
  };

  const actions: ToolbarAction[] = [
    { key: "pagar", label: "Efetuar pagamento", icon: BadgeDollarSign, mode: "batch", className: "text-success", iconClassName: "text-success",
      onClick: () => abrirPagamentoSelecionados(sel[0]?.motorista ?? false),
      disabled: !folhaAccountId || !(pagaveis(true) || pagaveis(false)) },
    { key: "visualizar", label: "Visualizar", icon: Eye, mode: "single", onClick: () => one && (one.motorista ? setFechamento(one) : setVisualizarFolha(one)), disabled: !one },
    { key: "imprimir-acerto", label: "Imprimir acerto", icon: Printer, mode: "single", onClick: imprimirAcerto, disabled: acting === "acerto-pdf" || !one?.motorista },
    { key: "imprimir-folha", label: "Imprimir folha de pagamento", icon: FileText, mode: "batch", onClick: handleSelectedReceipts, disabled: acting === "recibos" || sel.length === 0 || sel.some((l) => l.motorista) },
    { key: "excluir", label: "Excluir", icon: Trash2, mode: "single", variant: "destructive", onClick: () => one && handleDeleteItem(one.folha, one.item), disabled: !one || one.pago || one.sit === "cancelada" },
  ];

  const money = (v: number, cls = "") => <span className={cn("tabular-nums", cls)}>{formatBRL(v)}</span>;
  const columns: DataGridColumn<Linha>[] = [
    { key: "nome", header: "Colaborador", cell: (l) => <span className="font-medium">{l.item.colaborador_nome}</span>, sortValue: (l) => l.item.colaborador_nome },
    { key: "tipo", header: "Tipo", cell: (l) => l.motorista ? "Acerto motorista" : "Folha adm./oper.", sortValue: (l) => (l.motorista ? 1 : 0) },
    { key: "periodo", header: "Período", cell: (l) => `${fmtData(l.folha.data_inicio)} a ${fmtData(l.folha.data_fim)}`, sortValue: (l) => l.folha.data_inicio },
    { key: "venc", header: "Vencimento", cell: (l) => fmtData(l.folha.data_vencimento), sortValue: (l) => l.folha.data_vencimento },
    { key: "base", header: "Base", align: "right", cell: (l) => money(Number(l.item.salario_base)), sortValue: (l) => Number(l.item.salario_base) },
    { key: "com", header: "Comissões", align: "right", cell: (l) => money(Number(l.item.comissoes)), sortValue: (l) => Number(l.item.comissoes) },
    { key: "reemb", header: "Reembolsos", align: "right", cell: (l) => money(Number(l.item.reembolsos || 0)), sortValue: (l) => Number(l.item.reembolsos || 0) },
    { key: "adiant", header: "Adiant. / Vales", align: "right", cell: (l) => money(Number(l.item.adiantamentos), "text-destructive"), sortValue: (l) => Number(l.item.adiantamentos) },
    { key: "desc", header: "Descontos", align: "right", cell: (l) => money(Number(l.item.descontos), "text-destructive"), sortValue: (l) => Number(l.item.descontos) },
    { key: "liq", header: "Líquido", align: "right", cell: (l) => money(Number(l.item.liquido), "font-semibold"), sortValue: (l) => Number(l.item.liquido) },
    { key: "sit", header: "Situação", cell: (l) => l.pago ? "Pago" : SITUACAO_UI[l.sit].label, sortValue: (l) => (l.pago ? "Pago" : SITUACAO_UI[l.sit].label) },
  ];
  const tot = (f: (i: FolhaItem) => number) => linhas.reduce((s, l) => s + f(l.item), 0);

  return (
    <>
      <div className="space-y-3">
        <GlobalToolbar actions={actions} selectedCount={selecionados.size} />
        <DataGrid
          rows={linhas}
          columns={columns}
          rowId={(l) => l.item.id}
          selected={selecionados}
          onSelectedChange={setSelecionados}
          loading={loading}
          minWidth={1100}
          rowClassName={(l) => rowToneClass(l.pago ? "resolved" : l.sit === "cancelada" ? "neutral" : "pending")}
          emptyMessage="Nenhuma folha ou acerto neste mês. Gere a folha dos administrativos aqui; o acerto dos motoristas é gerado na tela Motoristas."
          footer={linhas.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-4 text-xs">
              <span>Comissões: <b className="tabular-nums">{formatBRL(tot((i) => Number(i.comissoes)))}</b></span>
              <span>Reembolsos: <b className="tabular-nums">{formatBRL(tot((i) => Number(i.reembolsos || 0)))}</b></span>
              <span>Descontos: <b className="tabular-nums">{formatBRL(tot((i) => Number(i.adiantamentos) + Number(i.descontos)))}</b></span>
              <span>Líquido: <b className="tabular-nums">{formatBRL(tot((i) => Number(i.liquido)))}</b></span>
            </div>
          ) : undefined}
        />
        <StatusLegend items={[{ tone: "pending", label: "A pagar" }, { tone: "resolved", label: "Pago" }]} />
      </div>

      {/* Fechamento do motorista */}
      <FechamentoMotoristaDialog alvo={fechamento} onClose={() => setFechamento(null)} adiantExpenses={adiantExpenses} />

      {/* Visualizar folha administrativa */}
      <Dialog open={!!visualizarFolha} onOpenChange={(o) => !o && setVisualizarFolha(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Folha — {visualizarFolha?.item.colaborador_nome}</DialogTitle>
            <DialogDescription>Período {fmtData(visualizarFolha?.folha.data_inicio)} a {fmtData(visualizarFolha?.folha.data_fim)} · Vencimento {fmtData(visualizarFolha?.folha.data_vencimento)}</DialogDescription>
          </DialogHeader>
          {visualizarFolha && (
            <div className="space-y-1 text-sm">
              {([
                ["Salário base", Number(visualizarFolha.item.salario_base), false],
                ["Comissões", Number(visualizarFolha.item.comissoes), false],
                ["Reembolsos", Number(visualizarFolha.item.reembolsos || 0), false],
                ["Adiantamentos / Vales", Number(visualizarFolha.item.adiantamentos), true],
                ["Descontos", Number(visualizarFolha.item.descontos), true],
              ] as const).map(([l, v, neg]) => (
                <div key={l} className="flex justify-between border-b border-border py-1">
                  <span>{l}</span><span className={cn("tabular-nums", neg && "text-destructive")}>{formatBRL(v)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-semibold text-primary">
                <span>Líquido</span><span className="tabular-nums">{formatBRL(Number(visualizarFolha.item.liquido))}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edição individual */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editing?.item.colaborador_nome}</DialogTitle>
            <DialogDescription>Ajuste os valores deste colaborador. Os totais da folha são recalculados.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["salario_base", "Salário base"],
              ["comissoes", "Comissões"],
              ["adiantamentos", "Adiantamentos"],
              ["descontos", "Descontos"],
            ] as const).map(([campo, label]) => (
              <div key={campo}>
                <Label className="text-xs">{label}</Label>
                <Input
                  type="number" step="0.01" min="0" className="h-9"
                  value={editForm[campo]}
                  onChange={(e) => setEditForm((s) => ({ ...s, [campo]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-primary font-semibold">Líquido</span>
            <span className="text-sm font-bold text-primary tabular-nums">{formatBRL(editLiquido)}</span>
          </div>
          <Button className="w-full" disabled={acting === editing?.item.id} onClick={salvarEdicao}>
            {acting === editing?.item.id ? "Salvando..." : "Salvar alterações"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Pagamento */}
      <Dialog open={!!pagamento} onOpenChange={(o) => !o && setPagamento(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Efetuar pagamento</DialogTitle>
            <DialogDescription>
              {pagamento?.label} — total {formatBRL((pagamento?.grupos || []).flatMap((g) => g.itens).reduce((s, i) => s + Number(i.liquido || 0), 0))}.
              A baixa é registrada no Contas a Pagar e no Fluxo de Caixa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Data do pagamento</Label>
              <Input type="date" className="h-9" value={pagData} onChange={(e) => setPagData(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={pagForma} onValueChange={setPagForma}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMA_PAGAMENTO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" disabled={acting === "pagamento"} onClick={confirmarPagamento}>
            {acting === "pagamento" ? "Processando..." : "Efetuar pagamento"}
          </Button>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </>
  );
}


async function baixarAcertoPdfLinha(l: Linha, movs?: MovMotorista[]) {
  const lista = movs ?? await loadMovimentosDoAcerto(l.item.colaborador_id, l.folha.data_inicio);
  await baixarAcertoMotoristaPdf({
    nome: l.item.colaborador_nome, inicio: l.folha.data_inicio, fim: l.folha.data_fim, vencimento: l.folha.data_vencimento,
    movs: lista, resumo: resumirMovimentos(lista), liquido: Number(l.item.liquido),
  });
}

const NAT_LABEL: Record<MovMotorista["natureza"], string> = { comissao: "Comissão", reembolso: "Reembolso", vale: "Vale / Adiantamento", desconto: "Desconto" };

function FechamentoMotoristaDialog({ alvo, onClose, adiantExpenses }: { alvo: Linha | null; onClose: () => void; adiantExpenses: Expense[] }) {
  const [movs, setMovs] = useState<MovMotorista[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!alvo) return;
    const f = alvo.folha;
    setLoading(true);
    setMovs([]);
    loadMovimentosDoAcerto(alvo.item.colaborador_id, f.data_inicio)
      .then(setMovs)
      .catch((e) => toast.error("Erro ao carregar o fechamento: " + e.message))
      .finally(() => setLoading(false));
  }, [alvo, adiantExpenses]);
  const r = resumirMovimentos(movs);
  const [baixando, setBaixando] = useState(false);
  const imprimir = async () => {
    if (!alvo) return;
    setBaixando(true);
    try { await baixarAcertoPdfLinha(alvo, movs); } catch (e: any) { toast.error("Falha ao gerar o PDF: " + e.message); } finally { setBaixando(false); }
  };
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fechamento — {alvo?.item.colaborador_nome}</DialogTitle>
          <DialogDescription>Período {fmtData(alvo?.folha.data_inicio)} a {fmtData(alvo?.folha.data_fim)}</DialogDescription>
        </DialogHeader>
        <DataGrid
          rows={movs}
          rowId={(m) => m.id}
          selected={new Set()}
          onSelectedChange={() => {}}
          isSelectable={() => false}
          loading={loading}
          minWidth={620}
          maxHeight="50vh"
          emptyMessage="Nenhuma movimentação neste acerto."
          columns={[
            { key: "data", header: "Data", cell: (m) => fmtData(m.data), sortValue: (m) => m.data },
            { key: "tipo", header: "Tipo", cell: (m) => NAT_LABEL[m.natureza] },
            { key: "desc", header: "Descrição", cell: (m) => <span className="truncate">{m.descricao}</span> },
            { key: "ent", header: "Entrada", align: "right", cell: (m) => (m.entrada ? <span className="tabular-nums">{formatBRL(m.entrada)}</span> : "") },
            { key: "sai", header: "Saída", align: "right", cell: (m) => (m.saida ? <span className="tabular-nums text-destructive">{formatBRL(m.saida)}</span> : "") },
          ]}
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div>Comissões<br /><b className="tabular-nums">{formatBRL(r.comissoes)}</b></div>
          <div>Reembolsos<br /><b className="tabular-nums">{formatBRL(r.reembolsos)}</b></div>
          <div>Adiant. / Vales<br /><b className="tabular-nums text-destructive">{formatBRL(r.vales)}</b></div>
          <div>Descontos<br /><b className="tabular-nums text-destructive">{formatBRL(r.descontos)}</b></div>
          <div>Saldo a receber<br /><b className="tabular-nums text-primary">{formatBRL(Number(alvo?.item.liquido ?? r.saldo))}</b></div>
        </div>
        <div className="flex justify-end">
          <Button onClick={imprimir} disabled={baixando || loading}>
            {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Imprimir acerto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
