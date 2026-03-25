import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

const FUEL_TYPES = [
  { value: "diesel", label: "Diesel" },
  { value: "diesel_s10", label: "Diesel S10" },
  { value: "gasolina", label: "Gasolina" },
  { value: "etanol", label: "Etanol" },
  { value: "arla32", label: "Arla 32" },
];

const PAYMENT_MODES = [
  { value: "avista", label: "À Vista" },
  { value: "prazo", label: "A Prazo" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  empresaId: string;
  userId: string;
  fueling?: any | null;
  onSaved: () => void;
}

export function FuelingFormDialog({ open, onOpenChange, empresaId, userId, fueling, onSaved }: Props) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [veiculoId, setVeiculoId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [dataAbastecimento, setDataAbastecimento] = useState(new Date().toISOString().slice(0, 10));
  const [tipoCombustivel, setTipoCombustivel] = useState("diesel");
  const [litros, setLitros] = useState("");
  const [valorLitro, setValorLitro] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [kmAtual, setKmAtual] = useState("");
  const [posto, setPosto] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("prazo");
  const [obs, setObs] = useState("");

  useEffect(() => {
    if (!open) return;
    const loadData = async () => {
      const vRes = await supabase.from("vehicles").select("id, plate, brand, model").eq("is_active", true).eq("fleet_type", "propria");
      const dRes = await supabase.from("profiles").select("id, full_name, role");
      setVehicles(vRes.data || []);
      setDrivers(dRes.data || []);
    };
    loadData();
  }, [open]);

  useEffect(() => {
    if (fueling) {
      setVeiculoId(fueling.veiculo_id || "");
      setMotoristaId(fueling.motorista_id || "");
      setDataAbastecimento(fueling.data_abastecimento || new Date().toISOString().slice(0, 10));
      setTipoCombustivel(fueling.tipo_combustivel || "diesel");
      setLitros(String(fueling.quantidade_litros || ""));
      setValorLitro(String(fueling.valor_por_litro || ""));
      setValorTotal(String(fueling.valor_total || ""));
      setKmAtual(String(fueling.km_atual || ""));
      setPosto(fueling.posto_combustivel || "");
      setFormaPagamento(fueling.forma_pagamento || "prazo");
      setObs(fueling.observacoes || "");
    } else {
      setVeiculoId("");
      setMotoristaId("");
      setDataAbastecimento(new Date().toISOString().slice(0, 10));
      setTipoCombustivel("diesel");
      setLitros("");
      setValorLitro("");
      setValorTotal("");
      setKmAtual("");
      setPosto("");
      setFormaPagamento("prazo");
      setObs("");
    }
  }, [fueling, open]);

  // Auto-calc valor_total
  useEffect(() => {
    const l = parseFloat(litros);
    const v = parseFloat(valorLitro);
    if (!isNaN(l) && !isNaN(v)) {
      setValorTotal((l * v).toFixed(2));
    }
  }, [litros, valorLitro]);

  const handleSave = async () => {
    if (!veiculoId) return toast.error("Selecione um veículo");
    if (!litros || parseFloat(litros) <= 0) return toast.error("Informe a quantidade de litros");

    setSaving(true);
    const payload: any = {
      empresa_id: empresaId,
      veiculo_id: veiculoId,
      motorista_id: motoristaId || null,
      data_abastecimento: dataAbastecimento,
      tipo_combustivel: tipoCombustivel,
      quantidade_litros: parseFloat(litros) || 0,
      valor_por_litro: parseFloat(valorLitro) || 0,
      valor_total: parseFloat(valorTotal) || 0,
      km_atual: kmAtual ? parseFloat(kmAtual) : null,
      posto_combustivel: posto || null,
      forma_pagamento: formaPagamento,
      observacoes: obs || null,
    };

    let error;
    if (fueling?.id) {
      ({ error } = await supabase.from("fuelings").update(payload as any).eq("id", fueling.id));
    } else {
      payload.created_by = userId;
      ({ error } = await supabase.from("fuelings").insert(payload as any));
    }

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(fueling ? "Abastecimento atualizado" : "Abastecimento registrado");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{fueling ? "Editar Abastecimento" : "Novo Abastecimento"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Veículo *</Label>
              <Select value={veiculoId} onValueChange={setVeiculoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.plate} - {v.brand} {v.model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motorista</Label>
              <Select value={motoristaId} onValueChange={setMotoristaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input type="date" value={dataAbastecimento} onChange={e => setDataAbastecimento(e.target.value)} />
            </div>
            <div>
              <Label>Combustível *</Label>
              <Select value={tipoCombustivel} onValueChange={setTipoCombustivel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUEL_TYPES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Litros *</Label>
              <Input value={litros ? maskCurrency(String(Math.round(parseFloat(litros) * 100))) : ""} onChange={e => setLitros(unmaskCurrency(e.target.value))} />
            </div>
            <div>
              <Label>R$/Litro</Label>
              <Input value={valorLitro ? maskCurrency(String(Math.round(parseFloat(valorLitro) * 1000))) : ""} onChange={e => { const nums = e.target.value.replace(/\D/g, ""); setValorLitro(nums ? (parseInt(nums) / 1000).toString() : ""); }} />
            </div>
            <div>
              <Label>Valor Total</Label>
              <Input value={valorTotal ? maskCurrency(String(Math.round(parseFloat(valorTotal) * 100))) : ""} onChange={e => setValorTotal(unmaskCurrency(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>KM Atual</Label>
              <Input type="number" value={kmAtual} onChange={e => setKmAtual(e.target.value)} />
            </div>
            <div>
              <Label>Pagamento</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Posto / Fornecedor</Label>
            <Input value={posto} onChange={e => setPosto(e.target.value)} placeholder="Nome do posto" />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
