/**
 * GerarFolhaWizard — Assistente quinzenal de Folha de Pagamento.
 *
 * 🔁 NOVO FLUXO PROFISSIONAL
 *   ETAPA 1 — Selecionar PERÍODO (1ª/2ª quinzena ou personalizado).
 *             Preset quinzenal:
 *               • 1ª quinzena: 01–15  → pagamento dia 20
 *               • 2ª quinzena: 16–fim → pagamento dia 05 do mês seguinte
 *   ETAPA 2 — Listar despesas existentes em Contas a Pagar dentro do período:
 *               • Salários (categoria configurada) por data_emissao
 *               • Adiantamentos PAGOS por data_pagamento
 *             + comissões e descontos pendentes do período.
 *             Tudo selecionável manualmente.
 *   ETAPA 3 — PRÉVIA consolidada por colaborador.
 *               Líquido = Salários − Adiantamentos − Descontos + Comissões
 *   ETAPA 4 — Confirmar: cria a folha em aberto + marca como confirmada.
 *             NÃO gera novas despesas (já existem em Contas a Pagar).
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check, ChevronLeft, ChevronRight, CalendarRange,
  ListChecks, Eye, FileCheck2, Loader2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  buildPeriodoQuinzenal,
  computePayrollRowsFromPeriodo,
  periodoToMesReferencia,
  criarFolhaEmAberto,
  confirmarFolha,
  fetchSalariosNoPeriodo,
  fetchSalariosDoMes,
  fetchAdiantamentosPagosNoPeriodo,
  fetchComissoesPendentesNoPeriodo,
  fetchDescontosPendentesNoPeriodo,
  type ColaboradorRH,
  type Comissao,
  type DescontoFolha,
  type Expense,
  type PeriodoFolha,
  type TipoPeriodo,
} from "@/services/rh";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
};

type Step = 0 | 1 | 2 | 3;

interface Props {
  open: boolean;
  onClose: () => void;
  colaboradores: ColaboradorRH[];
  month: string;
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  empresaId: string;
  userId: string;
  onGenerated: () => void;
}

const STEPS: { title: string; description: string; icon: typeof CalendarRange }[] = [
  { title: "Período", description: "Datas da folha", icon: CalendarRange },
  { title: "Despesas", description: "Selecione lançamentos", icon: ListChecks },
  { title: "Prévia", description: "Conferência final", icon: Eye },
  { title: "Confirmar", description: "Fechar a folha", icon: FileCheck2 },
];

export function GerarFolhaWizard({
  open, onClose, colaboradores, month,
  folhaAccountId, adiantamentoAccountId,
  empresaId, userId, onGenerated,
}: Props) {
  const [step, setStep] = useState<Step>(0);

  // Período
  const [periodo, setPeriodo] = useState<PeriodoFolha>(() =>
    buildPeriodoQuinzenal(month, "primeira_quinzena")
  );

  // Dados do período
  const [salarios, setSalarios] = useState<Expense[]>([]);
  const [salariosMes, setSalariosMes] = useState<Expense[]>([]);
  const [adiantamentos, setAdiantamentos] = useState<Expense[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [descontos, setDescontos] = useState<DescontoFolha[]>([]);

  // Seleção
  const [selSalarios, setSelSalarios] = useState<Set<string>>(new Set());
  const [selAdiant, setSelAdiant] = useState<Set<string>>(new Set());
  const [selComissoes, setSelComissoes] = useState<Set<string>>(new Set());
  const [selDescontos, setSelDescontos] = useState<Set<string>>(new Set());

  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPeriodo(buildPeriodoQuinzenal(month, "primeira_quinzena"));
  }, [open, month]);

  const colabIds = useMemo(
    () => colaboradores.filter((c) => c.ativo).map((c) => c.id),
    [colaboradores]
  );

  // Carrega dados quando entra na etapa 1 (despesas)
  const loadPeriodData = async () => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações.");
      return false;
    }
    setLoadingData(true);
    try {
      const mesRef = periodoToMesReferencia(periodo);
      const [sal, salMes, adv, com, desc] = await Promise.all([
        fetchSalariosNoPeriodo(colabIds, folhaAccountId, periodo.data_inicio, periodo.data_fim),
        fetchSalariosDoMes(colabIds, folhaAccountId, mesRef),
        adiantamentoAccountId
          ? fetchAdiantamentosPagosNoPeriodo(colabIds, adiantamentoAccountId, periodo.data_inicio, periodo.data_fim)
          : Promise.resolve([]),
        fetchComissoesPendentesNoPeriodo(colabIds, periodo.data_inicio, periodo.data_fim),
        fetchDescontosPendentesNoPeriodo(colabIds, periodo.data_inicio, periodo.data_fim),
      ]);
      setSalarios(sal);
      setSalariosMes(salMes);
      setAdiantamentos(adv);
      setComissoes(com);
      setDescontos(desc);
      // 🔒 Prompt 5: usuário deve ter CONTROLE TOTAL — nada vem pré-marcado.
      setSelSalarios(new Set());
      setSelAdiant(new Set());
      setSelComissoes(new Set());
      setSelDescontos(new Set());
      return true;
    } catch (e: any) {
      toast.error("Erro ao carregar dados: " + (e?.message || e));
      return false;
    } finally {
      setLoadingData(false);
    }
  };

  const rows = useMemo(
    () =>
      computePayrollRowsFromPeriodo({
        colaboradores,
        salarios,
        adiantamentos,
        comissoes,
        descontos,
        selectedSalarioIds: selSalarios,
        selectedAdiantamentoIds: selAdiant,
        selectedComissaoIds: selComissoes,
        selectedDescontoIds: selDescontos,
        salariosDoMes: salariosMes,
      }),
    [colaboradores, salarios, salariosMes, adiantamentos, comissoes, descontos, selSalarios, selAdiant, selComissoes, selDescontos]
  );

  const totals = rows.reduce(
    (acc, r) => ({
      base: acc.base + r.salario_base,
      adv: acc.adv + r.adiantamentos,
      desc: acc.desc + r.descontos,
      com: acc.com + r.comissoes,
      comp: acc.comp + r.complemento,
      liq: acc.liq + r.liquido,
    }),
    { base: 0, adv: 0, desc: 0, com: 0, comp: 0, liq: 0 }
  );

  const colabName = (id: string) =>
    colaboradores.find((c) => c.id === id)?.full_name || "—";

  // ============ Ações ============
  const handleNext = async () => {
    if (step === 0) {
      const ok = await loadPeriodData();
      if (ok) setStep(1);
      return;
    }
    if (step < 3) setStep((s) => (s + 1) as Step);
  };

  const handleConfirm = async () => {
    if (rows.length === 0) {
      toast.info("Nenhum colaborador com lançamentos selecionados.");
      return;
    }
    setSubmitting(true);
    try {
      const { folha } = await criarFolhaEmAberto({
        empresa_id: empresaId,
        created_by: userId,
        mes_referencia: periodoToMesReferencia(periodo),
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
        tipo_periodo: periodo.tipo,
        data_emissao: periodo.data_fim,
        data_vencimento: periodo.data_pagamento,
        itens: rows.map((r) => ({
          colaborador_id: r.c.id,
          colaborador_nome: r.c.full_name,
          salario_base: r.salario_base,
          adiantamentos: r.adiantamentos,
          descontos: r.descontos,
          comissoes: r.comissoes,
          liquido: r.liquido,
          comissao_ids: r.comissaoIds,
          desconto_ids: r.descontoIds,
          salario_expense_ids: r.salarioExpenseIds,
          adiantamento_expense_ids: r.adiantamentoExpenseIds,
        })),
      });
      const complementosMap: Record<string, number> = {};
      rows.forEach((r) => {
        if (r.complemento > 0) complementosMap[r.c.id] = r.complemento;
      });
      const c = await confirmarFolha({
        folhaId: folha.id,
        user_id: userId,
        folhaAccountId,
        complementos: complementosMap,
      });
      if (c.fail === 0) {
        const extra = c.complementosGerados > 0
          ? ` (+${c.complementosGerados} complemento${c.complementosGerados > 1 ? "s" : ""} salarial${c.complementosGerados > 1 ? "is" : ""})`
          : "";
        toast.success(`Folha confirmada — ${rows.length} colaborador(es)${extra}.`);
      } else toast.warning(`${c.ok} ok, ${c.fail} falha(s): ${c.errors[0] || ""}`);
      onGenerated();
      onClose();
    } catch (e: any) {
      toast.error("Falha ao confirmar: " + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loadingData || submitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Gerar folha de pagamento</DialogTitle>
          <DialogDescription>
            Período → seleção de despesas existentes → prévia → confirmar.
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
                  <div className={cn(
                    "flex items-center gap-1.5 text-[11px] font-medium min-w-0",
                    active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"
                  )}>
                    <span className={cn(
                      "h-6 w-6 rounded-full inline-flex items-center justify-center shrink-0 border",
                      active && "bg-primary text-primary-foreground border-primary",
                      done && "bg-green-100 text-green-700 border-green-300",
                      !active && !done && "bg-background border-border"
                    )}>
                      {done ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="truncate hidden sm:inline">{s.title}</span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn(
                      "flex-1 h-px mx-1 sm:mx-2",
                      step > idx ? "bg-green-300" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          {step === 0 && (
            <PeriodoStep
              month={month}
              periodo={periodo}
              onChange={setPeriodo}
              folhaAccountConfigured={!!folhaAccountId}
            />
          )}
          {step === 1 && (
            loadingData ? (
              <Loading />
            ) : (
              <SelecaoStep
                periodo={periodo}
                salarios={salarios}
                adiantamentos={adiantamentos}
                comissoes={comissoes}
                descontos={descontos}
                selSalarios={selSalarios} setSelSalarios={setSelSalarios}
                selAdiant={selAdiant} setSelAdiant={setSelAdiant}
                selComissoes={selComissoes} setSelComissoes={setSelComissoes}
                selDescontos={selDescontos} setSelDescontos={setSelDescontos}
                colabName={colabName}
              />
            )
          )}
          {step === 2 && <PreviaStep rows={rows} totals={totals} periodo={periodo} />}
          {step === 3 && <ConfirmStep rows={rows} totals={totals} periodo={periodo} />}
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t bg-muted/20 flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost" size="sm"
            onClick={() => setStep((s) => (Math.max(0, s - 1) as Step))}
            disabled={step === 0 || busy} className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Etapa {step + 1} de {STEPS.length}
          </div>
          {step < 3 ? (
            <Button size="sm" onClick={handleNext} disabled={busy} className="gap-1">
              {loadingData ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleConfirm} disabled={busy || rows.length === 0} className="gap-1">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              Confirmar folha
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================================================================
// STEPS
// =================================================================

function PeriodoStep({
  month, periodo, onChange, folhaAccountConfigured,
}: {
  month: string; periodo: PeriodoFolha;
  onChange: (p: PeriodoFolha) => void;
  folhaAccountConfigured: boolean;
}) {
  const setTipo = (tipo: TipoPeriodo) => {
    if (tipo === "primeira_quinzena") onChange(buildPeriodoQuinzenal(month, "primeira_quinzena"));
    else if (tipo === "segunda_quinzena") onChange(buildPeriodoQuinzenal(month, "segunda_quinzena"));
    else onChange({ ...periodo, tipo: "personalizado" });
  };

  return (
    <div className="space-y-4">
      {!folhaAccountConfigured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Configure a conta "Salários" em Configurações para continuar.
        </div>
      )}

      <div>
        <Label className="text-xs text-muted-foreground">Tipo de período</Label>
        <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <PresetCard
            active={periodo.tipo === "primeira_quinzena"}
            onClick={() => setTipo("primeira_quinzena")}
            title="1ª quinzena"
            subtitle="01 → 15 · pagamento dia 20"
          />
          <PresetCard
            active={periodo.tipo === "segunda_quinzena"}
            onClick={() => setTipo("segunda_quinzena")}
            title="2ª quinzena"
            subtitle="16 → fim · pagamento dia 05"
          />
          <PresetCard
            active={periodo.tipo === "personalizado"}
            onClick={() => setTipo("personalizado")}
            title="Personalizado"
            subtitle="Defina datas livremente"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Início do período</Label>
          <Input
            type="date" value={periodo.data_inicio}
            onChange={(e) => onChange({ ...periodo, tipo: "personalizado", data_inicio: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Fim do período</Label>
          <Input
            type="date" value={periodo.data_fim}
            onChange={(e) => onChange({ ...periodo, tipo: "personalizado", data_fim: e.target.value })}
            className="h-9"
          />
        </div>
        <div>
          <Label className="text-xs">Data de pagamento</Label>
          <Input
            type="date" value={periodo.data_pagamento}
            onChange={(e) => onChange({ ...periodo, data_pagamento: e.target.value })}
            className="h-9"
          />
        </div>
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-foreground space-y-1">
        <p className="font-semibold">Resumo do período</p>
        <p>
          <strong>{formatDate(periodo.data_inicio)}</strong> até{" "}
          <strong>{formatDate(periodo.data_fim)}</strong> · Pagamento em{" "}
          <strong>{formatDate(periodo.data_pagamento)}</strong>
        </p>
        <p className="text-muted-foreground">
          A próxima etapa carrega despesas de Salário emitidas e Adiantamentos pagos dentro deste intervalo.
        </p>
      </div>
    </div>
  );
}

function PresetCard({
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cn(
        "rounded-md border p-3 text-left transition-all",
        active
          ? "border-primary bg-primary/10 ring-1 ring-primary/30"
          : "border-border bg-background hover:bg-muted/50"
      )}
    >
      <p className={cn("text-sm font-semibold", active && "text-primary")}>{title}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
    </button>
  );
}

function SelecaoStep({
  periodo, salarios, adiantamentos, comissoes, descontos,
  selSalarios, setSelSalarios, selAdiant, setSelAdiant,
  selComissoes, setSelComissoes, selDescontos, setSelDescontos,
  colabName,
}: any) {
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  // Label dinâmico de salários conforme tipo de período
  const salarioHint =
    periodo.tipo === "primeira_quinzena"
      ? "Referente à 2ª quinzena do mês anterior"
      : periodo.tipo === "segunda_quinzena"
      ? "Referente à 1ª quinzena do mês corrente"
      : "Salários cuja COMPETÊNCIA cai no período selecionado";

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Período: <strong>{formatDate(periodo.data_inicio)} – {formatDate(periodo.data_fim)}</strong>.
        Marque manualmente os lançamentos que devem entrar nesta folha.
      </p>

      <Bucket
        title="Salários (competência)" tom="neutral"
        hint={salarioHint}
        items={salarios.map((e: Expense) => ({
          id: e.id,
          name: e.favorecido_nome || colabName(e.favorecido_id),
          desc: e.descricao,
          info: `Competência ${formatDate(e.data_competencia || e.data_emissao)}`,
          value: Number(e.valor_total || 0),
        }))}
        selected={selSalarios} onToggle={(id) => toggle(selSalarios, setSelSalarios, id)}
        emptyText="Nenhum salário com competência neste período. Lance via Contas a Pagar."
      />

      <Bucket
        title="Adiantamentos do período" tom="negative"
        hint="Adiantamentos cuja COMPETÊNCIA cai no período selecionado"
        items={adiantamentos.map((e: Expense) => ({
          id: e.id,
          name: e.favorecido_nome || colabName(e.favorecido_id),
          desc: e.descricao,
          info: `Competência ${formatDate(e.data_competencia || e.data_emissao)}`,
          value: Number(e.valor_pago || e.valor_total || 0),
        }))}
        selected={selAdiant} onToggle={(id) => toggle(selAdiant, setSelAdiant, id)}
        emptyText="Nenhum adiantamento com competência neste período."
      />

      <Bucket
        title="Comissões do período" tom="positive"
        hint="Comissões pendentes com data_referencia dentro do período"
        items={comissoes.map((c: Comissao) => ({
          id: c.id,
          name: colabName(c.colaborador_id),
          desc: `${c.tipo} · ${c.origem}`,
          info: formatDate(c.data_referencia),
          value: Number(c.valor_calculado || 0),
        }))}
        selected={selComissoes} onToggle={(id) => toggle(selComissoes, setSelComissoes, id)}
        emptyText="Sem comissões pendentes neste período."
      />

      <Bucket
        title="Descontos do período" tom="negative"
        hint="Descontos pendentes com data_referencia dentro do período"
        items={descontos.map((d: DescontoFolha) => ({
          id: d.id,
          name: colabName(d.colaborador_id),
          desc: d.tipo,
          info: formatDate(d.data_referencia),
          value: Number(d.valor || 0),
        }))}
        selected={selDescontos} onToggle={(id) => toggle(selDescontos, setSelDescontos, id)}
        emptyText="Sem descontos pendentes neste período."
      />
    </div>
  );
}

function Bucket({
  title, tom, items, selected, onToggle, emptyText, hint,
}: {
  title: string; tom: "neutral" | "positive" | "negative";
  items: { id: string; name: string; desc: string; info: string; value: number }[];
  selected: Set<string>; onToggle: (id: string) => void; emptyText: string;
  hint?: string;
}) {
  const total = items
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + i.value, 0);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toneTotal =
    tom === "positive" ? "text-emerald-600" :
    tom === "negative" ? "text-rose-600" : "text-foreground";

  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {hint && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs font-bold tabular-nums", toneTotal)}>
            {formatBRL(total)}
          </span>
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {selected.size}/{items.length}
            </Badge>
          )}
        </div>
      </div>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="divide-y">
            <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/20">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => {
                  const next = new Set<string>();
                  if (!allSelected) items.forEach((i) => next.add(i.id));
                  // mutate-friendly: replace
                  items.forEach((i) => {
                    if (allSelected && selected.has(i.id)) onToggle(i.id);
                    else if (!allSelected && !selected.has(i.id)) onToggle(i.id);
                  });
                }}
              />
              <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
                Selecionar tudo
              </span>
            </div>
            {items.map((i) => (
              <label
                key={i.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 cursor-pointer"
              >
                <Checkbox checked={selected.has(i.id)} onCheckedChange={() => onToggle(i.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{i.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {i.desc} · {i.info}
                  </p>
                </div>
                <span className={cn("text-xs font-semibold tabular-nums shrink-0", toneTotal)}>
                  {formatBRL(i.value)}
                </span>
              </label>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviaStep({ rows, totals, periodo }: any) {
  // Texto contextual sobre origem dos salários (competência anterior)
  const salarioContexto =
    periodo.tipo === "primeira_quinzena"
      ? "2ª quinzena do mês anterior"
      : periodo.tipo === "segunda_quinzena"
      ? "1ª quinzena do mês corrente"
      : "competência anterior ao período de pagamento";

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Período: <strong>{formatDate(periodo.data_inicio)} – {formatDate(periodo.data_fim)}</strong> · Pagamento{" "}
        <strong>{formatDate(periodo.data_pagamento)}</strong>
      </p>

      {/* 📌 Explicações OBRIGATÓRIAS (Prompt 6) */}
      <div className="rounded-md border border-sky-300 bg-sky-50 p-3 text-[11px] text-sky-900 space-y-1">
        <p className="flex items-start gap-1.5">
          <span className="font-semibold shrink-0">📅 Salários:</span>
          <span>referem-se à produção da <strong>{salarioContexto}</strong>.</span>
        </p>
        <p className="flex items-start gap-1.5">
          <span className="font-semibold shrink-0">💸 Adiantamentos:</span>
          <span>são descontados da <strong>produção atual</strong> (vales pagos no período).</span>
        </p>
        <p className="flex items-start gap-1.5">
          <span className="font-semibold shrink-0">🎯 Comissões:</span>
          <span>baseadas na <strong>produção do período atual</strong>, valor bruto.</span>
        </p>
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Mini label="Salários" value={formatBRL(totals.base)} />
          <Mini label="+ Complemento" value={formatBRL(totals.comp)} color="text-sky-600" />
          <Mini label="+ Comissões" value={formatBRL(totals.com)} color="text-emerald-600" />
          <Mini label="− Adiantamentos" value={formatBRL(totals.adv)} color="text-amber-600" />
          <Mini label="− Descontos" value={formatBRL(totals.desc)} color="text-rose-600" />
          <Mini label="= Total líquido" value={formatBRL(totals.liq)} color="text-primary" strong />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum colaborador selecionado.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rows.map((r: any) => (
            <Card key={r.c.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{r.c.full_name}</p>
                  {r.complemento > 0 && (
                    <Badge variant="outline" className="text-[9px] border-sky-300 text-sky-700 bg-sky-50 shrink-0">
                      Piso garantido
                    </Badge>
                  )}
                </div>

                {/* Bloco: SALÁRIOS (competência anterior) */}
                <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-1">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">
                    Salários · {salarioContexto}
                  </p>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Base do período</span>
                    <span className="font-medium tabular-nums">{formatBRL(r.salario_base)}</span>
                  </div>
                  {r.complemento > 0 && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-sky-700">+ Complemento salarial</span>
                      <span className="font-medium tabular-nums text-sky-600">{formatBRL(r.complemento)}</span>
                    </div>
                  )}
                </div>

                {/* Bloco: COMISSÕES (produção atual) */}
                <div className="rounded border border-emerald-200 bg-emerald-50/40 p-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[9px] uppercase tracking-wide text-emerald-700 font-semibold">
                      + Comissões · produção atual
                    </span>
                    <span className="font-semibold tabular-nums text-emerald-600">{formatBRL(r.comissoes)}</span>
                  </div>
                </div>

                {/* Bloco: ADIANTAMENTOS + DESCONTOS (período atual) */}
                <div className="rounded border border-amber-200 bg-amber-50/40 p-2 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[9px] uppercase tracking-wide text-amber-700 font-semibold">
                      − Adiantamentos · período atual
                    </span>
                    <span className="font-semibold tabular-nums text-amber-600">{formatBRL(r.adiantamentos)}</span>
                  </div>
                  {r.descontos > 0 && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-rose-700">− Outros descontos</span>
                      <span className="font-medium tabular-nums text-rose-600">{formatBRL(r.descontos)}</span>
                    </div>
                  )}
                </div>

                <div className="pt-1.5 border-t flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Total a pagar</span>
                  <span className="text-base font-bold text-primary tabular-nums">{formatBRL(r.liquido)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] space-y-1.5">
        <p className="font-semibold">📊 Fórmula final:</p>
        <code className="block text-[11px] font-mono bg-background/60 p-2 rounded border">
          Total = Salários + Comissões − Adiantamentos − Descontos
        </code>
        <p className="text-muted-foreground">
          🛡️ <strong>Complemento salarial</strong> é gerado automaticamente quando o total recebido
          no mês fica abaixo do salário base cadastrado, garantindo o piso.
        </p>
      </div>
    </div>
  );
}

function ConfirmStep({ rows, totals, periodo }: any) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Pronto para confirmar</h3>
          <p className="text-xs text-muted-foreground">
            Ao confirmar, a folha será fechada e <strong>não poderá ser alterada</strong>.
            As despesas já existem em Contas a Pagar — esta folha apenas as <em>consolida</em> em
            um snapshot oficial e marca comissões/descontos como vinculados.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            <Mini label="Período" value={`${formatDate(periodo.data_inicio)} → ${formatDate(periodo.data_fim)}`} />
            <Mini label="Pagamento" value={formatDate(periodo.data_pagamento)} />
            <Mini label="Colaboradores" value={String(rows.length)} />
            <Mini label="Líquido total" value={formatBRL(totals.liq)} color="text-primary" strong />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando lançamentos...
    </div>
  );
}

function Mini({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background p-2.5">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={cn("text-sm tabular-nums", color || "text-foreground", strong && "font-bold")}>
        {value}
      </div>
    </div>
  );
}

function Cell({ label, value, c }: { label: string; value: string; c?: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={cn("font-medium tabular-nums truncate", c || "text-foreground")}>{value}</p>
    </div>
  );
}
