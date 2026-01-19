import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, FileText, Download, Clock, CheckCircle, XCircle, Upload, Banknote, Send } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Application {
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

  // Upload proof modal state
  const [uploadProofOpen, setUploadProofOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const handleDownloadPaymentReceipt = async (app: Application) => {
    if (!app.payment_receipt_url) return;

    try {
      const { data, error } = await supabase.storage
        .from("freight-proofs")
        .download(app.payment_receipt_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comprovante_pagamento_${app.freight.origin_city}_${app.freight.destination_city}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download iniciado",
        description: "O comprovante de pagamento está sendo baixado.",
      });
    } catch (error: any) {
      console.error("Error downloading payment receipt:", error);
      toast({
        title: "Erro ao baixar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleOpenUploadProof = (app: Application) => {
    setSelectedApp(app);
    setSelectedFile(null);
    setUploadProofOpen(true);
  };

  const handleUploadProof = async () => {
    if (!selectedApp || !selectedFile || !user) return;

    setUploading(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${user.id}/${selectedApp.id}_loading_proof_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("freight-proofs")
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("freight_applications")
        .update({
          loading_proof_url: fileName,
          loading_proof_sent_at: new Date().toISOString(),
        })
        .eq("id", selectedApp.id);

      if (updateError) throw updateError;

      // Notify admin
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        await Promise.all(admins.map(admin =>
          supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: "Comprovante de Carregamento Recebido",
            message: `O motorista enviou o comprovante de carregamento para o frete ${selectedApp.freight.origin_city}/${selectedApp.freight.origin_state} → ${selectedApp.freight.destination_city}/${selectedApp.freight.destination_state}.`,
            type: "loading_proof_received",
            data: JSON.parse(JSON.stringify({
              application_id: selectedApp.id,
              freight_id: selectedApp.freight.id,
              loading_proof_url: fileName,
            })),
          })
        ));
      }

      toast({
        title: "Comprovante enviado!",
        description: "O administrador foi notificado.",
      });

      setUploadProofOpen(false);
      setSelectedFile(null);
      if (user) fetchApplications(user.id);
    } catch (error: any) {
      console.error("Error uploading proof:", error);
      toast({
        title: "Erro ao enviar comprovante",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
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

  const getPaymentStatusBadge = (paymentStatus: string | null) => {
    if (paymentStatus === "paid") {
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Pago</Badge>;
    }
    if (paymentStatus === "requested") {
      return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Pagamento Solicitado</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Aguardando</Badge>;
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
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                      {/* Show payment status for approved applications */}
                      {app.status === "approved" && app.loading_order_url && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">•</span>
                          {getPaymentStatusBadge(app.payment_status)}
                        </div>
                      )}
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

                    {/* Show loading proof status */}
                    {app.status === "approved" && app.loading_order_url && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {app.loading_proof_url ? (
                          <p className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            Comprovante de carregamento enviado em{" "}
                            {new Date(app.loading_proof_sent_at!).toLocaleDateString("pt-BR")}
                          </p>
                        ) : (
                          <p className="text-sm text-yellow-600 flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Aguardando envio do comprovante de carregamento
                          </p>
                        )}

                        {/* Payment info */}
                        {app.payment_status === "paid" && app.payment_receipt_url && (
                          <p className="text-sm text-green-600 flex items-center gap-1 mt-2">
                            <Banknote className="w-4 h-4" />
                            Adiantamento pago em{" "}
                            {new Date(app.payment_completed_at!).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xl font-bold text-primary">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(app.freight.value_brl)}
                    </span>

                    {/* Download loading order button */}
                    {app.loading_order_url && (
                      <Button
                        onClick={() => handleDownload(app)}
                        className="btn-transport-accent"
                        size="sm"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Ordem
                      </Button>
                    )}

                    {/* Upload loading proof button */}
                    {app.status === "approved" && app.loading_order_url && !app.loading_proof_url && (
                      <Button
                        onClick={() => handleOpenUploadProof(app)}
                        variant="outline"
                        size="sm"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Enviar Comprovante
                      </Button>
                    )}

                    {/* Download payment receipt button */}
                    {app.payment_status === "paid" && app.payment_receipt_url && (
                      <Button
                        onClick={() => handleDownloadPaymentReceipt(app)}
                        variant="outline"
                        size="sm"
                      >
                        <Banknote className="w-4 h-4 mr-2" />
                        Comprovante Pgto
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Upload Loading Proof Modal */}
      <Dialog open={uploadProofOpen} onOpenChange={setUploadProofOpen}>
        <DialogContent 
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Enviar Comprovante de Carregamento</DialogTitle>
            <DialogDescription>
              Anexe uma foto ou documento que comprove que o caminhão foi carregado.
            </DialogDescription>
          </DialogHeader>

          {selectedApp && (
            <div className="space-y-4">
              {/* Freight Summary */}
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-semibold">
                    {selectedApp.freight.origin_city}/{selectedApp.freight.origin_state} → {selectedApp.freight.destination_city}/{selectedApp.freight.destination_state}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedApp.freight.company_name}
                </p>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Anexar Comprovante (PDF, JPG, PNG)</Label>
                <div 
                  className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.jpg,.jpeg,.png';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        setSelectedFile(file);
                      }
                    };
                    input.click();
                  }}
                >
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {selectedFile ? "Clique para alterar o arquivo" : "Clique para selecionar um arquivo"}
                  </p>
                </div>
                {selectedFile && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 w-full">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="overflow-hidden flex-1">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleUploadProof}
                disabled={!selectedFile || uploading}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {uploading ? (
                  "Enviando..."
                ) : (
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
    </div>
  );
}
