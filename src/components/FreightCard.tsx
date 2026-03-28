import { MapPin, Package, Truck, Calendar, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";

interface FreightCardProps {
  id: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  cargoType: string;
  weightKg: number;
  valueBrl: number;
  distanceKm?: number;
  pickupDate: string;
  companyName: string;
  requiredVehicleType?: string;
  onApply?: (id: string) => void;
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

export function FreightCard({
  id,
  originCity,
  originState,
  destinationCity,
  destinationState,
  cargoType,
  weightKg,
  valueBrl,
  distanceKm,
  pickupDate,
  companyName,
  requiredVehicleType,
  onApply,
}: FreightCardProps) {
  const { isAdmin } = useUserRole();
  
  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valueBrl);

  const formattedWeight = new Intl.NumberFormat("pt-BR").format(weightKg);
  
  const formattedDate = new Date(pickupDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });

  return (
    <div className="freight-card group overflow-hidden">
      {/* Route Header */}
      <div className="mb-4 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-primary min-w-0 shrink">
            <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="font-medium text-sm truncate">
              {originCity}, {originState}
            </span>
          </div>
           <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.75} />
          <div className="flex items-center gap-1.5 text-foreground min-w-0 shrink">
            <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            <span className="font-medium text-sm truncate">
              {destinationCity}, {destinationState}
            </span>
          </div>
        </div>
      </div>

      {/* Cargo Info */}
      <div className="grid grid-cols-2 gap-3 mb-4 min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <Package className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{cargoType}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <span className="font-medium truncate">{formattedWeight} kg</span>
        </div>
        {requiredVehicleType && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Truck className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span>{vehicleTypeLabels[requiredVehicleType] || requiredVehicleType}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" strokeWidth={1.75} />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Company & Distance */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 pb-4 border-b border-border/50">
        <Building2 className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="truncate">{companyName}</span>
        {distanceKm && (
          <span className="ml-auto text-xs bg-secondary px-2 py-0.5 rounded-full">
            {distanceKm.toLocaleString("pt-BR")} km
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 shrink">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Valor do frete</p>
          <p className="text-lg font-semibold font-display text-primary truncate tracking-tight">{formattedValue}</p>
        </div>
        {!isAdmin && (
          <Button
            onClick={() => onApply?.(id)}
            className=" px-6 py-2.5"
          >
            Candidatar
          </Button>
        )}
      </div>
    </div>
  );
}
