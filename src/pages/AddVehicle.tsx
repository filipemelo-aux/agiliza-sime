import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  maskPlate, unmaskPlate, maskRenavam, maskYear, maskOnlyLettersNumbers,
  validatePlate, validateRenavam
} from "@/lib/masks";

// Define trailer requirements per vehicle type
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

export default function AddVehicle() {
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

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
  });

  const trailerConfig = trailerRequirements[vehicleData.vehicleType] || { count: 0, labels: [] };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (!session?.user) {
          navigate("/auth");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let maskedValue = value;
    
    const isPlateField = name === "plate" || name.startsWith("trailerPlate");
    const isRenavamField = name === "renavam" || name.startsWith("trailerRenavam");
    
    if (isPlateField) {
      maskedValue = maskPlate(value);
    } else if (isRenavamField) {
      maskedValue = maskRenavam(value);
    } else if (name === "year") {
      maskedValue = maskYear(value);
    } else if (name === "brand" || name === "model") {
      maskedValue = maskOnlyLettersNumbers(value);
    } else if (name === "anttNumber") {
      maskedValue = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    }
    
    setVehicleData((prev) => ({ ...prev, [name]: maskedValue }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleVehicleTypeChange = (value: string) => {
    setVehicleData((prev) => ({ 
      ...prev, 
      vehicleType: value,
      trailerPlate1: "",
      trailerRenavam1: "",
      trailerPlate2: "",
      trailerRenavam2: "",
      trailerPlate3: "",
      trailerRenavam3: "",
    }));
    setErrors((prev) => ({ ...prev, vehicleType: "" }));
  };

  const validateTrailerFields = (): Record<string, string> => {
    const trailerErrors: Record<string, string> = {};
    const config = trailerRequirements[vehicleData.vehicleType] || { count: 0, labels: [] };
    
    if (config.count >= 1) {
      const plate1 = unmaskPlate(vehicleData.trailerPlate1);
      if (!validatePlate(plate1)) {
        trailerErrors.trailerPlate1 = "Placa inválida (formato: ABC-1D23)";
      }
      if (!validateRenavam(vehicleData.trailerRenavam1)) {
        trailerErrors.trailerRenavam1 = "RENAVAM deve ter 11 dígitos";
      }
    }

    if (config.count >= 2) {
      const plate2 = unmaskPlate(vehicleData.trailerPlate2);
      if (!validatePlate(plate2)) {
        trailerErrors.trailerPlate2 = "Placa inválida (formato: ABC-1D23)";
      }
      if (!validateRenavam(vehicleData.trailerRenavam2)) {
        trailerErrors.trailerRenavam2 = "RENAVAM deve ter 11 dígitos";
      }
    }

    if (config.count >= 3) {
      const plate3 = unmaskPlate(vehicleData.trailerPlate3);
      if (!validatePlate(plate3)) {
        trailerErrors.trailerPlate3 = "Placa inválida (formato: ABC-1D23)";
      }
      if (!validateRenavam(vehicleData.trailerRenavam3)) {
        trailerErrors.trailerRenavam3 = "RENAVAM deve ter 11 dígitos";
      }
    }

    return trailerErrors;
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    const plateClean = unmaskPlate(vehicleData.plate);
    if (!validatePlate(plateClean)) {
      newErrors.plate = "Placa inválida (formato: ABC-1D23)";
    }
    
    if (!validateRenavam(vehicleData.renavam)) {
      newErrors.renavam = "RENAVAM deve ter 11 dígitos";
    }
    
    if (!vehicleData.vehicleType) {
      newErrors.vehicleType = "Selecione o tipo de veículo";
    }
    
    if (!vehicleData.brand.trim() || vehicleData.brand.trim().length < 2) {
      newErrors.brand = "Marca é obrigatória (mínimo 2 caracteres)";
    }
    
    if (!vehicleData.model.trim() || vehicleData.model.trim().length < 2) {
      newErrors.model = "Modelo é obrigatório (mínimo 2 caracteres)";
    }
    
    const year = parseInt(vehicleData.year);
    if (!year || year < 1990 || year > new Date().getFullYear() + 1) {
      newErrors.year = "Ano inválido (entre 1990 e " + (new Date().getFullYear() + 1) + ")";
    }
    
    if (!vehicleData.cargoType) {
      newErrors.cargoType = "Selecione o tipo de carroceria";
    }
    
    // Validate trailer fields
    const trailerErrors = validateTrailerFields();
    
    const allErrors = { ...newErrors, ...trailerErrors };
    setErrors(allErrors);
    return Object.keys(allErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!validateForm()) return;

    setLoading(true);

    try {
      const { error } = await supabase.from("vehicles").insert([{
        user_id: user.id,
        plate: unmaskPlate(vehicleData.plate),
        renavam: vehicleData.renavam,
        vehicle_type: vehicleData.vehicleType as "truck" | "bitruck" | "carreta" | "carreta_ls" | "rodotrem" | "bitrem" | "treminhao",
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
      }]);

      if (error) throw error;

      toast({
        title: "Veículo adicionado!",
        description: "Seu veículo foi cadastrado com sucesso.",
      });

      navigate("/my-vehicles");
    } catch (error: any) {
      toast({
        title: "Erro ao adicionar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Link
            to="/my-vehicles"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para Meus Veículos
          </Link>

          <div className="flex items-center gap-4 mb-8">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Truck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Adicionar Veículo</h1>
              <p className="text-muted-foreground">
                Cadastre um novo veículo à sua frota
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="bg-card rounded-xl border border-border p-6 space-y-5">
              {/* Basic vehicle info */}
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="plate">Placa do Cavalo *</Label>
                  <Input
                    id="plate"
                    name="plate"
                    placeholder="ABC-1D23"
                    value={vehicleData.plate}
                    onChange={handleChange}
                    className="input-transport uppercase"
                  />
                  {errors.plate && (
                    <p className="text-sm text-destructive">{errors.plate}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="renavam">RENAVAM *</Label>
                  <Input
                    id="renavam"
                    name="renavam"
                    placeholder="00000000000"
                    value={vehicleData.renavam}
                    onChange={handleChange}
                    className="input-transport"
                  />
                  {errors.renavam && (
                    <p className="text-sm text-destructive">{errors.renavam}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Veículo *</Label>
                  <Select
                    value={vehicleData.vehicleType}
                    onValueChange={handleVehicleTypeChange}
                  >
                    <SelectTrigger className="input-transport">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.vehicleType && (
                    <p className="text-sm text-destructive">{errors.vehicleType}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand">Marca *</Label>
                  <Input
                    id="brand"
                    name="brand"
                    placeholder="Volvo, Scania, Mercedes..."
                    value={vehicleData.brand}
                    onChange={handleChange}
                    className="input-transport"
                  />
                  {errors.brand && (
                    <p className="text-sm text-destructive">{errors.brand}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Modelo *</Label>
                  <Input
                    id="model"
                    name="model"
                    placeholder="FH 540"
                    value={vehicleData.model}
                    onChange={handleChange}
                    className="input-transport"
                  />
                  {errors.model && (
                    <p className="text-sm text-destructive">{errors.model}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year">Ano *</Label>
                  <Input
                    id="year"
                    name="year"
                    placeholder="2024"
                    value={vehicleData.year}
                    onChange={handleChange}
                    className="input-transport"
                  />
                  {errors.year && (
                    <p className="text-sm text-destructive">{errors.year}</p>
                  )}
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="anttNumber">ANTT (opcional)</Label>
                  <Input
                    id="anttNumber"
                    name="anttNumber"
                    placeholder="Número do RNTRC"
                    value={vehicleData.anttNumber}
                    onChange={handleChange}
                    className="input-transport"
                  />
                </div>
              </div>

              {/* Cargo Type Selection */}
              <div className="space-y-3 pt-4 border-t border-border">
                <Label>Tipo de Carroceria *</Label>
                <RadioGroup
                  value={vehicleData.cargoType}
                  onValueChange={(value) => setVehicleData(prev => ({ ...prev, cargoType: value }))}
                  className="flex gap-6"
                >
                  {cargoTypes.map((type) => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <RadioGroupItem value={type.value} id={type.value} />
                      <Label htmlFor={type.value} className="font-normal cursor-pointer">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {errors.cargoType && (
                  <p className="text-sm text-destructive">{errors.cargoType}</p>
                )}
              </div>

              {/* Trailer Plates Section */}
              {trailerConfig.count > 0 && (
                <div className="space-y-4 pt-4 border-t border-border">
                  <div>
                    <h3 className="font-semibold text-lg">Placas dos Implementos</h3>
                    <p className="text-sm text-muted-foreground">
                      Informe as placas dos implementos do conjunto
                    </p>
                  </div>
                  
                  <div className="grid gap-5">
                    {trailerConfig.count >= 1 && (
                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="trailerPlate1">{trailerConfig.labels[0]} *</Label>
                          <Input
                            id="trailerPlate1"
                            name="trailerPlate1"
                            placeholder="ABC-1D23"
                            value={vehicleData.trailerPlate1}
                            onChange={handleChange}
                            className="input-transport uppercase"
                          />
                          {errors.trailerPlate1 && (
                            <p className="text-sm text-destructive">{errors.trailerPlate1}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trailerRenavam1">RENAVAM {trailerConfig.labels[0]?.replace("Placa ", "")} *</Label>
                          <Input
                            id="trailerRenavam1"
                            name="trailerRenavam1"
                            placeholder="00000000000"
                            value={vehicleData.trailerRenavam1}
                            onChange={handleChange}
                            className="input-transport"
                          />
                          {errors.trailerRenavam1 && (
                            <p className="text-sm text-destructive">{errors.trailerRenavam1}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {trailerConfig.count >= 2 && (
                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="trailerPlate2">{trailerConfig.labels[1]} *</Label>
                          <Input
                            id="trailerPlate2"
                            name="trailerPlate2"
                            placeholder="ABC-1D23"
                            value={vehicleData.trailerPlate2}
                            onChange={handleChange}
                            className="input-transport uppercase"
                          />
                          {errors.trailerPlate2 && (
                            <p className="text-sm text-destructive">{errors.trailerPlate2}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trailerRenavam2">RENAVAM {trailerConfig.labels[1]?.replace("Placa ", "")} *</Label>
                          <Input
                            id="trailerRenavam2"
                            name="trailerRenavam2"
                            placeholder="00000000000"
                            value={vehicleData.trailerRenavam2}
                            onChange={handleChange}
                            className="input-transport"
                          />
                          {errors.trailerRenavam2 && (
                            <p className="text-sm text-destructive">{errors.trailerRenavam2}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {trailerConfig.count >= 3 && (
                      <div className="grid md:grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label htmlFor="trailerPlate3">{trailerConfig.labels[2]} *</Label>
                          <Input
                            id="trailerPlate3"
                            name="trailerPlate3"
                            placeholder="ABC-1D23"
                            value={vehicleData.trailerPlate3}
                            onChange={handleChange}
                            className="input-transport uppercase"
                          />
                          {errors.trailerPlate3 && (
                            <p className="text-sm text-destructive">{errors.trailerPlate3}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="trailerRenavam3">RENAVAM {trailerConfig.labels[2]?.replace("Placa ", "")} *</Label>
                          <Input
                            id="trailerRenavam3"
                            name="trailerRenavam3"
                            placeholder="00000000000"
                            value={vehicleData.trailerRenavam3}
                            onChange={handleChange}
                            className="input-transport"
                          />
                          {errors.trailerRenavam3 && (
                            <p className="text-sm text-destructive">{errors.trailerRenavam3}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/my-vehicles")}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="btn-transport-accent px-8"
                >
                  {loading ? "Salvando..." : "Adicionar Veículo"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
