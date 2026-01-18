import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Truck, FileText, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const profileSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos"),
  phone: z.string().min(10, "Telefone inválido"),
  cnhNumber: z.string().min(9, "CNH inválida"),
  cnhCategory: z.string().min(1, "Selecione a categoria"),
  cnhExpiry: z.string().min(1, "Data de validade obrigatória"),
});

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

const cnhCategories = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];

export default function Register() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  const [profileData, setProfileData] = useState({
    fullName: "",
    cpf: "",
    phone: "",
    cnhNumber: "",
    cnhCategory: "",
    cnhExpiry: "",
  });

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

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleVehicleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setVehicleData((prev) => ({ ...prev, [name]: value.toUpperCase() }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateStep1 = () => {
    try {
      profileSchema.parse(profileData);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const validateStep2 = () => {
    try {
      vehicleSchema.parse({
        ...vehicleData,
        year: parseInt(vehicleData.year) || 0,
      });
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
      setErrors({});
    }
  };

  const handleSubmit = async () => {
    if (!validateStep2()) return;
    if (!user) return;

    setLoading(true);

    try {
      // Create profile
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: profileData.fullName,
        cpf: profileData.cpf,
        phone: profileData.phone,
        cnh_number: profileData.cnhNumber,
        cnh_category: profileData.cnhCategory,
        cnh_expiry: profileData.cnhExpiry,
      });

      if (profileError) throw profileError;

      // Create vehicle
      const { error: vehicleError } = await supabase.from("vehicles").insert([{
        user_id: user.id,
        plate: vehicleData.plate,
        renavam: vehicleData.renavam,
        vehicle_type: vehicleData.vehicleType as "truck" | "bitruck" | "carreta" | "carreta_ls" | "rodotrem" | "bitrem" | "treminhao",
        brand: vehicleData.brand,
        model: vehicleData.model,
        year: parseInt(vehicleData.year),
        antt_number: vehicleData.anttNumber || null,
      }]);

      if (vehicleError) throw vehicleError;

      toast({
        title: "Cadastro completo!",
        description: "Seu perfil e veículo foram cadastrados com sucesso.",
      });

      navigate("/");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast({
        title: "Erro no cadastro",
        description: error.message || "Ocorreu um erro. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { number: 1, title: "Dados Pessoais", icon: User },
    { number: 2, title: "Veículo", icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-12">
            {steps.map((s, index) => (
              <div key={s.number} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    step >= s.number
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > s.number ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <s.icon className="w-5 h-5" />
                  )}
                  <span className="font-medium hidden sm:block">{s.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-12 h-0.5 mx-2 transition-all ${
                      step > s.number ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: Personal Data */}
          {step === 1 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold font-display mb-2">
                  Dados Pessoais
                </h2>
                <p className="text-muted-foreground">
                  Preencha suas informações e documentos
                </p>
              </div>

              <div className="bg-card rounded-xl border border-border p-6 space-y-5">
                <div className="grid md:grid-cols-2 gap-5">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="fullName">Nome Completo</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      placeholder="João da Silva"
                      value={profileData.fullName}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.fullName && (
                      <p className="text-sm text-destructive">{errors.fullName}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cpf">CPF</Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      placeholder="00000000000"
                      maxLength={11}
                      value={profileData.cpf}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.cpf && (
                      <p className="text-sm text-destructive">{errors.cpf}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="11999999999"
                      value={profileData.phone}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.phone && (
                      <p className="text-sm text-destructive">{errors.phone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnhNumber">Número da CNH</Label>
                    <Input
                      id="cnhNumber"
                      name="cnhNumber"
                      placeholder="000000000"
                      value={profileData.cnhNumber}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.cnhNumber && (
                      <p className="text-sm text-destructive">{errors.cnhNumber}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Categoria da CNH</Label>
                    <Select
                      value={profileData.cnhCategory}
                      onValueChange={(value) =>
                        setProfileData((prev) => ({ ...prev, cnhCategory: value }))
                      }
                    >
                      <SelectTrigger className="input-transport">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {cnhCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.cnhCategory && (
                      <p className="text-sm text-destructive">{errors.cnhCategory}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnhExpiry">Validade da CNH</Label>
                    <Input
                      id="cnhExpiry"
                      name="cnhExpiry"
                      type="date"
                      value={profileData.cnhExpiry}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.cnhExpiry && (
                      <p className="text-sm text-destructive">{errors.cnhExpiry}</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={handleNext}
                    className="btn-transport-primary px-8"
                  >
                    Próximo
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Vehicle Data */}
          {step === 2 && (
            <div className="animate-fade-in">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold font-display mb-2">
                  Dados do Veículo
                </h2>
                <p className="text-muted-foreground">
                  Informações do cavalo (caminhão trator)
                </p>
              </div>

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
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
                      className="input-transport"
                    />
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                  >
                    <ChevronLeft className="w-4 h-4 mr-2" />
                    Voltar
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="btn-transport-accent px-8"
                  >
                    {loading ? "Salvando..." : "Finalizar Cadastro"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
