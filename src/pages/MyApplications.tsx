import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Truck, FileText, Upload, Download, CheckCircle, Clock, XCircle,
  ChevronDown, ChevronUp, MapPin, Eye, Send
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface MyApplication {
  id: string;
  status: string;
  applied_at: string;
  loading_order_url: string | null;
  loading_order_sent_at: string | null;
  loading_proof_url: string | null;
  loading_proof_sent_at: string | null;
  payment_status: string | null;
  payment_receipt_url: string | null;
  payment_completed_at: string | null;
  cte_number: string | null;
  discharge_proof_url: string | null;
  discharge_proof_status: string | null;
  discharge_proof_sent_at: string | null;
  freight_id: string;
  vehicle_id: string;
  freight: {
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    company_name: string;
    cargo_type: string;
    value_brl: number;
    pickup_date: string;
  };
  vehicle: {
    plate: string;
    brand: string;
    model: string;
  };
}

interface UserVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
}

export default function MyApplications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Discharge proof modal state
  const [dischargeModalOpen, setDischargeModalOpen] = useState(false);
  const [dischargeApp, setDischargeApp] = useState<MyApplication | null>(null);
  const [dischargeCteNumber, setDischargeCteNumber] = useState("");
  const [dischargeVehicleId, setDischargeVehicleId] = useState("");
  const [dischargeFile, setDischargeFile] = useState<File | null>(null);
  const [submittingDischarge, setSubmittingDischarge] = useState(false);
  const [userVehicles, setUserVehicles] = useState<UserVehicle[]>([]);

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }
    fetchApplications();
    fetchVehicles();
  }, [user]);

  const fetchApplications = async () => {
    if (!user) return;
    try {
      const { data: apps, error } = await supabase
        .from("freight_applications")
        .select("*")
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false });

      if (error) throw error;
      if (!apps || apps.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      const details = await Promise.all(
        apps.map(async (app) => {
          const [freightRes, vehicleRes] = await Promise.all([
            supabase.from("freights").select("origin_city, origin_state, destination_city, destination_state, company_name, cargo_type, value_brl, pickup_date").eq("id", app.freight_id).maybeSingle(),
            supabase.from("vehicles").select("plate, brand, model").eq("id", app.vehicle_id).maybeSingle(),
          ]);
          return {
            ...app,
            freight: freightRes.data,
            vehicle: vehicleRes.data,
          } as MyApplication;
        })
      );

      setApplications(details.filter((a) => a.freight && a.vehicle));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("vehicles")
      .select("id, plate, brand, model")
      .eq("user_id", user.id)
      .eq("is_active", true);
    setUserVehicles(data || []);
  };

  const handleDownloadOrder = async (app: MyApplication) => {
    if (!app.loading_order_url) return;
    try {
      const { data, error } = await supabase.storage
        .from("loading-orders")
        .download(app.loading_order_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordem_${app.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Erro ao baixar", description: err.message, variant: "destructive" });
    }
  };

  const handleDownloadPaymentReceipt = async (app: MyApplication) => {
    if (!app.payment_receipt_url) return;
    try {
      const { data, error } = await supabase.storage
        .from("freight-proofs")
        .download(app.payment_receipt_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      window.open(url, "_blank");
    } catch (err: any) {
      toast({ title: "Erro ao baixar", description: err.message, variant: "destructive" });
    }
  };

  const openDischargeModal = (app: MyApplication) => {
    setDischargeApp(app);
    setDischargeCteNumber(app.cte_number || "");
    setDischargeVehicleId(app.vehicle_id);
    setDischargeFile(null);
    setDischargeModalOpen(true);
  };

  const handleSubmitDischarge = async () => {
    if (!dischargeApp || !dischargeFile || !dischargeCteNumber.trim()) {
      toast({ title: "Preencha todos os campos", description: "Nº CT-e e foto do comprovante são obrigatórios.", variant: "destructive" });
      return;
    }

    setSubmittingDischarge(true);
    try {
      const fileExt = dischargeFile.name.split(".").pop();
      const filePath = `${dischargeApp.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("discharge-proofs")
        .upload(filePath, dischargeFile, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("freight_applications")
        .update({
          cte_number: dischargeCteNumber.trim(),
          discharge_proof_url: filePath,
          discharge_proof_status: "pending",
          discharge_proof_sent_at: new Date().toISOString(),
        } as any)
        .eq("id", dischargeApp.id);
      if (updateError) throw updateError;

      // Notify admins
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles && adminRoles.length > 0) {
        const { data: profile } = await supabase.from("profiles").select("full_name").eq("user_id", user!.id).maybeSingle();
        await supabase.from("notifications").insert(
          adminRoles.map((a) => ({
            user_id: a.user_id,
            title: "Comprovante de Descarga Recebido",
            message: `${profile?.full_name || "Motorista"} enviou comprovante de descarga para ${dischargeApp.freight.origin_city}/${dischargeApp.freight.origin_state} → ${dischargeApp.freight.destination_city}/${dischargeApp.freight.destination_state} (CT-e: ${dischargeCteNumber.trim()})`,
            type: "discharge_proof",
            data: JSON.parse(JSON.stringify({ application_id: dischargeApp.id, freight_id: dischargeApp.freight_id })),
          }))
        );
      }

      toast({ title: "Comprovante enviado!", description: "Aguarde a análise do administrador." });
      setDischargeModalOpen(false);
      fetchApplications();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingDischarge(false);
    }
  };

  const getStatusInfo = (app: MyApplication) => {
    if (app.status === "rejected") return { label: "Rejeitado", color: "bg-red-500/20 text-red-500 border-red-500/30" };
    if (app.status === "pending") return { label: "Aguardando Aprovação", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" };
    if ((app as any).discharge_proof_status === "accepted") return { label: "Descarga Aceita", color: "bg-green-500/20 text-green-500 border-green-500/30" };
    if ((app as any).discharge_proof_status === "pending") return { label: "Descarga em Análise", color: "bg-blue-500/20 text-blue-500 border-blue-500/30" };
    if ((app as any).discharge_proof_status === "rejected") return { label: "Descarga Recusada", color: "bg-orange-500/20 text-orange-500 border-orange-500/30" };
    if (app.loading_order_url) return { label: "Ordem Recebida", color: "bg-green-500/20 text-green-500 border-green-500/30" };
    return { label: "Em Andamento", color: "bg-blue-500/20 text-blue-500 border-blue-500/30" };
  };

  const canSendDischargeProof = (app: MyApplication) => {
    return app.status === "approved" && app.loading_order_url && 
      (!(app as any).discharge_proof_status || (app as any).discharge_proof_status === "rejected");
  };

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <BackButton to="/freights" label="Mural de Fretes" />
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Minhas Candidaturas</h1>
          <p className="text-muted-foreground">Acompanhe suas solicitações de frete</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma candidatura</h3>
            <p className="text-muted-foreground mb-4">Candidate-se a fretes no mural para vê-los aqui.</p>
            <Button onClick={() => navigate("/freights")}>Ver Fretes Disponíveis</Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => {
              const statusInfo = getStatusInfo(app);
              const isExpanded = expandedCard === app.id;

              return (
                <div key={app.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div
                    className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedCard(isExpanded ? null : app.id)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">
                              {app.freight.origin_city}/{app.freight.origin_state} → {app.freight.destination_city}/{app.freight.destination_state}
                            </span>
                            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {app.freight.company_name} • {app.vehicle.plate} • {new Date(app.applied_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">
                          {app.freight.value_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </span>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-4 bg-muted/20 space-y-4">
                      {/* Freight details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Carga</span>
                          <p className="font-medium">{app.freight.cargo_type}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Coleta</span>
                          <p className="font-medium">{new Date(app.freight.pickup_date).toLocaleDateString("pt-BR")}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Veículo</span>
                          <p className="font-medium">{app.vehicle.brand} {app.vehicle.model}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Placa</span>
                          <p className="font-medium">{app.vehicle.plate}</p>
                        </div>
                      </div>

                      {/* Ordem de Carregamento */}
                      {app.loading_order_url && (
                        <div className="bg-card border border-border rounded-lg p-4">
                          <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            Ordem de Carregamento
                          </h5>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Recebida em {new Date(app.loading_order_sent_at!).toLocaleDateString("pt-BR")}
                            </p>
                            <Button size="sm" variant="outline" onClick={() => handleDownloadOrder(app)}>
                              <Download className="w-4 h-4 mr-2" />
                              Baixar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Comprovante de Descarga */}
                      {app.status === "approved" && app.loading_order_url && (
                        <div className="bg-card border border-border rounded-lg p-4">
                          <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <Upload className="w-4 h-4 text-primary" />
                            Comprovante de Descarga
                          </h5>

                          {(app as any).discharge_proof_status === "pending" && (
                            <p className="text-sm text-blue-600 flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Comprovante enviado — em análise (CT-e: {(app as any).cte_number})
                            </p>
                          )}

                          {(app as any).discharge_proof_status === "accepted" && (
                            <p className="text-sm text-green-600 flex items-center gap-1">
                              <CheckCircle className="w-4 h-4" />
                              Comprovante aceito (CT-e: {(app as any).cte_number})
                            </p>
                          )}

                          {(app as any).discharge_proof_status === "rejected" && (
                            <div className="space-y-2">
                              <p className="text-sm text-orange-600 flex items-center gap-1">
                                <XCircle className="w-4 h-4" />
                                Comprovante recusado — reenvie
                              </p>
                              <Button size="sm" onClick={() => openDischargeModal(app)}>
                                <Send className="w-4 h-4 mr-2" />
                                Reenviar Comprovante
                              </Button>
                            </div>
                          )}

                          {canSendDischargeProof(app) && !(app as any).discharge_proof_status && (
                            <Button size="sm" onClick={() => openDischargeModal(app)}>
                              <Send className="w-4 h-4 mr-2" />
                              Enviar Comprovante de Descarga
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Pagamento */}
                      {app.payment_status === "paid" && app.payment_receipt_url && (
                        <div className="bg-card border border-border rounded-lg p-4">
                          <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Pagamento
                          </h5>
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-green-600">
                              Pago em {new Date(app.payment_completed_at!).toLocaleDateString("pt-BR")}
                            </p>
                            <Button size="sm" variant="outline" onClick={() => handleDownloadPaymentReceipt(app)}>
                              <Eye className="w-4 h-4 mr-2" />
                              Comprovante
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Discharge Proof Modal */}
      <Dialog open={dischargeModalOpen} onOpenChange={setDischargeModalOpen}>
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Enviar Comprovante de Descarga</DialogTitle>
            <DialogDescription>
              Informe o nº do CT-e, selecione o veículo e anexe a foto do comprovante.
            </DialogDescription>
          </DialogHeader>

          {dischargeApp && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">
                    {dischargeApp.freight.origin_city}/{dischargeApp.freight.origin_state} → {dischargeApp.freight.destination_city}/{dischargeApp.freight.destination_state}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{dischargeApp.freight.company_name}</p>
              </div>

              <div className="space-y-2">
                <Label>Nº CT-e *</Label>
                <Input
                  value={dischargeCteNumber}
                  onChange={(e) => setDischargeCteNumber(e.target.value)}
                  placeholder="Número do CT-e"
                />
              </div>

              <div className="space-y-2">
                <Label>Veículo *</Label>
                <Select value={dischargeVehicleId} onValueChange={setDischargeVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {userVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.brand} {v.model} — {v.plate}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Foto do Comprovante *</Label>
                <div
                  className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".jpg,.jpeg,.png,.pdf";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) setDischargeFile(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {dischargeFile ? "Clique para alterar" : "Clique para selecionar"}
                  </p>
                </div>
                {dischargeFile && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div className="overflow-hidden">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                        {dischargeFile.name}
                      </p>
                      <p className="text-xs text-green-600">{(dischargeFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleSubmitDischarge}
                disabled={!dischargeFile || !dischargeCteNumber.trim() || submittingDischarge}
                className="w-full"
              >
                {submittingDischarge ? "Enviando..." : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar Comprovante
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
