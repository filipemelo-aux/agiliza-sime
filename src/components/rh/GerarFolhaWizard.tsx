/**
 * GerarFolhaWizard — Modal multi-etapas para revisar e gerar a folha do mês.
 *
 * Fluxo (somente revisão dos lançamentos já existentes — NÃO duplica regras):
 *   1. Adiantamentos pendentes do mês (somados ao líquido como dedução).
 *   2. Comissões pendentes do mês (somadas ao líquido).
 *   3. Descontos pendentes do mês (deduzidos do líquido).
 *   4. Confirmação: tabela de líquidos por colaborador + botão "Gerar todas".
 *
 * Os cálculos vêm de `computePayrollRows` (única fonte de verdade) e a criação
 * delega para `createPayrollExpense` — exatamente como o fluxo individual.
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
import { Check, ChevronLeft, ChevronRight, HandCoins, Percent, MinusCircle, PlayCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  computeDueDate,
  computeEmissionDate,
  computePayrollRows,
  createPayrollExpense,
  fetchComissoesPendentesForMonth,
  fetchDescontosPendentesForMonth,
  type ColaboradorRH,
  type Comissao,
  type Expense,
} from "@/services/rh";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

type Step = 0 | 1 | 2 | 3;

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
  { title: "Adiantamentos", description: "Vales descontados do líquido", icon: HandCoins },
  { title: "Comissões", description: "Pendentes somadas ao salário", icon: Percent },
  { title: "Descontos", description: "INSS, faltas e outros", icon: MinusCircle },
  { title: "Confirmação", description: "Gerar pagamentos", icon: PlayCircle },
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
  const [generating, setGenerating] = useState(false);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setStep(0);
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
  const totalLiquido = pendingRows.reduce((s, r) => s + r.liquido, 0);

  const emissionDate = computeEmissionDate(month);
  const dueDate = computeDueDate(month, payDay);

  const handleGenerateAll = async () => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações antes de gerar a folha.");
      return;
    }
    if (pendingRows.length === 0) {
      toast.info("Nenhuma folha pendente para gerar.");
      return;
    }
    setGenerating(true);
    let ok = 0;
    let fail = 0;
    for (const r of pendingRows) {
      const { error } = await createPayrollExpense({
        empresa_id: empresaId,
        created_by: userId,
        colaboradorId: r.c.id,
        colaboradorNome: r.c.full_name,
        month,
        liquido: r.liquido,
        salarioBase: r.salary,
        adiantamentos: r.adiant,
        comissoes: r.comissoes,
        comissaoIds: r.comissaoIds,
        descontos: r.descontos,
        descontoIds: r.descontoIds,
        emissionDate,
        dueDate,
        folhaAccountId,
      });
      if (error) fail++;
      else ok++;
    }
    setGenerating(false);
    if (fail === 0) {
      toast.success(`${ok} folha(s) gerada(s) com sucesso`);
    } else {
      toast.warning(`${ok} gerada(s), ${fail} falha(s)`);
    }
    onGenerated();
    onClose();
  };

  const next = () => setStep((s) => (Math.min(3, s + 1) as Step));
  const prev = () => setStep((s) => (Math.max(0, s - 1) as Step));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !generating && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Gerar folha — {month}</DialogTitle>
          <DialogDescription>
            Revise os lançamentos do mês antes de gerar os pagamentos em Contas a Pagar.
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
                    onClick={() => setStep(idx as Step)}
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
                <StepList
                  title="Adiantamentos pendentes do mês"
                  emptyText="Nenhum adiantamento pendente neste mês."
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
                  hint="Adiantamentos lançados em Contas a Pagar (categoria configurada) são automaticamente descontados."
                />
              )}
              {step === 1 && (
                <StepList
                  title="Comissões pendentes do mês"
                  emptyText="Nenhuma comissão pendente neste mês."
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
                  hint="Comissões com status 'pendente' geradas em Lançamentos > Comissões serão marcadas como 'enviadas para folha'."
                />
              )}
              {step === 2 && (
                <StepList
                  title="Descontos pendentes do mês"
                  emptyText="Nenhum desconto pendente neste mês."
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
                  hint="Inclui INSS, IRRF, faltas, multas e outros lançamentos manuais ainda não vinculados a uma folha."
                />
              )}
              {step === 3 && (
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
          <Button variant="ghost" size="sm" onClick={prev} disabled={step === 0 || generating} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Etapa {step + 1} de {STEPS.length}
          </div>
          {step < 3 ? (
            <Button size="sm" onClick={next} className="gap-1">
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerateAll}
              disabled={generating || pendingRows.length === 0 || !folhaAccountId}
              className="gap-1"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Gerando...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" /> Gerar {pendingRows.length} folha(s)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <h3 className="text-sm font-semibold text-foreground">Resumo da folha</h3>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Total líquido a gerar</div>
          <div className="text-base font-bold text-primary tabular-nums">{formatBRL(totalLiquido)}</div>
        </div>
      </div>

      {!hasFolhaAccount && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
          Configure a conta "Salários" em Configurações para habilitar a geração.
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
                <th className="text-right px-3 py-2 text-emerald-600">Com.</th>
                <th className="text-right px-3 py-2 text-amber-600">Adiant.</th>
                <th className="text-right px-3 py-2 text-rose-600">Desc.</th>
                <th className="text-right px-3 py-2">Líquido</th>
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
                  <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                    {r.comissoes > 0 ? formatBRL(r.comissoes) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-amber-600">
                    {r.adiant > 0 ? formatBRL(r.adiant) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                    {r.descontos > 0 ? formatBRL(r.descontos) : "—"}
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
        Será criada <span className="font-medium">{pendingRows.length}</span> despesa(s) em{" "}
        <span className="font-medium">Contas a Pagar</span> na categoria "Salários". A quitação segue
        o fluxo financeiro existente.
      </p>
    </div>
  );
}
