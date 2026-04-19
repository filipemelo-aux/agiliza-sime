import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HandCoins, Wrench, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  calcularComissao,
  createComissao,
  fetchAgregadosColheitaPorMotorista,
  fetchCtesElegiveisComissao,
  type AgregadoColheitaRow,
  type ColaboradorRH,
  type CteElegivel,
} from "@/services/rh";

type TipoComissao = "motorista" | "embarque";
type OperacaoMotorista = "frete" | "colheita";

interface ComissoesTabProps {
  colaboradores: ColaboradorRH[];
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/**
 * Aba de Comissões — RH
 *
 * Tipo "Motorista" + Operação "Frete":
 *   Lista CT-es elegíveis (autorizados na SEFAZ, com motorista colaborador-RH
 *   e sem comissão gerada). O usuário define o % e seleciona quais CT-es
 *   geram comissão. Cálculo: valor_frete * (% / 100).
 *
 * Tipo "Por Embarque": desabilitado ("Em manutenção").
 */
export function ComissoesTab({ colaboradores }: ComissoesTabProps) {
  const [tipo, setTipo] = useState<TipoComissao>("motorista");
  const [operacao, setOperacao] = useState<OperacaoMotorista>("frete");
  const [colaboradorId, setColaboradorId] = useState<string>("");
  const [percentual, setPercentual] = useState<string>("5");

  const [ctes, setCtes] = useState<CteElegivel[]>([]);
  const [loadingCtes, setLoadingCtes] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Colheita
  const [colheitaInicio, setColheitaInicio] = useState<string>("");
  const [colheitaFim, setColheitaFim] = useState<string>("");
  const [agregados, setAgregados] = useState<AgregadoColheitaRow[]>([]);
  const [loadingAgregados, setLoadingAgregados] = useState(false);
  const [agregadosSelecionados, setAgregadosSelecionados] = useState<Set<string>>(new Set());

  // Colaboradores elegíveis conforme o tipo
  const elegiveis = useMemo(() => {
    if (tipo === "motorista") {
      return colaboradores.filter((c) => c.tipo === "motorista" && c.ativo);
    }
    return colaboradores.filter((c) => c.ativo);
  }, [colaboradores, tipo]);

  // Reset seleção se colaborador atual deixar de ser elegível
  useEffect(() => {
    if (colaboradorId && !elegiveis.some((c) => c.id === colaboradorId)) {
      setColaboradorId("");
    }
  }, [elegiveis, colaboradorId]);

  // Carrega CT-es elegíveis quando combo "Motorista + Frete + colaborador" estiver pronto
  useEffect(() => {
    if (tipo !== "motorista" || operacao !== "frete" || !colaboradorId) {
      setCtes([]);
      setSelecionados(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCtes(true);
      try {
        const data = await fetchCtesElegiveisComissao(colaboradorId);
        if (!cancelled) {
          setCtes(data);
          setSelecionados(new Set());
        }
      } catch (err: any) {
        if (!cancelled) toast.error("Erro ao carregar CT-es: " + err.message);
      } finally {
        if (!cancelled) setLoadingCtes(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tipo, operacao, colaboradorId]);

  // Carrega agregados de colheita (Motorista + Colheita + colaborador)
  useEffect(() => {
    if (tipo !== "motorista" || operacao !== "colheita" || !colaboradorId) {
      setAgregados([]);
      setAgregadosSelecionados(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAgregados(true);
      try {
        const data = await fetchAgregadosColheitaPorMotorista(
          colaboradorId,
          colheitaInicio || null,
          colheitaFim || null
        );
        if (!cancelled) {
          setAgregados(data);
          setAgregadosSelecionados(new Set());
        }
      } catch (err: any) {
        if (!cancelled) toast.error("Erro ao carregar colheitas: " + err.message);
      } finally {
        if (!cancelled) setLoadingAgregados(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tipo, operacao, colaboradorId, colheitaInicio, colheitaFim]);

  const pctNum = Math.max(0, Math.min(100, Number(percentual.replace(",", ".")) || 0));
  const ctesSelecionados = ctes.filter((c) => selecionados.has(c.id));
  const totalBase = ctesSelecionados.reduce((s, c) => s + c.valor_frete, 0);
  const totalComissao = ctesSelecionados.reduce(
    (s, c) => s + calcularComissao(c.valor_frete, pctNum),
    0
  );

  const toggle = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selecionados.size === ctes.length) setSelecionados(new Set());
    else setSelecionados(new Set(ctes.map((c) => c.id)));
  };

  const handleGerar = async () => {
    if (ctesSelecionados.length === 0) {
      toast.error("Selecione ao menos um CT-e");
      return;
    }
    if (pctNum <= 0) {
      toast.error("Informe um percentual maior que zero");
      return;
    }
    setSalvando(true);
    try {
      let ok = 0;
      for (const cte of ctesSelecionados) {
        await createComissao({
          colaborador_id: colaboradorId,
          tipo: "motorista",
          origem: "cte",
          referencia_id: cte.id,
          valor_base: cte.valor_frete,
          percentual: pctNum,
          valor_calculado: calcularComissao(cte.valor_frete, pctNum),
          data_referencia: cte.data_emissao || new Date().toISOString().slice(0, 10),
          observacoes: `CT-e ${cte.numero ?? "—"}/${cte.serie}`,
        });
        ok++;
      }
      toast.success(`${ok} comissão(ões) gerada(s) — pendentes para folha`);
      // Recarrega lista (CT-es processados saem da lista)
      const data = await fetchCtesElegiveisComissao(colaboradorId);
      setCtes(data);
      setSelecionados(new Set());
    } catch (err: any) {
      toast.error("Erro ao gerar comissões: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  // === Colheita ===
  const agregadosSel = agregados.filter((a) => agregadosSelecionados.has(a.assignmentId));
  const totalAgregadosBase = agregadosSel.reduce((s, a) => s + a.valorTotal, 0);
  const totalAgregadosComissao = agregadosSel.reduce(
    (s, a) => s + calcularComissao(a.valorTotal, pctNum),
    0
  );
  const toggleAgr = (id: string) =>
    setAgregadosSelecionados((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAgrAll = () => {
    if (agregadosSelecionados.size === agregados.length) setAgregadosSelecionados(new Set());
    else setAgregadosSelecionados(new Set(agregados.map((a) => a.assignmentId)));
  };

  const handleGerarColheita = async () => {
    if (agregadosSel.length === 0) {
      toast.error("Selecione ao menos uma colheita");
      return;
    }
    if (pctNum <= 0) {
      toast.error("Informe um percentual maior que zero");
      return;
    }
    setSalvando(true);
    try {
      let ok = 0;
      for (const a of agregadosSel) {
        await createComissao({
          colaborador_id: colaboradorId,
          tipo: "motorista",
          origem: "colheita",
          referencia_id: a.assignmentId,
          valor_base: a.valorTotal,
          percentual: pctNum,
          valor_calculado: calcularComissao(a.valorTotal, pctNum),
          data_referencia: a.endDate || a.startDate,
          observacoes: `${a.farmName} · ${a.diasTrabalhados} dia(s) × ${formatBRL(a.valorDiaria)}`,
        });
        ok++;
      }
      toast.success(`${ok} comissão(ões) de colheita gerada(s) — pendentes para folha`);
      const data = await fetchAgregadosColheitaPorMotorista(
        colaboradorId,
        colheitaInicio || null,
        colheitaFim || null
      );
      setAgregados(data);
      setAgregadosSelecionados(new Set());
    } catch (err: any) {
      toast.error("Erro ao gerar comissões: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Comissões</h3>
            <p className="text-[11px] text-muted-foreground">
              Gere comissões a partir de CT-es autorizados — ficam pendentes até serem enviadas
              para a folha.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl">
          {/* Tipo de Comissão */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de Comissão</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoComissao)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="motorista">Motorista</SelectItem>
                <SelectItem value="embarque" disabled>
                  <span className="flex items-center gap-2">
                    Por Embarque
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 gap-1 text-muted-foreground"
                    >
                      <Wrench className="h-2.5 w-2.5" /> Em manutenção
                    </Badge>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Operação */}
          <div className="space-y-1.5">
            <Label className="text-xs">Operação</Label>
            <Select
              value={operacao}
              onValueChange={(v) => setOperacao(v as OperacaoMotorista)}
              disabled={tipo !== "motorista"}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frete">Frete (CT-e)</SelectItem>
                <SelectItem value="colheita">Colheita (Diária)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Colaborador */}
          <div className="space-y-1.5">
            <Label className="text-xs">Colaborador</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue
                  placeholder={
                    elegiveis.length === 0
                      ? tipo === "motorista"
                        ? "Nenhum motorista (RH)"
                        : "Nenhum colaborador disponível"
                      : "Selecione um colaborador"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {elegiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Percentual */}
        {tipo === "motorista" && operacao === "frete" && colaboradorId && (
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-end max-w-4xl">
            <div className="space-y-1.5">
              <Label className="text-xs">Percentual (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cálculo: <span className="font-medium">valor do frete × percentual</span>. Comissões
              ficam <Badge variant="outline" className="text-[9px] px-1.5 py-0">pendente</Badge>{" "}
              até serem enviadas para a folha.
            </p>
          </div>
        )}

        {/* Lista de CT-es elegíveis */}
        {tipo === "motorista" && operacao === "frete" && colaboradorId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">CT-es elegíveis</p>
              {ctes.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                  {selecionados.size === ctes.length ? "Limpar" : "Selecionar todos"}
                </Button>
              )}
            </div>

            {loadingCtes ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando CT-es...
              </div>
            ) : ctes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
                Nenhum CT-e elegível para este motorista no momento. Apenas CT-es autorizados pela
                SEFAZ e ainda sem comissão são listados.
              </p>
            ) : (
              <div className="border border-border rounded-md divide-y divide-border max-h-[420px] overflow-auto">
                {ctes.map((c) => {
                  const checked = selecionados.has(c.id);
                  const comissaoCalc = calcularComissao(c.valor_frete, pctNum);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 p-2.5 text-xs cursor-pointer hover:bg-muted/40 ${
                        checked ? "bg-primary/5" : ""
                      }`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} />
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[100px_1fr_auto] gap-2 items-center">
                        <div className="font-mono text-[11px] text-muted-foreground">
                          CT-e {c.numero ?? "—"}/{c.serie}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{c.motorista_nome}</p>
                          <p className="truncate text-[10px] text-muted-foreground">
                            {c.remetente_nome} → {c.destinatario_nome}
                            {c.data_emissao &&
                              ` · ${new Date(c.data_emissao).toLocaleDateString("pt-BR")}`}
                          </p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p className="font-semibold">{formatBRL(c.valor_frete)}</p>
                          <p className="text-[10px] text-primary">
                            Comissão: {formatBRL(comissaoCalc)}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Footer com totais e ação */}
            {selecionados.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-muted/40 border border-border">
                <div className="flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Selecionados:</span>{" "}
                    <span className="font-semibold">{selecionados.size}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Base total:</span>{" "}
                    <span className="font-semibold tabular-nums">{formatBRL(totalBase)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total comissão ({pctNum}%):</span>{" "}
                    <span className="font-semibold text-primary tabular-nums">
                      {formatBRL(totalComissao)}
                    </span>
                  </div>
                </div>
                <Button size="sm" className="h-8 gap-1.5" onClick={handleGerar} disabled={salvando}>
                  {salvando ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Gerar comissões
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
