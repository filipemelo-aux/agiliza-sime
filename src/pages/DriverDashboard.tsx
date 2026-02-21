import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, Truck, Phone, Building2, FileText, MapPin, Package, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FreightCard } from "@/components/FreightCard";
import { FreightDetailModal } from "@/components/FreightDetailModal";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface ProfileData {
  full_name: string;
  phone: string;
  person_type: string | null;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
}

interface Freight {
  id: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  cargo_type: string;
  weight_kg: number;
  value_brl: number;
  distance_km: number | null;
  pickup_date: string;
  delivery_date: string | null;
  company_name: string;
  required_vehicle_type: string | null;
  description: string | null;
}

interface VehicleData {
  id: string;
  plate: string;
  vehicle_type: string;
  brand: string;
  model: string;
}

const vehicleTypeLabels: Record<string, string> = {
  truck: "Truck",
  carreta_ls: "LS",
  bitrem: "Bitrem",
  rodotrem: "Rodotrem",
  bitruck: "Bitruck",
  carreta: "Carreta",
  treminhao: "Treminhão",
};

export default function DriverDashboard() {
  const { user, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [freights, setFreights] = useState<Freight[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFreight, setSelectedFreight] = useState<Freight | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!roleLoading && !user) {
      navigate("/");
    }
  }, [user, roleLoading, navigate]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user]);

  const fetchAll = async () => {
    if (!user) return;
    try {
      const [profileRes, vehiclesRes, freightsRes, servicesRes] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, person_type, cnpj, razao_social, nome_fantasia").eq("user_id", user.id).maybeSingle(),
        supabase.from("vehicles").select("id, plate, vehicle_type, brand, model").eq("user_id", user.id),
        supabase.from("freights").select("*").eq("status", "available").order("created_at", { ascending: false }),
        supabase.from("driver_services" as any).select("service_type").eq("user_id", user.id),
      ]);

      setProfile((profileRes.data as any) || null);
      setVehicles(vehiclesRes.data || []);
      setFreights(freightsRes.data || []);
      setServices(((servicesRes.data as any[]) || []).map((s: any) => s.service_type));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Profile Card */}
        <Card className="mb-8 border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Meu Cadastro
            </CardTitle>
            <Link to="/profile">
              <Button variant="ghost" size="sm">
                Editar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {profile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome</p>
                  <p className="font-medium">{profile.full_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium">{profile.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tipo</p>
                  <Badge variant="outline">
                    {profile.person_type === "cnpj" ? "Proprietário (CNPJ)" : "Autônomo (CPF)"}
                  </Badge>
                </div>
                {profile.person_type === "cnpj" && profile.razao_social && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Razão Social</p>
                    <p className="font-medium">{profile.razao_social}</p>
                  </div>
                )}

                {/* Services */}
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Serviços Vinculados</p>
                  <div className="flex gap-2">
                    {services.length > 0 ? services.map((s) => (
                      <Badge key={s} className={s === "fretes" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"}>
                        {s === "fretes" ? "Fretes" : "Colheita"}
                      </Badge>
                    )) : (
                      <span className="text-sm text-muted-foreground italic">Nenhum serviço vinculado</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">Cadastro incompleto</p>
                <Link to="/register">
                  <Button size="sm">Completar Cadastro</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vehicles Summary */}
        <Card className="mb-8 border-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Meus Veículos ({vehicles.length})
            </CardTitle>
            <Link to="/my-vehicles">
              <Button variant="ghost" size="sm">
                Ver todos <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {vehicles.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {vehicles.slice(0, 3).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Truck className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{v.brand} {v.model}</p>
                      <p className="text-sm text-muted-foreground">
                        {v.plate} · {vehicleTypeLabels[v.vehicle_type] || v.vehicle_type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">Nenhum veículo cadastrado</p>
                <Link to="/add-vehicle">
                  <Button size="sm">Adicionar Veículo</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Freights */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Fretes Disponíveis ({freights.length})
          </h2>
          <Link to="/freights">
            <Button variant="ghost" size="sm">
              Ver todos <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </div>

        {freights.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum frete disponível no momento.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {freights.slice(0, 6).map((freight, index) => (
              <div
                key={freight.id}
                className="animate-slide-up cursor-pointer"
                style={{ animationDelay: `${index * 0.05}s` }}
                onClick={() => {
                  setSelectedFreight(freight);
                  setModalOpen(true);
                }}
              >
                <FreightCard
                  id={freight.id}
                  originCity={freight.origin_city}
                  originState={freight.origin_state}
                  destinationCity={freight.destination_city}
                  destinationState={freight.destination_state}
                  cargoType={freight.cargo_type}
                  weightKg={freight.weight_kg}
                  valueBrl={freight.value_brl}
                  distanceKm={freight.distance_km ?? undefined}
                  pickupDate={freight.pickup_date}
                  companyName={freight.company_name}
                  requiredVehicleType={freight.required_vehicle_type ?? undefined}
                  onApply={() => {
                    setSelectedFreight(freight);
                    setModalOpen(true);
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {selectedFreight && (
          <FreightDetailModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            freight={selectedFreight}
            userId={user?.id || null}
          />
        )}
      </main>
    </div>
  );
}
