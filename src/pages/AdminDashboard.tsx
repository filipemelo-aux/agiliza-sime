import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { 
  Users, 
  FileText, 
  Package, 
  Clock, 
  CheckCircle, 
  ArrowRight,
  DollarSign,
  MapPin,
  Sprout,
  Truck,
  TrendingUp
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";

interface DashboardStats {
  totalDrivers: number;
  activeHarvestJobs: number;
  totalHarvestJobs: number;
  totalFreights: number;
  availableFreights: number;
  inProgressFreights: number;
  completedFreights: number;
  pendingApplications: number;
  totalValue: number;
}

interface ActiveHarvestJob {
  id: string;
  farm_name: string;
  location: string;
  status: string;
  monthly_value: number;
  payment_value: number;
  assignmentCount: number;
}

interface RecentApplication {
  id: string;
  status: string;
  applied_at: string;
  profile_name: string;
  freight_route: string;
}

export default function AdminDashboard() {
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [stats, setStats] = useState<DashboardStats>({
    totalDrivers: 0,
    activeHarvestJobs: 0,
    totalHarvestJobs: 0,
    totalFreights: 0,
    availableFreights: 0,
    inProgressFreights: 0,
    completedFreights: 0,
    pendingApplications: 0,
    totalValue: 0,
  });
  const [activeJobs, setActiveJobs] = useState<ActiveHarvestJob[]>([]);
  const [recentApplications, setRecentApplications] = useState<RecentApplication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setUserName(data.full_name.split(" ")[0]); });
    }
  }, [user]);

  useEffect(() => {
    if (!roleLoading && !isAdmin && !isModerator) {
      navigate("/");
    }
  }, [isAdmin, isModerator, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin || isModerator) {
      fetchDashboardData();
    }
  }, [isAdmin, isModerator]);

  const fetchDashboardData = async () => {
    try {
      // Parallel fetches
      const [
        { data: freights },
        { data: applications },
        { data: allProfiles },
        { data: systemRoles },
        { data: harvestJobs },
        { data: harvestAssignments },
      ] = await Promise.all([
        supabase.from("freights").select("*"),
        supabase.from("freight_applications").select("*").order("applied_at", { ascending: false }),
        supabase.from("profiles").select("user_id, category"),
        supabase.from("user_roles").select("user_id").in("role", ["admin", "moderator"]),
        supabase.from("harvest_jobs").select("*").order("created_at", { ascending: false }),
        supabase.from("harvest_assignments").select("harvest_job_id, user_id, status"),
      ]);

      // Count only motoristas (exclude admins/moderators)
      const systemUserIds = new Set((systemRoles || []).map(r => r.user_id));
      const driverCount = (allProfiles || []).filter(
        p => p.category === "motorista" && !systemUserIds.has(p.user_id)
      ).length;

      const freightStats = freights || [];
      const appStats = applications || [];
      const jobs = harvestJobs || [];
      const assignments = harvestAssignments || [];

      const totalValue = freightStats.reduce((sum, f) => sum + (f.value_brl || 0), 0);

      // Active harvest jobs with assignment counts
      const activeJobsList = jobs
        .filter(j => j.status === "active")
        .map(j => ({
          id: j.id,
          farm_name: j.farm_name,
          location: j.location,
          status: j.status,
          monthly_value: j.monthly_value,
          payment_value: j.payment_value,
          assignmentCount: assignments.filter(a => a.harvest_job_id === j.id && a.status === "active").length,
        }));

      setStats({
        totalDrivers: driverCount,
        activeHarvestJobs: activeJobsList.length,
        totalHarvestJobs: jobs.length,
        totalFreights: freightStats.length,
        availableFreights: freightStats.filter(f => f.status === "available").length,
        inProgressFreights: freightStats.filter(f => f.status === "in_progress").length,
        completedFreights: freightStats.filter(f => f.status === "completed").length,
        pendingApplications: appStats.filter(a => a.status === "pending").length,
        totalValue,
      });

      setActiveJobs(activeJobsList);

      // Recent applications
      if (appStats.length > 0) {
        const recentApps = appStats.slice(0, 5);
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

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
        <div className="mb-8">
          {userName && (
            <p className="text-lg text-muted-foreground mb-1">Olá, <span className="font-semibold text-foreground">{userName}</span>!</p>
          )}
          <h1 className="text-3xl font-bold font-display">Painel Administrativo</h1>
          <p className="text-muted-foreground">Visão geral do sistema SIME TRANSPORTES</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="border-border bg-card cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/admin/harvest")}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Serviços Ativos</CardTitle>
                  <Sprout className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeHarvestJobs}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stats.totalHarvestJobs} no total</p>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Motoristas</CardTitle>
                  <Users className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalDrivers}</div>
                  <p className="text-xs text-muted-foreground mt-1">cadastrados</p>
                </CardContent>
              </Card>

              {stats.totalFreights > 0 && (
                <Card className="border-border bg-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Fretes</CardTitle>
                    <Package className="h-4 w-4 text-accent" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.totalFreights}</div>
                    <p className="text-xs text-muted-foreground mt-1">{stats.availableFreights} disponíveis</p>
                  </CardContent>
                </Card>
              )}

              {stats.totalFreights > 0 ? (
                <Card className="border-border bg-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Ordens Pendentes</CardTitle>
                    <FileText className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.pendingApplications}</div>
                    <p className="text-xs text-muted-foreground mt-1">pendentes</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="border-border bg-card overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Valor Bruto Mensal</CardTitle>
                      <DollarSign className="h-4 w-4 text-primary shrink-0" />
                    </CardHeader>
                    <CardContent className="min-w-0">
                      <div className="text-base sm:text-2xl font-bold truncate">
                        {formatCurrency(activeJobs.reduce((s, j) => s + j.monthly_value * j.assignmentCount, 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">valor mensal ativo</p>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/20 bg-primary/5 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Lucro Líquido Mensal</CardTitle>
                      <TrendingUp className="h-4 w-4 text-primary shrink-0" />
                    </CardHeader>
                    <CardContent className="min-w-0">
                      <div className="text-base sm:text-2xl font-bold text-primary truncate">
                        {formatCurrency(activeJobs.reduce((s, j) => s + (j.monthly_value - j.payment_value) * j.assignmentCount, 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">receita - custos</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Active Harvest Jobs */}
            {activeJobs.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold font-display">Serviços em Execução</h2>
                  <Link to="/admin/harvest">
                    <Button variant="ghost" size="sm" className="text-muted-foreground">
                      Ver todos <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeJobs.slice(0, 6).map((job) => (
                    <Link key={job.id} to={`/admin/harvest/${job.id}`}>
                      <Card className="border-border bg-card hover:border-primary/50 transition-colors cursor-pointer">
                        <CardContent className="pt-5 pb-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Sprout className="h-4 w-4 text-primary shrink-0" />
                              <span className="font-medium truncate">{job.farm_name}</span>
                            </div>
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">Ativo</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                            <MapPin className="h-3 w-3" /> {job.location}
                          </p>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" /> {job.assignmentCount} motorista{job.assignmentCount !== 1 ? "s" : ""}
                            </span>
                            <span className="font-medium text-primary">{formatCurrency(job.monthly_value * job.assignmentCount)}/mês</span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Freight Status - only show if freights exist */}
            {stats.totalFreights > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <Card className="border-border bg-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <Clock className="h-6 w-6 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{stats.availableFreights}</p>
                        <p className="text-sm text-muted-foreground">Disponíveis</p>
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
            )}

            {/* Quick Actions & Recent Applications */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg font-display">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/admin/harvest">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Sprout className="h-4 w-4" />
                        Gerenciar Colheita
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link to="/admin/drivers">
                    <Button variant="outline" className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Gerenciar Cadastros
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  {stats.totalFreights > 0 && (
                    <>
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
                            Ver Ordens de Carregamento
                            {stats.pendingApplications > 0 && (
                              <span className="bg-yellow-500 text-yellow-950 text-xs px-2 py-0.5 rounded-full">
                                {stats.pendingApplications}
                              </span>
                            )}
                          </span>
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Recent Applications - only if freights exist */}
              {stats.totalFreights > 0 ? (
                <Card className="border-border bg-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg font-display">Ordens Recentes</CardTitle>
                    <Link to="/admin/applications">
                      <Button variant="ghost" size="sm">Ver todas</Button>
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
                          <div key={app.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{app.profile_name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {app.freight_route}
                              </p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                              app.status === "approved"
                                ? "bg-green-500/20 text-green-500"
                                : app.status === "pending"
                                ? "bg-yellow-500/20 text-yellow-500"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {app.status === "approved" ? "Aprovado" : app.status === "pending" ? "Pendente" : app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </>
        )}
      </main>
    </AdminLayout>
  );
}
