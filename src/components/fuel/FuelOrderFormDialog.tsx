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

async function resolveRequesterNameFromProfile(user: any) {
  if (!user?.id) return "";

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, category, email, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) return "";

  const byCategory = data.find((p) => p.category === "motorista" && p.full_name?.trim());
  if (byCategory) return byCategory.full_name.trim();

  const byEmail = data.find(
    (p) =>
      p.full_name?.trim() &&
      p.email &&
      user?.email &&
      String(p.email).toLowerCase() === String(user.email).toLowerCase()
  );
  if (byEmail) return byEmail.full_name.trim();

  return data.find((p) => p.full_name?.trim())?.full_name?.trim() || "";
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
  const [arlaMode, setArlaMode] = useState<"sim" | "nao">("nao");
  const [liters, setLiters] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;

    const fallbackName = resolveRequesterName(user);
    setUserName(fallbackName);

    resolveRequesterNameFromProfile(user).then((profileName) => {
      if (profileName) {
        setUserName(profileName);
      }
    });

    supabase
      .from("vehicles")
      .select("id, plate, brand, model, driver_id")
      .eq("is_active", true)
      .eq("fleet_type", "propria")
      .order("plate")
      .then(async ({ data }) => {
        const vList = data || [];
        // Fetch driver names for vehicles that have a driver_id
        const driverIds = [...new Set(vList.map((v) => v.driver_id).filter(Boolean))];
        if (driverIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, user_id, full_name")
            .in("user_id", driverIds);
          const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
          vList.forEach((v) => {
            (v as any).driver_name = nameMap.get(v.driver_id) || "";
          });
        }
        setVehicles(vList);
      });

    if (establishments.length === 1) {
      setEstablishmentId(establishments[0].id);
    }
  }, [open, establishments, user]);

  const reset = () => {
    setEstablishmentId(establishments.length === 1 ? establishments[0].id : "");
    setSupplierId(null);
    setSupplierName("");
    setVehicleId("");
    setVehiclePlate("");
    setFuelType("diesel");
    setFillMode("completar");
    setArlaMode("nao");
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
    const requesterName = userName.trim() || resolveRequesterName(user);
    const arlaNote = fillMode === "completar" ? `Completar Arla: ${arlaMode === "sim" ? "Sim" : "Não"}` : "";
    const notesPayload = [notes.trim(), arlaNote].filter(Boolean).join("\n");

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
        notes: notesPayload || null,
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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Abastecimento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Empresa & Solicitante */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificação</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa Solicitante *</Label>
              <Select value={establishmentId} onValueChange={setEstablishmentId}>
                <SelectTrigger className="text-sm">
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
            <div className="space-y-1.5">
              <Label className="text-xs">Solicitante</Label>
              <Input value={userName} disabled className="bg-muted/30 text-sm" />
            </div>
          </div>

          {/* Fornecedor & Veículo */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fornecedor & Veículo</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Fornecedor (Destinatário) *</Label>
              <PersonSearchInput
                categories={["fornecedor"]}
                placeholder="Buscar fornecedor..."
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
            <div className="space-y-1.5">
              <Label className="text-xs">Veículo *</Label>
              <Select
                value={vehicleId}
                onValueChange={(v) => {
                  setVehicleId(v);
                  const veh = vehicles.find((x) => x.id === v);
                  setVehiclePlate(veh?.plate || "");
                }}
              >
                <SelectTrigger className="text-sm">
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
              {vehicleId && (() => {
                const veh = vehicles.find((x) => x.id === vehicleId);
                return veh?.driver_name ? (
                  <p className="text-xs text-muted-foreground mt-1">Motorista: <span className="font-medium text-foreground">{veh.driver_name}</span></p>
                ) : null;
              })()}
            </div>
          </div>

          {/* Combustível & Modo */}
          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Combustível</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Combustível *</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasolina">Gasolina</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="diesel_s10">Diesel S10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Modo de Abastecimento *</Label>
              <RadioGroup value={fillMode} onValueChange={setFillMode} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="completar" id="fill-completar" />
                  <Label htmlFor="fill-completar" className="font-normal cursor-pointer text-sm">Completar tanque</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="litros" id="fill-litros" />
                  <Label htmlFor="fill-litros" className="font-normal cursor-pointer text-sm">Litros avulsos</Label>
                </div>
              </RadioGroup>
            </div>

            {fillMode === "completar" && (
              <div className="space-y-2">
                <Label className="text-xs">Completar Arla?</Label>
                <RadioGroup
                  value={arlaMode}
                  onValueChange={(value) => setArlaMode(value as "sim" | "nao")}
                  className="flex items-center gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="sim" id="arla-sim" />
                    <Label htmlFor="arla-sim" className="font-normal cursor-pointer text-sm">Sim</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="nao" id="arla-nao" />
                    <Label htmlFor="arla-nao" className="font-normal cursor-pointer text-sm">Não</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {fillMode === "litros" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade (litros) *</Label>
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="Ex: 150"
                  className="text-sm"
                />
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais..."
              rows={3}
              className="text-sm"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Criar e Gerar PDF
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
