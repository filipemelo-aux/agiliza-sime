/**
 * FolhaPreviaTab — ETAPA 4 do fluxo de Folha de Pagamento.
 *
 * Tela de revisão (PRÉVIA) que consolida, antes de gerar o financeiro:
 *   • Por colaborador: Salário base, (−) Adiantamentos, (−) Descontos, (+) Comissões, (=) Líquido
 *   • Totais gerais: Salários, Adiantamentos, Descontos, Comissões, Líquido
 *
 * Ações:
 *   • Confirmar folha → cria draft "em_aberto" + confirma (gera Contas a Pagar)
 *   • Voltar / editar → apenas reseta a tela / leva ao wizard com salários
 *
 * IMPORTANTE: a fórmula vive em rhViewModel.computeLiquido (não duplicar):
 *   Líquido = Base − Adiantamentos − Descontos + Comissões
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileCheck2, RefreshCw, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  computeDueDate,
  computeEmissionDate,
  computePayrollRows,
  criarFolhaEmAberto,
  confirmarFolha,
  fetchComissoesPendentesForMonth,
  fetchDescontosPendentesForMonth,
  type ColaboradorRH,
  type Comissao,
  type DescontoFolha,
  type Expense,
} from "@/services/rh";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

interface Props {
  colaboradores: ColaboradorRH[];
  expenses: Expense[];
  month: string;
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  salaryOverrides: Record<string, number>;
  payDay?: string;
  empresaId?: string;
  userId?: string;
  onConfirmed: () => void;
  onBack?: () => void;
}

export function FolhaPreviaTab({
  colaboradores,
  expenses,
  month,
  folhaAccountId,
  adiantamentoAccountId,
  salaryOverrides,
  payDay,
  empresaId,
  userId,
  onConfirmed,
  onBack,
}: Props) {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [comissoesPend, setComissoesPend] = useState<Comissao[]>([]);
  const [descontosPend, setDescontosPend] = useState<DescontoFolha[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reloadPendentes = async () => {
    const ids = colaboradores.filter((c) => c.ativo).map((c) => c.id);
    if (ids.length === 0) {
      setComissoesPend([]);
      setDescontosPend([]);
      return;
    }
    setLoading(true);
    try {
      const [com, desc] = await Promise.all([
        fetchComissoesPendentesForMonth(ids, month),
        fetchDescontosPendentesForMonth(ids, month),
      ]);
      setComissoesPend(com);
      setDescontosPend(desc);
    } catch (e: any) {
      toast.error("Erro ao carregar pendências: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadPendentes();
    // eslint-disable-next-line
  }, [colaboradores, month]);

  const rows = useMemo(
    () =>
      computePayrollRows(
        colaboradores,
        expenses,
        folhaAccountId,
        adiantamentoAccountId,
        salaryOverrides,
        comissoesPend,
        descontosPend
      ),
    [
      colaboradores,
      expenses,
      folhaAccountId,
      adiantamentoAccountId,
      salaryOverrides,
      comissoesPend,
      descontosPend,
    ]
  );

  const pendingRows = rows.filter((r) => !r.existing && r.liquido > 0);

  const totals = pendingRows.reduce(
    (acc, r) => ({
      base: acc.base + r.salary,
      adiant: acc.adiant + r.adiant,
      desc: acc.desc + r.descontos,
      com: acc.com + r.comissoes,
      liq: acc.liq + r.liquido,
    }),
    { base: 0, adiant: 0, desc: 0, com: 0, liq: 0 }
  );

  const emissionDate = computeEmissionDate(month);
  const dueDate = computeDueDate(month, payDay);

  const handleConfirm = async () => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações.");
      return;
    }
    if (!empresaId || !userId) {
      toast.error("Empresa/Usuário não disponível.");
      return;
    }
    if (pendingRows.length === 0) {
      toast.info("Nenhum colaborador elegível.");
      return;
    }
    const ok = await confirm({
      title: "Confirmar folha?",
      description: `Serão geradas ${pendingRows.length} despesa(s) em Contas a Pagar totalizando ${formatBRL(totals.liq)}. Comissões serão marcadas como enviadas e descontos vinculados.`,
      confirmLabel: "Confirmar e gerar",
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      // ETAPA 1 — cria folha em aberto (snapshot)
      const { folha } = await criarFolhaEmAberto({
        empresa_id: empresaId,
        created_by: userId,
        mes_referencia: month,
        data_emissao: emissionDate,
        data_vencimento: dueDate,
        itens: pendingRows.map((r) => ({
          colaborador_id: r.c.id,
          colaborador_nome: r.c.full_name,
          salario_base: r.salary,
          adiantamentos: r.adiant,
          descontos: r.descontos,
          comissoes: r.comissoes,
          liquido: r.liquido,
          comissao_ids: r.comissaoIds || [],
          desconto_ids: r.descontoIds || [],
        })),
      });
      // ETAPA 5 — confirma (gera Contas a Pagar + vincula comissões/descontos)
      const r = await confirmarFolha({
        folhaId: folha.id,
        empresa_id: empresaId,
        user_id: userId,
        folhaAccountId,
      });
      if (r.fail === 0) {
        toast.success(`Folha confirmada — ${r.ok} pagamento(s) gerado(s).`);
      } else {
        toast.warning(`${r.ok} ok, ${r.fail} falha(s): ${r.errors[0] || ""}`);
      }
      onConfirmed();
      await reloadPendentes();
    } catch (e: any) {
      toast.error("Falha ao confirmar: " + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Header + ações */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Prévia da folha — {month}</h2>
              <Badge variant="outline" className="text-[10px] text-primary border-primary/40">revisão</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Confira por colaborador antes de gerar o financeiro. Emissão{" "}
              <strong>{new Date(emissionDate).toLocaleDateString("pt-BR")}</strong> · Vencimento{" "}
              <strong>{new Date(dueDate).toLocaleDateString("pt-BR")}</strong>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {onBack && (
              <Button variant="outline" size="sm" className="gap-1" onClick={onBack} disabled={submitting}>
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={reloadPendentes}
              disabled={loading || submitting}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={handleConfirm}
              disabled={submitting || loading || pendingRows.length === 0 || !folhaAccountId}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
              Confirmar folha
            </Button>
          </div>
        </CardContent>
      </Card>

      {!folhaAccountId && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Configure a conta "Salários" em Configurações para habilitar a confirmação.
        </div>
      )}

      {/* Totais gerais */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-3">
            Totais gerais
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Total label="Salários" value={formatBRL(totals.base)} />
            <Total label="− Adiantamentos" value={formatBRL(totals.adiant)} color="text-amber-600" />
            <Total label="− Descontos" value={formatBRL(totals.desc)} color="text-rose-600" />
            <Total label="+ Comissões" value={formatBRL(totals.com)} color="text-emerald-600" />
            <Total label="= Líquido" value={formatBRL(totals.liq)} color="text-primary" strong />
          </div>
        </CardContent>
      </Card>

      {/* Cards responsivos por colaborador */}
      {loading ? (
        <Card>
          <CardContent className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando lançamentos...
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum colaborador ativo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => (
            <Card key={r.c.id} className="overflow-hidden">
              <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.c.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {r.c.tipo === "motorista" ? "Motorista" : r.c.cargo || "Colaborador"}
                  </p>
                </div>
                {r.existing ? (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[9px] shrink-0">
                    Já gerada
                  </Badge>
                ) : r.liquido <= 0 ? (
                  <Badge variant="outline" className="text-[9px] shrink-0">Sem líquido</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] text-primary border-primary/40 shrink-0">
                    Pendente
                  </Badge>
                )}
              </div>
              <CardContent className="p-3 grid grid-cols-2 gap-2">
                <Linha label="Salário base" value={formatBRL(r.salary)} />
                <Linha
                  label="− Adiantamentos"
                  value={r.adiant > 0 ? formatBRL(r.adiant) : "—"}
                  color="text-amber-600"
                />
                <Linha
                  label="− Descontos"
                  value={r.descontos > 0 ? formatBRL(r.descontos) : "—"}
                  color="text-rose-600"
                />
                <Linha
                  label="+ Comissões"
                  value={r.comissoes > 0 ? formatBRL(r.comissoes) : "—"}
                  color="text-emerald-600"
                />
                <div className="col-span-2 mt-1 pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    = Líquido
                  </span>
                  <span className="text-base font-bold text-primary tabular-nums">
                    {formatBRL(r.liquido)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-foreground">
        <p className="font-semibold mb-1">Ordem de cálculo (não alterar):</p>
        <code className="block text-[11px] font-mono bg-background/60 p-2 rounded border">
          Líquido = Salário base − Adiantamentos − Descontos + Comissões
        </code>
      </div>

      {ConfirmDialog}
    </div>
  );
}

function Total({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-sm tabular-nums ${color || "text-foreground"} ${strong ? "font-bold" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Linha({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={`text-xs font-medium tabular-nums truncate ${color || "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
