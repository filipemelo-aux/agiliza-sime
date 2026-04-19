/**
 * FolhasEmAbertoList — Lista de folhas com status `em_aberto` ou `cancelada`.
 *
 * Permite:
 *   - Ver itens de uma folha (drawer/sheet)
 *   - Confirmar (gera as despesas em Contas a Pagar)
 *   - Excluir folha em aberto (sem efeito financeiro)
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Loader2, FileCheck2, Trash2, Eye, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listarFolhas,
  buscarFolhaComItens,
  confirmarFolha,
  excluirFolhaEmAberto,
  type FolhaPagamento,
  type FolhaItem,
} from "@/services/rh";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

interface Props {
  month: string;
  empresaId: string;
  userId: string;
  folhaAccountId?: string;
  onChanged: () => void;
}

export function FolhasEmAbertoList({ month, empresaId, userId, folhaAccountId, onChanged }: Props) {
  const [folhas, setFolhas] = useState<FolhaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<FolhaPagamento | null>(null);
  const [viewItems, setViewItems] = useState<FolhaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const load = async () => {
    setLoading(true);
    try {
      const data = await listarFolhas({ status: "em_aberto", mes: month });
      setFolhas(data);
    } catch (e: any) {
      toast.error("Erro ao carregar folhas: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const openItems = async (f: FolhaPagamento) => {
    setViewing(f);
    setLoadingItems(true);
    try {
      const { itens } = await buscarFolhaComItens(f.id);
      setViewItems(itens);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleConfirm = async (f: FolhaPagamento) => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações.");
      return;
    }
    const ok = await confirm({
      title: "Confirmar folha?",
      description: `Serão criadas despesas em Contas a Pagar para ${formatBRL(Number(f.total_liquido))}. Esta ação não pode ser desfeita por aqui.`,
      confirmLabel: "Confirmar e gerar",
    });
    if (!ok) return;
    setActing(f.id);
    try {
      const r = await confirmarFolha({
        folhaId: f.id,
        empresa_id: empresaId,
        user_id: userId,
        folhaAccountId,
      });
      if (r.fail === 0) toast.success(`Folha confirmada — ${r.ok} pagamento(s) gerado(s).`);
      else toast.warning(`${r.ok} ok, ${r.fail} falha(s)`);
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async (f: FolhaPagamento) => {
    const ok = await confirm({
      title: "Excluir folha em aberto?",
      description: "A folha será removida. Comissões e descontos vinculados voltam para 'pendente'. Nenhum lançamento financeiro será afetado.",
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    setActing(f.id);
    try {
      await excluirFolhaEmAberto(f.id);
      toast.success("Folha excluída.");
      await load();
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando folhas em aberto...
      </CardContent></Card>
    );
  }

  if (folhas.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Nenhuma folha em aberto neste mês. Use <span className="font-medium">Gerar nova folha</span> para iniciar.
          </p>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {folhas.map((f) => (
          <Card key={f.id} className="overflow-hidden">
            {/* Cabeçalho */}
            <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">Folha {f.mes_referencia}</p>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/40">em aberto</Badge>
                <span className="text-[11px] text-muted-foreground">
                  Vence {new Date(f.data_vencimento).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => openItems(f)}>
                  <Eye className="h-3.5 w-3.5" /> Ver itens
                </Button>
                <Button
                  size="sm"
                  className="h-8 gap-1"
                  disabled={acting === f.id || !folhaAccountId}
                  onClick={() => handleConfirm(f)}
                >
                  {acting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
                  Confirmar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                  disabled={acting === f.id}
                  onClick={() => handleDelete(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Blocos visuais separados: Base • Descontos • Comissões • Total */}
            <CardContent className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Bloco
                tom="neutral"
                titulo="Base"
                principal={formatBRL(Number(f.total_base))}
              />
              <Bloco
                tom="negativo"
                titulo="Descontos"
                principal={formatBRL(Number(f.total_adiantamentos) + Number(f.total_descontos))}
                detalhes={[
                  { label: "Adiantamentos", value: formatBRL(Number(f.total_adiantamentos)) },
                  { label: "Outros descontos", value: formatBRL(Number(f.total_descontos)) },
                ]}
              />
              <Bloco
                tom="positivo"
                titulo="Comissões"
                principal={formatBRL(Number(f.total_comissoes))}
              />
              <Bloco
                tom="destaque"
                titulo="Total líquido"
                principal={formatBRL(Number(f.total_liquido))}
              />
            </CardContent>
          </Card>
        ))}
      </div>


      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Folha {viewing?.mes_referencia}</SheetTitle>
            <SheetDescription>
              Itens snapshot. Os pagamentos em Contas a Pagar só serão criados ao confirmar.
            </SheetDescription>
          </SheetHeader>

          {loadingItems ? (
            <div className="py-8 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {viewItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem itens.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {viewItems.map((i) => (
                    <Card key={i.id}>
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-sm font-semibold truncate">{i.colaborador_nome}</p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <div>
                            <span className="text-muted-foreground">Base: </span>
                            <span className="tabular-nums font-medium">{formatBRL(Number(i.salario_base))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">−A: </span>
                            <span className="tabular-nums text-amber-600">{formatBRL(Number(i.adiantamentos))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">−D: </span>
                            <span className="tabular-nums text-rose-600">{formatBRL(Number(i.descontos))}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">+C: </span>
                            <span className="tabular-nums text-emerald-600">{formatBRL(Number(i.comissoes))}</span>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-border flex items-center justify-between">
                          <span className="text-[10px] uppercase text-muted-foreground tracking-wide">Líquido</span>
                          <span className="text-sm font-bold text-primary tabular-nums">
                            {formatBRL(Number(i.liquido))}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {ConfirmDialog}
    </>
  );
}

function Mini({ label, v, c }: { label: string; v: string; c?: string }) {
  return (
    <div className="text-center">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-xs tabular-nums ${c || ""}`}>{v}</div>
    </div>
  );
}

type Tom = "neutral" | "negativo" | "positivo" | "destaque";

function Bloco({
  tom,
  titulo,
  principal,
  detalhes,
}: {
  tom: Tom;
  titulo: string;
  principal: string;
  detalhes?: { label: string; value: string }[];
}) {
  const styles: Record<Tom, { wrap: string; title: string; value: string }> = {
    neutral: {
      wrap: "border-border bg-background",
      title: "text-muted-foreground",
      value: "text-foreground",
    },
    negativo: {
      wrap: "border-rose-200 bg-rose-50/60",
      title: "text-rose-700",
      value: "text-rose-700",
    },
    positivo: {
      wrap: "border-emerald-200 bg-emerald-50/60",
      title: "text-emerald-700",
      value: "text-emerald-700",
    },
    destaque: {
      wrap: "border-primary/40 bg-primary/5 ring-1 ring-primary/20",
      title: "text-primary",
      value: "text-primary font-bold",
    },
  };
  const s = styles[tom];
  return (
    <div className={`rounded-md border p-2.5 ${s.wrap}`}>
      <div className={`text-[9px] uppercase tracking-wide font-semibold ${s.title}`}>{titulo}</div>
      <div className={`text-sm tabular-nums mt-0.5 ${s.value}`}>{principal}</div>
      {detalhes && detalhes.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {detalhes.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="truncate">{d.label}</span>
              <span className="tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
