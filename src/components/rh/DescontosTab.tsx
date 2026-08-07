import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, MinusCircle, Loader2, Calculator, Info, Check } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import {
  createDescontoFolha,
  createDescontosFolhaBatch,
  deleteDescontoFolha,
  fetchDescontosPendentesForMonth,
  calcularDescontosLegais,
  type ColaboradorRH,
  type DescontoFolha,
  type DescontoFolhaTipo,
  type DescontoLegalCalculado,
} from "@/services/rh";
import { MonthPicker } from "@/components/MonthPicker";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/** Rótulos de todos os tipos (inclui os legados, usados apenas para exibição). */
const TIPOS: { v: DescontoFolhaTipo; label: string }[] = [
  { v: "inss", label: "INSS" },
  { v: "irrf", label: "IRRF" },
  { v: "faltas", label: "Faltas" },
  { v: "multas", label: "Multas" },
  { v: "vale", label: "Vale" },
  { v: "adiantamento", label: "Adiantamento" },
  { v: "outros", label: "Outros" },
];

/**
 * Tipos permitidos no lançamento manual.
 * Adiantamento e Vale ficam de fora de propósito: eles representam saída real
 * de caixa e devem nascer no Contas a Pagar (plano de contas de adiantamento).
 * O wizard da folha já lê essas despesas, e as parcelas futuras de um
 * adiantamento parcelado são criadas automaticamente pelo próprio wizard.
 */
const TIPOS_MANUAIS: { v: DescontoFolhaTipo; label: string }[] = TIPOS.filter(
  (t) => t.v !== "adiantamento" && t.v !== "vale"
);


type LinhaAuto = DescontoLegalCalculado & {
  incluir: boolean;
  inssEdit: string;
  irrfEdit: string;
  depEdit: string;
  jaLancadoInss: boolean;
  jaLancadoIrrf: boolean;
};

interface DescontosTabProps {
  colaboradores: ColaboradorRH[];
}

const MESES_LONGOS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const labelMes = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES_LONGOS[m - 1]}/${y}`;
};

/** Recebe o mês de PAGAMENTO e devolve o mês de COMPETÊNCIA (mês trabalhado = anterior). */
const competenciaDoPagamento = (payMonth: string) => {
  const [y, m] = payMonth.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function DescontosTab({ colaboradores }: DescontosTabProps) {
  // Mês em que a folha será PAGA (o usuário seleciona o pagamento)
  const [payMonth, setPayMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  // Mês trabalhado (competência) — é onde os descontos são gravados
  const month = competenciaDoPagamento(payMonth);

  const [items, setItems] = useState<DescontoFolha[]>([]);
  const [loading, setLoading] = useState(false);
  const [colabId, setColabId] = useState("");
  const [tipo, setTipo] = useState<DescontoFolhaTipo>("outros");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [auto, setAuto] = useState<LinhaAuto[] | null>(null);
  const [lancandoAuto, setLancandoAuto] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const ativos = useMemo(() => colaboradores.filter((c) => c.ativo), [colaboradores]);
  const colabName = (id: string) =>
    ativos.find((c) => c.id === id)?.full_name || colaboradores.find((c) => c.id === id)?.full_name || "—";

  const load = async () => {
    setLoading(true);
    try {
      const ids = ativos.map((c) => c.id);
      const data = await fetchDescontosPendentesForMonth(ids, month);
      setItems(data);
    } catch (e: any) {
      toast.error("Erro ao carregar descontos: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ativos.length > 0) load();
    else setItems([]);
    setAuto(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, ativos.length]);

  const handleAdd = async () => {
    if (!colabId) return toast.error("Selecione um colaborador");
    if (tipo === "adiantamento" || tipo === "vale")
      return toast.error("Adiantamentos e vales devem ser lançados no Contas a Pagar");

    const n = parseFloat(valor.replace(",", "."));
    if (isNaN(n) || n <= 0) return toast.error("Valor inválido");
    setSaving(true);
    try {
      const [y, m] = month.split("-").map(Number);
      await createDescontoFolha({
        colaborador_id: colabId,
        tipo,
        valor: n,
        descricao: descricao || null,
        data_referencia: `${y}-${String(m).padStart(2, "0")}-01`,
      });
      toast.success("Desconto adicionado");
      setValor("");
      setDescricao("");
      await load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: DescontoFolha) => {
    const ok = await confirm({
      title: "Remover desconto?",
      description: `${colabName(d.colaborador_id)} — ${formatBRL(Number(d.valor))}`,
      confirmLabel: "Remover",
    });
    if (!ok) return;
    try {
      await deleteDescontoFolha(d.id);
      toast.success("Desconto removido");
      await load();
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  };

  // ---- Cálculo automático de descontos legais (INSS / IRRF) ----
  const calcularAutomatico = (depOverrides: Record<string, number> = {}) => {
    const linhas: LinhaAuto[] = ativos.map((c) => {
      const jaInss = items.some((i) => i.colaborador_id === c.id && i.tipo === "inss");
      const jaIrrf = items.some((i) => i.colaborador_id === c.id && i.tipo === "irrf");
      const dep = depOverrides[c.id] ?? 0;
      const calc = calcularDescontosLegais({
        colaborador_id: c.id,
        nome: c.full_name,
        salarioBruto: c.salario,
        regime: c.regime,
        dependentes: dep,
      });
      return {
        ...calc,
        incluir: !calc.motivoIsencao && (!jaInss || !jaIrrf) && calc.inss + calc.irrf > 0,
        inssEdit: calc.inss.toFixed(2),
        irrfEdit: calc.irrf.toFixed(2),
        depEdit: String(dep),
        jaLancadoInss: jaInss,
        jaLancadoIrrf: jaIrrf,
      };
    });
    setAuto(linhas);
  };

  const recalcLinha = (id: string, dep: number) => {
    setAuto((prev) =>
      (prev || []).map((l) => {
        if (l.colaborador_id !== id) return l;
        const c = ativos.find((a) => a.id === id);
        const calc = calcularDescontosLegais({
          colaborador_id: id,
          nome: l.nome,
          salarioBruto: c?.salario ?? l.salarioBruto,
          regime: c?.regime,
          dependentes: dep,
        });
        return {
          ...l,
          ...calc,
          depEdit: String(dep),
          inssEdit: calc.inss.toFixed(2),
          irrfEdit: calc.irrf.toFixed(2),
        };
      })
    );
  };

  const patchLinha = (id: string, patch: Partial<LinhaAuto>) =>
    setAuto((prev) => (prev || []).map((l) => (l.colaborador_id === id ? { ...l, ...patch } : l)));

  const lancarAutomaticos = async () => {
    const selecionadas = (auto || []).filter((l) => l.incluir);
    if (selecionadas.length === 0) return toast.error("Nenhum colaborador selecionado");
    const [y, m] = month.split("-").map(Number);
    const dataRef = `${y}-${String(m).padStart(2, "0")}-01`;

    const rows: {
      colaborador_id: string;
      tipo: DescontoFolhaTipo;
      valor: number;
      descricao: string;
      data_referencia: string;
    }[] = [];

    for (const l of selecionadas) {
      const inss = parseFloat(l.inssEdit.replace(",", ".")) || 0;
      const irrf = parseFloat(l.irrfEdit.replace(",", ".")) || 0;
      if (inss > 0 && !l.jaLancadoInss) {
        rows.push({
          colaborador_id: l.colaborador_id,
          tipo: "inss",
          valor: inss,
          descricao: `INSS automático — tabela progressiva 2026 sobre ${formatBRL(l.salarioBruto)}`,
          data_referencia: dataRef,
        });
      }
      if (irrf > 0 && !l.jaLancadoIrrf) {
        rows.push({
          colaborador_id: l.colaborador_id,
          tipo: "irrf",
          valor: irrf,
          descricao: `IRRF automático — base ${formatBRL(l.irrfDetalhe.base)} (${(l.irrfDetalhe.aliquota * 100).toFixed(1)}%${l.irrfDetalhe.redutor > 0 ? `, redutor ${formatBRL(l.irrfDetalhe.redutor)}` : ""})`,
          data_referencia: dataRef,
        });
      }
    }

    if (rows.length === 0) return toast.error("Nada a lançar (valores zerados ou já lançados)");

    const ok = await confirm({
      title: "Lançar descontos automáticos?",
      description: `${rows.length} lançamento(s) serão criados para ${selecionadas.length} colaborador(es) na competência ${labelMes(month)} (mês trabalhado), para pagamento em ${labelMes(payMonth)}.`,
      confirmLabel: "Lançar",
    });
    if (!ok) return;

    setLancandoAuto(true);
    try {
      await createDescontosFolhaBatch(rows);
      toast.success(`${rows.length} desconto(s) lançado(s)`);
      setAuto(null);
      await load();
    } catch (e: any) {
      toast.error("Erro ao lançar: " + e.message);
    } finally {
      setLancandoAuto(false);
    }
  };

  const total = items.reduce((s, i) => s + Number(i.valor || 0), 0);
  const totalAuto = (auto || [])
    .filter((l) => l.incluir)
    .reduce(
      (s, l) =>
        s +
        (l.jaLancadoInss ? 0 : parseFloat(l.inssEdit.replace(",", ".")) || 0) +
        (l.jaLancadoIrrf ? 0 : parseFloat(l.irrfEdit.replace(",", ".")) || 0),
      0
    );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MinusCircle className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-semibold">Descontos pendentes</h3>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mês do pagamento</Label>
            <MonthPicker value={payMonth} onChange={setPayMonth} className="w-[160px]" />
            <Badge variant="outline" className="text-[11px] font-normal">
              competência: {labelMes(month)} (mês trabalhado)
            </Badge>
          </div>

        </div>

        {/* Descontos legais automáticos */}
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold">Descontos legais automáticos (INSS / IRRF)</h4>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[340px] text-xs leading-relaxed">
                    <p className="font-semibold mb-1">Regras aplicadas (competência 2026)</p>
                    <p>
                      <b>INSS</b>: tabela progressiva da Portaria MPS/MF nº 13/2026 — 7,5% até
                      R$ 1.621,00; 9% até R$ 2.902,84; 12% até R$ 4.354,27; 14% até o teto de
                      R$ 8.475,55.
                    </p>
                    <p className="mt-1">
                      <b>IRRF</b>: tabela mensal da Receita Federal (Lei 15.191/2025), dedução de
                      R$ 189,59 por dependente ou desconto simplificado de R$ 607,20 (usa-se o mais
                      vantajoso), com o redutor da Lei 15.270/2025 que zera o imposto até
                      R$ 5.000,00 e decresce até R$ 7.350,00.
                    </p>
                    <p className="mt-1">
                      Vale igualmente para motoristas de rodotrem e administrativos — a lei não
                      diferencia por função. Diárias e verbas indenizatórias não entram na base.
                      Apenas colaboradores <b>CLT</b> sofrem retenção.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="h-9 gap-1" onClick={() => calcularAutomatico()}>
                <Calculator className="h-3.5 w-3.5" />
                Calcular para {labelMes(month)}
              </Button>
              {auto && (
                <Button
                  className="h-9 gap-1"
                  disabled={lancandoAuto || totalAuto <= 0}
                  onClick={lancarAutomaticos}
                >
                  {lancandoAuto ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Lançar ({formatBRL(totalAuto)})
                </Button>
              )}
            </div>
          </div>

          {auto && (
            <div className="rounded-md border border-border bg-background overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Colaborador</th>
                    <th className="p-2 text-right">Salário</th>
                    <th className="p-2 w-20 text-center">Depend.</th>
                    <th className="p-2 text-right w-28">INSS</th>
                    <th className="p-2 text-right w-28">IRRF</th>
                    <th className="p-2 text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {auto.map((l) => (
                    <tr key={l.colaborador_id} className="border-t border-border/60">
                      <td className="p-2">
                        <Checkbox
                          checked={l.incluir}
                          disabled={!!l.motivoIsencao}
                          onCheckedChange={(v) =>
                            patchLinha(l.colaborador_id, { incluir: v === true })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium truncate max-w-[220px]">{l.nome}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {l.motivoIsencao ? (
                            <span className="text-amber-600">{l.motivoIsencao}</span>
                          ) : (
                            <>
                              {l.regime.toUpperCase()} · base IR {formatBRL(l.irrfDetalhe.base)} (
                              {l.irrfDetalhe.modelo})
                              {l.jaLancadoInss && " · INSS já lançado"}
                              {l.jaLancadoIrrf && " · IRRF já lançado"}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatBRL(l.salarioBruto)}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-7 text-xs text-center"
                          value={l.depEdit}
                          disabled={!!l.motivoIsencao}
                          onChange={(e) =>
                            recalcLinha(l.colaborador_id, Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-7 text-xs text-right tabular-nums"
                          value={l.jaLancadoInss ? "—" : l.inssEdit}
                          disabled={!!l.motivoIsencao || l.jaLancadoInss}
                          onChange={(e) =>
                            patchLinha(l.colaborador_id, { inssEdit: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-7 text-xs text-right tabular-nums"
                          value={l.jaLancadoIrrf ? "—" : l.irrfEdit}
                          disabled={!!l.motivoIsencao || l.jaLancadoIrrf}
                          onChange={(e) =>
                            patchLinha(l.colaborador_id, { irrfEdit: e.target.value })
                          }
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums font-semibold">
                        {formatBRL(l.liquido)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Os valores são calculados pelas tabelas oficiais vigentes e ficam editáveis para casos
            com variação (afastamento, múltiplos vínculos, pensão alimentícia). Colaboradores PJ,
            freelancer ou sem salário cadastrado ficam de fora automaticamente.
          </p>
        </div>

        <p className="text-[11px] text-muted-foreground">
          <b>Adiantamentos e vales não são lançados aqui.</b> Como representam saída real de caixa,
          devem ser registrados no <b>Contas a Pagar</b> com o plano de contas de adiantamento — o
          wizard da folha já os identifica e abate do líquido, com opção de parcelar o desconto.
        </p>

        <div className="rounded-md border border-border p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-muted/20">

          <div className="md:col-span-4 space-y-1">
            <Label className="text-xs">Colaborador</Label>
            <Select value={colabId} onValueChange={setColabId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ativos.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as DescontoFolhaTipo)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_MANUAIS.map((t) => (
                  <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 space-y-1">
            <Label className="text-xs">Valor (R$)</Label>
            <Input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="h-9" placeholder="0,00" />
          </div>
          <div className="md:col-span-3 space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-9" placeholder="Opcional" />
          </div>
          <div className="md:col-span-1">
            <Button onClick={handleAdd} disabled={saving} className="h-9 w-full gap-1">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{items.length} desconto(s) pendente(s)</span>
          <span className="font-semibold text-foreground">Total: {formatBRL(total)}</span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum desconto pendente para este mês.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {items.map((d) => (
              <Card key={d.id} className="hover:shadow-sm transition-shadow border-rose-200/60">
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate flex-1 min-w-0">
                      {colabName(d.colaborador_id)}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                      {TIPOS.find((t) => t.v === d.tipo)?.label || d.tipo}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {d.descricao || "Sem descrição"}
                  </p>
                  <div className="flex items-center justify-between pt-1.5 border-t border-border/60">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(`${String(d.data_referencia).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold tabular-nums text-rose-600 text-sm">
                        - {formatBRL(Number(d.valor))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => handleDelete(d)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Descontos pendentes serão automaticamente abatidos do líquido na geração da folha do mês correspondente.
        </p>
      </CardContent>
      {ConfirmDialog}
    </Card>
  );
}
