import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/masks";
import { getLocalDateISO } from "@/lib/date";

interface Fueling {
  id: string;
  posto_combustivel: string | null;
  valor_total: number;
  data_abastecimento: string;
  veiculo_id: string;
  vehicle_plate?: string;
  tipo_combustivel?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedFuelings: Fueling[];
  empresaId: string;
  userId: string;
  onGenerated: () => void;
}

export function GeneratePayablesDialog({ open, onOpenChange, selectedFuelings, empresaId, userId, onGenerated }: Props) {
  const [dueDate, setDueDate] = useState("");
  const [groupMode, setGroupMode] = useState<"single" | "individual">("single");
  const [saving, setSaving] = useState(false);

  const total = selectedFuelings.reduce((s, f) => s + Number(f.valor_total), 0);

  const handleGenerate = async () => {
    if (!dueDate) return toast.error("Informe a data de vencimento");
    setSaving(true);

    try {
      // Resolve accounts by código (gasolina/etanol => Combustível Apoio, diesel => Diesel, arla => Arla 32)
      const { data: allAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, codigo, nome, tipo_operacional")
        .eq("tipo", "despesa")
        .eq("ativo", true);
      const accByCode = new Map<string, any>((allAccounts as any[] || []).map((c: any) => [c.codigo, c]));
      const resolveAccount = (tipo?: string | null) =>
        accByCode.get(fuelAccountCode(tipo)) || accByCode.get(DEFAULT_FUEL_ACCOUNT_CODE) || null;
      const tipoDespesaOf = (acc: any) =>
        acc?.tipo_operacional === "manutencao" ? "manutencao"
          : acc?.tipo_operacional === "combustivel" ? "combustivel" : "outros";

      if (groupMode === "single") {
        // One expense per plano de contas (nunca misturar combustível de apoio com operacional)
        const groups = new Map<string, Fueling[]>();
        selectedFuelings.forEach(f => {
          const code = fuelAccountCode(f.tipo_combustivel);
          groups.set(code, [...(groups.get(code) || []), f]);
        });

        for (const [code, list] of groups) {
          const acc = accByCode.get(code) || null;
          const postos = [...new Set(list.map(f => f.posto_combustivel).filter(Boolean))];
          const descricao = `Abastecimentos - ${postos.join(", ") || "Diversos"} (${list.length} abast.)`;
          const groupTotal = list.reduce((s, f) => s + Number(f.valor_total), 0);

          const { data: expense, error } = await supabase.from("expenses").insert({
            empresa_id: empresaId,
            unidade_id: empresaId,
            created_by: userId,
            descricao,
            tipo_despesa: tipoDespesaOf(acc) as any,
            plano_contas_id: acc?.id || null,
            centro_custo: "frota_propria" as any,
            origem: "abastecimento" as any,
            valor_total: groupTotal,
            data_emissao: getLocalDateISO(),
            data_vencimento: dueDate,
            favorecido_nome: postos[0] || null,
            status: "pendente" as any,
          } as any).select("id").single();

          if (error) throw error;

          await supabase.from("fuelings").update({
            expense_id: expense.id,
            status_faturamento: "faturado",
          } as any).in("id", list.map(f => f.id));
        }

      } else {
        // Create one expense per fueling
        for (const f of selectedFuelings) {
          const descricao = `Abastecimento - ${f.posto_combustivel || "Posto"} - ${format(new Date(f.data_abastecimento + "T12:00:00"), "dd/MM/yyyy")}`;
          const acc = resolveAccount(f.tipo_combustivel);

          const { data: expense, error } = await supabase.from("expenses").insert({
            empresa_id: empresaId,
            unidade_id: empresaId,
            created_by: userId,
            descricao,
            tipo_despesa: tipoDespesaOf(acc) as any,
            plano_contas_id: acc?.id || null,
            centro_custo: "frota_propria" as any,
            origem: "abastecimento" as any,
            valor_total: f.valor_total,
            data_emissao: f.data_abastecimento,
            data_vencimento: dueDate,
            favorecido_nome: f.posto_combustivel || null,
            veiculo_id: f.veiculo_id,
            status: "pendente" as any,
          } as any).select("id").single();

          if (error) throw error;

          await supabase.from("fuelings").update({
            expense_id: expense.id,
            status_faturamento: "faturado",
          } as any).eq("id", f.id);
        }
      }

      toast.success(`${groupMode === "single" ? "Conta a pagar gerada" : `${selectedFuelings.length} contas a pagar geradas`}`);
      onGenerated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar contas");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerar Contas a Pagar</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3 space-y-1.5">
            <p className="text-sm text-muted-foreground">Abastecimentos selecionados: <span className="font-semibold text-foreground">{selectedFuelings.length}</span></p>
            <p className="text-sm text-muted-foreground">Valor total: <span className="font-semibold text-foreground">{formatCurrency(total)}</span></p>
          </div>

          <div>
            <Label>Data de Vencimento *</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          <div>
            <Label className="mb-2 block">Agrupamento</Label>
            <RadioGroup value={groupMode} onValueChange={v => setGroupMode(v as any)} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="font-normal">Título único (agrupar tudo)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="individual" id="individual" />
                <Label htmlFor="individual" className="font-normal">Um título por abastecimento</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={saving}>
              {saving ? "Gerando..." : "Gerar Conta(s)"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
