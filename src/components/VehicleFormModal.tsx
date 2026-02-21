import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  maskPlate, unmaskPlate, maskRenavam, maskYear, maskOnlyLettersNumbers,
  validatePlate, validateRenavam,
} from "@/lib/masks";

const trailerRequirements: Record<string, { count: number; labels: string[] }> = {
  truck: { count: 0, labels: [] },
  bitruck: { count: 0, labels: [] },
  carreta: { count: 1, labels: ["Placa da Carreta"] },
  carreta_ls: { count: 1, labels: ["Placa da Carreta LS"] },
  rodotrem: { count: 3, labels: ["Placa da 1ª Carreta", "Placa do Dolly", "Placa da 2ª Carreta"] },
  bitrem: { count: 2, labels: ["Placa da 1ª Carreta", "Placa da 2ª Carreta"] },
  treminhao: { count: 2, labels: ["Placa do 1º Reboque", "Placa do 2º Reboque"] },
};

const vehicleTypes = [
  { value: "truck", label: "Truck" },
  { value: "bitruck", label: "Bitruck" },
  { value: "carreta", label: "Carreta" },
  { value: "carreta_ls", label: "Carreta LS" },
  { value: "rodotrem", label: "Rodotrem" },
  { value: "bitrem", label: "Bitrem" },
  { value: "treminhao", label: "Treminhão" },
];

const cargoTypes = [
  { value: "cacamba", label: "Caçamba" },
  { value: "graneleiro", label: "Graneleiro" },
];

interface ProfileOption {
  user_id: string;
  full_name: string;
  category: string;
}

interface VehicleFormData {
  plate: string;
  renavam: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: string;
  anttNumber: string;
  cargoType: string;
  trailerPlate1: string;
  trailerRenavam1: string;
  trailerPlate2: string;
  trailerRenavam2: string;
  trailerPlate3: string;
  trailerRenavam3: string;
  driverId: string;
  ownerId: string;
}

const emptyVehicle: VehicleFormData = {
  plate: "", renavam: "", vehicleType: "", brand: "", model: "", year: "",
  anttNumber: "", cargoType: "",
  trailerPlate1: "", trailerRenavam1: "",
  trailerPlate2: "", trailerRenavam2: "",
  trailerPlate3: "", trailerRenavam3: "",
  driverId: "", ownerId: "",
};

interface VehicleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId?: string | null; // null = create mode
  onSaved: () => void;
  defaultDriverId?: string | null;
}

export function VehicleFormModal({ open, onOpenChange, vehicleId, onSaved, defaultDriverId }: VehicleFormModalProps) {
  const isEdit = !!vehicleId;
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<VehicleFormData>(emptyVehicle);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [driverIsOwner, setDriverIsOwner] = useState(false);

  // Load profiles for driver/owner linking
  useEffect(() => {
    if (open) {
      supabase.from("profiles").select("user_id, full_name, category").order("full_name").then(({ data }) => {
        setProfiles((data as any[]) || []);
      });
      // Set default driver if provided (create mode)
      if (!vehicleId && defaultDriverId) {
        setForm(prev => ({ ...prev, driverId: defaultDriverId }));
      }
    }
  }, [open, defaultDriverId, vehicleId]);

  // Load vehicle data in edit mode
  useEffect(() => {
    if (open && isEdit && vehicleId) {
      setFetching(true);
      supabase.from("vehicles").select("*").eq("id", vehicleId).single().then(({ data, error }) => {
        if (error || !data) {
          toast({ title: "Veículo não encontrado", variant: "destructive" });
          onOpenChange(false);
          return;
        }
        setForm({
          plate: maskPlate(data.plate || ""),
          renavam: data.renavam || "",
          vehicleType: data.vehicle_type || "",
          brand: data.brand || "",
          model: data.model || "",
          year: data.year?.toString() || "",
          anttNumber: data.antt_number || "",
          cargoType: data.cargo_type || "",
          trailerPlate1: maskPlate(data.trailer_plate_1 || ""),
          trailerRenavam1: data.trailer_renavam_1 || "",
          trailerPlate2: maskPlate(data.trailer_plate_2 || ""),
          trailerRenavam2: data.trailer_renavam_2 || "",
          trailerPlate3: maskPlate(data.trailer_plate_3 || ""),
          trailerRenavam3: data.trailer_renavam_3 || "",
          driverId: (data as any).driver_id || "",
          ownerId: (data as any).owner_id || "",
        });
        // Check if driver is owner
        const dId = (data as any).driver_id || "";
        const oId = (data as any).owner_id || "";
        setDriverIsOwner(!!dId && dId === oId);
        setFetching(false);
      });
    } else if (open && !isEdit) {
      setForm(emptyVehicle);
      setErrors({});
      setDriverIsOwner(false);
    }
  }, [open, vehicleId, isEdit]);

  const trailerConfig = trailerRequirements[form.vehicleType] || { count: 0, labels: [] };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let masked = value;
    if (name === "plate" || name.startsWith("trailerPlate")) masked = maskPlate(value);
    else if (name === "renavam" || name.startsWith("trailerRenavam")) masked = maskRenavam(value);
    else if (name === "year") masked = maskYear(value);
    else if (name === "brand" || name === "model") masked = maskOnlyLettersNumbers(value);
    else if (name === "anttNumber") masked = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    setForm((p) => ({ ...p, [name]: masked }));
    setErrors((p) => ({ ...p, [name]: "" }));
  };

  const handleVehicleTypeChange = (value: string) => {
    setForm((p) => ({
      ...p, vehicleType: value,
      trailerPlate1: "", trailerRenavam1: "",
      trailerPlate2: "", trailerRenavam2: "",
      trailerPlate3: "", trailerRenavam3: "",
    }));
    setErrors((p) => ({ ...p, vehicleType: "" }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!validatePlate(unmaskPlate(form.plate))) e.plate = "Placa inválida";
    if (form.renavam && !validateRenavam(form.renavam)) e.renavam = "RENAVAM inválido";
    if (!form.vehicleType) e.vehicleType = "Selecione o tipo";
    if (!form.brand.trim() || form.brand.trim().length < 2) e.brand = "Marca obrigatória";
    if (!form.model.trim() || form.model.trim().length < 2) e.model = "Modelo obrigatório";
    const year = parseInt(form.year);
    if (!year || year < 1990 || year > new Date().getFullYear() + 1) e.year = "Ano inválido";
    if (!form.cargoType) e.cargoType = "Selecione a carroceria";

    // Trailer plates and renavams are optional — only validate format if filled
    const tc = trailerRequirements[form.vehicleType] || { count: 0 };
    if (tc.count >= 1) {
      if (form.trailerPlate1 && !validatePlate(unmaskPlate(form.trailerPlate1))) e.trailerPlate1 = "Placa inválida";
      if (form.trailerRenavam1 && !validateRenavam(form.trailerRenavam1)) e.trailerRenavam1 = "RENAVAM inválido";
    }
    if (tc.count >= 2) {
      if (form.trailerPlate2 && !validatePlate(unmaskPlate(form.trailerPlate2))) e.trailerPlate2 = "Placa inválida";
      if (form.trailerRenavam2 && !validateRenavam(form.trailerRenavam2)) e.trailerRenavam2 = "RENAVAM inválido";
    }
    if (tc.count >= 3) {
      if (form.trailerPlate3 && !validatePlate(unmaskPlate(form.trailerPlate3))) e.trailerPlate3 = "Placa inválida";
      if (form.trailerRenavam3 && !validateRenavam(form.trailerRenavam3)) e.trailerRenavam3 = "RENAVAM inválido";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    plate: unmaskPlate(form.plate),
    renavam: form.renavam,
    vehicle_type: form.vehicleType as any,
    brand: form.brand.trim(),
    model: form.model.trim(),
    year: parseInt(form.year),
    antt_number: form.anttNumber || null,
    cargo_type: form.cargoType || null,
    trailer_plate_1: unmaskPlate(form.trailerPlate1) || null,
    trailer_renavam_1: form.trailerRenavam1 || null,
    trailer_plate_2: unmaskPlate(form.trailerPlate2) || null,
    trailer_renavam_2: form.trailerRenavam2 || null,
    trailer_plate_3: unmaskPlate(form.trailerPlate3) || null,
    trailer_renavam_3: form.trailerRenavam3 || null,
    driver_id: form.driverId || null,
    owner_id: driverIsOwner ? (form.driverId || null) : (form.ownerId || null),
  });

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isEdit) {
        const { error } = await supabase.from("vehicles").update(buildPayload()).eq("id", vehicleId);
        if (error) throw error;
        toast({ title: "Veículo atualizado!" });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Não autenticado");
        const { error } = await supabase.from("vehicles").insert({ ...buildPayload(), user_id: user.id });
        if (error) throw error;
        toast({ title: "Veículo cadastrado!" });
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const motoristas = profiles.filter((p) => p.category === "motorista");
  const proprietarios = profiles.filter((p) => p.category === "proprietario");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isEdit ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[75vh]">
          <div className="px-6 pb-6 space-y-4">
            {fetching ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                {/* Vínculos */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">Vínculos</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Motorista</Label>
                      <Select value={form.driverId || "__none__"} onValueChange={(v) => {
                        const newDriverId = v === "__none__" ? "" : v;
                        setForm((p) => ({ ...p, driverId: newDriverId }));
                        if (driverIsOwner) {
                          setForm((p) => ({ ...p, driverId: newDriverId, ownerId: newDriverId }));
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {motoristas.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Proprietário</Label>
                      {driverIsOwner ? (
                        <Input value={motoristas.find(m => m.user_id === form.driverId)?.full_name || "—"} disabled className="text-muted-foreground" />
                      ) : (
                        <Select value={form.ownerId || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, ownerId: v === "__none__" ? "" : v }))}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {proprietarios.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="driver-is-owner"
                      checked={driverIsOwner}
                      onCheckedChange={(checked) => {
                        const isChecked = !!checked;
                        setDriverIsOwner(isChecked);
                        if (isChecked) {
                          setForm((p) => ({ ...p, ownerId: p.driverId }));
                        } else {
                          setForm((p) => ({ ...p, ownerId: "" }));
                        }
                      }}
                      disabled={!form.driverId}
                    />
                    <Label htmlFor="driver-is-owner" className="text-sm font-normal cursor-pointer">
                      Motorista é o proprietário do conjunto
                    </Label>
                  </div>
                </div>

                <Separator />

                {/* Dados do veículo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Placa do Cavalo *</Label>
                    <Input name="plate" placeholder="ABC-1D23" maxLength={8} value={form.plate} onChange={handleChange} className="uppercase" />
                    {errors.plate && <p className="text-xs text-destructive">{errors.plate}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">RENAVAM</Label>
                    <Input name="renavam" placeholder="00000000000" maxLength={11} value={form.renavam} onChange={handleChange} />
                    {errors.renavam && <p className="text-xs text-destructive">{errors.renavam}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Veículo *</Label>
                    <Select value={form.vehicleType} onValueChange={handleVehicleTypeChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{vehicleTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {errors.vehicleType && <p className="text-xs text-destructive">{errors.vehicleType}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Marca *</Label>
                    <Input name="brand" placeholder="Volvo, Scania..." value={form.brand} onChange={handleChange} />
                    {errors.brand && <p className="text-xs text-destructive">{errors.brand}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo *</Label>
                    <Input name="model" placeholder="FH 540" value={form.model} onChange={handleChange} />
                    {errors.model && <p className="text-xs text-destructive">{errors.model}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Ano *</Label>
                    <Input name="year" placeholder="2024" maxLength={4} value={form.year} onChange={handleChange} />
                    {errors.year && <p className="text-xs text-destructive">{errors.year}</p>}
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">ANTT (opcional)</Label>
                    <Input name="anttNumber" placeholder="Número do RNTRC" value={form.anttNumber} onChange={handleChange} />
                  </div>
                </div>

                {/* Carroceria */}
                <div className="space-y-2">
                  <Label className="text-xs">Tipo de Carroceria *</Label>
                  <RadioGroup value={form.cargoType} onValueChange={(v) => setForm((p) => ({ ...p, cargoType: v }))} className="flex gap-6">
                    {cargoTypes.map((t) => (
                      <div key={t.value} className="flex items-center space-x-2">
                        <RadioGroupItem value={t.value} id={`vfm-${t.value}`} />
                        <Label htmlFor={`vfm-${t.value}`} className="font-normal cursor-pointer text-sm">{t.label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {errors.cargoType && <p className="text-xs text-destructive">{errors.cargoType}</p>}
                </div>

                {/* Implementos */}
                {trailerConfig.count > 0 && (
                  <>
                    <Separator />
                    <p className="text-sm font-medium text-muted-foreground">Implementos do Conjunto</p>
                    <div className="space-y-3">
                      {Array.from({ length: trailerConfig.count }).map((_, i) => {
                        const idx = i + 1;
                        const plateKey = `trailerPlate${idx}` as keyof VehicleFormData;
                        const renavamKey = `trailerRenavam${idx}` as keyof VehicleFormData;
                        return (
                          <div key={i} className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                            <div className="space-y-1">
                              <Label className="text-xs">{trailerConfig.labels[i]}</Label>
                              <Input name={plateKey} placeholder="ABC-1D23" maxLength={8} value={form[plateKey]} onChange={handleChange} className="uppercase" />
                              {errors[plateKey] && <p className="text-xs text-destructive">{errors[plateKey]}</p>}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">RENAVAM</Label>
                              <Input name={renavamKey} placeholder="00000000000" maxLength={11} value={form[renavamKey]} onChange={handleChange} />
                              {errors[renavamKey] && <p className="text-xs text-destructive">{errors[renavamKey]}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <Button className="w-full" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Cadastrar Veículo"}
                </Button>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
