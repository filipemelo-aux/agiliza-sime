import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, Loader2, Trash2, Truck, Sprout, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { MonthPicker } from "@/components/MonthPicker";
import {
  fetchComissoes,
  deleteComissao,
  type ColaboradorRH,
  type Comissao,
  type ComissaoStatus,
} from "@/services/rh";

interface HistoricoComissoesTabProps {
  colaboradores: ColaboradorRH[];
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const ini = new Date(y, m - 1, 1);
  const fim = new Date(y, m, 0); // último dia do mês
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ini: fmt(ini), fim: fmt(fim) };
};

export function HistoricoComissoesTab({ colaboradores }: HistoricoComissoesTabProps) {
  const [colaboradorId, setColaboradorId] = useState<string>("all");
  const [status, setStatus] = useState<"all" | ComissaoStatus>("all");
  const [periodMode, setPeriodMode] = useState<"mes" | "custom">("mes");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const colabMap = useMemo(() => {
    const m = new Map<string, string>();
    colaboradores.forEach((c) => m.set(c.id, c.full_name));
    return m;
  }, [colaboradores]);

  const carregar = async () => {
    setLoading(true);
    try {
      let ini: string | undefined;
      let fim: string | undefined;
      if (periodMode === "mes") {
        const b = monthBounds(month);
        ini = b.ini;
        fim = b.fim;
      } else {
        ini = dataInicio || undefined;
        fim = dataFim || undefined;
      }
      const data = await fetchComissoes({
        colaboradorId: colaboradorId !== "all" ? colaboradorId : undefined,
        status: status !== "all" ? status : undefined,
        dataInicio: ini,
        dataFim: fim,
      });
      setComissoes(data);
    } catch (err: any) {
      toast.error("Erro ao carregar histórico: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradorId, status, periodMode, month, dataInicio, dataFim]);

  const totais = useMemo(() => {
    const totalBase = comissoes.reduce((s, c) => s + Number(c.valor_base || 0), 0);
    const totalComissao = comissoes.reduce((s, c) => s + Number(c.valor_calculado || 0), 0);
    return { totalBase, totalComissao };
  }, [comissoes]);

  const handleRemover = async (c: Comissao) => {
    if (c.status === "enviado_folha") {
      toast.error("Comissões enviadas para a folha não podem ser removidas");
      return;
    }
    const ok = await confirm({
      title: "Remover comissão",
      description: `Deseja remover a comissão de ${formatBRL(Number(c.valor_calculado))} de ${
        colabMap.get(c.colaborador_id) || "—"
      }?\n\nO item voltará a ficar elegível para nova geração.`,
      confirmLabel: "Remover",
      variant: "destructive",
    });
    if (!ok) return;
    setRemovendo(c.id);
    try {
      await deleteComissao(c.id);
      toast.success("Comissão removida");
      setComissoes((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err: any) {
      toast.error("Erro ao remover: " + err.message);
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Histórico de comissões</h3>
            <p className="text-[11px] text-muted-foreground">
              Acompanhe todas as comissões geradas e seu status na folha.
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Colaborador</Label>
            <Select value={colaboradorId} onValueChange={setColaboradorId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {colaboradores.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="enviado_folha">Enviado para folha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as any)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Mês a mês</SelectItem>
                <SelectItem value="custom">Intervalo personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodMode === "mes" ? (
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Mês
              </Label>
              <MonthPicker value={month} onChange={setMonth} className="h-9 text-xs" />
            </div>
          ) : (
            <div className="space-y-1.5 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">De</Label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-9 text-xs w-full rounded-md border border-input bg-background px-2"
                />
              </div>
              <div>
                <Label className="text-xs">Até</Label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-9 text-xs w-full rounded-md border border-input bg-background px-2"
                />
              </div>
            </div>
          )}
        </div>

        {/* Lista em cards responsivos */}
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
          </div>
        ) : comissoes.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
            Nenhuma comissão encontrada com os filtros atuais.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {comissoes.map((c) => {
                const isCte = c.origem === "cte";
                const isPendente = c.status === "pendente";
                return (
                  <Card key={c.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="shrink-0 h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                          {isCte ? (
                            <Truck className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Sprout className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {colabMap.get(c.colaborador_id) || "—"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {c.observacoes ||
                              `${isCte ? "CT-e" : "Colheita"} · ${c.referencia_id.slice(0, 8)}`}
                          </p>
                        </div>
                        <Badge
                          variant={isPendente ? "outline" : "secondary"}
                          className="text-[9px] px-1.5 py-0 shrink-0"
                        >
                          {isPendente ? "pendente" : "enviado folha"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-border/60">
                        <div>
                          <p className="text-[9px] uppercase text-muted-foreground tracking-wide">Base</p>
                          <p className="text-xs font-medium tabular-nums truncate">
                            {formatBRL(Number(c.valor_base))}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] uppercase text-muted-foreground tracking-wide">
                            Comissão{c.percentual ? ` (${c.percentual}%)` : ""}
                          </p>
                          <p className="text-xs font-semibold text-primary tabular-nums truncate">
                            {formatBRL(Number(c.valor_calculado))}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(c.data_referencia).toLocaleDateString("pt-BR")}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={!isPendente || removendo === c.id}
                          title={
                            isPendente
                              ? "Remover comissão"
                              : "Comissão já enviada à folha — não pode ser removida"
                          }
                          onClick={() => handleRemover(c)}
                        >
                          {removendo === c.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5 text-destructive mr-1" />
                              <span className="text-destructive">Remover</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-muted/40 border border-border">
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Registros:</span>{" "}
                  <span className="font-semibold">{comissoes.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Base total:</span>{" "}
                  <span className="font-semibold tabular-nums">{formatBRL(totais.totalBase)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Comissões:</span>{" "}
                  <span className="font-semibold text-primary tabular-nums">
                    {formatBRL(totais.totalComissao)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {ConfirmDialog}
      </CardContent>
    </Card>
  );
}
