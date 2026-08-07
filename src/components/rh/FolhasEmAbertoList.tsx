/**
 * FolhasDoMes — Lista todas as folhas de pagamento do mês selecionado,
 * indicando a situação (em aberto, confirmada, paga parcialmente, paga).
 *
 * Permite:
 *   - Filtrar por situação
 *   - Ver itens de uma folha (drawer/sheet)
 *   - Baixar/imprimir a folha no formato padrão (resumo + recibo por colaborador)
 *   - Confirmar (gera as despesas em Contas a Pagar) — só para folhas em aberto
 *   - Excluir folha em aberto (sem efeito financeiro)
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, FileCheck2, Trash2, Eye, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarFolhas,
  buscarFolhaComItens,
  confirmarFolha,
  excluirFolhaEmAberto,
  type FolhaPagamento,
  type FolhaItem,
} from "@/services/rh";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { imprimirFolhaPagamento } from "@/lib/folhaPagamentoPrint";
import { cn } from "@/lib/utils";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

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

export function FolhasEmAbertoList({ month, empresaId, userId, folhaAccountId, onChanged }: Props) {
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [situacoes, setSituacoes] = useState<Record<string, Situacao>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "abertas" | "pagas">("todas");
  const [viewing, setViewing] = useState<FolhaPagamento | null>(null);
  const [viewItems, setViewItems] = useState<FolhaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      // A folha pode ter competência (mes_referencia) diferente do mês de
      // pagamento (ex.: competência 07/2026 paga em 08/2026). Mostramos ambas.
      const all = await listarFolhas();
      const data = all.filter(
        (f) =>
          f.mes_referencia === month ||
          (f.data_vencimento || "").startsWith(month) ||
          (f.data_inicio || "").startsWith(month)
      );
      setFolhas(data);

      // Situação de pagamento das folhas confirmadas, via despesas geradas
      const confirmadas = data.filter((f) => f.status === "confirmada").map((f) => f.id);
      const map: Record<string, Situacao> = {};
      data.forEach((f) => {
        map[f.id] = f.status === "cancelada" ? "cancelada" : f.status === "em_aberto" ? "em_aberto" : "confirmada";
      });

      if (confirmadas.length > 0) {
        const { data: itens } = await (supabase.from("folhas_pagamento_itens" as any) as any)
          .select("folha_id, expense_id")
          .in("folha_id", confirmadas);
        const expIds = ((itens as any[]) || []).map((i) => i.expense_id).filter(Boolean);
        if (expIds.length > 0) {
          const { data: exps } = await supabase.from("expenses").select("id, status").in("id", expIds);
          const statusById = new Map(((exps as any[]) || []).map((e) => [e.id, e.status]));
          confirmadas.forEach((fid) => {
            const meus = ((itens as any[]) || [])
              .filter((i) => i.folha_id === fid && i.expense_id)
              .map((i) => statusById.get(i.expense_id))
              .filter(Boolean) as string[];
            if (meus.length === 0) return;
            const pagos = meus.filter((s) => s === "pago").length;
            const parciais = meus.filter((s) => s === "parcial").length;
            map[fid] = pagos === meus.length ? "paga" : pagos > 0 || parciais > 0 ? "parcial" : "confirmada";
          });
        }
      }
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

  const openItems = async (f: FolhaPagamento) => {
    setViewing(f);
    setLoadingItems(true);
    try {
      const { itens } = await buscarFolhaComItens(f.id);
      setViewItems(itens);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleDownload = async (f: FolhaPagamento) => {
    setActing(f.id);
    try {
      const { folha, itens } = await buscarFolhaComItens(f.id);
      if (itens.length === 0) {
        toast.error("Esta folha não possui itens para gerar o recibo.");
        return;
      }
      // Dados cadastrais dos colaboradores para o padrão contábil
      const ids = Array.from(new Set(itens.map((i) => i.colaborador_id).filter(Boolean)));
      const perfis: Record<string, any> = {};
      if (ids.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, cnpj, cargo, departamento, data_admissao, tipo_colaborador_rh")
          .in("id", ids);
        (data || []).forEach((p: any) => { perfis[p.id] = p; });
      }
      imprimirFolhaPagamento(
        {
          mes_referencia: folha.mes_referencia,
          data_inicio: folha.data_inicio,
          data_fim: folha.data_fim,
          data_vencimento: folha.data_vencimento,
          status: folha.status,
          total_base: Number(folha.total_base),
          total_comissoes: Number(folha.total_comissoes),
          total_adiantamentos: Number(folha.total_adiantamentos),
          total_descontos: Number(folha.total_descontos),
          total_liquido: Number(folha.total_liquido),
        },
        itens.map((i) => {
          const p = perfis[i.colaborador_id] || {};
          return {
            colaborador_nome: i.colaborador_nome,
            salario_base: Number(i.salario_base),
            comissoes: Number(i.comissoes),
            adiantamentos: Number(i.adiantamentos),
            descontos: Number(i.descontos),
            liquido: Number(i.liquido),
            codigo: String(i.colaborador_id || "").slice(0, 8).toUpperCase(),
            cpf: p.cnpj || null,
            funcao: p.cargo || (p.tipo_colaborador_rh === "motorista" ? "Motorista" : null),
            departamento: p.departamento || null,
            admissao: p.data_admissao || null,
            regime: "clt",
          };
        })
      );
    } catch (e: any) {
      toast.error("Falha ao gerar documento: " + e.message);
    } finally {
      setActing(null);
    }
  };


  const handleConfirm = async (f: FolhaPagamento) => {
    const ok = await confirm({
      title: "Confirmar folha?",
      description: `A folha de ${formatBRL(Number(f.total_liquido))} será fechada e não poderá ser alterada. Comissões e descontos vinculados serão marcados.`,
      confirmLabel: "Confirmar",
    });
    if (!ok) return;
    if (!folhaAccountId) {
      toast.error("Configure a conta de Folha em Configurações do RH.");
      return;
    }
    setActing(f.id);
    try {
      const r = await confirmarFolha({ folhaId: f.id, user_id: userId, folhaAccountId });
      if (r.fail === 0) toast.success("Folha confirmada.");
      else toast.warning(`${r.ok} ok, ${r.fail} falha(s)`);
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
          return (
          <Card key={f.id} className="overflow-hidden">
            {/* Cabeçalho */}
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">Folha {f.mes_referencia}</p>
                <Badge variant="outline" className={cn("text-[10px]", ui.cls)}>{ui.label}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  Vence {new Date(`${f.data_vencimento}T12:00:00`).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => openItems(f)}>
                  <Eye className="h-3.5 w-3.5" /> Ver itens
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={acting === f.id}
                  onClick={() => handleDownload(f)}
                  title="Baixar folha em formato padrão (resumo + recibos)"
                >
                  {acting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Baixar
                </Button>
                {f.status === "em_aberto" && (
                  <>
                    <Button
                      size="sm"
                      className="h-8 gap-1"
                      disabled={acting === f.id || !folhaAccountId}
                      onClick={() => handleConfirm(f)}
                    >
                      {acting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                      Confirmar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      disabled={acting === f.id}
                      onClick={() => handleDelete(f)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Blocos visuais separados: Base • Descontos • Comissões • Total */}
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Bloco
                tom="neutral"
                titulo="Base"
                principal={formatBRL(Number(f.total_base))}
              />
              <Bloco
                tom="negativo"
                titulo="Descontos"
                principal={formatBRL(Number(f.total_adiantamentos) + Number(f.total_descontos))}
                detalhes={[
                  { label: "Adiantamentos", value: formatBRL(Number(f.total_adiantamentos)) },
                  { label: "Outros descontos", value: formatBRL(Number(f.total_descontos)) },
                ]}
              />
              <Bloco
                tom="positivo"
                titulo="Comissões"
                principal={formatBRL(Number(f.total_comissoes))}
              />
              <Bloco
                tom="destaque"
                titulo="Total líquido"
                principal={formatBRL(Number(f.total_liquido))}
              />
            </CardContent>
          </Card>
        );})}
      </div>

      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Folha {viewing?.mes_referencia}</SheetTitle>
            <SheetDescription>
              Itens snapshot da folha. Use "Baixar" para gerar o recibo padrão de cada colaborador.
            </SheetDescription>
          </SheetHeader>

          {loadingItems ? (
            <div className="py-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {viewItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem itens.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {viewItems.map((i) => (
                    <Card key={i.id}>
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-sm font-semibold truncate">{i.colaborador_nome}</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Base: </span>
                            <span className="tabular-nums font-medium">{formatBRL(Number(i.salario_base))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">−A: </span>
                            <span className="tabular-nums text-amber-600">{formatBRL(Number(i.adiantamentos))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">−D: </span>
                            <span className="tabular-nums text-rose-600">{formatBRL(Number(i.descontos))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">+C: </span>
                            <span className="tabular-nums text-emerald-600">{formatBRL(Number(i.comissoes))}</span>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-border flex items-center justify-between">
                          <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Líquido</span>
                          <span className="text-sm font-bold text-primary tabular-nums">
                            {formatBRL(Number(i.liquido))}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

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
    neutral: {
      wrap: "border-border bg-background",
      title: "text-muted-foreground",
      value: "text-foreground",
    },
    negativo: {
      wrap: "border-rose-200 bg-rose-50/60",
      title: "text-rose-700",
      value: "text-rose-700",
    },
    positivo: {
      wrap: "border-emerald-200 bg-emerald-50/60",
      title: "text-emerald-700",
      value: "text-emerald-700",
    },
    destaque: {
      wrap: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
      title: "text-primary",
      value: "text-primary font-bold",
    },
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
