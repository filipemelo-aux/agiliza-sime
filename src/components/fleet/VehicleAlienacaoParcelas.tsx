import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlanoContasCombobox, PlanoContaOption } from "@/components/financial/PlanoContasCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { maskCurrency, unmaskCurrency, formatCurrency } from "@/lib/masks";
import { formatDateBR } from "@/lib/date";

export type StatusParcelaAlienacao = "Pendente" | "Pago" | "Atrasado";

interface Parcela {
  id: string;
  veiculo_id: string;
  numero_parcela: number;
  total_parcelas: number;
  valor_parcela: number;
  data_vencimento: string;
  status_pagamento: StatusParcelaAlienacao;
  expense_id: string | null;
}

function statusClass(s: StatusParcelaAlienacao) {
  switch (s) {
    case "Pago":
      return "bg-success/15 text-success border-success/30";
    case "Atrasado":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

/** Soma meses preservando o dia (com clamp para meses curtos). */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  return `${base.getFullYear()}-${mm}-${String(day).padStart(2, "0")}`;
}

interface Props {
  vehicleId: string | null | undefined;
  vehiclePlate?: string | null;
  tipoAlienacao?: string | null;
  instituicaoFinanceiraId?: string | null;
  instituicaoFinanceiraNome?: string | null;
  readOnly?: boolean;
}

export function VehicleAlienacaoParcelas({
  vehicleId,
  vehiclePlate,
  tipoAlienacao,
  instituicaoFinanceiraId,
  instituicaoFinanceiraNome,
  readOnly = false,
}: Props) {
  const { toast } = useToast();
  const { matrizId } = useUnifiedCompany();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planoOptions, setPlanoOptions] = useState<PlanoContaOption[]>([]);
  const [form, setForm] = useState({
    valor: "",
    quantidade: "60",
    primeiroVencimento: "",
    planoContasId: "",
  });

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("veiculo_alienacao_parcelas" as any)
      .select("*")
      .eq("veiculo_id", vehicleId)
      .order("numero_parcela", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar parcelas", description: error.message, variant: "destructive" });
    } else {
      setParcelas((data as unknown as Parcela[]) || []);
    }
    setLoading(false);
  }, [vehicleId, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase
      .from("chart_of_accounts")
      .select("id, codigo, nome, tipo, conta_pai_id")
      .eq("ativo", true)
      .then(({ data }) => setPlanoOptions(((data as any[]) || []) as PlanoContaOption[]));
  }, []);

  const totalFinanciado = parcelas.reduce((s, p) => s + Number(p.valor_parcela || 0), 0);
  const valorPago = parcelas.filter(p => p.status_pagamento === "Pago").reduce((s, p) => s + Number(p.valor_parcela || 0), 0);
  const saldoDevedor = totalFinanciado - valorPago;

  const openGerador = () => {
    setForm({ valor: "", quantidade: "60", primeiroVencimento: "", planoContasId: "" });
    setOpen(true);
  };

  const handleGerar = async () => {
    if (!vehicleId) return;
    const valor = Number(unmaskCurrency(form.valor)) || 0;
    const qtd = Number(form.quantidade) || 0;
    if (valor <= 0) return toast({ title: "Informe o valor da parcela", variant: "destructive" });
    if (qtd < 1 || qtd > 240) return toast({ title: "Quantidade de parcelas inválida (1 a 240)", variant: "destructive" });
    if (!form.primeiroVencimento) return toast({ title: "Informe a data do 1º vencimento", variant: "destructive" });
    if (!matrizId) return toast({ title: "Empresa não identificada", variant: "destructive" });

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const hoje = new Date().toISOString().slice(0, 10);
      const rotulo = tipoAlienacao || "Financiamento";
      const placa = vehiclePlate ? ` ${vehiclePlate}` : "";

      const expensesPayload = Array.from({ length: qtd }, (_, i) => ({
        empresa_id: matrizId,
        descricao: `${rotulo}${placa} - Parcela ${i + 1}/${qtd}`,
        tipo_despesa: "outros",
        centro_custo: "administrativo",
        plano_contas_id: form.planoContasId || null,
        valor_total: valor,
        data_emissao: hoje,
        data_vencimento: addMonths(form.primeiroVencimento, i),
        data_competencia: addMonths(form.primeiroVencimento, i),
        status: "pendente",
        favorecido_id: instituicaoFinanceiraId || null,
        favorecido_nome: instituicaoFinanceiraNome || null,
        veiculo_id: vehicleId,
        veiculo_placa: vehiclePlate || null,
        origem: "manual",
        created_by: user?.id ?? null,
      }));

      const { data: exps, error: expErr } = await supabase
        .from("expenses")
        .insert(expensesPayload as any)
        .select("id, data_vencimento");
      if (expErr) throw expErr;

      const created = (exps as any[]) || [];
      const parcelasPayload = created.map((e, i) => ({
        veiculo_id: vehicleId,
        numero_parcela: i + 1,
        total_parcelas: qtd,
        valor_parcela: valor,
        data_vencimento: addMonths(form.primeiroVencimento, i),
        status_pagamento: addMonths(form.primeiroVencimento, i) < hoje ? "Atrasado" : "Pendente",
        expense_id: e.id,
        created_by: user?.id ?? null,
      }));

      const { error: parcErr } = await supabase
        .from("veiculo_alienacao_parcelas" as any)
        .insert(parcelasPayload as any);
      if (parcErr) throw parcErr;

      toast({ title: `${qtd} parcela(s) gerada(s)`, description: "Lançamentos criados no Contas a Pagar." });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao gerar parcelamento", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Parcela) => {
    const ok = await confirm({
      title: "Excluir parcela",
      description: `Excluir a parcela ${p.numero_parcela}/${p.total_parcelas}? O lançamento vinculado no Contas a Pagar também será removido, se ainda estiver em aberto.`,
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.from("veiculo_alienacao_parcelas" as any).delete().eq("id", p.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    if (p.expense_id && p.status_pagamento !== "Pago") {
      await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).eq("id", p.expense_id);
    }
    load();
  };

  const handleLimpar = async () => {
    const ok = await confirm({
      title: "Excluir parcelamento",
      description: "Remover todas as parcelas em aberto deste veículo e seus lançamentos no Contas a Pagar? Parcelas já pagas serão mantidas.",
      variant: "destructive",
    });
    if (!ok || !vehicleId) return;
    const abertas = parcelas.filter(p => p.status_pagamento !== "Pago");
    const expenseIds = abertas.map(p => p.expense_id).filter(Boolean) as string[];
    await supabase.from("veiculo_alienacao_parcelas" as any).delete().in("id", abertas.map(p => p.id));
    if (expenseIds.length) {
      await supabase.from("expenses").update({ deleted_at: new Date().toISOString() } as any).in("id", expenseIds);
    }
    toast({ title: "Parcelamento removido" });
    load();
  };

  if (!vehicleId) {
    return (
      <p className="text-xs text-muted-foreground italic py-4 text-center">
        Salve o veículo para gerar o parcelamento da alienação.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-2 border-t">
      {ConfirmDialog}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-semibold">Painel de Amortização</h4>
        {!readOnly && (
          <div className="flex gap-2">
            {parcelas.length > 0 && (
              <Button size="sm" variant="outline" className="h-8" onClick={handleLimpar}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
            <Button size="sm" className="h-8" onClick={openGerador}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Gerar Parcelamento
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Total Financiado</p>
          <p className="text-sm font-bold">{formatCurrency(totalFinanciado)}</p>
        </div>
        <div className="rounded border p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Valor Pago</p>
          <p className="text-sm font-bold text-success">{formatCurrency(valorPago)}</p>
        </div>
        <div className="rounded border p-2">
          <p className="text-[10px] uppercase text-muted-foreground">Saldo Devedor</p>
          <p className="text-sm font-bold text-destructive">{formatCurrency(saldoDevedor)}</p>
        </div>
      </div>

      <div className="rounded border overflow-x-auto max-h-[260px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left p-2">Parcela</th>
              <th className="text-right p-2">Valor</th>
              <th className="text-left p-2">Vencimento</th>
              <th className="text-left p-2">Situação</th>
              {!readOnly && <th className="text-right p-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Carregando...</td></tr>
            ) : parcelas.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-muted-foreground italic">Nenhuma parcela gerada.</td></tr>
            ) : parcelas.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2 font-medium">
                  <span className="inline-flex items-center gap-1">
                    {p.numero_parcela}/{p.total_parcelas}
                    {p.expense_id && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild><Link2 className="h-3.5 w-3.5 text-primary" /></TooltipTrigger>
                          <TooltipContent>Vinculado ao Contas a Pagar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </span>
                </td>
                <td className="p-2 text-right font-mono">{formatCurrency(Number(p.valor_parcela))}</td>
                <td className="p-2">{formatDateBR(p.data_vencimento)}</td>
                <td className="p-2">
                  <Badge variant="outline" className={statusClass(p.status_pagamento)}>{p.status_pagamento}</Badge>
                </td>
                {!readOnly && (
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Parcelamento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor da Parcela *</Label>
              <Input
                className="h-9"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm(p => ({ ...p, valor: maskCurrency(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Quantidade de Parcelas *</Label>
              <Input
                className="h-9"
                inputMode="numeric"
                value={form.quantidade}
                onChange={(e) => setForm(p => ({ ...p, quantidade: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Data do 1º Vencimento *</Label>
              <Input
                type="date"
                className="h-9"
                value={form.primeiroVencimento}
                onChange={(e) => setForm(p => ({ ...p, primeiroVencimento: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Plano de Contas (opcional)</Label>
              <PlanoContasCombobox
                value={form.planoContasId}
                onChange={(v) => setForm(p => ({ ...p, planoContasId: v }))}
                options={planoOptions}
                size="sm"
              />
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Serão criadas {Number(form.quantidade) || 0} despesas no Contas a Pagar
              {instituicaoFinanceiraNome ? ` para ${instituicaoFinanceiraNome}` : ""}, com vencimento mensal
              {form.valor ? ` — total ${formatCurrency((Number(unmaskCurrency(form.valor)) || 0) * (Number(form.quantidade) || 0))}` : ""}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleGerar} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {saving ? "Gerando..." : "Gerar Parcelas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
