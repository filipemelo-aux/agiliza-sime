import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { HandCoins, Percent, Receipt, UserMinus, Wallet } from "lucide-react";
import { ComissoesTab } from "@/components/rh/ComissoesTab";
import { DescontosTab } from "@/components/rh/DescontosTab";
import { toast } from "@/lib/notice";
import { fetchReembolsosPendentes, type ColaboradorRH, type Expense, type ReembolsoExpense } from "@/services/rh";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
const formatDate = (d?: string | null) =>
  d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

type Aba = "comissoes" | "vencimentos" | "reembolsos" | "vales" | "descontos";

interface Props {
  colaborador: ColaboradorRH | null;
  perfil: "motorista" | "administrativo";
  adiantExpenses: Expense[];
  onClose: () => void;
}

/** Janela única de movimentação para o colaborador escolhido na grade. */
export function ColaboradorMovimentacaoDialog({ colaborador, perfil, adiantExpenses, onClose }: Props) {
  const [aba, setAba] = useState<Aba>(perfil === "motorista" ? "comissoes" : "vencimentos");
  const [reembolsos, setReembolsos] = useState<ReembolsoExpense[]>([]);
  const [loadingReemb, setLoadingReemb] = useState(false);

  useEffect(() => {
    setAba(perfil === "motorista" ? "comissoes" : "vencimentos");
    if (!colaborador) return;
    setLoadingReemb(true);
    fetchReembolsosPendentes([colaborador.id])
      .then(setReembolsos)
      .catch((e) => toast.error("Erro ao carregar reembolsos: " + e.message))
      .finally(() => setLoadingReemb(false));
  }, [colaborador?.id, perfil]);

  const lista = useMemo(() => (colaborador ? [colaborador] : []), [colaborador]);
  const vales = useMemo(
    () => adiantExpenses.filter((e: any) => e.favorecido_id === colaborador?.id),
    [adiantExpenses, colaborador?.id]
  );
  const totalReemb = reembolsos.reduce((s, e) => s + Math.max(Number(e.valor_total) - Number(e.valor_pago || 0), 0), 0);
  const totalVales = vales.reduce((s, e: any) => s + Number(e.valor_total || 0), 0);

  const abas = [
    ...(perfil === "motorista"
      ? [{ v: "comissoes" as Aba, label: "Comissões de viagem", icon: Percent }]
      : [{ v: "vencimentos" as Aba, label: "Vencimentos", icon: Wallet }]),
    { v: "reembolsos" as Aba, label: `Reembolsos${reembolsos.length ? ` (${reembolsos.length})` : ""}`, icon: Receipt },
    { v: "vales" as Aba, label: "Vales / Adiantamentos", icon: HandCoins },
    { v: "descontos" as Aba, label: "Descontos", icon: UserMinus },
  ];

  return (
    <Dialog open={!!colaborador} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh]">
        <DialogHeader>
          <DialogTitle>Movimentação — {colaborador?.full_name}</DialogTitle>
          <DialogDescription>
            {perfil === "motorista" ? "Motorista" : (colaborador?.cargo || "Administrativo / Operacional")}
            {colaborador?.salario != null ? ` · Salário base ${formatBRL(Number(colaborador.salario))}` : ""}
            {` · Reembolsos pendentes ${formatBRL(totalReemb)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex flex-wrap items-center gap-0.5 p-0.5 rounded-md bg-muted/60 self-start">
          {abas.map((opt) => {
            const Icon = opt.icon;
            const active = aba === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setAba(opt.v)}
                className={cn(
                  "inline-flex items-center gap-1.5 h-7 px-3 text-xs rounded-sm transition-colors",
                  active ? "bg-background text-foreground shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>

        {aba === "comissoes" && perfil === "motorista" && <ComissoesTab colaboradores={lista} />}

        {aba === "vencimentos" && (
          <Card>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Salário base</span><span className="font-mono">{colaborador?.salario != null ? formatBRL(Number(colaborador.salario)) : "Não informado"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Regime</span><span className="uppercase">{colaborador?.regime || "clt"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">+ Reembolsos pendentes</span><span className="font-mono text-success">{formatBRL(totalReemb)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">− Vales do mês</span><span className="font-mono text-warning">{formatBRL(totalVales)}</span></div>
              <p className="text-[11px] text-muted-foreground pt-2 border-t">
                O salário base entra automaticamente na folha de pagamento. Horas extras, faltas e outros ajustes são lançados em Descontos; reembolsos entram como crédito.
              </p>
            </CardContent>
          </Card>
        )}

        {aba === "reembolsos" && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr><th className="text-left p-2">Despesa</th><th className="text-left p-2 w-28">Competência</th><th className="text-right p-2 w-32">A reembolsar</th></tr>
                </thead>
                <tbody>
                  {loadingReemb && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>}
                  {!loadingReemb && reembolsos.length === 0 && (
                    <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Nenhum reembolso pendente. Marque “Pago pelo colaborador (Reembolso)” ao lançar a despesa.</td></tr>
                  )}
                  {reembolsos.map((e) => (
                    <tr key={e.id} className="border-t border-border/60">
                      <td className="p-2">{e.descricao}</td>
                      <td className="p-2">{formatDate(e.data_competencia || e.data_emissao)}</td>
                      <td className="p-2 text-right font-mono text-success">{formatBRL(Number(e.valor_total) - Number(e.valor_pago || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-muted-foreground p-3 border-t">
                Estes valores entram como crédito na folha. Ao pagar a folha, as despesas originais são quitadas no Contas a Pagar junto com a saída do pagamento.
              </p>
            </CardContent>
          </Card>
        )}

        {aba === "vales" && (
          <div className="space-y-3">
            <Card>
              <CardContent className="p-0">
                <div className="px-3 py-2 text-xs font-medium border-b">Adiantamentos pagos no mês (Contas a Pagar)</div>
                <table className="w-full text-xs">
                  <tbody>
                    {vales.length === 0 && <tr><td className="p-3 text-center text-muted-foreground">Nenhum adiantamento pago neste mês.</td></tr>}
                    {vales.map((e: any) => (
                      <tr key={e.id} className="border-t border-border/60">
                        <td className="p-2">{e.descricao}</td>
                        <td className="p-2 w-28">{formatDate(e.data_emissao)}</td>
                        <td className="p-2 w-32 text-right font-mono text-warning">{formatBRL(Number(e.valor_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
            <p className="text-[11px] text-muted-foreground">Para lançar um novo vale a descontar, use a aba Descontos com o tipo “Vale” ou “Adiantamento”.</p>
          </div>
        )}

        {aba === "descontos" && <DescontosTab colaboradores={lista} />}
      </DialogContent>
    </Dialog>
  );
}
