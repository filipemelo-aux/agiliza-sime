import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Plus, Calendar, FileText, Trash2, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

interface Vehicle {
  id: string;
  plate: string;
  renavam: string;
  vehicle_type: string;
  brand: string;
  model: string;
  year: number;
  antt_number: string | null;
  is_active: boolean;
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

export default function MyVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          navigate("/auth");
        } else {
          // Defer Supabase calls to prevent deadlock
          setTimeout(() => {
            fetchVehicles(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchVehicles(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchVehicles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);

    try {
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      setVehicles((prev) => prev.filter((v) => v.id !== deleteId));
      toast({
        title: "Veículo removido",
        description: "O veículo foi removido com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3" />
            <div className="grid md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold font-display">Meus Veículos</h1>
          <Button
            onClick={() => navigate("/add-vehicle")}
            className="btn-transport-accent"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Veículo
          </Button>
        </div>

        {vehicles.length === 0 ? (
          <div className="text-center py-16">
            <Truck className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum veículo cadastrado</h3>
            <p className="text-muted-foreground mb-6">
              Adicione seu primeiro veículo para começar a se candidatar a fretes.
            </p>
            <Button
              onClick={() => navigate("/add-vehicle")}
              className="btn-transport-accent"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Veículo
            </Button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {vehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="freight-card group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Truck className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">
                        {vehicle.brand} {vehicle.model}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {vehicleTypeLabels[vehicle.vehicle_type] || vehicle.vehicle_type}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(vehicle.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Placa</p>
                    <p className="font-semibold">{vehicle.plate}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Ano</p>
                    <p className="font-semibold">{vehicle.year}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">RENAVAM</p>
                    <p className="font-semibold">{vehicle.renavam}</p>
                  </div>
                  {vehicle.antt_number && (
                    <div>
                      <p className="text-muted-foreground">ANTT</p>
                      <p className="font-semibold">{vehicle.antt_number}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-border">
                  <span
                    className={`badge-status ${
                      vehicle.is_active ? "badge-available" : "badge-pending"
                    }`}
                  >
                    {vehicle.is_active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O veículo será removido permanentemente
              da sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
