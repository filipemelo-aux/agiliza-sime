import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  establishments: any[];
  user: any;
  onCreated: (order: any) => void;
}

function resolveRequesterName(user: any) {
  const metaName = String(
    user?.user_metadata?.full_name || user?.user_metadata?.name || ""
  ).trim();
  if (metaName) return metaName;

  const email = String(user?.email || "").trim();
  if (!email) return "Usuário";

  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || "Usuário";
}

export function FuelOrderFormDialog({ open, onOpenChange, establishments, user, onCreated }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [userName, setUserName] = useState("");

  const [establishmentId, setEstablishmentId] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [fuelType, setFuelType] = useState("diesel");
  const [fillMode, setFillMode] = useState("completar");
  const [liters, setLiters] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;

    let active = true;

    const bootstrapDialog = async () => {
      setUserName(resolveRequesterName(user));

      const [vehiclesRes, profileName] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, plate, brand, model")
          .eq("is_active", true)
          .order("plate"),
        fetchRequesterProfileName(user?.id),
      ]);

      if (!active) return;

      setVehicles(vehiclesRes.data || []);
      setUserName(resolveRequesterName(user, profileName));

      if (establishments.length === 1) {
        setEstablishmentId(establishments[0].id);
      }
    };

    void bootstrapDialog();

    return () => {
      active = false;
    };
  }, [open, establishments, user]);

  const reset = () => {
    setEstablishmentId(establishments.length === 1 ? establishments[0].id : "");
    setSupplierId(null);
    setSupplierName("");
    setVehicleId("");
    setVehiclePlate("");
    setFuelType("diesel");
    setFillMode("completar");
    setLiters("");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      toast({ title: "Usuário não autenticado", variant: "destructive" });
      return;
    }

    if (!establishmentId || !supplierName || !vehicleId || !fuelType) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    if (fillMode === "litros" && (!liters || Number(liters) <= 0)) {
      toast({ title: "Informe a quantidade de litros", variant: "destructive" });
      return;
    }

    setSaving(true);
    const latestProfileName = await fetchRequesterProfileName(user.id);
    const requesterName = resolveRequesterName(user, latestProfileName || userName);

    const { data, error } = await supabase
      .from("fuel_orders")
      .insert({
        establishment_id: establishmentId,
        requester_user_id: user.id,
        requester_name: requesterName,
        supplier_id: supplierId,
        supplier_name: supplierName,
        vehicle_id: vehicleId,
        vehicle_plate: vehiclePlate,
        fuel_type: fuelType,
        fill_mode: fillMode,
        liters: fillMode === "litros" ? Number(liters) : null,
        notes: notes || null,
        created_by: user.id,
      } as any)
      .select()
      .single();

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao criar ordem", description: error.message, variant: "destructive" });
      return;
    }
    reset();
    onCreated(data);
  };

  const selectedEst = establishments.find((e) => e.id === establishmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Abastecimento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Empresa */}
          <div className="space-y-1.5">
            <Label>Empresa Solicitante *</Label>
            <Select value={establishmentId} onValueChange={setEstablishmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {establishments.map((est) => (
                  <SelectItem key={est.id} value={est.id}>
                    {est.type === "matriz" ? "Matriz" : "Filial"} — {est.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Solicitante */}
          <div className="space-y-1.5">
            <Label>Solicitante</Label>
            <Input value={userName} disabled className="bg-muted/30" />
          </div>

          {/* Fornecedor */}
          <div className="space-y-1.5">
            <Label>Fornecedor (Destinatário) *</Label>
            <PersonSearchInput
              categories={["fornecedor"]}
              placeholder="Buscar fornecedor cadastrado..."
              selectedName={supplierName || undefined}
              onSelect={(p) => {
                setSupplierId(p.id);
                setSupplierName(p.razao_social || p.full_name);
              }}
              onClear={() => {
                setSupplierId(null);
                setSupplierName("");
              }}
            />
          </div>

          {/* Veículo */}
          <div className="space-y-1.5">
            <Label>Veículo *</Label>
            <Select
              value={vehicleId}
              onValueChange={(v) => {
                setVehicleId(v);
                const veh = vehicles.find((x) => x.id === v);
                setVehiclePlate(veh?.plate || "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o veículo" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plate} — {v.brand} {v.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Combustível */}
          <div className="space-y-1.5">
            <Label>Tipo de Combustível *</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gasolina">Gasolina</SelectItem>
                <SelectItem value="diesel">Diesel</SelectItem>
                <SelectItem value="diesel_s10">Diesel S10</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Modo de Abastecimento */}
          <div className="space-y-1.5">
            <Label>Modo de Abastecimento *</Label>
            <RadioGroup value={fillMode} onValueChange={setFillMode} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="completar" id="fill-completar" />
                <Label htmlFor="fill-completar" className="font-normal cursor-pointer">Completar tanque</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="litros" id="fill-litros" />
                <Label htmlFor="fill-litros" className="font-normal cursor-pointer">Litros avulsos</Label>
              </div>
            </RadioGroup>
          </div>

          {fillMode === "litros" && (
            <div className="space-y-1.5">
              <Label>Quantidade (litros) *</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={liters}
                onChange={(e) => setLiters(e.target.value)}
                placeholder="Ex: 150"
              />
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Criar e Gerar PDF
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
