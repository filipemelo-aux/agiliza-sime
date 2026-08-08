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
import { Loader2, Trash2, RefreshCw, Download, RotateCcw, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
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
}

type PagamentoAlvo = { folha: FolhaPagamento; itens: FolhaItem[]; label: string };

export function FolhasEmAbertoList({ month, empresaId, userId, folhaAccountId, onChanged }: Props) {
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
      const expIds = todosItens.map((i) => i.expense_id).filter(Boolean) as string[];
      const pagoMap: Record<string, boolean> = {};
      if (expIds.length > 0) {
        const { data: exps } = await supabase.from("expenses").select("id, status").in("id", expIds);
        const statusById = new Map(((exps as any[]) || []).map((e) => [e.id, e.status]));
        todosItens.forEach((i) => {
          if (i.expense_id) pagoMap[i.id] = statusById.get(i.expense_id) === "pago";
        });
        itensCarregados.forEach(({ folhaId, itens }) => {
          const folha = data.find((f) => f.id === folhaId);
          if (!folha || folha.status !== "confirmada") return;
          const meus = itens.map((i) => statusById.get(i.expense_id || "")).filter(Boolean) as string[];
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

  const visiveis = useMemo(() => {
    if (filtro === "todas") return folhas;
    return folhas.filter((f) => {
      const s = situacoes[f.id] || "em_aberto";
      return filtro === "pagas" ? s === "paga" || s === "parcial" : s === "em_aberto" || s === "confirmada";
    });
  }, [folhas, situacoes, filtro]);

  const itensVisiveis = useMemo(
    () => visiveis.flatMap((folha) => (itensPorFolha[folha.id] || []).map((item) => ({ folha, item }))),
    [visiveis, itensPorFolha]
  );

  const totais = useMemo(
    () =>
      visiveis.reduce(
        (acc, f) => ({
          folhas: acc.folhas + 1,
          colaboradores: acc.colaboradores + (itensPorFolha[f.id] || []).length,
          base: acc.base + Number(f.total_base || 0),
          comissoes: acc.comissoes + Number(f.total_comissoes || 0),
          descontos: acc.descontos + Number(f.total_adiantamentos || 0) + Number(f.total_descontos || 0),
          liquido: acc.liquido + Number(f.total_liquido || 0),
        }),
        { folhas: 0, colaboradores: 0, base: 0, comissoes: 0, descontos: 0, liquido: 0 }
      ),
    [visiveis, itensPorFolha]
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
          colaborador_nome: item.colaborador_nome,
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

  const abrirPagamento = (folha: FolhaPagamento, itens: FolhaItem[], label: string) => {
    if (!folhaAccountId) {
      toast.error("Configure a conta de Folha em Configurações do RH.");
      return;
    }
    if (itens.length === 0) {
      toast.error("Nada a pagar.");
      return;
    }
    setPagData(folha.data_vencimento || getLocalDateISO());
    setPagForma("pix");
    setPagamento({ folha, itens, label });
  };

  const confirmarPagamento = async () => {
    if (!pagamento || !folhaAccountId) return;
    setActing(pagamento.folha.id);
    try {
      const r = await efetuarPagamentoFolha({
        folhaId: pagamento.folha.id,
        user_id: userId,
        folhaAccountId,
        data_pagamento: pagData,
        forma_pagamento: pagForma,
        itemIds: pagamento.itens.map((i) => i.id),
      });
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
      title: `Excluir folha de ${item.colaborador_nome}?`,
      description: "Somente este colaborador será removido da folha. Os lançamentos vinculados voltarão a ficar disponíveis para uma nova geração.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    setActing(item.id);
    try {
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

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando folhas do mês...
      </CardContent></Card>
    );
  }

  const filtros = [
    { v: "todas", label: "Todas", n: folhas.length },
    { v: "abertas", label: "Em aberto", n: folhas.filter((f) => ["em_aberto", "confirmada"].includes(situacoes[f.id] || "")).length },
    { v: "pagas", label: "Pagas", n: folhas.filter((f) => ["paga", "parcial"].includes(situacoes[f.id] || "")).length },
  ] as const;

  const editLiquido = Math.max(
    0,
    (Number(editForm.salario_base) || 0) + (Number(editForm.comissoes) || 0) -
    (Number(editForm.adiantamentos) || 0) - (Number(editForm.descontos) || 0)
  );

  return (
    <>
      <div className="space-y-3">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60">
          {filtros.map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setFiltro(opt.v)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-sm transition-colors",
                filtro === opt.v ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
              <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{opt.n}</Badge>
            </button>
          ))}
        </div>

        {/* Total consolidado das folhas exibidas */}
        {visiveis.length > 0 && (
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Bloco tom="neutral" titulo="Folhas" principal={`${totais.folhas} · ${totais.colaboradores} colab.`} />
              <Bloco tom="neutral" titulo="Base" principal={formatBRL(totais.base)} />
              <Bloco tom="positivo" titulo="Comissões" principal={formatBRL(totais.comissoes)} />
              <Bloco tom="negativo" titulo="Descontos" principal={formatBRL(totais.descontos)} />
              <Bloco tom="destaque" titulo="Total geral líquido" principal={formatBRL(totais.liquido)} />
            </CardContent>
          </Card>
        )}

        {itensVisiveis.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-y py-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <Checkbox
                checked={selecionados.size === itensVisiveis.length}
                onCheckedChange={() => setSelecionados(
                  selecionados.size === itensVisiveis.length ? new Set() : new Set(itensVisiveis.map(({ item }) => item.id))
                )}
              />
              Selecionar todas ({itensVisiveis.length})
            </label>
            <Button size="sm" className="h-8 gap-1.5" disabled={selecionados.size === 0 || acting === "recibos"} onClick={handleSelectedReceipts}>
              {acting === "recibos" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {selecionados.size > 1 ? `Gerar recibos (${selecionados.size})` : "Gerar recibo"}
            </Button>
          </div>
        )}

        {visiveis.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Nenhuma folha encontrada neste mês. Use <span className="font-medium">Gerar nova folha</span> para iniciar.
              </p>
              <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Recarregar
              </Button>
            </CardContent>
          </Card>
        ) : visiveis.map((f) => {
          const sit = situacoes[f.id] || "em_aberto";
          const ui = SITUACAO_UI[sit];
          const itens = itensPorFolha[f.id] || [];
          const pendentes = itens.filter((i) => !itemPago[i.id]);
          return (
          <Card key={f.id} className="overflow-hidden">
            {/* Cabeçalho */}
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Checkbox
                  checked={itens.length > 0 && itens.every((i) => selecionados.has(i.id))}
                  onCheckedChange={() => {
                    const ids = itens.map((i) => i.id);
                    setSelecionados((atual) => {
                      const proximo = new Set(atual);
                      ids.every((id) => proximo.has(id)) ? ids.forEach((id) => proximo.delete(id)) : ids.forEach((id) => proximo.add(id));
                      return proximo;
                    });
                  }}
                />
                <p className="text-sm font-semibold">Folha {f.mes_referencia}</p>
                <Badge variant="outline" className={cn("text-[10px]", ui.cls)}>{ui.label}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  Vence {new Date(`${f.data_vencimento}T12:00:00`).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {sit !== "paga" && sit !== "cancelada" && pendentes.length > 0 && (
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    disabled={acting === f.id || !folhaAccountId}
                    onClick={() => abrirPagamento(f, pendentes, `Folha ${f.mes_referencia} — ${pendentes.length} colaborador(es)`)}
                  >
                    {acting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                    Efetuar pagamento
                  </Button>
                )}
                {f.status === "em_aberto" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                    disabled={acting === f.id}
                    onClick={() => handleDelete(f)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {f.status === "confirmada" && sit === "confirmada" && (
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={acting === f.id} onClick={() => handleReopen(f)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                  </Button>
                )}
              </div>
            </div>

            {/* Blocos visuais separados: Base • Descontos • Comissões • Total */}
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Bloco tom="neutral" titulo="Base" principal={formatBRL(Number(f.total_base))} />
              <Bloco
                tom="negativo"
                titulo="Descontos"
                principal={formatBRL(Number(f.total_adiantamentos) + Number(f.total_descontos))}
                detalhes={[
                  { label: "Adiantamentos", value: formatBRL(Number(f.total_adiantamentos)) },
                  { label: "Outros descontos", value: formatBRL(Number(f.total_descontos)) },
                ]}
              />
              <Bloco tom="positivo" titulo="Comissões" principal={formatBRL(Number(f.total_comissoes))} />
              <Bloco tom="destaque" titulo="Total líquido" principal={formatBRL(Number(f.total_liquido))} />
            </CardContent>

            <div className="border-t divide-y">
              {itens.map((item) => (
                <div key={item.id} className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30">
                  <Checkbox checked={selecionados.has(item.id)} onCheckedChange={() => toggleItem(item.id)} />
                  <span className="min-w-0 flex-1 text-sm font-medium truncate">{item.colaborador_nome}</span>
                  {itemPago[item.id] && (
                    <Badge variant="outline" className="h-5 text-[9px] text-emerald-700 border-emerald-300 bg-emerald-50">Pago</Badge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatBRL(Number(item.liquido))}</span>
                  {f.status === "em_aberto" && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => abrirEdicao(f, item)}
                      title={`Editar valores de ${item.colaborador_nome}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {!itemPago[item.id] && sit !== "cancelada" && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-primary"
                      disabled={!folhaAccountId}
                      onClick={() => abrirPagamento(f, [item], item.colaborador_nome)}
                      title={`Efetuar pagamento de ${item.colaborador_nome}`}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    disabled={acting === `recibo-${item.id}`}
                    onClick={() => gerarRecibos([{ folha: f, item }], `recibo-${item.id}`)}
                    title="Gerar recibo"
                  >
                    {acting === `recibo-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  </Button>
                  {f.status === "em_aberto" && (
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      disabled={acting === item.id} onClick={() => handleDeleteItem(f, item)}
                      title={`Excluir folha de ${item.colaborador_nome}`}
                    >
                      {acting === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );})}
      </div>

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
              {pagamento?.label} — total {formatBRL((pagamento?.itens || []).reduce((s, i) => s + Number(i.liquido || 0), 0))}.
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
          <Button className="w-full" disabled={acting === pagamento?.folha.id} onClick={confirmarPagamento}>
            {acting === pagamento?.folha.id ? "Processando..." : "Efetuar pagamento"}
          </Button>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </>
  );
}

type Tom = "neutral" | "negativo" | "positivo" | "destaque";

function Bloco({
  tom,
  titulo,
  principal,
  detalhes,
}: {
  tom: Tom;
  titulo: string;
  principal: string;
  detalhes?: { label: string; value: string }[];
}) {
  const styles: Record<Tom, { wrap: string; title: string; value: string }> = {
    neutral: { wrap: "border-border bg-background", title: "text-muted-foreground", value: "text-foreground" },
    negativo: { wrap: "border-rose-200 bg-rose-50/60", title: "text-rose-700", value: "text-rose-700" },
    positivo: { wrap: "border-emerald-200 bg-emerald-50/60", title: "text-emerald-700", value: "text-emerald-700" },
    destaque: { wrap: "border-primary/40 bg-primary/5 ring-1 ring-primary/20", title: "text-primary", value: "text-primary font-bold" },
  };
  const s = styles[tom];
  return (
    <div className={`rounded-md border p-2.5 ${s.wrap}`}>
      <div className={`text-[9px] uppercase tracking-wide font-semibold ${s.title}`}>{titulo}</div>
      <div className={`text-sm tabular-nums mt-0.5 ${s.value}`}>{principal}</div>
      {detalhes && detalhes.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {detalhes.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="truncate">{d.label}</span>
              <span className="tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
