import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Header } from "@/components/Header";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { 
  maskPlate, unmaskPlate, maskRenavam, maskYear, maskOnlyLettersNumbers,
  validatePlate, validateRenavam
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

export default function EditVehicle() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  const [profiles, setProfiles] = useState<ProfileOption[]>([]);

  const [vehicleData, setVehicleData] = useState({
    plate: "",
    renavam: "",
    vehicleType: "",
    brand: "",
    model: "",
    year: "",
    anttNumber: "",
    cargoType: "",
    trailerPlate1: "",
    trailerRenavam1: "",
    trailerPlate2: "",
    trailerRenavam2: "",
    trailerPlate3: "",
    trailerRenavam3: "",
    driverId: "",
    ownerId: "",
  });

  const trailerConfig = trailerRequirements[vehicleData.vehicleType] || { count: 0, labels: [] };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        } else if (id) {
          setTimeout(() => fetchVehicle(id, session.user.id), 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      } else if (id) {
        fetchVehicle(id, session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, id]);

  // Load profiles for admin to select driver/owner
  useEffect(() => {
    if (isAdmin) {
      supabase.from("profiles").select("user_id, full_name, category").order("full_name").then(({ data }) => {
        setProfiles((data as any[]) || []);
      });
    }
  }, [isAdmin]);

  const fetchVehicle = async (vehicleId: string, userId: string) => {
    try {
      let query = supabase.from("vehicles").select("*").eq("id", vehicleId);
      // Admins can edit any vehicle, regular users only their own
      if (!isAdmin) {
        query = query.eq("user_id", userId);
      }
      const { data, error } = await query.single();

      if (error) throw error;
      if (!data) {
        toast({ title: "Veículo não encontrado", variant: "destructive" });
        navigate(isAdmin ? "/admin/drivers" : "/my-vehicles");
        return;
      }

      setVehicleData({
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
    } catch (error) {
      console.error("Error fetching vehicle:", error);
      navigate(isAdmin ? "/admin/drivers" : "/my-vehicles");
    } finally {
      setFetching(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let maskedValue = value;
    const isPlateField = name === "plate" || name.startsWith("trailerPlate");
    const isRenavamField = name === "renavam" || name.startsWith("trailerRenavam");
    if (isPlateField) maskedValue = maskPlate(value);
    else if (isRenavamField) maskedValue = maskRenavam(value);
    else if (name === "year") maskedValue = maskYear(value);
    else if (name === "brand" || name === "model") maskedValue = maskOnlyLettersNumbers(value);
    else if (name === "anttNumber") maskedValue = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    setVehicleData((prev) => ({ ...prev, [name]: maskedValue }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleVehicleTypeChange = (value: string) => {
    setVehicleData((prev) => ({ 
      ...prev, vehicleType: value,
      trailerPlate1: "", trailerRenavam1: "",
      trailerPlate2: "", trailerRenavam2: "",
      trailerPlate3: "", trailerRenavam3: "",
    }));
    setErrors((prev) => ({ ...prev, vehicleType: "" }));
  };

  const validateTrailerFields = (): Record<string, string> => {
    const trailerErrors: Record<string, string> = {};
    const config = trailerRequirements[vehicleData.vehicleType] || { count: 0, labels: [] };
    if (config.count >= 1) {
      if (!validatePlate(unmaskPlate(vehicleData.trailerPlate1))) trailerErrors.trailerPlate1 = "Placa inválida";
      if (!validateRenavam(vehicleData.trailerRenavam1)) trailerErrors.trailerRenavam1 = "RENAVAM inválido";
    }
    if (config.count >= 2) {
      if (!validatePlate(unmaskPlate(vehicleData.trailerPlate2))) trailerErrors.trailerPlate2 = "Placa inválida";
      if (!validateRenavam(vehicleData.trailerRenavam2)) trailerErrors.trailerRenavam2 = "RENAVAM inválido";
    }
    if (config.count >= 3) {
      if (!validatePlate(unmaskPlate(vehicleData.trailerPlate3))) trailerErrors.trailerPlate3 = "Placa inválida";
      if (!validateRenavam(vehicleData.trailerRenavam3)) trailerErrors.trailerRenavam3 = "RENAVAM inválido";
    }
    return trailerErrors;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!validatePlate(unmaskPlate(vehicleData.plate))) newErrors.plate = "Placa inválida";
    if (!validateRenavam(vehicleData.renavam)) newErrors.renavam = "RENAVAM inválido";
    if (!vehicleData.vehicleType) newErrors.vehicleType = "Selecione o tipo";
    if (!vehicleData.brand.trim() || vehicleData.brand.trim().length < 2) newErrors.brand = "Marca obrigatória";
    if (!vehicleData.model.trim() || vehicleData.model.trim().length < 2) newErrors.model = "Modelo obrigatório";
    const year = parseInt(vehicleData.year);
    if (!year || year < 1990 || year > new Date().getFullYear() + 1) newErrors.year = "Ano inválido";
    if (!vehicleData.cargoType) newErrors.cargoType = "Selecione a carroceria";
    const allErrors = { ...newErrors, ...validateTrailerFields() };
    setErrors(allErrors);
    return Object.keys(allErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;
    if (!validateForm()) return;
    setLoading(true);
    try {
      const updatePayload: any = {
        plate: unmaskPlate(vehicleData.plate),
        renavam: vehicleData.renavam,
        vehicle_type: vehicleData.vehicleType,
        brand: vehicleData.brand.trim(),
        model: vehicleData.model.trim(),
        year: parseInt(vehicleData.year),
        antt_number: vehicleData.anttNumber || null,
        cargo_type: vehicleData.cargoType || null,
        trailer_plate_1: unmaskPlate(vehicleData.trailerPlate1) || null,
        trailer_renavam_1: vehicleData.trailerRenavam1 || null,
        trailer_plate_2: unmaskPlate(vehicleData.trailerPlate2) || null,
        trailer_renavam_2: vehicleData.trailerRenavam2 || null,
        trailer_plate_3: unmaskPlate(vehicleData.trailerPlate3) || null,
        trailer_renavam_3: vehicleData.trailerRenavam3 || null,
        driver_id: vehicleData.driverId || null,
        owner_id: vehicleData.ownerId || null,
      };

      let query = supabase.from("vehicles").update(updatePayload).eq("id", id);
      if (!isAdmin) query = query.eq("user_id", user.id);
      const { error } = await query;
      if (error) throw error;

      toast({ title: "Veículo atualizado!", description: "Alterações salvas." });
      navigate(isAdmin ? "/admin/drivers" : "/my-vehicles");
    } catch (error: any) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const backUrl = isAdmin ? "/admin/drivers" : "/my-vehicles";
  const backLabel = isAdmin ? "Voltar para Cadastros" : "Voltar para Meus Veículos";

  const motoristas = profiles.filter(p => p.category === "motorista");
  const proprietarios = profiles.filter(p => p.category !== "motorista" || true); // All profiles can be owners

  const formContent = (
    <div className="max-w-2xl mx-auto">
      <Link to={backUrl} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
          <Truck className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display">Editar Veículo</h1>
          <p className="text-muted-foreground">Atualize as informações do veículo</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          {/* Driver/Owner linking - admin only */}
          {isAdmin && (
            <div className="space-y-4 pb-4 border-b border-border">
              <h3 className="font-semibold">Vínculos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Motorista</Label>
                  <Select value={vehicleData.driverId || "__none__"} onValueChange={(v) => setVehicleData(p => ({ ...p, driverId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {motoristas.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Proprietário</Label>
                  <Select value={vehicleData.ownerId || "__none__"} onValueChange={(v) => setVehicleData(p => ({ ...p, ownerId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {proprietarios.map(p => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="plate">Placa do Cavalo *</Label>
              <Input id="plate" name="plate" placeholder="ABC-1D23" maxLength={8} value={vehicleData.plate} onChange={handleChange} className="input-transport uppercase" />
              {errors.plate && <p className="text-sm text-destructive">{errors.plate}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="renavam">RENAVAM *</Label>
              <Input id="renavam" name="renavam" placeholder="00000000000" maxLength={11} value={vehicleData.renavam} onChange={handleChange} className="input-transport" />
              {errors.renavam && <p className="text-sm text-destructive">{errors.renavam}</p>}
            </div>
            <div className="space-y-2">
              <Label>Tipo de Veículo *</Label>
              <Select value={vehicleData.vehicleType} onValueChange={handleVehicleTypeChange}>
                <SelectTrigger className="input-transport"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{vehicleTypes.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              {errors.vehicleType && <p className="text-sm text-destructive">{errors.vehicleType}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Marca *</Label>
              <Input id="brand" name="brand" placeholder="Volvo, Scania..." value={vehicleData.brand} onChange={handleChange} className="input-transport" />
              {errors.brand && <p className="text-sm text-destructive">{errors.brand}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo *</Label>
              <Input id="model" name="model" placeholder="FH 540" value={vehicleData.model} onChange={handleChange} className="input-transport" />
              {errors.model && <p className="text-sm text-destructive">{errors.model}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Ano *</Label>
              <Input id="year" name="year" placeholder="2024" maxLength={4} value={vehicleData.year} onChange={handleChange} className="input-transport" />
              {errors.year && <p className="text-sm text-destructive">{errors.year}</p>}
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="anttNumber">ANTT (opcional)</Label>
              <Input id="anttNumber" name="anttNumber" placeholder="Número do RNTRC" value={vehicleData.anttNumber} onChange={handleChange} className="input-transport" />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <Label>Tipo de Carroceria *</Label>
            <RadioGroup value={vehicleData.cargoType} onValueChange={(value) => setVehicleData(prev => ({ ...prev, cargoType: value }))} className="flex gap-6">
              {cargoTypes.map(t => (
                <div key={t.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={t.value} id={`edit-${t.value}`} />
                  <Label htmlFor={`edit-${t.value}`} className="font-normal cursor-pointer">{t.label}</Label>
                </div>
              ))}
            </RadioGroup>
            {errors.cargoType && <p className="text-sm text-destructive">{errors.cargoType}</p>}
          </div>

          {trailerConfig.count > 0 && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <h3 className="font-semibold text-lg">Implementos do Conjunto</h3>
                <p className="text-sm text-muted-foreground">Placas e RENAVAM dos implementos</p>
              </div>
              <div className="grid gap-5">
                {Array.from({ length: trailerConfig.count }).map((_, i) => {
                  const idx = i + 1;
                  const plateKey = `trailerPlate${idx}` as keyof typeof vehicleData;
                  const renavamKey = `trailerRenavam${idx}` as keyof typeof vehicleData;
                  return (
                    <div key={i} className="grid md:grid-cols-2 gap-5 p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="space-y-2">
                        <Label>{trailerConfig.labels[i]} *</Label>
                        <Input name={plateKey} placeholder="ABC-1D23" maxLength={8} value={vehicleData[plateKey]} onChange={handleChange} className="input-transport uppercase" />
                        {errors[plateKey] && <p className="text-sm text-destructive">{errors[plateKey]}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>RENAVAM *</Label>
                        <Input name={renavamKey} placeholder="00000000000" maxLength={11} value={vehicleData[renavamKey]} onChange={handleChange} className="input-transport" />
                        {errors[renavamKey] && <p className="text-sm text-destructive">{errors[renavamKey]}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </form>
    </div>
  );

  if (fetching) {
    return isAdmin ? (
      <AdminLayout>
        <div className="container mx-auto px-4 py-16">
          <div className="animate-pulse space-y-4 max-w-2xl mx-auto">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-96 bg-muted rounded" />
          </div>
        </div>
      </AdminLayout>
    ) : (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="animate-pulse space-y-4 max-w-2xl mx-auto">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="h-96 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          {formContent}
        </div>
      </AdminLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        {formContent}
      </div>
    </div>
  );
}
