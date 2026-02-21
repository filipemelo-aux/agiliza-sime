import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sprout, Plus, MapPin, Calendar, Users, DollarSign, ChevronRight, Pencil, Trash2, Building2 } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

interface ClientOption {
  id: string;
  full_name: string;
  nome_fantasia: string | null;
  address_city: string | null;
  address_state: string | null;
}

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
  client_id: string | null;
  assignment_count?: number;
  client_name?: string;
}

const emptyForm = {
  farm_name: "",
  location: "",
  harvest_period_start: "",
  harvest_period_end: "",
  total_third_party_vehicles: "1",
  monthly_value: "",
  payment_value: "",
  payment_closing_day: "30",
  notes: "",
  client_id: "",
};

export default function AdminHarvest() {
  const { user, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobs, setJobs] = useState<HarvestJob[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingJob, setEditingJob] = useState<HarvestJob | null>(null);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchJobs();
      fetchClients();
    }
  }, [isAdmin]);

  const fetchClients = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, nome_fantasia, address_city, address_state")
      .eq("category", "cliente")
      .order("full_name");
    setClients(data || []);
  };

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("harvest_jobs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const jobsWithCounts = await Promise.all(
        (data || []).map(async (job: any) => {
          const { count } = await supabase
            .from("harvest_assignments")
            .select("*", { count: "exact", head: true })
            .eq("harvest_job_id", job.id);

          let client_name: string | undefined;
          if (job.client_id) {
            const { data: clientData } = await supabase
              .from("profiles")
              .select("full_name, nome_fantasia")
              .eq("id", job.client_id)
              .maybeSingle();
            client_name = clientData?.nome_fantasia || clientData?.full_name || undefined;
          }

          return { ...job, assignment_count: count || 0, client_name };
        })
      );

      setJobs(jobsWithCounts);
    } catch (error) {
      console.error("Error fetching harvest jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingJob(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };


  const handleSave = async () => {
    if (!form.farm_name || !form.location || !form.harvest_period_start || !form.monthly_value) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        farm_name: form.farm_name,
        location: form.location,
        harvest_period_start: form.harvest_period_start,
        harvest_period_end: form.harvest_period_end || null,
        total_third_party_vehicles: parseInt(form.total_third_party_vehicles),
        monthly_value: parseFloat(form.monthly_value),
        payment_value: form.payment_value ? parseFloat(form.payment_value) : parseFloat(form.monthly_value),
        payment_closing_day: parseInt(form.payment_closing_day),
        notes: form.notes || null,
        client_id: form.client_id || null,
      };

      if (editingJob) {
        const { error } = await supabase.from("harvest_jobs").update(payload).eq("id", editingJob.id);
        if (error) throw error;
        toast({ title: "Serviço atualizado!" });
      } else {
        const { error } = await supabase.from("harvest_jobs").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast({ title: "Serviço de colheita criado!" });
      }
      setDialogOpen(false);
      setForm(emptyForm);
      setEditingJob(null);
      fetchJobs();
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (jobId: string) => {
    
    try {
      // Delete assignments first
      await supabase.from("harvest_assignments").delete().eq("harvest_job_id", jobId);
      const { error } = await supabase.from("harvest_jobs").delete().eq("id", jobId);
      if (error) throw error;
      toast({ title: "Serviço excluído!" });
      fetchJobs();
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
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
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display flex items-center gap-2">
              <Sprout className="h-8 w-8 text-primary" />
              Colheitas
            </h1>
            <p className="text-muted-foreground">Gestão de serviços de colheita terceirizados</p>
          </div>
          <Button className="btn-transport-accent" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" /> Novo Serviço
          </Button>
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingJob(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingJob ? "Editar Serviço" : "Novo Serviço de Colheita"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Contratante (Cliente)</Label>
                <Select value={form.client_id} onValueChange={(v) => {
                  const client = clients.find((c) => c.id === v);
                  const updates: Partial<typeof form> = { client_id: v };
                  if (client && !editingJob) {
                    if (!form.farm_name) updates.farm_name = client.nome_fantasia || client.full_name;
                    if (!form.location && client.address_city) {
                      updates.location = [client.address_city, client.address_state].filter(Boolean).join("/");
                    }
                  }
                  setForm((prev) => ({ ...prev, ...updates }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um cliente..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome_fantasia || c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fazenda / Local *</Label>
                  <Input value={form.farm_name} onChange={(e) => setForm({ ...form, farm_name: e.target.value })} placeholder="Nome da fazenda" />
                </div>
                <div className="space-y-2">
                  <Label>Cidade/Estado *</Label>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Qtd. Veículos</Label>
                  <Input type="number" min="1" value={form.total_third_party_vehicles} onChange={(e) => setForm({ ...form, total_third_party_vehicles: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Dia Fechamento</Label>
                  <Input type="number" min="1" max="31" value={form.payment_closing_day} onChange={(e) => setForm({ ...form, payment_closing_day: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Contrato (R$) *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={maskCurrency(String(Math.round(parseFloat(form.monthly_value || "0") * 100)))} onChange={(e) => setForm({ ...form, monthly_value: unmaskCurrency(e.target.value) })} placeholder="0,00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Valor a Pagar Terceiros (R$)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input className="pl-10" value={form.payment_value ? maskCurrency(String(Math.round(parseFloat(form.payment_value) * 100))) : ""} onChange={(e) => setForm({ ...form, payment_value: unmaskCurrency(e.target.value) })} placeholder="Mesmo do contrato" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Observações gerais..." rows={3} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full btn-transport-accent">
                {saving ? "Salvando..." : editingJob ? "Salvar Alterações" : "Criar Serviço"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
              const paymentVal = (job as any).payment_value || job.monthly_value;
              const dailyValue = paymentVal / 30;
              return (
                <div key={job.id}>
                  <Card
                    className="border-border bg-card hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full"
                    onClick={() => navigate(`/admin/harvest/${job.id}`)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg font-display">{job.farm_name}</CardTitle>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingJob(job);
                          setForm({
                            farm_name: job.farm_name,
                            location: job.location,
                            harvest_period_start: job.harvest_period_start,
                            harvest_period_end: job.harvest_period_end || "",
                            total_third_party_vehicles: String(job.total_third_party_vehicles),
                            monthly_value: String(job.monthly_value),
                            payment_value: String((job as any).payment_value || ""),
                            payment_closing_day: String(job.payment_closing_day),
                            notes: job.notes || "",
                            client_id: job.client_id || "",
                          });
                            setDialogOpen(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir serviço?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Isso excluirá o serviço "{job.farm_name}" e todos os vínculos de motoristas. Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(job.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" /> {job.location}
                        </p>
                        {job.client_name && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3.5 w-3.5" /> {job.client_name}
                          </p>
                        )}
                      </div>
                      <Badge variant={job.status === "active" ? "default" : "secondary"} className={job.status === "active" ? "bg-green-500/20 text-green-600 border-0 w-fit" : "w-fit"}>
                        {job.status === "active" ? "Ativo" : "Encerrado"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>{formatDate(job.harvest_period_start)}</span>
                        {job.harvest_period_end && <span> — {formatDate(job.harvest_period_end)}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>{formatCurrency(paymentVal)}/mês</span>
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
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
