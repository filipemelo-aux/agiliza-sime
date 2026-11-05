import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/notice";
import type { AcertoPeriod } from "@/lib/rhAcertoPeriod";
import {
  calcularDescontosLegais, createDescontosFolhaBatch, fetchDescontosPendentesNoPeriodo,
  type ColaboradorRH, type DescontoFolha, type MovMotorista, type NovoDescontoFolha,
} from "@/services/rh";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
interface Props {
  colaborador: ColaboradorRH;
  periodo: AcertoPeriod;
  disponiveis: MovMotorista[];
  onAdicionar: (movimentos: MovMotorista[]) => Promise<void>;
}

/** Calculation is a preview; only the selected taxes are persisted on add. */
export function DescontosMotoristaPicker({ colaborador, periodo, disponiveis, onAdicionar }: Props) {
  const [existentes, setExistentes] = useState<DescontoFolha[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<MovMotorista[]>([]);
  const [dependentes, setDependentes] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSelected(new Set());
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
    ...[...disponiveis.filter((d) => d.natureza === "desconto"), ...saved.filter((d) => !disponiveis.some((m) => m.id === d.id))].map((mov) => ({ id: mov.id, descricao: mov.descricao, valor: mov.saida, mov, novo: undefined as NovoDescontoFolha | undefined })),
    ...novos.map((novo) => ({ id: `novo-${novo.tipo}`, descricao: novo.tipo.toUpperCase(), valor: novo.valor, mov: undefined as MovMotorista | undefined, novo })),
  ];
  const escolhidos = opcoes.filter((d) => selected.has(d.id));
  const adicionar = async () => {
    if (busy || loading || error || !escolhidos.length) return;
    setBusy(true);
    try {
      const criados = await createDescontosFolhaBatch(escolhidos.flatMap((d) => d.novo ? [d.novo] : []));
      // Retain saved sources if linking fails, avoiding a second creation on retry.
      setExistentes((prev) => [...prev, ...criados]);
      const movimentos = [
        ...escolhidos.flatMap((d) => d.mov ? [d.mov] : []),
        ...criados.map((d): MovMotorista => ({ id: `d-${d.id}`, origemId: d.id, origemTipo: "desconto", natureza: "desconto",
          data: d.data_referencia, descricao: `${d.tipo.toUpperCase()} · ${d.descricao || ""}`, entrada: 0, saida: Number(d.valor), removivel: true })),
      ];
      setSaved((prev) => [...prev, ...movimentos.filter((m) => !prev.some((d) => d.id === m.id))]);
      setSelected(new Set(movimentos.map((m) => m.id)));
      await onAdicionar(movimentos);
    } catch (e: any) {
      toast.error("Erro ao adicionar descontos: " + e.message);
    } finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap items-end gap-4 text-xs">
      <span>Salário base: <strong>{brl(calculo.salarioBruto)}</strong></span>
      <div className="space-y-1"><Label htmlFor="dependentes-descontos" className="text-xs">Dependentes</Label>
        <Input id="dependentes-descontos" type="number" min={0} step={1} value={dependentes} disabled={busy || loading}
          className="h-7 w-20 text-xs" onChange={(e) => setDependentes(Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></div>
    </div>
    {loading ? <p className="text-xs text-muted-foreground">Calculando descontos...</p> : error ?
      <p className="text-xs text-destructive">Não foi possível carregar os descontos.</p> :
      <div className="divide-y rounded-md border">
        {opcoes.map((d) => <label key={d.id} className="flex cursor-pointer items-center gap-3 p-3 text-xs">
          <Checkbox aria-label={d.descricao} checked={selected.has(d.id)} disabled={busy} onCheckedChange={(v) => setSelected((prev) => {
            const next = new Set(prev); if (v === true) next.add(d.id); else next.delete(d.id); return next;
          })} />
          <span className="min-w-0 flex-1 break-words">{d.descricao}</span><span className="shrink-0 font-mono text-destructive">{brl(d.valor)}</span>
        </label>)}
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