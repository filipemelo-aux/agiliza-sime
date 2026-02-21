import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Sprout, ArrowLeft, Plus, Trash2, Users, Calendar, DollarSign, MapPin, User, Building2, Pencil } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  client_id: string | null;
  client_name?: string;
}

interface Assignment {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  start_date: string;
  end_date: string | null;
  daily_value: number | null;
  status: string;
  driver_name?: string;
  vehicle_plate?: string;
  days_worked?: number;
  total_value?: number;
}

interface DriverOption {
  user_id: string;
  full_name: string;
}

export default function HarvestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<HarvestJob | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignForm, setAssignForm] = useState({
    user_id: "",
    start_date: new Date().toISOString().split("T")[0],
    daily_value: "",
  });
  const [editForm, setEditForm] = useState({
    farm_name: "",
    location: "",
    harvest_period_start: "",
    harvest_period_end: "",
    total_third_party_vehicles: "1",
    monthly_value: "",
    payment_value: "",
    payment_closing_day: "30",
    notes: "",
  });

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin && id) fetchAll();
  }, [isAdmin, id]);

  const fetchAll = async () => {
    if (!id) return;
    try {
      // Fetch job
      const { data: jobData, error: jobErr } = await supabase
        .from("harvest_jobs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (jobErr) throw jobErr;
      if (!jobData) { navigate("/admin/harvest"); return; }
      
      // Enrich with client name
      let enrichedJob = { ...jobData, client_name: undefined as string | undefined };
      if (jobData.client_id) {
        const { data: clientData } = await supabase
          .from("profiles")
          .select("full_name, nome_fantasia")
          .eq("id", jobData.client_id)
          .maybeSingle();
        enrichedJob.client_name = clientData?.nome_fantasia || clientData?.full_name || undefined;
      }
      setJob(enrichedJob);

      // Fetch assignments
      const { data: assignData } = await supabase
        .from("harvest_assignments")
        .select("*")
        .eq("harvest_job_id", id)
        .order("start_date", { ascending: true });

      // Enrich with driver names and vehicle plates
      const enriched = await Promise.all(
        (assignData || []).map(async (a) => {
          const [profileRes, vehicleRes] = await Promise.all([
            supabase.from("profiles").select("full_name").eq("user_id", a.user_id).maybeSingle(),
            a.vehicle_id ? supabase.from("vehicles").select("plate").eq("id", a.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);

          const endDate = a.end_date ? new Date(a.end_date) : new Date();
          const startDate = new Date(a.start_date);
          const daysWorked = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
          const pv = (jobData as any).payment_value || jobData.monthly_value;
          const dailyVal = a.daily_value || (pv / 30);
          
          return {
            ...a,
            driver_name: profileRes.data?.full_name || "Desconhecido",
            vehicle_plate: vehicleRes.data?.plate || "—",
            days_worked: daysWorked,
            total_value: daysWorked * dailyVal,
          };
        })
      );
      setAssignments(enriched);

      // Fetch available drivers (all motoristas)
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("category", "motorista")
        .order("full_name");
      setDrivers(profilesData || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!assignForm.user_id || !id) {
      toast({ title: "Selecione um motorista", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const pv = (job as any)?.payment_value || job?.monthly_value || 0;
      const dailyVal = assignForm.daily_value ? parseFloat(assignForm.daily_value) : (pv / 30);
      const { error } = await supabase.from("harvest_assignments").insert({
        harvest_job_id: id,
        user_id: assignForm.user_id,
        start_date: assignForm.start_date,
        daily_value: dailyVal,
      });
      if (error) throw error;
      toast({ title: "Motorista vinculado com sucesso!" });
      setDialogOpen(false);
      setAssignForm({ user_id: "", start_date: new Date().toISOString().split("T")[0], daily_value: "" });
      fetchAll();
    } catch (error: any) {
      if (error.message?.includes("duplicate")) {
        toast({ title: "Motorista já vinculado a este serviço", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase.from("harvest_assignments").delete().eq("id", assignmentId);
      if (error) throw error;
      toast({ title: "Motorista removido" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleStatus = async () => {
    if (!job || !id) return;
    const newStatus = job.status === "active" ? "closed" : "active";
    try {
      const { error } = await supabase.from("harvest_jobs").update({ status: newStatus }).eq("id", id);
      if (error) throw error;
      toast({ title: newStatus === "active" ? "Serviço reativado" : "Serviço encerrado" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = () => {
    if (!job) return;
    setEditForm({
      farm_name: job.farm_name,
      location: job.location,
      harvest_period_start: job.harvest_period_start,
      harvest_period_end: job.harvest_period_end || "",
      total_third_party_vehicles: String(job.total_third_party_vehicles),
      monthly_value: String(job.monthly_value),
      payment_value: String((job as any).payment_value || ""),
      payment_closing_day: String(job.payment_closing_day),
      notes: job.notes || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm.farm_name || !editForm.monthly_value || !id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("harvest_jobs").update({
        farm_name: editForm.farm_name,
        location: editForm.location,
        harvest_period_start: editForm.harvest_period_start,
        harvest_period_end: editForm.harvest_period_end || null,
        total_third_party_vehicles: parseInt(editForm.total_third_party_vehicles),
        monthly_value: parseFloat(editForm.monthly_value),
        payment_value: editForm.payment_value ? parseFloat(editForm.payment_value) : parseFloat(editForm.monthly_value),
        payment_closing_day: parseInt(editForm.payment_closing_day),
        notes: editForm.notes || null,
      }).eq("id", id);
      if (error) throw error;
      toast({ title: "Serviço atualizado!" });
      setEditDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const formatDate = (date: string) =>
    new Date(date + "T00:00:00").toLocaleDateString("pt-BR");

  if (roleLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!job) return null;

  const paymentValue = (job as any).payment_value || job.monthly_value;
  const dailyValue = paymentValue / 30;
  const totalPaid = assignments.reduce((sum, a) => sum + (a.total_value || 0), 0);

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/admin/harvest">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold font-display">{job.farm_name}</h1>
            <p className="text-muted-foreground flex items-center gap-1 text-sm">
              <MapPin className="h-3.5 w-3.5" /> {job.location}
            </p>
            {job.client_name && (
              <p className="text-muted-foreground flex items-center gap-1 text-sm">
                <Building2 className="h-3.5 w-3.5" /> {job.client_name}
              </p>
            )}
          </div>
          <Badge variant={job.status === "active" ? "default" : "secondary"} className={job.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}>
            {job.status === "active" ? "Ativo" : "Encerrado"}
          </Badge>
          <Button variant="outline" size="icon" onClick={openEditDialog}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleStatus}>
            {job.status === "active" ? "Encerrar" : "Reativar"}
          </Button>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Editar Serviço de Colheita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fazenda / Local *</Label>
                  <Input value={editForm.farm_name} onChange={(e) => setEditForm({ ...editForm, farm_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Cidade/Estado *</Label>
                  <Input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Início do Período</Label>
                  <Input type="date" value={editForm.harvest_period_start} onChange={(e) => setEditForm({ ...editForm, harvest_period_start: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Fim do Período</Label>
                  <Input type="date" value={editForm.harvest_period_end} onChange={(e) => setEditForm({ ...editForm, harvest_period_end: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Qtd. Veículos</Label>
                  <Input type="number" min="1" value={editForm.total_third_party_vehicles} onChange={(e) => setEditForm({ ...editForm, total_third_party_vehicles: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Dia Fechamento</Label>
                  <Input type="number" min="1" max="31" value={editForm.payment_closing_day} onChange={(e) => setEditForm({ ...editForm, payment_closing_day: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Contrato (R$) *</Label>
                  <Input type="number" step="0.01" value={editForm.monthly_value} onChange={(e) => setEditForm({ ...editForm, monthly_value: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Valor a Pagar Terceiros (R$)</Label>
                  <Input type="number" step="0.01" value={editForm.payment_value} onChange={(e) => setEditForm({ ...editForm, payment_value: e.target.value })} placeholder="Mesmo do contrato" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
              </div>
              <Button onClick={handleEditSave} disabled={saving} className="w-full btn-transport-accent">
                {saving ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Período</p>
              <p className="font-semibold text-sm">{formatDate(job.harvest_period_start)}</p>
              {job.harvest_period_end && <p className="text-xs text-muted-foreground">até {formatDate(job.harvest_period_end)}</p>}
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Valor Contrato</p>
              <p className="font-semibold text-sm">{formatCurrency(job.monthly_value)}</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Valor a Pagar</p>
              <p className="font-semibold text-sm">{formatCurrency(paymentValue)}</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(dailyValue)}/dia</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Motoristas</p>
              <p className="font-semibold text-sm">{assignments.length}/{job.total_third_party_vehicles}</p>
              <p className="text-xs text-muted-foreground">vinculados</p>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
              <p className="font-semibold text-sm">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-muted-foreground">acumulado</p>
            </CardContent>
          </Card>
        </div>

        {job.notes && (
          <Card className="border-border mb-6">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Observações</p>
              <p className="text-sm">{job.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Assignments */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Motoristas Vinculados
          </h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="btn-transport-accent">
                <Plus className="h-4 w-4 mr-1" /> Vincular
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Vincular Motorista</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-2">
                   <Label>Motorista *</Label>
                  {drivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum motorista cadastrado. Vá em <Link to="/admin/drivers" className="text-primary underline">Motoristas</Link> e cadastre primeiro.</p>
                  ) : (
                    <Select value={assignForm.user_id} onValueChange={(v) => setAssignForm({ ...assignForm, user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {drivers.map((d) => (
                          <SelectItem key={d.user_id} value={d.user_id}>{d.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Início</Label>
                    <Input type="date" value={assignForm.start_date} onChange={(e) => setAssignForm({ ...assignForm, start_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Diária (R$)</Label>
                    <Input type="number" step="0.01" value={assignForm.daily_value} onChange={(e) => setAssignForm({ ...assignForm, daily_value: e.target.value })} placeholder={dailyValue.toFixed(2)} />
                  </div>
                </div>
                <Button onClick={handleAssign} disabled={saving || drivers.length === 0} className="w-full btn-transport-accent">
                  {saving ? "Salvando..." : "Vincular Motorista"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum motorista vinculado a este serviço.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Dias</TableHead>
                  <TableHead>Diária</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.driver_name}</TableCell>
                    <TableCell>{formatDate(a.start_date)}</TableCell>
                    <TableCell>{a.days_worked}</TableCell>
                    <TableCell>{formatCurrency(a.daily_value || dailyValue)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(a.total_value || 0)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "active" ? "default" : "secondary"} className={a.status === "active" ? "bg-green-500/20 text-green-600 border-0" : ""}>
                        {a.status === "active" ? "Ativo" : "Encerrado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemoveAssignment(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </main>
    </AdminLayout>
  );
}
