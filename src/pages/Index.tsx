import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, Truck, MapPin, Package } from "lucide-react";
import { Header } from "@/components/Header";
import { FreightCard } from "@/components/FreightCard";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  company_name: string;
  required_vehicle_type: string | null;
}

export default function Index() {
  const [freights, setFreights] = useState<Freight[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [user, setUser] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
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

  useEffect(() => {
    fetchFreights();
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

  const handleApply = async (freightId: string) => {
    if (!user) {
      toast({
        title: "Faça login para continuar",
        description: "Você precisa estar logado para se candidatar a um frete.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    navigate(`/apply/${freightId}`);
  };

  const filteredFreights = freights.filter((freight) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      freight.origin_city.toLowerCase().includes(searchLower) ||
      freight.destination_city.toLowerCase().includes(searchLower) ||
      freight.cargo_type.toLowerCase().includes(searchLower) ||
      freight.company_name.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/5 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-display mb-6 animate-fade-in">
              Encontre os melhores{" "}
              <span className="gradient-text">fretes</span> para você
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 animate-slide-up">
              Conectamos motoristas a oportunidades de frete em todo o Brasil.
              Cadastre-se e comece a transportar hoje.
            </p>

            {/* Search Bar */}
            <div className="relative max-w-xl mx-auto animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por cidade, carga ou empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-transport pl-12 pr-4 py-4 text-base"
              />
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </section>

      {/* Stats */}
      <section className="py-8 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-1">
                <Truck className="w-5 h-5" />
                <span className="text-2xl font-bold font-display">{freights.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Fretes disponíveis</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-1">
                <MapPin className="w-5 h-5" />
                <span className="text-2xl font-bold font-display">27</span>
              </div>
              <p className="text-sm text-muted-foreground">Estados atendidos</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 text-primary mb-1">
                <Package className="w-5 h-5" />
                <span className="text-2xl font-bold font-display">+1000</span>
              </div>
              <p className="text-sm text-muted-foreground">Cargas entregues</p>
            </div>
          </div>
        </div>
      </section>

      {/* Freights List */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold font-display">
              Fretes Disponíveis
              {searchTerm && (
                <span className="text-muted-foreground font-normal text-lg ml-2">
                  ({filteredFreights.length} resultados)
                </span>
              )}
            </h2>
          </div>

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
                {searchTerm ? "Nenhum frete encontrado" : "Nenhum frete disponível"}
              </h3>
              <p className="text-muted-foreground">
                {searchTerm
                  ? "Tente buscar por outros termos"
                  : "Novos fretes são adicionados constantemente. Volte em breve!"}
              </p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFreights.map((freight, index) => (
                <div
                  key={freight.id}
                  className="animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
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
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
