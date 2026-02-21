import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  Truck, 
  Users, 
  FileText, 
  Package, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle,
  ArrowRight,
  DollarSign,
  MapPin,
  Sprout
} from "lucide-react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

interface DashboardStats {
  totalFreights: number;
  availableFreights: number;
  inProgressFreights: number;
  completedFreights: number;
  totalApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  totalDrivers: number;
  totalVehicles: number;
  totalValue: number;
}

interface RecentApplication {
  id: string;
  status: string;
  applied_at: string;
  profile_name: string;
  freight_route: string;
}

export default function AdminDashboard() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalFreights: 0,
    availableFreights: 0,
    inProgressFreights: 0,
    completedFreights: 0,
    totalApplications: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    totalDrivers: 0,
    totalVehicles: 0,
    totalValue: 0,
  });
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchDashboardData();
    }
  }, [isAdmin]);

  const fetchDashboardData = async () => {
    try {
      // Fetch all freights
      const { data: freights } = await supabase
        .from("freights")
        .select("*");

      // Fetch all applications
      const { data: applications } = await supabase
        .from("freight_applications")
        .select("*")
        .order("applied_at", { ascending: false });

      // Fetch profiles count
      const { count: driversCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // Fetch vehicles count
      const { count: vehiclesCount } = await supabase
        .from("vehicles")
        .select("*", { count: "exact", head: true });

      // Calculate stats
      const freightStats = freights || [];
      const appStats = applications || [];

      const totalValue = freightStats.reduce((sum, f) => sum + (f.value_brl || 0), 0);

      setStats({
        totalFreights: freightStats.length,
        availableFreights: freightStats.filter(f => f.status === "available").length,
        inProgressFreights: freightStats.filter(f => f.status === "in_progress").length,
        completedFreights: freightStats.filter(f => f.status === "completed").length,
        totalApplications: appStats.length,
        pendingApplications: appStats.filter(a => a.status === "pending").length,
        approvedApplications: appStats.filter(a => a.status === "approved").length,
        totalDrivers: driversCount || 0,
        totalVehicles: vehiclesCount || 0,
        totalValue,
      });

      // Fetch recent applications with details
      if (applications && applications.length > 0) {
        const recentApps = applications.slice(0, 5);
        const recentWithDetails = await Promise.all(
          recentApps.map(async (app) => {
            const [profileRes, freightRes] = await Promise.all([
              supabase.from("profiles").select("full_name").eq("user_id", app.user_id).maybeSingle(),
              supabase.from("freights").select("origin_city, origin_state, destination_city, destination_state").eq("id", app.freight_id).maybeSingle(),
            ]);

            return {
              id: app.id,
              status: app.status,
              applied_at: app.applied_at,
              profile_name: profileRes.data?.full_name || "Desconhecido",
              freight_route: freightRes.data 
                ? `${freightRes.data.origin_city}/${freightRes.data.origin_state} → ${freightRes.data.destination_city}/${freightRes.data.destination_state}`
                : "Rota desconhecida",
            };
          })
        );
        setRecentApplications(recentWithDetails);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Painel Administrativo</h1>
          <p className="text-muted-foreground">Visão geral do sistema SIME TRANSPORTES</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total de Fretes
                  </CardTitle>
                  <Package className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalFreights}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.availableFreights} disponíveis
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Candidaturas
                  </CardTitle>
                  <FileText className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalApplications}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="text-yellow-500">{stats.pendingApplications} pendentes</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Motoristas
                  </CardTitle>
                  <Users className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalDrivers}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stats.totalVehicles} veículos cadastrados
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Valor Total
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    em fretes cadastrados
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Freight Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <Card className="border-border bg-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Clock className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.availableFreights}</p>
                      <p className="text-sm text-muted-foreground">Fretes Disponíveis</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.inProgressFreights}</p>
                      <p className="text-sm text-muted-foreground">Em Andamento</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{stats.completedFreights}</p>
                      <p className="text-sm text-muted-foreground">Concluídos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions & Recent Applications */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Quick Actions */}
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-display">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        Gerenciar Fretes
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/admin/applications">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Ver Candidaturas
                        {stats.pendingApplications > 0 && (
                          <span className="bg-yellow-500 text-yellow-950 text-xs px-2 py-0.5 rounded-full">
                            {stats.pendingApplications}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/admin/drivers">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Gerenciar Motoristas
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/admin/harvest">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Sprout className="h-4 w-4" />
                        Gerenciar Colheitas
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Recent Applications */}
              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg font-display">Candidaturas Recentes</CardTitle>
                  <Link to="/admin/applications">
                    <Button variant="ghost" size="sm">
                      Ver todas
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  {recentApplications.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">
                      Nenhuma candidatura ainda
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {recentApplications.map((app) => (
                        <div
                          key={app.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{app.profile_name}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {app.freight_route}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                              app.status === "approved"
                                ? "bg-green-500/20 text-green-500"
                                : app.status === "pending"
                                ? "bg-yellow-500/20 text-yellow-500"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {app.status === "approved"
                              ? "Aprovado"
                              : app.status === "pending"
                              ? "Pendente"
                              : app.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
