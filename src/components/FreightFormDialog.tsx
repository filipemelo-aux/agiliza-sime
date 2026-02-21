import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";
import type { Database } from "@/integrations/supabase/types";

type VehicleType = Database["public"]["Enums"]["vehicle_type"];

interface Freight {
  id: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  cargo_type: string;
  weight_kg: number;
  value_brl: number;
  distance_km: number | null;
  pickup_date: string;
  delivery_date: string | null;
  company_name: string;
  required_vehicle_type: string | null;
  description: string | null;
}

interface FreightFormDialogProps {
  open: boolean;
  onClose: () => void;
  freight: Freight | null;
  onSuccess: () => void;
}

const vehicleTypes = [
  { value: "truck", label: "Truck" },
  { value: "bitruck", label: "Bitruck" },
  { value: "carreta", label: "Carreta" },
  { value: "carreta_ls", label: "Carreta LS" },
  { value: "rodotrem", label: "Rodotrem" },
  { value: "bitrem", label: "Bitrem" },
  { value: "treminhao", label: "Treminhão" },
];

const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const initialFormData = {
  origin_city: "",
  origin_state: "",
  destination_city: "",
  destination_state: "",
  cargo_type: "",
  weight_kg: "",
  value_brl: "",
  distance_km: "",
  pickup_date: "",
  delivery_date: "",
  company_name: "",
  required_vehicle_type: "",
  description: "",
};

export function FreightFormDialog({ open, onClose, freight, onSuccess }: FreightFormDialogProps) {
  const [formData, setFormData] = useState(initialFormData);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (freight) {
      setFormData({
        origin_city: freight.origin_city,
        origin_state: freight.origin_state,
        destination_city: freight.destination_city,
        destination_state: freight.destination_state,
        cargo_type: freight.cargo_type,
        weight_kg: String(freight.weight_kg),
        value_brl: String(freight.value_brl),
        distance_km: freight.distance_km ? String(freight.distance_km) : "",
        pickup_date: freight.pickup_date,
        delivery_date: freight.delivery_date || "",
        company_name: freight.company_name,
        required_vehicle_type: freight.required_vehicle_type || "",
        description: freight.description || "",
      });
    } else {
      setFormData(initialFormData);
    }
  }, [freight, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data = {
        origin_city: formData.origin_city,
        origin_state: formData.origin_state,
        destination_city: formData.destination_city,
        destination_state: formData.destination_state,
        cargo_type: formData.cargo_type,
        weight_kg: Number(formData.weight_kg),
        value_brl: Number(formData.value_brl),
        distance_km: formData.distance_km ? Number(formData.distance_km) : null,
        pickup_date: formData.pickup_date,
        delivery_date: formData.delivery_date || null,
        company_name: formData.company_name,
        required_vehicle_type: (formData.required_vehicle_type || null) as VehicleType | null,
        description: formData.description || null,
      };

      if (freight) {
        const { error } = await supabase
          .from("freights")
          .update(data)
          .eq("id", freight.id);

        if (error) throw error;
        toast({ title: "Frete atualizado com sucesso!" });
      } else {
        const { error } = await supabase
          .from("freights")
          .insert(data);

        if (error) throw error;
        toast({ title: "Frete criado com sucesso!" });
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">
            {freight ? "Editar Frete" : "Adicionar Frete"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Origin */}
            <div className="space-y-2">
              <Label>Cidade de Origem</Label>
              <Input
                value={formData.origin_city}
                onChange={(e) => setFormData({ ...formData, origin_city: e.target.value })}
                required
                className="input-transport"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado de Origem</Label>
              <Select
                value={formData.origin_state}
                onValueChange={(value) => setFormData({ ...formData, origin_state: value })}
              >
                <SelectTrigger className="input-transport">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {brazilianStates.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination */}
            <div className="space-y-2">
              <Label>Cidade de Destino</Label>
              <Input
                value={formData.destination_city}
                onChange={(e) => setFormData({ ...formData, destination_city: e.target.value })}
                required
                className="input-transport"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado de Destino</Label>
              <Select
                value={formData.destination_state}
                onValueChange={(value) => setFormData({ ...formData, destination_state: value })}
              >
                <SelectTrigger className="input-transport">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {brazilianStates.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cargo Info */}
            <div className="space-y-2">
              <Label>Tipo de Carga</Label>
              <Input
                value={formData.cargo_type}
                onChange={(e) => setFormData({ ...formData, cargo_type: e.target.value })}
                required
                className="input-transport"
              />
            </div>
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input
                type="number"
                value={formData.weight_kg}
                onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                required
                className="input-transport"
              />
            </div>

            {/* Value and Distance */}
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                <Input
                  className="input-transport pl-10"
                  value={formData.value_brl ? maskCurrency(String(Math.round(parseFloat(formData.value_brl) * 100))) : ""}
                  onChange={(e) => setFormData({ ...formData, value_brl: unmaskCurrency(e.target.value) })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Distância (km)</Label>
              <Input
                type="number"
                value={formData.distance_km}
                onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
                className="input-transport"
              />
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <Label>Data de Coleta</Label>
              <Input
                type="date"
                value={formData.pickup_date}
                onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })}
                required
                className="input-transport"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Entrega</Label>
              <Input
                type="date"
                value={formData.delivery_date}
                onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                className="input-transport"
              />
            </div>

            {/* Company and Vehicle Type */}
            <div className="space-y-2">
              <Label>Nome da Empresa</Label>
              <Input
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                required
                className="input-transport"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Veículo</Label>
              <Select
                value={formData.required_vehicle_type}
                onValueChange={(value) => setFormData({ ...formData, required_vehicle_type: value })}
              >
                <SelectTrigger className="input-transport">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {vehicleTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="input-transport"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="btn-transport-accent">
              {saving ? "Salvando..." : freight ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
