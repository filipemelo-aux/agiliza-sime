/**
 * GerarFolhaWizard — Assistente para gerar a Folha de Pagamento.
 *
 * 🎯 FLUXO PROFISSIONAL OBRIGATÓRIO
 *   ETAPA 1 — Criar nova folha como rascunho (status: em_aberto). NÃO gera financeiro.
 *   ETAPA 2 — Carregar automaticamente: salário base, adiantamentos, descontos, comissões.
 *   ETAPA 3 — ORDEM DE CÁLCULO (CRÍTICA, não alterar):
 *               Líquido = Base − Adiantamentos − Descontos + Comissões
 *   ETAPA 4 — Confirmar: gera as despesas em Contas a Pagar e muda status para "confirmada".
 *
 * Toda a lógica de cálculo vive em rhViewModel.computeLiquido (única fonte de verdade).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Percent,
  MinusCircle,
  PlayCircle,
  Loader2,
  FilePlus2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  type Expense,
} from "@/services/rh";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

type Step = 0 | 1 | 2 | 3 | 4;

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradores: ColaboradorRH[];
  expenses: Expense[];
  month: string;
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  salaryOverrides: Record<string, number>;
  payDay?: string;
  empresaId: string;
  userId: string;
  onGenerated: () => void;
}

const STEPS: { title: string; description: string; icon: typeof HandCoins }[] = [
  { title: "Iniciar", description: "Criar folha em aberto", icon: FilePlus2 },
  { title: "Adiantamentos", description: "− deduzidos do salário", icon: HandCoins },
  { title: "Descontos", description: "− INSS, faltas e outros", icon: MinusCircle },
  { title: "Comissões", description: "+ somadas no fim", icon: Percent },
  { title: "Confirmar", description: "Gerar Contas a Pagar", icon: PlayCircle },
];

export function GerarFolhaWizard({
  open,
  onClose,
  colaboradores,
  expenses,
  month,
  folhaAccountId,
  adiantamentoAccountId,
  salaryOverrides,
  payDay,
  empresaId,
  userId,
  onGenerated,
}: Props) {
  const [step, setStep] = useState<Step>(0);
  const [comissoesPend, setComissoesPend] = useState<Comissao[]>([]);
  const [descontosPend, setDescontosPend] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [draftFolhaId, setDraftFolhaId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDraftFolhaId(null);
  }, [open]);

  // Carrega comissões e descontos pendentes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const ids = colaboradores.filter((c) => c.ativo).map((c) => c.id);
      if (ids.length === 0) {
        setComissoesPend([]);
        setDescontosPend([]);
        return;
      }
      setLoadingData(true);
      try {
        const [com, desc] = await Promise.all([
          fetchComissoesPendentesForMonth(ids, month),
          fetchDescontosPendentesForMonth(ids, month),
        ]);
        if (!cancelled) {
          setComissoesPend(com);
          setDescontosPend(desc);
        }
      } catch {
        if (!cancelled) {
          setComissoesPend([]);
          setDescontosPend([]);
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, colaboradores, month]);

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
    [colaboradores, expenses, folhaAccountId, adiantamentoAccountId, salaryOverrides, comissoesPend, descontosPend]
  );

  const pendingRows = rows.filter((r) => !r.existing && r.liquido > 0);

  const totalAdiant = rows.reduce((s, r) => s + r.adiant, 0);
  const totalComissoes = rows.reduce((s, r) => s + r.comissoes, 0);
  const totalDescontos = rows.reduce((s, r) => s + r.descontos, 0);
  const totalBase = pendingRows.reduce((s, r) => s + r.salary, 0);
  const totalLiquido = pendingRows.reduce((s, r) => s + r.liquido, 0);

  const emissionDate = computeEmissionDate(month);
  const dueDate = computeDueDate(month, payDay);

  // ETAPA 1 — Criar folha em aberto
  const handleCreateDraft = async () => {
    if (pendingRows.length === 0) {
      toast.info("Nenhum colaborador elegível para esta folha.");
      return;
    }
    setCreatingDraft(true);
    try {
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
      setDraftFolhaId(folha.id);
      toast.success("Folha criada em aberto. Revise as etapas.");
      setStep(1);
      onGenerated();
    } catch (e: any) {
      toast.error("Falha ao criar folha: " + (e?.message || String(e)));
    } finally {
      setCreatingDraft(false);
    }
  };

  // ETAPA FINAL — Confirmar (gera financeiro)
  const handleConfirm = async () => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações.");
      return;
    }
    if (!draftFolhaId) {
      toast.error("Folha em aberto não encontrada.");
      return;
    }
    setConfirming(true);
    try {
      const { ok, fail, errors } = await confirmarFolha({
        folhaId: draftFolhaId,
        empresa_id: empresaId,
        user_id: userId,
        folhaAccountId,
      });
      if (fail === 0) {
        toast.success(`Folha confirmada — ${ok} pagamento(s) gerado(s).`);
      } else {
        toast.warning(`${ok} ok, ${fail} falha(s): ${errors[0] || ""}`);
      }
      onGenerated();
      onClose();
    } catch (e: any) {
      toast.error("Falha ao confirmar: " + (e?.message || String(e)));
    } finally {
      setConfirming(false);
    }
  };

  const next = () => setStep((s) => (Math.min(4, s + 1) as Step));
  const prev = () => setStep((s) => (Math.max(0, s - 1) as Step));

  const busy = creatingDraft || confirming;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Gerar folha — {month}</DialogTitle>
          <DialogDescription>
            Fluxo: criar em aberto → revisar adiantamentos / descontos / comissões → confirmar.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-5 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const active = step === idx;
              const done = step > idx;
              return (
                <div key={s.title} className="flex items-center flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      // Não deixa pular para frente sem ter criado o draft
                      if (idx > 0 && !draftFolhaId) return;
                      setStep(idx as Step);
                    }}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] font-medium transition-colors min-w-0",
                      active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "h-6 w-6 rounded-full inline-flex items-center justify-center shrink-0 border",
                        active && "bg-primary text-primary-foreground border-primary",
                        done && "bg-green-100 text-green-700 border-green-300",
                        !active && !done && "bg-background border-border"
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="truncate hidden sm:inline">{s.title}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={cn(
                        "flex-1 h-px mx-1 sm:mx-2",
                        step > idx ? "bg-green-300" : "bg-border"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          {loadingData ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando lançamentos...
            </div>
          ) : (
            <>
              {step === 0 && (
                <StartStep
                  count={pendingRows.length}
                  totalBase={totalBase}
                  totalAdiant={totalAdiant}
                  totalDescontos={totalDescontos}
                  totalComissoes={totalComissoes}
                  totalLiquido={totalLiquido}
                  draftCreated={!!draftFolhaId}
                  emission={emissionDate}
                  due={dueDate}
                />
              )}
              {step === 1 && (
                <StepList
                  title="Adiantamentos do mês"
                  emptyText="Nenhum adiantamento neste mês."
                  total={totalAdiant}
                  totalColor="text-amber-600"
                  totalLabel="Total a deduzir"
                  rows={rows
                    .filter((r) => r.adiant > 0)
                    .map((r) => ({
                      key: r.c.id,
                      name: r.c.full_name,
                      sub: r.c.tipo === "motorista" ? "Motorista" : r.c.cargo || "Colaborador",
                      value: r.adiant,
                      sign: "-" as const,
                    }))}
                  hint="Subtraídos do salário base ANTES dos descontos."
                />
              )}
              {step === 2 && (
                <StepList
                  title="Descontos do mês"
                  emptyText="Nenhum desconto neste mês."
                  total={totalDescontos}
                  totalColor="text-rose-600"
                  totalLabel="Total a deduzir"
                  rows={rows
                    .filter((r) => r.descontos > 0)
                    .map((r) => ({
                      key: r.c.id,
                      name: r.c.full_name,
                      sub: `${r.descontoIds.length} desconto(s)`,
                      value: r.descontos,
                      sign: "-" as const,
                    }))}
                  hint="Subtraídos APÓS os adiantamentos. INSS, IRRF, faltas, multas etc."
                />
              )}
              {step === 3 && (
                <StepList
                  title="Comissões do mês"
                  emptyText="Nenhuma comissão pendente."
                  total={totalComissoes}
                  totalColor="text-emerald-600"
                  totalLabel="Total a somar"
                  rows={rows
                    .filter((r) => r.comissoes > 0)
                    .map((r) => ({
                      key: r.c.id,
                      name: r.c.full_name,
                      sub: `${r.comissaoIds.length} comissão(ões)`,
                      value: r.comissoes,
                      sign: "+" as const,
                    }))}
                  hint="Somadas SOMENTE no fim, após adiantamentos e descontos. Nunca antes."
                />
              )}
              {step === 4 && (
                <ConfirmStep
                  rows={rows}
                  pendingRows={pendingRows}
                  totalLiquido={totalLiquido}
                  dueDate={dueDate}
                  hasFolhaAccount={!!folhaAccountId}
                />
              )}
            </>
          )}
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t bg-muted/20 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0 || busy} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Etapa {step + 1} de {STEPS.length}
            {draftFolhaId && (
              <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[9px]">em aberto</Badge>
            )}
          </div>
          {step === 0 ? (
            <Button
              size="sm"
              onClick={draftFolhaId ? next : handleCreateDraft}
              disabled={busy || pendingRows.length === 0}
              className="gap-1"
            >
              {creatingDraft ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
              ) : draftFolhaId ? (
                <>Próximo <ChevronRight className="h-4 w-4" /></>
              ) : (
                <><FilePlus2 className="h-4 w-4" /> Criar folha em aberto</>
              )}
            </Button>
          ) : step < 4 ? (
            <Button size="sm" onClick={next} className="gap-1">
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={busy || !folhaAccountId || !draftFolhaId}
              className="gap-1"
            >
              {confirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando...</>
              ) : (
                <><PlayCircle className="h-4 w-4" /> Confirmar e gerar pagamentos</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartStep({
  count,
  totalBase,
  totalAdiant,
  totalDescontos,
  totalComissoes,
  totalLiquido,
  draftCreated,
  emission,
  due,
}: {
  count: number;
  totalBase: number;
  totalAdiant: number;
  totalDescontos: number;
  totalComissoes: number;
  totalLiquido: number;
  draftCreated: boolean;
  emission: string;
  due: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Pré-visualização da folha</h3>
        <p className="text-[11px] text-muted-foreground">
          Os valores abaixo são um snapshot. A folha será criada como <span className="font-semibold">EM ABERTO</span> e
          <span className="font-semibold"> não gera financeiro</span> até a confirmação.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
          <Mini label="Colaboradores" value={String(count)} />
          <Mini label="Salário base" value={formatBRL(totalBase)} />
          <Mini label="− Adiantamentos" value={formatBRL(totalAdiant)} color="text-amber-600" />
          <Mini label="− Descontos" value={formatBRL(totalDescontos)} color="text-rose-600" />
          <Mini label="+ Comissões" value={formatBRL(totalComissoes)} color="text-emerald-600" />
          <Mini label="= Líquido" value={formatBRL(totalLiquido)} color="text-primary" strong />
        </div>
        <div className="text-[11px] text-muted-foreground pt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span>Emissão: <span className="font-semibold text-foreground">{new Date(emission).toLocaleDateString("pt-BR")}</span></span>
          <span>Vencimento: <span className="font-semibold text-foreground">{new Date(due).toLocaleDateString("pt-BR")}</span></span>
        </div>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-foreground">
        <p className="font-semibold mb-1">Ordem de cálculo (não alterar):</p>
        <code className="block text-[11px] font-mono bg-background/60 p-2 rounded border">
          Líquido = Salário base − Adiantamentos − Descontos + Comissões
        </code>
      </div>

      {draftCreated && (
        <div className="rounded-md border border-green-300 bg-green-50 text-green-800 p-2.5 text-xs">
          ✓ Folha em aberto criada. Avance para revisar adiantamentos, descontos e comissões antes de confirmar.
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="bg-background rounded border border-border p-2">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={cn("text-sm tabular-nums", color || "text-foreground", strong && "font-bold")}>{value}</div>
    </div>
  );
}

function StepList({
  title,
  rows,
  total,
  totalLabel,
  totalColor,
  emptyText,
  hint,
}: {
  title: string;
  rows: { key: string; name: string; sub: string; value: number; sign: "+" | "-" }[];
  total: number;
  totalLabel: string;
  totalColor: string;
  emptyText: string;
  hint?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">{totalLabel}</div>
          <div className={cn("text-sm font-bold tabular-nums", totalColor)}>
            {formatBRL(total)}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
          {emptyText}
        </p>
      ) : (
        <div className="rounded-md border border-border divide-y divide-border">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{r.sub}</p>
              </div>
              <div className={cn("text-sm font-semibold tabular-nums shrink-0", totalColor)}>
                {r.sign} {formatBRL(r.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {hint && (
        <p className="text-[11px] text-muted-foreground border-l-2 border-primary/30 pl-2">
          {hint}
        </p>
      )}
    </div>
  );
}

function ConfirmStep({
  rows,
  pendingRows,
  totalLiquido,
  dueDate,
  hasFolhaAccount,
}: {
  rows: ReturnType<typeof computePayrollRows>;
  pendingRows: ReturnType<typeof computePayrollRows>;
  totalLiquido: number;
  dueDate: string;
  hasFolhaAccount: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Resumo final</h3>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Total líquido a gerar</div>
          <div className="text-base font-bold text-primary tabular-nums">{formatBRL(totalLiquido)}</div>
        </div>
      </div>

      {!hasFolhaAccount && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          Configure a conta "Salários" em Configurações para habilitar a confirmação.
        </div>
      )}

      <div className="text-[11px] text-muted-foreground">
        Vencimento padrão:{" "}
        <span className="font-semibold text-foreground">
          {new Date(dueDate).toLocaleDateString("pt-BR")}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-md">
          Nenhum colaborador ativo.
        </p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Colaborador</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2 text-amber-600">− Adiant.</th>
                <th className="text-right px-3 py-2 text-rose-600">− Desc.</th>
                <th className="text-right px-3 py-2 text-emerald-600">+ Com.</th>
                <th className="text-right px-3 py-2">= Líquido</th>
                <th className="text-right px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.c.id}>
                  <td className="px-3 py-1.5">
                    <div className="font-medium truncate">{r.c.full_name}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(r.salary)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">
                    {r.adiant > 0 ? formatBRL(r.adiant) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                    {r.descontos > 0 ? formatBRL(r.descontos) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                    {r.comissoes > 0 ? formatBRL(r.comissoes) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {formatBRL(r.liquido)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.existing ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[9px]">
                        Já gerada
                      </Badge>
                    ) : r.liquido <= 0 ? (
                      <Badge variant="outline" className="text-[9px]">
                        Sem líquido
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] text-primary border-primary/40">
                        Pendente
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Confirmar irá criar <span className="font-medium">{pendingRows.length}</span> despesa(s) em{" "}
        <span className="font-medium">Contas a Pagar</span> (categoria "Salários") e marcar a folha como
        <span className="font-semibold text-foreground"> confirmada</span>.
      </p>
    </div>
  );
}
