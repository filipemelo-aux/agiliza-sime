import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Plus, Search, Pencil, Trash2, Eye } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { VehicleFormModal } from "@/components/VehicleFormModal";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: "Truck", bitruck: "Bitruck", carreta: "Carreta", carreta_ls: "LS",
  rodotrem: "Rodotrem", bitrem: "Bitrem", treminhao: "Treminhão",
};

const TRAILER_LABELS: Record<string, string[]> = {
  carreta: ["Carreta"], carreta_ls: ["Carreta"],
  bitrem: ["1ª Carreta", "2ª Carreta"],
  rodotrem: ["1ª Carreta", "Dolly", "2ª Carreta"],
  treminhao: ["1º Reboque", "2º Reboque"],
};

interface VehicleRow {
  id: string; user_id: string; plate: string; brand: string; model: string;
  year: number; vehicle_type: string; cargo_type: string | null;
  trailer_plate_1: string | null; trailer_plate_2: string | null; trailer_plate_3: string | null;
  driver_id: string | null; owner_id: string | null;
  driver_name?: string; owner_name?: string;
}

export default function AdminVehicles() {
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [deleteVehicle, setDeleteVehicle] = useState<VehicleRow | null>(null);
  const [viewVehicle, setViewVehicle] = useState<VehicleRow | null>(null);

  useEffect(() => {
    if (!roleLoading && !isAdmin && !isModerator) {
      const timer = setTimeout(() => navigate("/"), 100);
      return () => clearTimeout(timer);
    }
  }, [roleLoading]);

  useEffect(() => {
    if (isAdmin || isModerator) fetchVehicles();
  }, [isAdmin]);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, profilesRes] = await Promise.all([
        supabase.from("vehicles").select("*").order("brand"),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      const profiles = profilesRes.data || [];
      const vehicleRows: VehicleRow[] = (vehiclesRes.data || []).map((v: any) => {
        const driver = profiles.find((p: any) => p.user_id === v.driver_id);
        const owner = profiles.find((p: any) => p.user_id === v.owner_id);
        return { ...v, driver_name: driver?.full_name, owner_name: owner?.full_name };
      });
      setVehicles(vehicleRows);
    } catch (error: any) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteVehicle) return;
    try {
      const { error } = await supabase.from("vehicles").delete().eq("id", deleteVehicle.id);
      if (error) throw error;
      toast({ title: "Veículo excluído!" });
      setDeleteVehicle(null);
      fetchVehicles();
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  const filteredVehicles = vehicles.filter((v) =>
    v.plate.toLowerCase().includes(search.toLowerCase()) ||
    v.brand.toLowerCase().includes(search.toLowerCase()) ||
    v.model.toLowerCase().includes(search.toLowerCase()) ||
    (v.driver_name && v.driver_name.toLowerCase().includes(search.toLowerCase())) ||
    (v.owner_name && v.owner_name.toLowerCase().includes(search.toLowerCase()))
  );

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold font-display">Veículos</h1>
            <p className="text-muted-foreground">Gerencie a frota de veículos do sistema</p>
          </div>
          <Button onClick={() => { setEditVehicleId(null); setVehicleModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo Veículo
          </Button>
        </div>

        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por placa, marca, modelo ou proprietário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredVehicles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum veículo encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredVehicles.map((v) => {
              const trailerLabels = TRAILER_LABELS[v.vehicle_type] || [];
              const trailerPlates = [v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3].filter(Boolean);
              return (
                <Card key={v.id} className="border-border">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold">🚛 {v.plate}</h3>
                          <Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type}</Badge>
                          {v.cargo_type && <Badge variant="secondary" className="text-xs capitalize">{v.cargo_type}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{v.brand} {v.model} • {v.year}</p>
                        {trailerPlates.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {trailerPlates.map((plate, i) => (
                              <Badge key={i} variant="outline" className="text-xs gap-1 bg-muted/50">
                                {trailerLabels[i] || `Impl. ${i+1}`}: {plate}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0 mt-1.5 text-xs text-muted-foreground">
                          {v.driver_name && <span>Motorista: <strong className="text-foreground">{v.driver_name}</strong></span>}
                          {v.owner_name && <span>Proprietário: <strong className="text-foreground">{v.owner_name}</strong></span>}
                          {!v.driver_name && !v.owner_name && <span className="italic">Sem vínculo</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewVehicle(v)} title="Visualizar">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEditVehicleId(v.id); setVehicleModalOpen(true); }} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteVehicle(v)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <VehicleFormModal open={vehicleModalOpen} onOpenChange={setVehicleModalOpen} vehicleId={editVehicleId} onSaved={fetchVehicles} />

      <AlertDialog open={!!deleteVehicle} onOpenChange={(open) => !open && setDeleteVehicle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o veículo <strong>{deleteVehicle?.plate}</strong> ({deleteVehicle?.brand} {deleteVehicle?.model})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVehicle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewVehicle} onOpenChange={(open) => !open && setViewVehicle(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Veículo</DialogTitle>
          </DialogHeader>
          {viewVehicle && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base">🚛 {viewVehicle.plate}</span>
                <Badge variant="outline">{VEHICLE_TYPE_LABELS[viewVehicle.vehicle_type] || viewVehicle.vehicle_type}</Badge>
                {viewVehicle.cargo_type && <Badge variant="secondary" className="capitalize">{viewVehicle.cargo_type}</Badge>}
              </div>
              <p><span className="text-muted-foreground">Veículo:</span> {viewVehicle.brand} {viewVehicle.model} • {viewVehicle.year}</p>
              {(() => {
                const trailerLabels = TRAILER_LABELS[viewVehicle.vehicle_type] || [];
                const trailerPlates = [viewVehicle.trailer_plate_1, viewVehicle.trailer_plate_2, viewVehicle.trailer_plate_3].filter(Boolean);
                return trailerPlates.length > 0 ? (
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Conjunto:</span>
                    {trailerPlates.map((plate, i) => (
                      <p key={i} className="ml-2">{trailerLabels[i] || `Impl. ${i+1}`}: <strong>{plate}</strong></p>
                    ))}
                  </div>
                ) : null;
              })()}
              {viewVehicle.driver_name && <p><span className="text-muted-foreground">Motorista:</span> {viewVehicle.driver_name}</p>}
              {viewVehicle.owner_name && <p><span className="text-muted-foreground">Proprietário:</span> {viewVehicle.owner_name}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
