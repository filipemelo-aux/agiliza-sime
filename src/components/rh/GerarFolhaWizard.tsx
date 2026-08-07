/**
 * GerarFolhaWizard — Assistente quinzenal de Folha de Pagamento.
 *
 * 🔁 NOVO FLUXO (folha GERA Contas a Pagar)
 *   ETAPA 1 — Período (1ª/2ª quinzena ou personalizado)
 *   ETAPA 2 — Selecionar adiantamentos / comissões / descontos do período.
 *             O salário base vem do CADASTRO (não há mais bucket de salários).
 *   ETAPA 3 — Prévia consolidada por colaborador
 *   ETAPA 4 — Confirmar → cria folha + gera UMA despesa LÍQUIDA por colaborador
 *             em Contas a Pagar (categoria Salários, vencimento = data de pagamento).
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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
  buildPeriodoMensal,

  computePayrollRowsFromPeriodo,
  periodoToMesReferencia,
  criarFolhaEmAberto,
  confirmarFolha,
  fetchAdiantamentosPagosNoPeriodo,
  fetchComissoesPendentesNoPeriodo,
  fetchDescontosPendentesNoPeriodo,
  isColaboradorElegivelNoPeriodo,
  isPeriodoQuinzenal,
  splitParcelas,
  createParcelasFuturasAdiantamento,

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

const STEPS = [
  { title: "Período", description: "Datas da folha", icon: CalendarRange },
  { title: "Lançamentos", description: "Adiant./Comissões/Descontos", icon: ListChecks },
  { title: "Prévia", description: "Conferência final", icon: Eye },
  { title: "Confirmar", description: "Gerar despesas", icon: FileCheck2 },
];

export function GerarFolhaWizard({
  open, onClose, colaboradores, month,
  folhaAccountId, adiantamentoAccountId,
  empresaId, userId, onGenerated,
}: Props) {
  const [step, setStep] = useState<Step>(0);
  const [periodo, setPeriodo] = useState<PeriodoFolha>(() =>
    buildPeriodoQuinzenal(month, "primeira_quinzena")
  );

  const [adiantamentos, setAdiantamentos] = useState<Expense[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [descontos, setDescontos] = useState<DescontoFolha[]>([]);

  const [selAdiant, setSelAdiant] = useState<Set<string>>(new Set());
  const [selComissoes, setSelComissoes] = useState<Set<string>>(new Set());
  const [selDescontos, setSelDescontos] = useState<Set<string>>(new Set());
  const [selColabs, setSelColabs] = useState<Set<string>>(new Set());
  /** Nº de parcelas por adiantamento (1 = descontar integral na folha atual). */
  const [parcelasAdiant, setParcelasAdiant] = useState<Record<string, number>>({});

  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const elegiveis = useMemo(
    () => colaboradores.filter((c) => c.ativo && isColaboradorElegivelNoPeriodo(c, periodo.tipo)),
    [colaboradores, periodo.tipo]
  );

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setPeriodo(buildPeriodoQuinzenal(month, "primeira_quinzena"));
  }, [open, month]);

  // Seleção sempre limitada aos colaboradores elegíveis ao período atual
  useEffect(() => {
    if (!open) return;
    setSelColabs(new Set(elegiveis.map((c) => c.id)));
  }, [open, elegiveis]);

  const colabIds = useMemo(() => elegiveis.map((c) => c.id), [elegiveis]);


  const loadPeriodData = async () => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações.");
      return false;
    }
    setLoadingData(true);
    try {
      const [adv, com, desc] = await Promise.all([
        adiantamentoAccountId
          ? fetchAdiantamentosPagosNoPeriodo(colabIds, adiantamentoAccountId, periodo.data_inicio, periodo.data_fim)
          : Promise.resolve([]),
        fetchComissoesPendentesNoPeriodo(colabIds, periodo.data_inicio, periodo.data_fim),
        fetchDescontosPendentesNoPeriodo(colabIds, periodo.data_inicio, periodo.data_fim),
      ]);
      setAdiantamentos(adv);
      setComissoes(com);
      setDescontos(desc);
      // pré-marca tudo (usuário pode desmarcar)
      setSelAdiant(new Set(adv.map((e: Expense) => e.id)));
      setSelComissoes(new Set(com.map((c: Comissao) => c.id)));
      setSelDescontos(new Set(desc.map((d: DescontoFolha) => d.id)));
      setParcelasAdiant(Object.fromEntries(adv.map((e: Expense) => [e.id, 1])));
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
        periodo,
        adiantamentos,
        comissoes,
        descontos,
        selectedAdiantamentoIds: selAdiant,
        selectedComissaoIds: selComissoes,
        selectedDescontoIds: selDescontos,
        adiantamentoParcelas: parcelasAdiant,
        selectedColaboradorIds: selColabs,
      }),
    [colaboradores, periodo, adiantamentos, comissoes, descontos, selAdiant, selComissoes, selDescontos, parcelasAdiant, selColabs]
  );

  const totals = rows.reduce(
    (acc, r) => ({
      base: acc.base + r.salario_base,
      adv: acc.adv + r.adiantamentos,
      desc: acc.desc + r.descontos,
      com: acc.com + r.comissoes,
      liq: acc.liq + r.liquido,
    }),
    { base: 0, adv: 0, desc: 0, com: 0, liq: 0 }
  );

  const colabName = (id: string) =>
    colaboradores.find((c) => c.id === id)?.full_name || "—";

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
      toast.info("Nenhum colaborador com lançamentos para gerar folha.");
      return;
    }
    if (!folhaAccountId) {
      toast.error("Conta de Salários não configurada.");
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
          adiantamento_expense_ids: r.adiantamentoExpenseIds,
        })),
      });
      const c = await confirmarFolha({
        folhaId: folha.id,
        user_id: userId,
        folhaAccountId,
      });

      // Adiantamentos parcelados → gera os descontos das folhas seguintes
      const mesRef = periodoToMesReferencia(periodo);
      let parcelasCriadas = 0;
      for (const e of adiantamentos as Expense[]) {
        const n = Math.max(1, Number(parcelasAdiant[e.id] || 1));
        if (n <= 1) continue;
        if (!selAdiant.has(e.id) || !e.favorecido_id) continue;
        if (selColabs.size > 0 && !selColabs.has(e.favorecido_id)) continue;
        const valores = splitParcelas(Number(e.valor_pago || e.valor_total || 0), n);
        await createParcelasFuturasAdiantamento({
          colaborador_id: e.favorecido_id,
          mesReferencia: mesRef,
          parcelas: valores,
          descricaoBase: e.descricao || "Adiantamento",
        });
        parcelasCriadas += n - 1;
      }

      if (c.fail === 0) {
        toast.success(
          `Folha confirmada — ${rows.length} colaborador(es), ${c.despesasCriadas} despesa(s) gerada(s) em Contas a Pagar.` +
            (parcelasCriadas > 0 ? ` ${parcelasCriadas} parcela(s) de adiantamento agendada(s).` : "")
        );
      } else {
        toast.warning(`${c.ok} ok, ${c.fail} falha(s): ${c.errors[0] || ""}`);
      }
      onGenerated();
      onClose();
    } catch (e: any) {
      toast.error("Falha ao confirmar: " + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loadingData || submitting;
  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Gerar folha de pagamento</DialogTitle>
          <DialogDescription>
            A folha gera automaticamente uma despesa em Contas a Pagar para cada colaborador.
          </DialogDescription>
        </DialogHeader>

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
                    <div className={cn("flex-1 h-px mx-1 sm:mx-2", step > idx ? "bg-green-300" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <ScrollArea className="flex-1 px-5 py-4">
          {step === 0 && (
            <PeriodoStep
              month={month} periodo={periodo} onChange={setPeriodo}
              folhaAccountConfigured={!!folhaAccountId}
              colaboradores={colaboradores}
              selColabs={selColabs} setSelColabs={setSelColabs}
            />
          )}
          {step === 1 && (
            loadingData ? <Loading /> : (
              <SelecaoStep
                periodo={periodo}
                adiantamentos={adiantamentos}
                comissoes={comissoes}
                descontos={descontos}
                selAdiant={selAdiant} setSelAdiant={setSelAdiant}
                selComissoes={selComissoes} setSelComissoes={setSelComissoes}
                selDescontos={selDescontos} setSelDescontos={setSelDescontos}
                colabName={colabName}
                selColabs={selColabs}
                parcelasAdiant={parcelasAdiant} setParcelasAdiant={setParcelasAdiant}
                toggle={toggleSet}
              />
            )
          )}
          {step === 2 && <PreviaStep rows={rows} totals={totals} periodo={periodo} />}
          {step === 3 && <ConfirmStep rows={rows} totals={totals} periodo={periodo} />}
        </ScrollArea>

        <DialogFooter className="px-5 py-3 border-t bg-muted/20 flex flex-row items-center justify-between gap-2">
          <Button variant="ghost" size="sm"
            onClick={() => setStep((s) => (Math.max(0, s - 1) as Step))}
            disabled={step === 0 || busy} className="gap-1">
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
              Confirmar e gerar despesas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ STEPS ============

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function PeriodoStep({
  month, periodo, onChange, folhaAccountConfigured,
  colaboradores, selColabs, setSelColabs,
}: any) {
  // Mês de competência derivado do período atual (fallback: mês da tela)
  const mesRef = (periodo?.data_inicio || `${month}-01`).slice(0, 7);
  const [refYear, refMonthIdx] = [Number(mesRef.slice(0, 4)), Number(mesRef.slice(5, 7)) - 1];
  const [showDatas, setShowDatas] = useState(false);
  const [buscaColab, setBuscaColab] = useState("");

  const buildFor = (tipo: TipoPeriodo, m: string) =>
    tipo === "primeira_quinzena" || tipo === "segunda_quinzena"
      ? buildPeriodoQuinzenal(m, tipo)
      : buildPeriodoMensal(m);

  // Competência padrão da folha mensal: mês ANTERIOR à data atual
  // (ex.: em agosto, a folha mensal refere-se a julho, paga no 5º dia útil de agosto).
  const mesAnteriorAtual = (() => {
    const hoje = new Date();
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const setTipo = (tipo: TipoPeriodo) =>
    onChange(buildFor(tipo, tipo === "mensal" ? mesAnteriorAtual : mesRef));

  const setMes = (idx: number, year = refYear) =>
    onChange(buildFor(periodo.tipo, `${year}-${String(idx + 1).padStart(2, "0")}`));

  const quinzenal = isPeriodoQuinzenal(periodo.tipo);
  const ativos = colaboradores.filter(
    (c: ColaboradorRH) => c.ativo && isColaboradorElegivelNoPeriodo(c, periodo.tipo)
  );
  const excluidosQuinzena = quinzenal
    ? colaboradores.filter((c: ColaboradorRH) => c.ativo && c.tipo !== "motorista").length
    : 0;
  const excluidosMensal =
    periodo.tipo === "mensal"
      ? colaboradores.filter((c: ColaboradorRH) => c.ativo && c.tipo === "motorista").length
      : 0;
  const allSelected = ativos.length > 0 && ativos.every((c: ColaboradorRH) => selColabs.has(c.id));

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
          <PresetCard active={periodo.tipo === "primeira_quinzena"} onClick={() => setTipo("primeira_quinzena")}
            title="1ª quinzena" subtitle="01 → 15 · pagamento dia 20" />
          <PresetCard active={periodo.tipo === "segunda_quinzena"} onClick={() => setTipo("segunda_quinzena")}
            title="2ª quinzena" subtitle="16 → fim · pagamento dia 05" />
          <PresetCard active={periodo.tipo === "mensal" || periodo.tipo === "personalizado"} onClick={() => setTipo("mensal")}
            title="Mensal" subtitle="Competência do mês · pagamento no 5º dia útil seguinte" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs text-muted-foreground shrink-0">Competência</Label>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" className="px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMes(refMonthIdx, refYear - 1)}>◀</button>
          <span className="text-xs font-medium tabular-nums">{refYear}</span>
          <button type="button" className="px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMes(refMonthIdx, refYear + 1)}>▶</button>
        </div>
        <div className="flex-1 min-w-[240px] grid grid-cols-12 gap-0.5">
          {MESES_CURTOS.map((m, i) => (
            <button key={m} type="button" onClick={() => setMes(i)} title={m}
              className={`h-6 rounded border text-[10px] leading-none transition-colors ${
                i === refMonthIdx
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <button type="button" onClick={() => setShowDatas((v) => !v)}
          className="text-[11px] text-primary hover:underline">
          {showDatas ? "Ocultar período personalizado" : "Ajustar período personalizado (opcional)"}
        </button>
        {showDatas && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" value={periodo.data_inicio}
                onChange={(e) => onChange({ ...periodo, data_inicio: e.target.value })}
                className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input type="date" value={periodo.data_fim}
                onChange={(e) => onChange({ ...periodo, data_fim: e.target.value })}
                className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Pagamento</Label>
              <Input type="date" value={periodo.data_pagamento}
                onChange={(e) => onChange({ ...periodo, data_pagamento: e.target.value })}
                className="h-9" />
            </div>
          </div>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatDate(periodo.data_inicio)} – {formatDate(periodo.data_fim)} · pagamento {formatDate(periodo.data_pagamento)}
        </p>
      </div>

      {quinzenal && (
        <div className="rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            Folha quinzenal é exclusiva para motoristas.
            {excluidosQuinzena > 0 && ` ${excluidosQuinzena} colaborador(es) não motorista(s) ficam de fora — use o período mensal para eles.`}
          </span>
        </div>
      )}

      {periodo.tipo === "mensal" && (
        <div className="rounded-md border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            Folha mensal é exclusiva para colaboradores não motoristas. Competência sugerida: mês anterior à data atual.
            {excluidosMensal > 0 && ` ${excluidosMensal} motorista(s) ficam de fora — use as quinzenas para eles.`}
          </span>
        </div>
      )}


      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <Label className="text-xs text-muted-foreground">Colaboradores ({selColabs.size}/{ativos.length})</Label>
          <button type="button" className="text-[11px] text-primary hover:underline"
            onClick={() => {
              if (allSelected) setSelColabs(new Set());
              else setSelColabs(new Set(ativos.map((c: ColaboradorRH) => c.id)));
            }}>
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
        </div>
        <Input
          value={buscaColab}
          onChange={(e) => setBuscaColab(e.target.value)}
          placeholder="Buscar colaborador..."
          className="h-8 text-xs mb-1.5"
        />
        <Card className="max-h-[420px] min-h-[220px] overflow-y-auto">
          <CardContent className="p-2 space-y-0.5">
            {ativosFiltrados.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                Nenhum colaborador encontrado para este período.
              </p>
            )}
            {ativosFiltrados.map((c: ColaboradorRH) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-2 rounded hover:bg-muted/50 cursor-pointer">
                <Checkbox
                  checked={selColabs.has(c.id)}
                  onCheckedChange={() => {
                    const next = new Set(selColabs);
                    if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                    setSelColabs(next);
                  }}
                />
                <span className="text-sm flex-1 truncate">{c.full_name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {formatBRL(Number(c.salario || 0))}/mês
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PresetCard({ active, onClick, title, subtitle }: any) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded-md border p-3 text-left transition-all",
        active ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-background hover:bg-muted/50"
      )}>
      <p className={cn("text-sm font-semibold", active && "text-primary")}>{title}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
    </button>
  );
}

function SelecaoStep({
  periodo, adiantamentos, comissoes, descontos,
  selAdiant, setSelAdiant, selComissoes, setSelComissoes,
  selDescontos, setSelDescontos, colabName, toggle, selColabs,
  parcelasAdiant, setParcelasAdiant,
}: any) {
  // Somente itens dos colaboradores selecionados na etapa anterior
  const inColab = (id?: string | null) =>
    !selColabs || selColabs.size === 0 ? true : !!id && selColabs.has(id);

  const comissoesFiltradas = comissoes.filter((c: Comissao) => inColab(c.colaborador_id));
  const adiantamentosFiltrados = adiantamentos.filter((e: Expense) => inColab(e.favorecido_id));
  const descontosFiltrados = descontos.filter((d: DescontoFolha) => inColab(d.colaborador_id));

  const setParcelas = (id: string, n: number) =>
    setParcelasAdiant((prev: Record<string, number>) => ({ ...prev, [id]: Math.max(1, Math.min(36, n || 1)) }));

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Período: <strong>{formatDate(periodo.data_inicio)} – {formatDate(periodo.data_fim)}</strong>.
        O salário base vem do cadastro do colaborador. Marque adiantamentos, comissões e descontos.
      </p>


      <Bucket title="Comissões do período" tom="positive"
        hint="Comissões pendentes com data_referencia dentro do período"
        items={comissoesFiltradas.map((c: Comissao) => ({
          id: c.id, name: colabName(c.colaborador_id),
          desc: `${c.tipo} · ${c.origem}`, info: formatDate(c.data_referencia),
          value: Number(c.valor_calculado || 0),
        }))}
        selected={selComissoes} onToggle={(id: string) => toggle(selComissoes, setSelComissoes, id)}
        emptyText="Sem comissões pendentes neste período."
      />

      <Bucket title="Adiantamentos / vales do período" tom="negative"
        hint="Descontar integralmente nesta folha ou parcelar o débito nas próximas folhas"
        items={adiantamentosFiltrados.map((e: Expense) => {
          const bruto = Number(e.valor_pago || e.valor_total || 0);
          const n = Math.max(1, Number(parcelasAdiant?.[e.id] || 1));
          const parcelas = splitParcelas(bruto, n);
          return {
            id: e.id,
            name: e.favorecido_nome || colabName(e.favorecido_id),
            desc: e.descricao,
            info: `Comp. ${formatDate(e.data_competencia || e.data_emissao)} · Total ${formatBRL(bruto)}`,
            value: parcelas[0],
            extra: (
              <ParcelamentoControl
                n={n}
                onChange={(v: number) => setParcelas(e.id, v)}
                parcelas={parcelas}
              />
            ),
          };
        })}
        selected={selAdiant} onToggle={(id: string) => toggle(selAdiant, setSelAdiant, id)}
        emptyText="Nenhum adiantamento neste período."
      />

      <Bucket title="Descontos do período" tom="negative"
        hint="Descontos pendentes lançados no RH"
        items={descontosFiltrados.map((d: DescontoFolha) => ({
          id: d.id, name: colabName(d.colaborador_id),
          desc: d.tipo, info: formatDate(d.data_referencia),
          value: Number(d.valor || 0),
        }))}
        selected={selDescontos} onToggle={(id: string) => toggle(selDescontos, setSelDescontos, id)}
        emptyText="Sem descontos pendentes neste período."
      />

    </div>
  );
}

/** Define se o adiantamento é descontado integralmente ou parcelado. */
function ParcelamentoControl({ n, onChange, parcelas }: { n: number; onChange: (v: number) => void; parcelas: number[] }) {
  const parcelado = n > 1;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button type="button" size="sm" variant={parcelado ? "outline" : "default"}
        className="h-7 px-2 text-[10px]" onClick={() => onChange(1)}>
        Integral nesta folha
      </Button>
      <Button type="button" size="sm" variant={parcelado ? "default" : "outline"}
        className="h-7 px-2 text-[10px]" onClick={() => onChange(n > 1 ? n : 2)}>
        Parcelar
      </Button>
      {parcelado && (
        <>
          <Input type="number" min={2} max={36} value={n}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-7 w-16 text-[11px]" />
          <span className="text-[10px] text-muted-foreground">
            x de {formatBRL(parcelas[1] ?? parcelas[0])} · 1ª parcela {formatBRL(parcelas[0])} nesta folha, demais nas próximas folhas
          </span>
        </>
      )}
    </div>
  );
}

function Bucket({ title, tom, items, selected, onToggle, emptyText, hint }: any) {
  const total = items.filter((i: any) => selected.has(i.id)).reduce((s: number, i: any) => s + i.value, 0);
  const allSelected = items.length > 0 && items.every((i: any) => selected.has(i.id));
  const toneTotal = tom === "positive" ? "text-emerald-600" : tom === "negative" ? "text-rose-600" : "text-foreground";

  return (
    <Card className="overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("text-xs font-bold tabular-nums", toneTotal)}>{formatBRL(total)}</span>
          {items.length > 0 && (
            <Badge variant="outline" className="text-[10px]">{selected.size}/{items.length}</Badge>
          )}
        </div>
      </div>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="divide-y">
            <div className="px-3 py-1.5 flex items-center gap-2 bg-muted/20">
              <Checkbox checked={allSelected}
                onCheckedChange={() => {
                  items.forEach((i: any) => {
                    if (allSelected && selected.has(i.id)) onToggle(i.id);
                    else if (!allSelected && !selected.has(i.id)) onToggle(i.id);
                  });
                }} />
              <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Selecionar tudo</span>
            </div>
            {items.map((i: any) => (
              <div key={i.id} className="px-3 py-2 hover:bg-muted/30">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selected.has(i.id)} onCheckedChange={() => onToggle(i.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{i.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{i.desc} · {i.info}</p>
                  </div>
                  <span className={cn("text-xs font-semibold tabular-nums shrink-0", toneTotal)}>{formatBRL(i.value)}</span>
                </label>
                {i.extra && selected.has(i.id) && <div className="pl-6 pt-1.5">{i.extra}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviaStep({ rows, totals, periodo }: any) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Período: <strong>{formatDate(periodo.data_inicio)} – {formatDate(periodo.data_fim)}</strong> · Pagamento{" "}
        <strong>{formatDate(periodo.data_pagamento)}</strong>
      </p>

      <Card>
        <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Mini label="Salário base" value={formatBRL(totals.base)} />
          <Mini label="+ Comissões" value={formatBRL(totals.com)} color="text-emerald-600" />
          <Mini label="− Adiantamentos" value={formatBRL(totals.adv)} color="text-amber-600" />
          <Mini label="− Descontos" value={formatBRL(totals.desc)} color="text-rose-600" />
          <Mini label="= Líquido" value={formatBRL(totals.liq)} color="text-primary" strong />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Nenhum colaborador para gerar.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {rows.map((r: any) => (
            <Card key={r.c.id}>
              <CardContent className="p-3 space-y-2">
                <p className="text-sm font-semibold truncate">{r.c.full_name}</p>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <Cell label="Base" value={formatBRL(r.salario_base)} />
                  <Cell label="+ Comissões" value={formatBRL(r.comissoes)} c="text-emerald-600" />
                  <Cell label="− Adiantam." value={formatBRL(r.adiantamentos)} c="text-amber-600" />
                  <Cell label="− Descontos" value={formatBRL(r.descontos)} c="text-rose-600" />
                </div>
                <div className="pt-1.5 border-t flex items-center justify-between">
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Líquido a pagar</span>
                  <span className="text-base font-bold text-primary tabular-nums">{formatBRL(r.liquido)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
            Ao confirmar, será criada <strong>uma despesa em Contas a Pagar por colaborador</strong> com o valor líquido,
            categoria "Salários" e vencimento na data de pagamento. Comissões e descontos selecionados serão vinculados à folha.
            A folha não poderá ser alterada — para reverter, estorne o pagamento no Contas a Pagar.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            <Mini label="Período" value={`${formatDate(periodo.data_inicio)} → ${formatDate(periodo.data_fim)}`} />
            <Mini label="Pagamento" value={formatDate(periodo.data_pagamento)} />
            <Mini label="Colaboradores" value={String(rows.length)} />
            <Mini label="Total a pagar" value={formatBRL(totals.liq)} color="text-primary" strong />
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
      <div className={cn("text-sm tabular-nums", color || "text-foreground", strong && "font-bold")}>{value}</div>
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
