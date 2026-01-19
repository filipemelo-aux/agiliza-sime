import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Plus, Edit2, Trash2, Filter, X } from "lucide-react";
import { Header } from "@/components/Header";
import { FreightCard } from "@/components/FreightCard";
import { FreightDetailModal } from "@/components/FreightDetailModal";
import { FreightFormDialog } from "@/components/FreightFormDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const vehicleTypeLabels: Record<string, string> = {
  truck: "Truck",
  bitruck: "Bitruck",
  carreta: "Carreta",
  carreta_ls: "Carreta LS",
  rodotrem: "Rodotrem",
  bitrem: "Bitrem",
  treminhao: "Treminhão",
};

const brazilianStates = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

export default function Index() {
  const [freights, setFreights] = useState<Freight[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedFreight, setSelectedFreight] = useState<Freight | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingFreight, setEditingFreight] = useState<Freight | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [freightToDelete, setFreightToDelete] = useState<Freight | null>(null);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  
  // Filter states
  const [filterOriginState, setFilterOriginState] = useState<string>("");
  const [filterDestinationState, setFilterDestinationState] = useState<string>("");
  const [filterVehicleType, setFilterVehicleType] = useState<string>("");
  const [filterMinValue, setFilterMinValue] = useState<string>("");
  const [filterCargoType, setFilterCargoType] = useState<string>("");
  
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  useEffect(() => {
    fetchFreights();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchFreights = async () => {
    try {
      const { data, error } = await supabase
        .from("freights")
        .select("*")
        .eq("status", "available")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFreights(data || []);
    } catch (error) {
      console.error("Error fetching freights:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFreightClick = (freight: Freight) => {
    if (!isAdmin) {
      setSelectedFreight(freight);
      setModalOpen(true);
    }
  };

  const handleApply = (freightId: string) => {
    const freight = freights.find((f) => f.id === freightId);
    if (freight) {
      handleFreightClick(freight);
    }
  };

  const handleAddFreight = () => {
    setEditingFreight(null);
    setFormDialogOpen(true);
  };

  const handleEditFreight = (freight: Freight, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFreight(freight);
    setFormDialogOpen(true);
  };

  const handleDeleteClick = (freight: Freight, e: React.MouseEvent) => {
    e.stopPropagation();
    setFreightToDelete(freight);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!freightToDelete) return;

    try {
      const { error } = await supabase
        .from("freights")
        .delete()
        .eq("id", freightToDelete.id);

      if (error) throw error;

      toast({
        title: "Frete excluído",
        description: "O frete foi removido com sucesso.",
      });
      fetchFreights();
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setFreightToDelete(null);
    }
  };

  const clearFilters = () => {
    setFilterOriginState("");
    setFilterDestinationState("");
    setFilterVehicleType("");
    setFilterMinValue("");
    setFilterCargoType("");
  };

  const hasActiveFilters = filterOriginState || filterDestinationState || filterVehicleType || filterMinValue || filterCargoType;

  const filteredFreights = freights.filter((freight) => {
    if (filterOriginState && freight.origin_state !== filterOriginState) return false;
    if (filterDestinationState && freight.destination_state !== filterDestinationState) return false;
    if (filterVehicleType && freight.required_vehicle_type !== filterVehicleType) return false;
    if (filterMinValue && freight.value_brl < parseFloat(filterMinValue)) return false;
    if (filterCargoType && !freight.cargo_type.toLowerCase().includes(filterCargoType.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Freights Section */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          {/* Header with counter and filter */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full">
                <Truck className="w-5 h-5" />
                <span className="text-xl font-bold font-display">{freights.length}</span>
                <span className="text-sm font-medium">fretes disponíveis</span>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <X className="w-4 h-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="w-4 h-4" />
                    Filtrar
                    {hasActiveFilters && (
                      <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        !
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Filtrar Fretes</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-6 mt-6">
                    {/* Origin State */}
                    <div className="space-y-2">
                      <Label>Estado de Origem</Label>
                      <Select value={filterOriginState} onValueChange={setFilterOriginState}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os estados" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Todos os estados</SelectItem>
                          {brazilianStates.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Destination State */}
                    <div className="space-y-2">
                      <Label>Estado de Destino</Label>
                      <Select value={filterDestinationState} onValueChange={setFilterDestinationState}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os estados" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Todos os estados</SelectItem>
                          {brazilianStates.map((state) => (
                            <SelectItem key={state} value={state}>{state}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Vehicle Type */}
                    <div className="space-y-2">
                      <Label>Tipo de Veículo</Label>
                      <Select value={filterVehicleType} onValueChange={setFilterVehicleType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os tipos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Todos os tipos</SelectItem>
                          {Object.entries(vehicleTypeLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Min Value */}
                    <div className="space-y-2">
                      <Label>Valor Mínimo (R$/ton)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={filterMinValue}
                        onChange={(e) => setFilterMinValue(e.target.value)}
                      />
                    </div>

                    {/* Cargo Type */}
                    <div className="space-y-2">
                      <Label>Tipo de Carga</Label>
                      <Input
                        type="text"
                        placeholder="Ex: Calcário, Soja..."
                        value={filterCargoType}
                        onChange={(e) => setFilterCargoType(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" className="flex-1" onClick={clearFilters}>
                        Limpar
                      </Button>
                      <Button className="flex-1" onClick={() => setFilterSheetOpen(false)}>
                        Aplicar
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {isAdmin && (
                <Button onClick={handleAddFreight} className="btn-transport-accent">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Frete
                </Button>
              )}
            </div>
          </div>

          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mb-6">
              {filterOriginState && (
                <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Origem: {filterOriginState}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFilterOriginState("")} />
                </span>
              )}
              {filterDestinationState && (
                <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Destino: {filterDestinationState}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFilterDestinationState("")} />
                </span>
              )}
              {filterVehicleType && (
                <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Veículo: {vehicleTypeLabels[filterVehicleType]}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFilterVehicleType("")} />
                </span>
              )}
              {filterMinValue && (
                <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Mín: R${filterMinValue}/ton
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFilterMinValue("")} />
                </span>
              )}
              {filterCargoType && (
                <span className="bg-secondary text-secondary-foreground px-3 py-1 rounded-full text-sm flex items-center gap-1">
                  Carga: {filterCargoType}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setFilterCargoType("")} />
                </span>
              )}
            </div>
          )}

          {loading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="freight-card animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                  <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-4 bg-muted rounded w-2/3 mb-4" />
                  <div className="h-10 bg-muted rounded w-full" />
                </div>
              ))}
            </div>
          ) : filteredFreights.length === 0 ? (
            <div className="text-center py-16">
              <Truck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {hasActiveFilters ? "Nenhum frete encontrado" : "Nenhum frete disponível"}
              </h3>
              <p className="text-muted-foreground">
                {hasActiveFilters
                  ? "Tente ajustar os filtros para ver mais resultados"
                  : "Novos fretes são adicionados constantemente. Volte em breve!"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Limpar Filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFreights.map((freight, index) => (
                <div
                  key={freight.id}
                  className="animate-slide-up relative group"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  {/* Admin Action Buttons */}
                  {isAdmin && (
                    <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8"
                        onClick={(e) => handleEditFreight(freight, e)}
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={(e) => handleDeleteClick(freight, e)}
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div
                    className={isAdmin ? "" : "cursor-pointer"}
                    onClick={() => handleFreightClick(freight)}
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
                      onApply={handleApply}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Freight Detail Modal */}
      <FreightDetailModal
        freight={selectedFreight}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedFreight(null);
        }}
        userId={user?.id || null}
      />

      {/* Freight Form Dialog for Admin */}
      <FreightFormDialog
        open={formDialogOpen}
        onClose={() => {
          setFormDialogOpen(false);
          setEditingFreight(null);
        }}
        freight={editingFreight}
        onSuccess={fetchFreights}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o frete de{" "}
              <strong>{freightToDelete?.origin_city}/{freightToDelete?.origin_state}</strong> para{" "}
              <strong>{freightToDelete?.destination_city}/{freightToDelete?.destination_state}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
