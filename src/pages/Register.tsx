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
import { 
  maskCPF, unmaskCPF, maskPhone, unmaskPhone, maskPlate, unmaskPlate,
  maskRenavam, maskCNH, maskYear, maskOnlyLettersNumbers,
  validateCPF, validatePlate, validateRenavam, validateCNH, validatePhone
} from "@/lib/masks";

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
    let maskedValue = value;
    
    switch (name) {
      case "cpf":
        maskedValue = maskCPF(value);
        break;
      case "phone":
        maskedValue = maskPhone(value);
        break;
      case "cnhNumber":
        maskedValue = maskCNH(value);
        break;
      case "fullName":
        maskedValue = value.replace(/[^A-Za-zÀ-ÿ\s]/g, "");
        break;
    }
    
    setProfileData((prev) => ({ ...prev, [name]: maskedValue }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleVehicleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let maskedValue = value;
    
    switch (name) {
      case "plate":
        maskedValue = maskPlate(value);
        break;
      case "renavam":
        maskedValue = maskRenavam(value);
        break;
      case "year":
        maskedValue = maskYear(value);
        break;
      case "brand":
      case "model":
        maskedValue = maskOnlyLettersNumbers(value);
        break;
      case "anttNumber":
        maskedValue = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        break;
    }
    
    setVehicleData((prev) => ({ ...prev, [name]: maskedValue }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};
    
    if (!profileData.fullName.trim() || profileData.fullName.trim().length < 3) {
      newErrors.fullName = "Nome completo é obrigatório (mínimo 3 caracteres)";
    }
    
    const cpfNumbers = unmaskCPF(profileData.cpf);
    if (!validateCPF(cpfNumbers)) {
      newErrors.cpf = "CPF inválido";
    }
    
    const phoneNumbers = unmaskPhone(profileData.phone);
    if (!validatePhone(phoneNumbers)) {
      newErrors.phone = "Telefone inválido (10 ou 11 dígitos)";
    }
    
    if (!validateCNH(profileData.cnhNumber)) {
      newErrors.cnhNumber = "CNH deve ter 11 dígitos";
    }
    
    if (!profileData.cnhCategory) {
      newErrors.cnhCategory = "Selecione a categoria da CNH";
    }
    
    if (!profileData.cnhExpiry) {
      newErrors.cnhExpiry = "Data de validade é obrigatória";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
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
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
      // Create profile (without sensitive document data)
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: user.id,
        full_name: profileData.fullName.trim(),
        phone: unmaskPhone(profileData.phone),
      });

      if (profileError) throw profileError;

      // Create driver documents (sensitive data in separate table)
      const { error: docsError } = await supabase.from("driver_documents").insert({
        user_id: user.id,
        cpf: unmaskCPF(profileData.cpf),
        cnh_number: profileData.cnhNumber,
        cnh_category: profileData.cnhCategory,
        cnh_expiry: profileData.cnhExpiry,
      });

      if (docsError) throw docsError;

      // Create vehicle
      const { error: vehicleError } = await supabase.from("vehicles").insert([{
        user_id: user.id,
        plate: unmaskPlate(vehicleData.plate),
        renavam: vehicleData.renavam,
        vehicle_type: vehicleData.vehicleType as "truck" | "bitruck" | "carreta" | "carreta_ls" | "rodotrem" | "bitrem" | "treminhao",
        brand: vehicleData.brand.trim(),
        model: vehicleData.model.trim(),
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
                    <Label htmlFor="fullName">Nome Completo *</Label>
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
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input
                      id="cpf"
                      name="cpf"
                      placeholder="000.000.000-00"
                      value={profileData.cpf}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.cpf && (
                      <p className="text-sm text-destructive">{errors.cpf}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      name="phone"
                      placeholder="(11) 99999-9999"
                      value={profileData.phone}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.phone && (
                      <p className="text-sm text-destructive">{errors.phone}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cnhNumber">Número da CNH *</Label>
                    <Input
                      id="cnhNumber"
                      name="cnhNumber"
                      placeholder="00000000000"
                      value={profileData.cnhNumber}
                      onChange={handleProfileChange}
                      className="input-transport"
                    />
                    {errors.cnhNumber && (
                      <p className="text-sm text-destructive">{errors.cnhNumber}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Categoria da CNH *</Label>
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
                    <Label htmlFor="cnhExpiry">Validade da CNH *</Label>
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
                    <Label htmlFor="plate">Placa *</Label>
                    <Input
                      id="plate"
                      name="plate"
                      placeholder="ABC-1D23"
                      value={vehicleData.plate}
                      onChange={handleVehicleChange}
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
                      onChange={handleVehicleChange}
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
                    <Label htmlFor="brand">Marca *</Label>
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
                    <Label htmlFor="model">Modelo *</Label>
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
                    <Label htmlFor="year">Ano *</Label>
                    <Input
                      id="year"
                      name="year"
                      placeholder="2024"
                      value={vehicleData.year}
                      onChange={handleVehicleChange}
                      className="input-transport"
                    />
                    {errors.year && (
                      <p className="text-sm text-destructive">{errors.year}</p>
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
