import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2 } from "lucide-react";
import { DescontoLinhaRapida } from "./DescontoLinhaRapida";
import { dataOriginalDesconto, descricaoDesconto, parcelasDesconto, DESCONTO_LABELS, type PlanoDesconto } from "@/lib/rh/descontoParcelas";
import { formatDateBR } from "@/lib/date";
import { formatCurrency } from "@/lib/masks";
import { toast } from "@/lib/notice";
import type { AcertoPeriod } from "@/lib/rhAcertoPeriod";
import {
  calcularDescontosLegais, createDescontosFolhaBatch, fetchDescontosPendentesNoPeriodo, criarPlanosDescontoAcerto,
  type ColaboradorRH, type DescontoFolha, type MovMotorista, type NovoDescontoFolha,
} from "@/services/rh";

const brl = formatCurrency;
interface Props {
  colaborador: ColaboradorRH;
  periodo: AcertoPeriod;
  disponiveis: MovMotorista[];
  onAdicionar: (movimentos: MovMotorista[]) => Promise<void>;
  mensal?: boolean;
}

/** Calculation is a preview; only the selected taxes are persisted on add. */
export function DescontosMotoristaPicker({ colaborador, periodo, disponiveis, onAdicionar, mensal = colaborador.tipo !== "motorista" }: Props) {
  const [existentes, setExistentes] = useState<DescontoFolha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<MovMotorista[]>([]);
  const [dependentes, setDependentes] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planos, setPlanos] = useState<PlanoDesconto[]>([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(new Set());
    setPlanos([]); setSaved([]);
    fetchDescontosPendentesNoPeriodo([colaborador.id], periodo.inicio, periodo.fim)
      .then((data) => { if (active) { setExistentes(data); setError(false); } })
      .catch((e) => { if (active) { setError(true); toast.error("Erro ao calcular descontos: " + e.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [colaborador.id, periodo.inicio, periodo.fim]);

  const calculo = useMemo(() => calcularDescontosLegais({
    colaborador_id: colaborador.id, nome: colaborador.full_name,
    salarioBruto: colaborador.salario, regime: colaborador.regime, dependentes,
  }), [colaborador, dependentes]);
  const novos: NovoDescontoFolha[] = (["inss", "irrf"] as const)
    .filter((tipo) => calculo[tipo] > 0 && !existentes.some((d) => d.tipo === tipo))
    .map((tipo) => ({ colaborador_id: colaborador.id, tipo, valor: calculo[tipo],
      data_referencia: periodo.inicio,
      descricao: `${tipo.toUpperCase()} automático — salário base ${brl(calculo.salarioBruto)}`,
    }));
  const opcoes = [
    ...[...disponiveis.filter((d) => d.natureza === "desconto"), ...saved.filter((d) => !disponiveis.some((m) => m.id === d.id))].map((mov) => ({ id: mov.id, descricao: mov.descricao, valor: mov.saida, mov, novo: undefined as NovoDescontoFolha | undefined, plano: undefined as PlanoDesconto | undefined })),
    ...novos.map((novo) => ({ id: `novo-${novo.tipo}`, descricao: novo.tipo.toUpperCase(), valor: novo.valor, mov: undefined as MovMotorista | undefined, novo, plano: undefined as PlanoDesconto | undefined })),
    ...planos.map((plano) => ({ id: plano.id, descricao: `${DESCONTO_LABELS[plano.tipo]} · ${plano.descricao}${plano.parcelas > 1 ? ` — parcela 1/${plano.parcelas}` : ""}`, valor: parcelasDesconto(plano, periodo, mensal)[0].valor, mov: undefined as MovMotorista | undefined, novo: undefined as NovoDescontoFolha | undefined, plano })),
  ];
  const escolhidos = opcoes.filter((d) => selected.has(d.id));
  const adicionar = async () => {
    if (busy || loading || error || !escolhidos.length) return;
    setBusy(true);
    try {
      const planosSelecionados = escolhidos.flatMap((d) => d.plano ? [d.plano] : []);
      const primeiras = await criarPlanosDescontoAcerto(colaborador.id, periodo, planosSelecionados);
      const toMov = (d: DescontoFolha): MovMotorista => ({ id: `d-${d.id}`, origemId: d.id, origemTipo: "desconto", natureza: "desconto",
        data: dataOriginalDesconto(d), descricao: descricaoDesconto(d), entrada: 0, saida: Number(d.valor), removivel: true });
      // Save completed plans before creating taxes, retaining them even if the next call fails.
      setPlanos((prev) => prev.filter((p) => !planosSelecionados.some((s) => s.id === p.id)));
      setExistentes((prev) => [...prev, ...primeiras]);
      setSaved((prev) => [...prev, ...primeiras.map(toMov)]);
      setSelected((prev) => { const next = new Set(prev); planosSelecionados.forEach((p) => next.delete(p.id)); primeiras.forEach((p) => next.add(`d-${p.id}`)); return next; });
      const criados = await createDescontosFolhaBatch(escolhidos.flatMap((d) => d.novo ? [d.novo] : []));
      // Retain saved sources if linking fails, avoiding a second creation on retry.
      setExistentes((prev) => [...prev, ...criados]);
      const movimentos = [
        ...escolhidos.flatMap((d) => d.mov ? [d.mov] : []),
        ...primeiras.map(toMov), ...criados.map(toMov),
      ];
      setSaved((prev) => [...prev, ...movimentos.filter((m) => !prev.some((d) => d.id === m.id))]);
      setSelected(new Set(movimentos.map((m) => m.id)));
      await onAdicionar(movimentos);
    } catch (e: any) {
      toast.error("Erro ao adicionar descontos: " + e.message);
    } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <h3 className="text-xs font-semibold">Cálculo de folha</h3>
    <div className="flex flex-wrap items-end gap-4 text-xs">
      <span>Salário base: <strong>{brl(calculo.salarioBruto)}</strong></span>
      <div className="space-y-1"><Label htmlFor="dependentes-descontos" className="text-xs">Dependentes</Label>
        <Input id="dependentes-descontos" type="number" min={0} step={1} value={dependentes} disabled={busy || loading}
          className="h-7 w-20 text-xs" onChange={(e) => setDependentes(Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></div>
    </div>
    <DescontoLinhaRapida periodo={periodo} mensal={mensal} disabled={busy || loading || error} onIncluir={(plano) => {
      setPlanos((prev) => [...prev, plano]); setSelected((prev) => new Set([...prev, plano.id]));
    }} />
    <h3 className="text-xs font-semibold">Descontos disponíveis</h3>
    {loading ? <p className="text-xs text-muted-foreground">Calculando descontos...</p> : error ?
      <p className="text-xs text-destructive">Não foi possível carregar os descontos.</p> :
      <div className="divide-y rounded-md border">
        {opcoes.map((d) => <div key={d.id} className="flex items-center gap-2 pr-2"><label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-3 text-xs">
          <Checkbox aria-label={d.descricao} checked={selected.has(d.id)} disabled={busy} onCheckedChange={(v) => setSelected((prev) => {
            const next = new Set(prev); if (v === true) next.add(d.id); else next.delete(d.id); return next;
          })} />
          {d.mov && <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatDateBR(d.mov.data)}</span>}
          <span className="min-w-0 flex-1 break-words">{d.descricao}</span><span className="shrink-0 font-mono text-destructive">{brl(d.valor)}</span>
        </label>{d.plano && <Button variant="ghost" size="icon" aria-label={`Remover ${d.plano.descricao}`} title="Remover desconto da seleção" disabled={busy} onClick={() => {
          setPlanos((prev) => prev.filter((p) => p.id !== d.id)); setSelected((prev) => { const n = new Set(prev); n.delete(d.id); return n; });
        }}><Trash2 className="h-4 w-4" /></Button>}</div>)}
        {!opcoes.length && <p className="p-3 text-xs text-muted-foreground">{calculo.motivoIsencao || "Nenhum desconto disponível neste período."}</p>}
      </div>}
    <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
      <span>Total selecionado: <strong>{brl(escolhidos.reduce((s, d) => s + d.valor, 0))}</strong></span>
      <Button disabled={busy || loading || error || !escolhidos.length} onClick={adicionar}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Adicionar à movimentação ({escolhidos.length})
      </Button>
    </div>
  </div>;
}