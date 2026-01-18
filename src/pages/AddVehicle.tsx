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
import { z } from "zod";

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

const plateRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

const baseVehicleSchema = z.object({
  plate: z.string().regex(plateRegex, "Placa inválida (formato: ABC1D23)"),
  renavam: z.string().min(9, "RENAVAM inválido"),
  vehicleType: z.string().min(1, "Selecione o tipo"),
  brand: z.string().min(2, "Marca obrigatória"),
  model: z.string().min(2, "Modelo obrigatório"),
  year: z.number().min(1990, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido"),
  anttNumber: z.string().optional(),
  cargoType: z.string().optional(),
  trailerPlate1: z.string().optional(),
  trailerPlate2: z.string().optional(),
  trailerPlate3: z.string().optional(),
});

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
    trailerPlate2: "",
    trailerPlate3: "",
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
    const isPlateField = name === "plate" || name.startsWith("trailerPlate");
    setVehicleData((prev) => ({ 
      ...prev, 
      [name]: isPlateField ? value.toUpperCase() : value 
    }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleVehicleTypeChange = (value: string) => {
    setVehicleData((prev) => ({ 
      ...prev, 
      vehicleType: value,
      // Reset trailer plates when vehicle type changes
      trailerPlate1: "",
      trailerPlate2: "",
      trailerPlate3: "",
    }));
    setErrors((prev) => ({ ...prev, vehicleType: "" }));
  };

  const validateTrailerPlates = (): Record<string, string> => {
    const trailerErrors: Record<string, string> = {};
    const config = trailerRequirements[vehicleData.vehicleType] || { count: 0, labels: [] };
    
    if (config.count >= 1 && vehicleData.trailerPlate1) {
      if (!plateRegex.test(vehicleData.trailerPlate1)) {
        trailerErrors.trailerPlate1 = "Placa inválida (formato: ABC1D23)";
      }
    } else if (config.count >= 1 && !vehicleData.trailerPlate1) {
      trailerErrors.trailerPlate1 = "Placa obrigatória";
    }

    if (config.count >= 2 && vehicleData.trailerPlate2) {
      if (!plateRegex.test(vehicleData.trailerPlate2)) {
        trailerErrors.trailerPlate2 = "Placa inválida (formato: ABC1D23)";
      }
    } else if (config.count >= 2 && !vehicleData.trailerPlate2) {
      trailerErrors.trailerPlate2 = "Placa obrigatória";
    }

    if (config.count >= 3 && vehicleData.trailerPlate3) {
      if (!plateRegex.test(vehicleData.trailerPlate3)) {
        trailerErrors.trailerPlate3 = "Placa inválida (formato: ABC1D23)";
      }
    } else if (config.count >= 3 && !vehicleData.trailerPlate3) {
      trailerErrors.trailerPlate3 = "Placa obrigatória";
    }

    return trailerErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setErrors({});

    let validationErrors: Record<string, string> = {};

    try {
      baseVehicleSchema.parse({
        ...vehicleData,
        year: parseInt(vehicleData.year) || 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach((err) => {
          if (err.path[0]) {
            validationErrors[err.path[0] as string] = err.message;
          }
        });
      }
    }

    // Validate trailer plates
    const trailerErrors = validateTrailerPlates();
    validationErrors = { ...validationErrors, ...trailerErrors };

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("vehicles").insert([{
        user_id: user.id,
        plate: vehicleData.plate,
        renavam: vehicleData.renavam,
        vehicle_type: vehicleData.vehicleType as "truck" | "bitruck" | "carreta" | "carreta_ls" | "rodotrem" | "bitrem" | "treminhao",
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: parseInt(vehicleData.year),
        antt_number: vehicleData.anttNumber || null,
        cargo_type: vehicleData.cargoType || null,
        trailer_plate_1: vehicleData.trailerPlate1 || null,
        trailer_plate_2: vehicleData.trailerPlate2 || null,
        trailer_plate_3: vehicleData.trailerPlate3 || null,
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
                  <Label htmlFor="plate">Placa do Cavalo</Label>
                  <Input
                    id="plate"
                    name="plate"
                    placeholder="ABC1D23"
                    maxLength={7}
                    value={vehicleData.plate}
                    onChange={handleChange}
                    className="input-transport uppercase"
                  />
                  {errors.plate && (
                    <p className="text-sm text-destructive">{errors.plate}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="renavam">RENAVAM</Label>
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
                  <Label>Tipo de Veículo</Label>
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
                  <Label htmlFor="brand">Marca</Label>
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
                  <Label htmlFor="model">Modelo</Label>
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
                  <Label htmlFor="year">Ano</Label>
                  <Input
                    id="year"
                    name="year"
                    type="number"
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
                <Label>Tipo de Carroceria</Label>
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
                  
                  <div className="grid md:grid-cols-2 gap-5">
                    {trailerConfig.count >= 1 && (
                      <div className="space-y-2">
                        <Label htmlFor="trailerPlate1">{trailerConfig.labels[0]}</Label>
                        <Input
                          id="trailerPlate1"
                          name="trailerPlate1"
                          placeholder="ABC1D23"
                          maxLength={7}
                          value={vehicleData.trailerPlate1}
                          onChange={handleChange}
                          className="input-transport uppercase"
                        />
                        {errors.trailerPlate1 && (
                          <p className="text-sm text-destructive">{errors.trailerPlate1}</p>
                        )}
                      </div>
                    )}

                    {trailerConfig.count >= 2 && (
                      <div className="space-y-2">
                        <Label htmlFor="trailerPlate2">{trailerConfig.labels[1]}</Label>
                        <Input
                          id="trailerPlate2"
                          name="trailerPlate2"
                          placeholder="ABC1D23"
                          maxLength={7}
                          value={vehicleData.trailerPlate2}
                          onChange={handleChange}
                          className="input-transport uppercase"
                        />
                        {errors.trailerPlate2 && (
                          <p className="text-sm text-destructive">{errors.trailerPlate2}</p>
                        )}
                      </div>
                    )}

                    {trailerConfig.count >= 3 && (
                      <div className="space-y-2">
                        <Label htmlFor="trailerPlate3">{trailerConfig.labels[2]}</Label>
                        <Input
                          id="trailerPlate3"
                          name="trailerPlate3"
                          placeholder="ABC1D23"
                          maxLength={7}
                          value={vehicleData.trailerPlate3}
                          onChange={handleChange}
                          className="input-transport uppercase"
                        />
                        {errors.trailerPlate3 && (
                          <p className="text-sm text-destructive">{errors.trailerPlate3}</p>
                        )}
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
