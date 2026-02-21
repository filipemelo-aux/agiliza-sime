import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sprout, Plus, MapPin, Calendar, Users, DollarSign, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

interface HarvestJob {
  id: string;
  farm_name: string;
  location: string;
  harvest_period_start: string;
  harvest_period_end: string | null;
  total_third_party_vehicles: number;
  monthly_value: number;
  payment_closing_day: number;
  status: string;
  notes: string | null;
  created_at: string;
  assignment_count?: number;
}

export default function AdminHarvest() {
  const { user, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<HarvestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    farm_name: "",
    location: "",
    harvest_period_start: "",
    harvest_period_end: "",
    total_third_party_vehicles: "1",
    monthly_value: "",
    payment_closing_day: "30",
    notes: "",
  });

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchJobs();
  }, [isAdmin]);

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("harvest_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get assignment counts
      const jobsWithCounts = await Promise.all(
        (data || []).map(async (job) => {
          const { count } = await supabase
            .from("harvest_assignments")
            .select("*", { count: "exact", head: true })
            .eq("harvest_job_id", job.id);
          return { ...job, assignment_count: count || 0 };
        })
      );

      setJobs(jobsWithCounts);
    } catch (error) {
      console.error("Error fetching harvest jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.farm_name || !form.location || !form.harvest_period_start || !form.monthly_value) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("harvest_jobs").insert({
        farm_name: form.farm_name,
        location: form.location,
        harvest_period_start: form.harvest_period_start,
        harvest_period_end: form.harvest_period_end || null,
        total_third_party_vehicles: parseInt(form.total_third_party_vehicles),
        monthly_value: parseFloat(form.monthly_value),
        payment_closing_day: parseInt(form.payment_closing_day),
        notes: form.notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Serviço de colheita criado!" });
      setDialogOpen(false);
      setForm({ farm_name: "", location: "", harvest_period_start: "", harvest_period_end: "", total_third_party_vehicles: "1", monthly_value: "", payment_closing_day: "30", notes: "" });
      fetchJobs();
    } catch (error: any) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (date: string) =>
    new Date(date + "T00:00:00").toLocaleDateString("pt-BR");

  if (roleLoading) {
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display flex items-center gap-2">
              <Sprout className="h-8 w-8 text-primary" />
              Colheitas
            </h1>
            <p className="text-muted-foreground">Gestão de serviços de colheita terceirizados</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="btn-transport-accent">
                <Plus className="h-4 w-4 mr-2" /> Novo Serviço
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo Serviço de Colheita</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fazenda / Cliente *</Label>
                    <Input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} placeholder="Nome da fazenda" />
                  </div>
                  <div className="space-y-2">
                    <Label>Local *</Label>
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Cidade/Estado" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Início do Período *</Label>
                    <Input type="date" value={form.harvest_period_start} onChange={(e) => setForm({ ...form, harvest_period_start: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fim do Período</Label>
                    <Input type="date" value={form.harvest_period_end} onChange={(e) => setForm({ ...form, harvest_period_end: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Qtd. Veículos</Label>
                    <Input type="number" min="1" value={form.total_third_party_vehicles} onChange={(e) => setForm({ ...form, total_third_party_vehicles: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Mensal (R$) *</Label>
                    <Input type="number" step="0.01" value={form.monthly_value} onChange={(e) => setForm({ ...form, monthly_value: e.target.value })} placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label>Dia Fechamento</Label>
                    <Input type="number" min="1" max="31" value={form.payment_closing_day} onChange={(e) => setForm({ ...form, payment_closing_day: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações gerais..." rows={3} />
                </div>
                <Button onClick={handleCreate} disabled={saving} className="w-full btn-transport-accent">
                  {saving ? "Salvando..." : "Criar Serviço"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Sprout className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum serviço de colheita</h3>
              <p className="text-muted-foreground mb-4">Cadastre um novo serviço para começar a gerenciar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.map((job) => {
              const dailyValue = job.monthly_value / 30;
              return (
                <Link key={job.id} to={`/admin/harvest/${job.id}`}>
                  <Card className="border-border bg-card hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg font-display">{job.farm_name}</CardTitle>
                        <Badge variant={job.status === "active" ? "default" : "secondary"} className={job.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}>
                          {job.status === "active" ? "Ativo" : "Encerrado"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {job.location}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(job.harvest_period_start)}</span>
                        {job.harvest_period_end && <span> — {formatDate(job.harvest_period_end)}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>{formatCurrency(job.monthly_value)}/mês</span>
                        <span className="text-muted-foreground">({formatCurrency(dailyValue)}/dia)</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {job.assignment_count}/{job.total_third_party_vehicles} motoristas
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
