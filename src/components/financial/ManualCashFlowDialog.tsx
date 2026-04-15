import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowDownCircle, ArrowUpCircle, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import { cn } from "@/lib/utils";

interface ManualCashFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  initialValues?: { valor?: string; data?: Date; tipo?: "entrada" | "saida"; descricao?: string } | null;
}

export function ManualCashFlowDialog({ open, onOpenChange, onSaved, initialValues }: ManualCashFlowDialogProps) {
  const [tipo, setTipo] = useState<"entrada" | "saida">(initialValues?.tipo || "entrada");
  const [valor, setValor] = useState(initialValues?.valor || "");
  const [data, setData] = useState<Date>(initialValues?.data || new Date());
  const [descricao, setDescricao] = useState(initialValues?.descricao || "");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTipo("entrada");
    setValor("");
    setData(new Date());
    setDescricao("");
  };

  // Apply initialValues when dialog opens
  useEffect(() => {
    if (open && initialValues) {
      if (initialValues.tipo) setTipo(initialValues.tipo);
      if (initialValues.valor) setValor(initialValues.valor);
      if (initialValues.data) setData(initialValues.data);
      if (initialValues.descricao) setDescricao(initialValues.descricao);
    }
  }, [open]);

  const handleSave = async () => {
    const valorNum = Number(unmaskCurrency(valor));
    if (!valorNum || valorNum <= 0) { toast.error("Informe um valor válido"); return; }
    if (!descricao.trim()) { toast.error("Informe uma descrição"); return; }

    setSaving(true);
    const { error } = await supabase.from("movimentacoes_bancarias").insert({
      tipo,
      origem: "manual",
      origem_id: crypto.randomUUID(),
      valor: valorNum,
      data_movimentacao: format(data, "yyyy-MM-dd"),
      descricao: descricao.trim(),
    });

    if (error) {
      toast.error("Erro ao salvar movimentação");
      console.error(error);
    } else {
      toast.success("Movimentação registrada com sucesso");
      reset();
      onOpenChange(false);
      onSaved();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Movimentação Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Tipo - toggle buttons */}
          <div>
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button
                type="button"
                variant={tipo === "entrada" ? "default" : "outline"}
                size="sm"
                className={cn("gap-1.5", tipo === "entrada" && "bg-green-600 hover:bg-green-700")}
                onClick={() => setTipo("entrada")}
              >
                <ArrowUpCircle className="h-4 w-4" /> Entrada
              </Button>
              <Button
                type="button"
                variant={tipo === "saida" ? "destructive" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setTipo("saida")}
              >
                <ArrowDownCircle className="h-4 w-4" /> Saída
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
            <Input
              placeholder="0,00"
              className="h-9"
              value={valor}
              onChange={(e) => setValor(maskCurrency(e.target.value))}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Data</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal h-9">
                  <CalendarIcon className="mr-2 h-3 w-3" />
                  {format(data, "dd/MM/yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={data}
                  onSelect={(d) => d && setData(d)}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Descrição</Label>
            <Textarea
              placeholder="Ex: Transferência entre contas, aporte de capital..."
              className="min-h-[70px] text-sm"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
