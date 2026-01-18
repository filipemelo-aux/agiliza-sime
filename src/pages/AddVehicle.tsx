import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const vehicleSchema = z.object({
  plate: z.string().regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/, "Placa inválida (formato: ABC1D23)"),
  renavam: z.string().min(9, "RENAVAM inválido"),
  vehicleType: z.string().min(1, "Selecione o tipo"),
  brand: z.string().min(2, "Marca obrigatória"),
  model: z.string().min(2, "Modelo obrigatório"),
  year: z.number().min(1990, "Ano inválido").max(new Date().getFullYear() + 1, "Ano inválido"),
  anttNumber: z.string().optional(),
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
  });

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
    setVehicleData((prev) => ({ ...prev, [name]: name === "plate" ? value.toUpperCase() : value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setErrors({});

    try {
      vehicleSchema.parse({
        ...vehicleData,
        year: parseInt(vehicleData.year) || 0,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
        return;
      }
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
              <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="plate">Placa</Label>
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
                    onValueChange={(value) =>
                      setVehicleData((prev) => ({ ...prev, vehicleType: value }))
                    }
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
