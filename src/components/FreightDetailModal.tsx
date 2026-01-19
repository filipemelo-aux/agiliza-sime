import { useState, useEffect } from "react";
import { MapPin, Package, Truck, Calendar, Building2, Weight, Route, DollarSign, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

interface FreightDetailModalProps {
  freight: {
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
  } | null;
  open: boolean;
  onClose: () => void;
  userId: string | null;
}

const vehicleTypeLabels: Record<string, string> = {
  truck: "Truck",
  bitruck: "Bitruck",
  carreta: "Carreta",
  carreta_ls: "Carreta LS",
  rodotrem: "Rodotrem",
  bitrem: "Bitrem",
  treminhao: "Treminhão",
};

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  vehicle_type: string;
}

export function FreightDetailModal({ freight, open, onClose, userId }: FreightDetailModalProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    if (userId && freight) {
      fetchUserVehicles();
      checkExistingApplication();
    }
  }, [userId, freight]);

  const fetchUserVehicles = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("vehicles")
      .select("id, brand, model, plate, vehicle_type")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (!error && data) {
      setVehicles(data);
    }
  };

  const checkExistingApplication = async () => {
    if (!userId || !freight) return;

    const { data, error } = await supabase
      .from("freight_applications")
      .select("id")
      .eq("freight_id", freight.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      setHasApplied(true);
    }
  };

  const handleApply = async () => {
    if (!userId || !freight || !selectedVehicle) {
      toast({
        title: "Selecione um veículo",
        description: "Escolha um veículo para se candidatar ao frete.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      // Create the application
      const { error: appError } = await supabase
        .from("freight_applications")
        .insert([{
          freight_id: freight.id,
          user_id: userId,
          vehicle_id: selectedVehicle,
          status: "pending",
        }]);

      if (appError) throw appError;

      // Get admin users to notify them
      const { data: adminRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (rolesError) throw rolesError;

      // Get user profile for notification
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();

      // Get selected vehicle info
      const selectedVehicleInfo = vehicles.find((v) => v.id === selectedVehicle);

      // Create notifications for all admins
      if (adminRoles && adminRoles.length > 0) {
        const notifications = adminRoles.map((admin) => ({
          user_id: admin.user_id,
          title: "Nova Solicitação de Carregamento",
          message: `${profile?.full_name || "Um motorista"} solicitou ordem de carregamento para ${freight.origin_city}/${freight.origin_state} → ${freight.destination_city}/${freight.destination_state}`,
          type: "freight_application",
          data: JSON.parse(JSON.stringify({
            freight_id: freight.id,
            application_user_id: userId,
            vehicle: selectedVehicleInfo ? {
              id: selectedVehicleInfo.id,
              brand: selectedVehicleInfo.brand,
              model: selectedVehicleInfo.model,
              plate: selectedVehicleInfo.plate,
              vehicle_type: selectedVehicleInfo.vehicle_type,
            } : null,
          })),
        }));

        await supabase.from("notifications").insert(notifications);
      }

      setHasApplied(true);
      toast({
        title: "Interesse registrado!",
        description: "Sua solicitação de ordem de carregamento foi enviada. Aguarde a aprovação.",
      });
    } catch (error: any) {
      console.error("Error applying:", error);
      toast({
        title: "Erro ao enviar candidatura",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!freight) return null;

  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(freight.value_brl);

  const formattedWeight = new Intl.NumberFormat("pt-BR").format(freight.weight_kg);

  const formattedPickupDate = new Date(freight.pickup_date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const formattedDeliveryDate = freight.delivery_date
    ? new Date(freight.delivery_date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            Detalhes do Frete
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Route */}
          <div className="bg-secondary/30 rounded-lg p-4">
            <div className="flex items-center gap-4 justify-center">
              <div className="text-center">
                <div className="flex items-center gap-2 text-primary">
                  <MapPin className="w-5 h-5" />
                  <span className="font-bold text-lg">{freight.origin_city}</span>
                </div>
                <span className="text-sm text-muted-foreground">{freight.origin_state}</span>
              </div>
              <div className="flex-1 border-t-2 border-dashed border-primary/30 relative">
                {freight.distance_km && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background px-2 text-sm text-muted-foreground">
                    {freight.distance_km.toLocaleString("pt-BR")} km
                  </span>
                )}
              </div>
              <div className="text-center">
                <div className="flex items-center gap-2 text-foreground">
                  <MapPin className="w-5 h-5" />
                  <span className="font-bold text-lg">{freight.destination_city}</span>
                </div>
                <span className="text-sm text-muted-foreground">{freight.destination_state}</span>
              </div>
            </div>
          </div>

          {/* Company & Value */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Building2 className="w-4 h-4" />
                <span>Empresa</span>
              </div>
              <p className="font-semibold text-lg">{freight.company_name}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <DollarSign className="w-4 h-4" />
                <span>Valor do Frete</span>
              </div>
              <p className="font-bold text-2xl text-primary">{formattedValue}</p>
            </div>
          </div>

          {/* Cargo Details */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Package className="w-4 h-4" />
                <span>Tipo de Carga</span>
              </div>
              <p className="font-medium">{freight.cargo_type}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Weight className="w-4 h-4" />
                <span>Peso</span>
              </div>
              <p className="font-medium">{formattedWeight} kg</p>
            </div>
            {freight.required_vehicle_type && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Truck className="w-4 h-4" />
                  <span>Veículo Requerido</span>
                </div>
                <p className="font-medium">
                  {vehicleTypeLabels[freight.required_vehicle_type] || freight.required_vehicle_type}
                </p>
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Calendar className="w-4 h-4" />
                <span>Data de Coleta</span>
              </div>
              <p className="font-medium">{formattedPickupDate}</p>
            </div>
            {formattedDeliveryDate && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4" />
                  <span>Data de Entrega</span>
                </div>
                <p className="font-medium">{formattedDeliveryDate}</p>
              </div>
            )}
          </div>

          {/* Description */}
          {freight.description && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <FileText className="w-4 h-4" />
                <span>Descrição</span>
              </div>
              <p className="text-sm bg-secondary/30 rounded-lg p-3">{freight.description}</p>
            </div>
          )}

          {/* Apply Section - Only for non-admin users */}
          {userId && !isAdmin && !hasApplied && (
            <div className="border-t border-border pt-6 space-y-4">
              <h4 className="font-semibold">Solicitar Ordem de Carregamento</h4>
              
              {vehicles.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Você precisa cadastrar um veículo para se candidatar.
                </p>
              ) : (
                <>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione seu veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.brand} {vehicle.model} - {vehicle.plate} ({vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    onClick={handleApply}
                    disabled={!selectedVehicle || submitting}
                    className="w-full btn-transport-accent py-3 text-lg"
                  >
                    {submitting ? "Enviando..." : "Tenho Interesse"}
                  </Button>
                </>
              )}
            </div>
          )}

          {!isAdmin && hasApplied && (
            <div className="border-t border-border pt-6">
              <div className="bg-primary/10 text-primary rounded-lg p-4 text-center">
                <p className="font-semibold">✓ Você já se candidatou a este frete</p>
                <p className="text-sm mt-1">Aguarde a aprovação da transportadora.</p>
              </div>
            </div>
          )}

          {!userId && !isAdmin && (
            <div className="border-t border-border pt-6">
              <p className="text-center text-muted-foreground">
                Faça login para se candidatar a este frete.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
