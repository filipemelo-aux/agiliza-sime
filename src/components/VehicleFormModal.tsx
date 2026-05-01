import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonSearchInput } from "@/components/freight/PersonSearchInput";
import { PersonCreateDialog } from "@/components/PersonEditDialog";
import { UserPlus } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  maskPlate, unmaskPlate, maskRenavam, maskYear, maskName,
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
  utilitario: { count: 0, labels: [] },
  passeio: { count: 0, labels: [] },
};

const vehicleTypes = [
  { value: "truck", label: "Truck", group: "caminhao" },
  { value: "bitruck", label: "Bitruck", group: "caminhao" },
  { value: "carreta", label: "Carreta", group: "caminhao" },
  { value: "carreta_ls", label: "Carreta LS", group: "caminhao" },
  { value: "rodotrem", label: "Rodotrem", group: "caminhao" },
  { value: "bitrem", label: "Bitrem", group: "caminhao" },
  { value: "treminhao", label: "Treminhão", group: "caminhao" },
  { value: "utilitario", label: "Utilitário", group: "leve" },
  { value: "passeio", label: "Passeio", group: "leve" },
];

const TRUCK_TYPES = new Set(["truck", "bitruck", "carreta", "carreta_ls", "rodotrem", "bitrem", "treminhao"]);

const cargoTypes = [
  { value: "cacamba", label: "Caçamba" },
  { value: "graneleiro", label: "Graneleiro" },
];

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: "Truck", bitruck: "Bitruck", carreta: "Carreta", carreta_ls: "Carreta LS",
  rodotrem: "Rodotrem", bitrem: "Bitrem", treminhao: "Treminhão",
  utilitario: "Utilitário", passeio: "Passeio",
};

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
  fleetType: string;
}

const emptyVehicle: VehicleFormData = {
  plate: "", renavam: "", vehicleType: "", brand: "", model: "", year: "",
  anttNumber: "", cargoType: "",
  trailerPlate1: "", trailerRenavam1: "",
  trailerPlate2: "", trailerRenavam2: "",
  trailerPlate3: "", trailerRenavam3: "",
  driverId: "", ownerId: "", fleetType: "terceiros",
};

interface ExistingVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  vehicle_type: string;
}

interface VehicleFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId?: string | null;
  onSaved: () => void;
  defaultDriverId?: string | null;
}

export function VehicleFormModal({ open, onOpenChange, vehicleId, onSaved, defaultDriverId }: VehicleFormModalProps) {
  const isEdit = !!vehicleId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<VehicleFormData>(emptyVehicle);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [driverIsOwner, setDriverIsOwner] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [personCreateOpen, setPersonCreateOpen] = useState(false);
  const [personCreateCategory, setPersonCreateCategory] = useState<string>("motorista");
  const [savedVehicleIdForLink, setSavedVehicleIdForLink] = useState<string | null>(null);
  const [personCreateTarget, setPersonCreateTarget] = useState<"driver" | "owner">("driver");

  // Link existing vehicle mode (only when creating with defaultDriverId)
  const showLinkOption = !isEdit && !!defaultDriverId;
  const [existingVehicles, setExistingVehicles] = useState<ExistingVehicle[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string>("");

  // Load profiles for driver/owner linking (exclude system users)
  useEffect(() => {
    if (open) {
      Promise.all([
        supabase.from("profiles").select("user_id, full_name, category").order("full_name"),
        supabase.from("user_roles").select("user_id"),
      ]).then(([profilesRes, rolesRes]) => {
        const systemUserIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));
        const filtered = ((profilesRes.data as any[]) || []).filter((p: any) => !systemUserIds.has(p.user_id));
        setProfiles(filtered);
      });

      // Load existing vehicles for linking
      if (showLinkOption) {
        supabase.from("vehicles").select("id, plate, brand, model, year, vehicle_type").order("plate").then(({ data }) => {
          setExistingVehicles((data as ExistingVehicle[]) || []);
        });
      }

      if (!vehicleId && defaultDriverId) {
        setForm(prev => ({ ...prev, driverId: defaultDriverId }));
      }
    }
  }, [open, defaultDriverId, vehicleId]);

  // Load vehicle data in edit mode
  useEffect(() => {
    if (open && isEdit && vehicleId) {
      setFetching(true);
      supabase.from("vehicles").select("*").eq("id", vehicleId).single().then(async ({ data, error }) => {
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
          fleetType: (data as any).fleet_type || "terceiros",
        });
        const dId = (data as any).driver_id || "";
        const oId = (data as any).owner_id || "";
        setDriverIsOwner(!!dId && dId === oId);
        // Resolve names for driver/owner
        const idsToResolve = [dId, oId].filter(Boolean);
        if (idsToResolve.length > 0) {
          const { data: names } = await supabase.from("profiles").select("user_id, full_name").in("user_id", idsToResolve);
          if (names) {
            const driverProfile = names.find((n: any) => n.user_id === dId);
            const ownerProfile = names.find((n: any) => n.user_id === oId);
            if (driverProfile) setDriverName(driverProfile.full_name);
            if (ownerProfile) setOwnerName(ownerProfile.full_name);
          }
        }
        setFetching(false);
      });
    } else if (open && !isEdit) {
      setForm(defaultDriverId ? { ...emptyVehicle, driverId: defaultDriverId } : emptyVehicle);
      setErrors({});
      setDriverIsOwner(false);
      setDriverName("");
      setOwnerName("");
      setSelectedExistingId("");
      // Resolve default driver name
      if (defaultDriverId) {
        supabase.from("profiles").select("full_name").eq("user_id", defaultDriverId).single().then(({ data }) => {
          if (data) setDriverName(data.full_name);
        });
      }
    }
  }, [open, vehicleId, isEdit]);

  const trailerConfig = trailerRequirements[form.vehicleType] || { count: 0, labels: [] };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let masked = value;
    if (name === "plate" || name.startsWith("trailerPlate")) masked = maskPlate(value);
    else if (name === "renavam" || name.startsWith("trailerRenavam")) masked = maskRenavam(value);
    else if (name === "brand" || name === "model") masked = maskName(value);
    else if (name === "year") masked = maskYear(value);
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
    if (TRUCK_TYPES.has(form.vehicleType) && !form.cargoType) e.cargoType = "Selecione a carroceria";

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
    fleet_type: form.fleetType || "terceiros",
  });

  // Link existing vehicle to this driver
  const handleLinkExisting = async () => {
    if (!selectedExistingId || !defaultDriverId) return;
    setLoading(true);
    try {
      // Duplicate the existing vehicle record with this driver
      const { data: original, error: fetchErr } = await supabase
        .from("vehicles").select("*").eq("id", selectedExistingId).single();
      if (fetchErr || !original) throw new Error("Veículo não encontrado");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { id, created_at, updated_at, ...rest } = original as any;
      const { error } = await supabase.from("vehicles").insert({
        ...rest,
        driver_id: defaultDriverId,
        user_id: user.id,
      });
      if (error) throw error;
      toast({ title: "Veículo vinculado ao motorista!" });
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
      // If driver is also the owner, flag the driver's profile so it shows up in owner searches
      if (driverIsOwner && form.driverId) {
        await supabase.from("profiles").update({ is_owner: true }).eq("user_id", form.driverId);
      }
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isLightVehicle = !TRUCK_TYPES.has(form.vehicleType);
  const isTruck = TRUCK_TYPES.has(form.vehicleType);

  const isLinkingExisting = showLinkOption && !!selectedExistingId;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-1">
          <DialogTitle>{isEdit ? "Editar Veículo" : showLinkOption ? "Vincular Veículo" : "Novo Veículo"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[75vh]">
          <div className="px-6 pb-5 space-y-3">
            {fetching ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <>
                {/* Select existing vehicle option */}
                {showLinkOption && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Selecionar conjunto já cadastrado</Label>
                      <Select value={selectedExistingId || "__none__"} onValueChange={(v) => setSelectedExistingId(v === "__none__" ? "" : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Nenhum — cadastrar novo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum — cadastrar novo</SelectItem>
                          {existingVehicles.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {maskPlate(v.plate)} — {v.brand} {v.model} ({VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Separator />
                  </>
                )}

                {/* If linking existing, show summary + button */}
                {isLinkingExisting ? (
                  <Button className="w-full" onClick={handleLinkExisting} disabled={loading}>
                    {loading ? "Vinculando..." : "Vincular Veículo"}
                  </Button>
                ) : (
                  <>
                    {/* Categoria do veículo no topo */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Categoria *</Label>
                      <RadioGroup
                        value={form.vehicleType ? (TRUCK_TYPES.has(form.vehicleType) ? "caminhao" : "leve") : ""}
                        onValueChange={(cat) => {
                          if (cat === "caminhao") {
                            handleVehicleTypeChange("rodotrem");
                          } else {
                            handleVehicleTypeChange("passeio");
                          }
                        }}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="caminhao" id="cat-caminhao" />
                          <Label htmlFor="cat-caminhao" className="text-sm font-normal cursor-pointer">🚛 Caminhão</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="leve" id="cat-leve" />
                          <Label htmlFor="cat-leve" className="text-sm font-normal cursor-pointer">🚗 Veículo Leve</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <Separator className="my-1" />

                    {/* Dados do veículo */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{isTruck ? "Placa do Cavalo *" : "Placa *"}</Label>
                        <Input name="plate" placeholder="ABC-1D23" maxLength={8} value={form.plate} onChange={handleChange} className="uppercase" />
                        {errors.plate && <p className="text-xs text-destructive">{errors.plate}</p>}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">RENAVAM</Label>
                        <Input name="renavam" placeholder="00000000000" maxLength={11} value={form.renavam} onChange={handleChange} />
                        {errors.renavam && <p className="text-xs text-destructive">{errors.renavam}</p>}
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
                      {isTruck && (
                        <div className="space-y-1">
                          <Label className="text-xs">ANTT (opcional)</Label>
                          <Input name="anttNumber" placeholder="Número do RNTRC" value={form.anttNumber} onChange={handleChange} />
                        </div>
                      )}
                    </div>

                    {/* Tipo específico de veículo */}
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo de Veículo *</Label>
                      <Select value={form.vehicleType} onValueChange={handleVehicleTypeChange}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {vehicleTypes.filter(t => isTruck ? t.group === "caminhao" : t.group === "leve").map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.vehicleType && <p className="text-xs text-destructive">{errors.vehicleType}</p>}
                    </div>

                    {isTruck && (
                      <div className="space-y-1">
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
                    )}

                    {/* Implementos */}
                    {trailerConfig.count > 0 && (
                      <>
                        <Separator className="my-1" />
                        <p className="text-xs font-medium text-muted-foreground">Implementos do Conjunto</p>
                        <div className="space-y-2">
                          {Array.from({ length: trailerConfig.count }).map((_, i) => {
                            const idx = i + 1;
                            const plateKey = `trailerPlate${idx}` as keyof VehicleFormData;
                            const renavamKey = `trailerRenavam${idx}` as keyof VehicleFormData;
                            return (
                              <div key={i} className="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-muted/30 border border-border">
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

                    <Separator className="my-1" />

                    {/* Vínculos */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Vínculos</p>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{isTruck ? "Motorista" : "Colaborador"}</Label>
                          <PersonSearchInput
                            categories={isTruck ? ["motorista"] : ["colaborador"]}
                            placeholder={isTruck ? "Buscar motorista..." : "Buscar colaborador..."}
                            selectedName={driverName || undefined}
                            onSelect={(person) => {
                              const newDriverId = person.user_id;
                              setForm((p) => ({
                                ...p,
                                driverId: newDriverId,
                                ...(driverIsOwner ? { ownerId: newDriverId } : {}),
                              }));
                              setDriverName(person.full_name);
                              if (driverIsOwner) setOwnerName(person.full_name);
                            }}
                            onClear={() => {
                              setForm((p) => ({ ...p, driverId: "" }));
                              setDriverName("");
                              if (driverIsOwner) {
                                setDriverIsOwner(false);
                                setForm((p) => ({ ...p, ownerId: "" }));
                                setOwnerName("");
                              }
                            }}
                            endAction={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title={isTruck ? "Cadastrar motorista" : "Cadastrar colaborador"}
                                onClick={async () => {
                                  if (!validate()) {
                                    toast({ title: "Preencha os dados do veículo antes de cadastrar", variant: "destructive" });
                                    return;
                                  }
                                  setLoading(true);
                                  try {
                                    const { data: { user } } = await supabase.auth.getUser();
                                    if (!user) throw new Error("Não autenticado");
                                    if (isEdit && vehicleId) {
                                      const { error } = await supabase.from("vehicles").update(buildPayload()).eq("id", vehicleId);
                                      if (error) throw error;
                                      setSavedVehicleIdForLink(vehicleId);
                                    } else {
                                      const { data, error } = await supabase.from("vehicles").insert({ ...buildPayload(), user_id: user.id }).select("id").single();
                                      if (error) throw error;
                                      setSavedVehicleIdForLink(data.id);
                                    }
                                    toast({ title: "Veículo salvo! Agora cadastre o " + (isTruck ? "motorista" : "colaborador") + "." });
                                    onOpenChange(false);
                                    onSaved();
                                    setPersonCreateCategory(isTruck ? "motorista" : "colaborador");
                                    setPersonCreateTarget("driver");
                                    setPersonCreateOpen(true);
                                  } catch (error: any) {
                                    toast({ title: "Erro ao salvar veículo", description: error.message, variant: "destructive" });
                                  } finally {
                                    setLoading(false);
                                  }
                                }}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                              </Button>
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Proprietário</Label>
                          {driverIsOwner ? (
                            <Input value={driverName || "—"} disabled className="text-muted-foreground" />
                          ) : (
                            <PersonSearchInput
                              categories={["proprietario"]}
                              placeholder="Buscar proprietário..."
                              selectedName={ownerName || undefined}
                              onSelect={(person) => {
                                setForm((p) => ({ ...p, ownerId: person.user_id }));
                                setOwnerName(person.full_name);
                              }}
                              onClear={() => {
                                setForm((p) => ({ ...p, ownerId: "" }));
                                setOwnerName("");
                              }}
                              endAction={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Cadastrar proprietário"
                                  onClick={async () => {
                                    if (!validate()) {
                                      toast({ title: "Preencha os dados do veículo antes de cadastrar", variant: "destructive" });
                                      return;
                                    }
                                    setLoading(true);
                                    try {
                                      const { data: { user } } = await supabase.auth.getUser();
                                      if (!user) throw new Error("Não autenticado");
                                      if (isEdit && vehicleId) {
                                        const { error } = await supabase.from("vehicles").update(buildPayload()).eq("id", vehicleId);
                                        if (error) throw error;
                                        setSavedVehicleIdForLink(vehicleId);
                                      } else {
                                        const { data, error } = await supabase.from("vehicles").insert({ ...buildPayload(), user_id: user.id }).select("id").single();
                                        if (error) throw error;
                                        setSavedVehicleIdForLink(data.id);
                                      }
                                      toast({ title: "Veículo salvo! Agora cadastre o proprietário." });
                                      onOpenChange(false);
                                      onSaved();
                                      setPersonCreateCategory("proprietario");
                                      setPersonCreateTarget("owner");
                                      setPersonCreateOpen(true);
                                    } catch (error: any) {
                                      toast({ title: "Erro ao salvar veículo", description: error.message, variant: "destructive" });
                                    } finally {
                                      setLoading(false);
                                    }
                                  }}
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                </Button>
                              }
                            />
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
                              setOwnerName(driverName);
                            } else {
                              setForm((p) => ({ ...p, ownerId: "" }));
                              setOwnerName("");
                            }
                          }}
                          disabled={!form.driverId}
                        />
                        <Label htmlFor="driver-is-owner" className="text-xs font-normal cursor-pointer">
                          {isTruck ? "Motorista é o proprietário do conjunto" : "Colaborador é o proprietário"}
                        </Label>
                      </div>

                      {/* Tipo de Frota */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">Tipo de Frota</Label>
                        <RadioGroup
                          value={form.fleetType}
                          onValueChange={(v) => setForm((p) => ({ ...p, fleetType: v }))}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="propria" id="fleet-propria" />
                            <Label htmlFor="fleet-propria" className="text-sm font-normal cursor-pointer">Frota Própria</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="terceiros" id="fleet-terceiros" />
                            <Label htmlFor="fleet-terceiros" className="text-sm font-normal cursor-pointer">Frota Terceiros</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>

                    <Button className="w-full mt-2" onClick={handleSubmit} disabled={loading}>
                      {loading ? "Salvando..." : isEdit ? "Salvar Alterações" : "Cadastrar Veículo"}
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    <PersonCreateDialog
      open={personCreateOpen}
      onOpenChange={setPersonCreateOpen}
      defaultCategory={personCreateCategory}
      onCreated={async (createdUserId) => {
        if (createdUserId && savedVehicleIdForLink) {
          const updateField = personCreateTarget === "driver" ? "driver_id" : "owner_id";
          await supabase.from("vehicles").update({ [updateField]: createdUserId } as any).eq("id", savedVehicleIdForLink);
          onSaved();
          toast({ title: personCreateTarget === "driver" ? "Motorista vinculado ao veículo!" : "Proprietário vinculado ao veículo!" });
        }
        setSavedVehicleIdForLink(null);
      }}
    />
    </>
  );
}
