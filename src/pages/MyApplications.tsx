import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, FileText, Download, Clock, CheckCircle, XCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Application {
  id: string;
  status: string;
  applied_at: string;
  loading_order_url: string | null;
  loading_order_sent_at: string | null;
  freight: {
    id: string;
    company_name: string;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    cargo_type: string;
    weight_kg: number;
    value_brl: number;
    pickup_date: string;
  };
  vehicle: {
    plate: string;
    brand: string;
    model: string;
  };
}

export default function MyApplications() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) {
          navigate("/auth");
        } else {
          setUser(session.user);
          setTimeout(() => {
            fetchApplications(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchApplications(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchApplications = async (userId: string) => {
    try {
      const { data: apps, error: appsError } = await supabase
        .from("freight_applications")
        .select("*")
        .eq("user_id", userId)
        .order("applied_at", { ascending: false });

      if (appsError) throw appsError;

      if (!apps || apps.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      // Fetch all related data
      const applicationDetails = await Promise.all(
        apps.map(async (app) => {
          const [freightRes, vehicleRes] = await Promise.all([
            supabase.from("freights").select("*").eq("id", app.freight_id).single(),
            supabase.from("vehicles").select("plate, brand, model").eq("id", app.vehicle_id).single(),
          ]);

          return {
            ...app,
            freight: freightRes.data,
            vehicle: vehicleRes.data,
          } as Application;
        })
      );

      setApplications(applicationDetails.filter(app => app.freight && app.vehicle));
    } catch (error) {
      console.error("Error fetching applications:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (app: Application) => {
    if (!app.loading_order_url) return;

    try {
      const { data, error } = await supabase.storage
        .from("loading-orders")
        .download(app.loading_order_url);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordem_carregamento_${app.freight.origin_city}_${app.freight.destination_city}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "A ordem de carregamento está sendo baixada.",
      });
    } catch (error: any) {
      console.error("Error downloading file:", error);
      toast({
        title: "Erro ao baixar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string, hasOrder: boolean) => {
    if (hasOrder) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === "pending") return <Clock className="w-5 h-5 text-yellow-500" />;
    if (status === "rejected") return <XCircle className="w-5 h-5 text-destructive" />;
    return <CheckCircle className="w-5 h-5 text-green-500" />;
  };

  const getStatusLabel = (status: string, hasOrder: boolean) => {
    if (hasOrder) return "Ordem Disponível";
    if (status === "pending") return "Aguardando Aprovação";
    if (status === "approved") return "Aprovado";
    if (status === "rejected") return "Rejeitado";
    return status;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Minhas Candidaturas</h1>
          <p className="text-muted-foreground">Acompanhe suas solicitações de ordem de carregamento</p>
        </div>

        {applications.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma candidatura</h3>
            <p className="text-muted-foreground mb-6">
              Você ainda não se candidatou a nenhum frete.
            </p>
            <Button onClick={() => navigate("/")} className="btn-transport-accent">
              Ver Fretes Disponíveis
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => (
              <div key={app.id} className="freight-card">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(app.status, !!app.loading_order_url)}
                      <span className={`text-sm font-medium ${
                        app.loading_order_url
                          ? "text-green-600"
                          : app.status === "pending"
                          ? "text-yellow-600"
                          : app.status === "rejected"
                          ? "text-destructive"
                          : "text-green-600"
                      }`}>
                        {getStatusLabel(app.status, !!app.loading_order_url)}
                      </span>
                    </div>

                    <h3 className="font-semibold text-lg mb-1">{app.freight.company_name}</h3>
                    
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Truck className="w-4 h-4" />
                      {app.freight.origin_city}/{app.freight.origin_state} → {app.freight.destination_city}/{app.freight.destination_state}
                    </p>

                    <p className="text-sm text-muted-foreground mt-1">
                      Veículo: {app.vehicle.brand} {app.vehicle.model} - {app.vehicle.plate}
                    </p>

                    <p className="text-sm text-muted-foreground mt-1">
                      Candidatura: {new Date(app.applied_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xl font-bold text-primary">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(app.freight.value_brl)}
                    </span>

                    {app.loading_order_url && (
                      <Button
                        onClick={() => handleDownload(app)}
                        className="btn-transport-accent"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Ordem
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
