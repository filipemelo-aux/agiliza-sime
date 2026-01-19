import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Truck, User, FileText, Upload, Send, Phone, CreditCard, Car, 
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, MapPin,
  Calendar, Package, Scale, DollarSign, Banknote, Download, Eye
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface ApplicationWithDetails {
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
  freight_id: string;
  user_id: string;
  vehicle_id: string;
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
  profile: {
    full_name: string;
    phone: string;
    bank_name: string | null;
    bank_agency: string | null;
    bank_account: string | null;
    bank_account_type: string | null;
    pix_key: string | null;
    pix_key_type: string | null;
  };
  driver_documents: {
    cpf: string;
    cnh_number: string;
    cnh_category: string;
    cnh_expiry: string;
  };
  vehicle: {
    plate: string;
    renavam: string;
    brand: string;
    model: string;
    year: number;
    vehicle_type: string;
    antt_number: string | null;
    cargo_type: string | null;
    trailer_plate_1: string | null;
    trailer_plate_2: string | null;
    trailer_plate_3: string | null;
    trailer_renavam_1: string | null;
    trailer_renavam_2: string | null;
    trailer_renavam_3: string | null;
  };
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

export default function AdminApplications() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [applications, setApplications] = useState<ApplicationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<ApplicationWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [appToReject, setAppToReject] = useState<ApplicationWithDetails | null>(null);

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentApp, setPaymentApp] = useState<ApplicationWithDetails | null>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentAction, setPaymentAction] = useState<"request" | "confirm">("request");

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      fetchApplications();
    }
  }, [isAdmin]);

  const fetchApplications = async () => {
    try {
      const { data: apps, error: appsError } = await supabase
        .from("freight_applications")
        .select("*")
        .order("applied_at", { ascending: false });

      if (appsError) {
        console.error("Error fetching applications:", appsError);
        throw appsError;
      }

      if (!apps || apps.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      const applicationDetails = await Promise.all(
        apps.map(async (app) => {
          try {
            const [freightRes, profileRes, docsRes, vehicleRes] = await Promise.all([
              supabase.from("freights").select("*").eq("id", app.freight_id).maybeSingle(),
              supabase.from("profiles").select("*").eq("user_id", app.user_id).maybeSingle(),
              supabase.from("driver_documents").select("*").eq("user_id", app.user_id).maybeSingle(),
              supabase.from("vehicles").select("*").eq("id", app.vehicle_id).maybeSingle(),
            ]);

            if (freightRes.error) console.warn("Freight fetch error:", freightRes.error);
            if (profileRes.error) console.warn("Profile fetch error:", profileRes.error);
            if (docsRes.error) console.warn("Docs fetch error:", docsRes.error);
            if (vehicleRes.error) console.warn("Vehicle fetch error:", vehicleRes.error);

            return {
              ...app,
              freight: freightRes.data,
              profile: profileRes.data,
              driver_documents: docsRes.data,
              vehicle: vehicleRes.data,
            } as ApplicationWithDetails;
          } catch (err) {
            console.error("Error fetching app details:", err);
            return null;
          }
        })
      );

      const validApplications = applicationDetails.filter(
        (app): app is ApplicationWithDetails => 
          app !== null && app.freight !== null && app.profile !== null && app.vehicle !== null
      );
      
      setApplications(validApplications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      toast({
        title: "Erro ao carregar ordens de carregamento",
        description: "Tente recarregar a página.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("File input change event triggered");
    console.log("Files:", e.target.files);
    const file = e.target.files?.[0];
    if (file) {
      console.log("File selected:", file.name, file.type, file.size);
      setSelectedFile(file);
    } else {
      console.log("No file selected");
    }
  };

  const handleAccept = (app: ApplicationWithDetails) => {
    console.log("Opening upload modal for application:", app.id);
    setSelectedApp(app);
    setDetailOpen(true);
    setSelectedFile(null);
  };

  const handleRejectClick = (app: ApplicationWithDetails, e: React.MouseEvent) => {
    e.stopPropagation();
    setAppToReject(app);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!appToReject || !rejectReason.trim()) {
      toast({
        title: "Justificativa obrigatória",
        description: "Por favor, informe o motivo da rejeição.",
        variant: "destructive",
      });
      return;
    }

    setRejecting(true);

    try {
      // Update application status
      const { error: updateError } = await supabase
        .from("freight_applications")
        .update({ status: "rejected" })
        .eq("id", appToReject.id);

      if (updateError) throw updateError;

      // Send notification to driver
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: appToReject.user_id,
        title: "Ordem de Carregamento Rejeitada",
        message: `Sua solicitação de ordem de carregamento para o frete ${appToReject.freight.origin_city}/${appToReject.freight.origin_state} → ${appToReject.freight.destination_city}/${appToReject.freight.destination_state} foi rejeitada. Motivo: ${rejectReason}`,
        type: "application_rejected",
        data: JSON.parse(JSON.stringify({
          application_id: appToReject.id,
          freight_id: appToReject.freight_id,
          reason: rejectReason,
        })),
      });

      if (notifError) throw notifError;

      toast({
        title: "Ordem de carregamento rejeitada",
        description: "O motorista foi notificado sobre a rejeição.",
      });

      setRejectModalOpen(false);
      setAppToReject(null);
      setRejectReason("");
      fetchApplications();
    } catch (error: any) {
      console.error("Error rejecting application:", error);
      toast({
        title: "Erro ao rejeitar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  const handleUploadAndSend = async () => {
    if (!selectedApp || !selectedFile) {
      console.log("Upload validation failed:", { selectedApp: !!selectedApp, selectedFile: !!selectedFile });
      return;
    }

    setUploadingFile(true);
    console.log("Starting upload for file:", selectedFile.name);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${selectedApp.id}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      console.log("Uploading to path:", filePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("loading-orders")
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      console.log("Upload result:", { uploadData, uploadError });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("freight_applications")
        .update({
          loading_order_url: filePath,
          loading_order_sent_at: new Date().toISOString(),
          status: "approved",
        })
        .eq("id", selectedApp.id);

      if (updateError) throw updateError;

      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: selectedApp.user_id,
        title: "Ordem de Carregamento Recebida",
        message: `Sua ordem de carregamento para o frete ${selectedApp.freight.origin_city}/${selectedApp.freight.origin_state} → ${selectedApp.freight.destination_city}/${selectedApp.freight.destination_state} está disponível para download em Minhas Ordens.`,
        type: "loading_order",
        data: JSON.parse(JSON.stringify({
          application_id: selectedApp.id,
          freight_id: selectedApp.freight_id,
          loading_order_url: filePath,
          navigate_to: "/my-applications",
        })),
      });

      if (notifError) throw notifError;

      toast({
        title: "Ordem enviada com sucesso!",
        description: "O motorista foi notificado e pode baixar a ordem de carregamento.",
      });

      setDetailOpen(false);
      setSelectedFile(null);
      fetchApplications();
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        title: "Erro ao enviar ordem",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleViewLoadingProof = async (app: ApplicationWithDetails) => {
    if (!app.loading_proof_url) return;

    try {
      const { data, error } = await supabase.storage
        .from("freight-proofs")
        .download(app.loading_proof_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      window.open(url, '_blank');
    } catch (error: any) {
      console.error("Error viewing loading proof:", error);
      toast({
        title: "Erro ao visualizar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleOpenPaymentModal = (app: ApplicationWithDetails, action: "request" | "confirm") => {
    setPaymentApp(app);
    setPaymentAction(action);
    setPaymentFile(null);
    setPaymentModalOpen(true);
  };

  const handlePaymentAction = async () => {
    if (!paymentApp) return;

    setProcessingPayment(true);

    try {
      if (paymentAction === "request") {
        // Mark payment as requested
        const { error: updateError } = await supabase
          .from("freight_applications")
          .update({ payment_status: "requested" })
          .eq("id", paymentApp.id);

        if (updateError) throw updateError;

        // Notify driver
        await supabase.from("notifications").insert({
          user_id: paymentApp.user_id,
          title: "Pagamento Solicitado",
          message: `O adiantamento do frete ${paymentApp.freight.origin_city}/${paymentApp.freight.origin_state} → ${paymentApp.freight.destination_city}/${paymentApp.freight.destination_state} foi solicitado.`,
          type: "payment_requested",
          data: JSON.parse(JSON.stringify({
            application_id: paymentApp.id,
            freight_id: paymentApp.freight_id,
          })),
        });

        toast({
          title: "Pagamento solicitado",
          description: "O motorista foi notificado.",
        });
      } else {
        // Confirm payment with receipt
        if (!paymentFile) {
          toast({
            title: "Comprovante obrigatório",
            description: "Anexe o comprovante de pagamento.",
            variant: "destructive",
          });
          setProcessingPayment(false);
          return;
        }

        const fileExt = paymentFile.name.split('.').pop();
        const fileName = `payment_receipt/${paymentApp.id}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("freight-proofs")
          .upload(fileName, paymentFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { error: updateError } = await supabase
          .from("freight_applications")
          .update({
            payment_status: "paid",
            payment_receipt_url: fileName,
            payment_completed_at: new Date().toISOString(),
          })
          .eq("id", paymentApp.id);

        if (updateError) throw updateError;

        // Notify driver
        await supabase.from("notifications").insert({
          user_id: paymentApp.user_id,
          title: "Pagamento Realizado",
          message: `O adiantamento do frete ${paymentApp.freight.origin_city}/${paymentApp.freight.origin_state} → ${paymentApp.freight.destination_city}/${paymentApp.freight.destination_state} foi depositado. O comprovante está disponível em Minhas Ordens de Carregamento.`,
          type: "payment_completed",
          data: JSON.parse(JSON.stringify({
            application_id: paymentApp.id,
            freight_id: paymentApp.freight_id,
            payment_receipt_url: fileName,
          })),
        });

        toast({
          title: "Pagamento confirmado",
          description: "O motorista foi notificado e pode baixar o comprovante.",
        });
      }

      setPaymentModalOpen(false);
      setPaymentApp(null);
      setPaymentFile(null);
      fetchApplications();
    } catch (error: any) {
      console.error("Error processing payment:", error);
      toast({
        title: "Erro ao processar",
        description: error.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  const toggleExpand = (appId: string) => {
    setExpandedCard(expandedCard === appId ? null : appId);
  };

  const maskCPF = (cpf: string) => {
    if (!cpf) return "";
    return `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-${cpf.substring(9)}`;
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "";
    if (phone.length === 11) {
      return `(${phone.substring(0, 2)}) ${phone.substring(2, 7)}-${phone.substring(7)}`;
    }
    if (phone.length === 10) {
      return `(${phone.substring(0, 2)}) ${phone.substring(2, 6)}-${phone.substring(6)}`;
    }
    return phone;
  };

  const getStatusBadge = (status: string, hasOrder: boolean) => {
    if (status === "approved" || hasOrder) {
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Aprovado</Badge>;
    }
    if (status === "rejected") {
      return <Badge className="bg-red-500/20 text-red-500 border-red-500/30">Rejeitado</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Pendente</Badge>;
  };

  const getPaymentStatusBadge = (paymentStatus: string | null) => {
    if (paymentStatus === "paid") {
      return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">Pago</Badge>;
    }
    if (paymentStatus === "requested") {
      return <Badge className="bg-blue-500/20 text-blue-500 border-blue-500/30">Pgto Solicitado</Badge>;
    }
    return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">Aguardando</Badge>;
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
          <h1 className="text-3xl font-bold font-display">Ordens de Carregamento</h1>
          <p className="text-muted-foreground">Gerencie as solicitações de ordem de carregamento</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma ordem de carregamento</h3>
            <p className="text-muted-foreground">As solicitações de motoristas aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => (
              <div
                key={app.id}
                className="bg-card border border-border rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div 
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(app.id)}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{app.profile.full_name}</span>
                          {getStatusBadge(app.status, !!app.loading_order_url)}
                          {app.status === "approved" && app.loading_order_url && (
                            <>
                              {getPaymentStatusBadge(app.payment_status)}
                              {app.loading_proof_url && (
                                <Badge className="bg-purple-500/20 text-purple-500 border-purple-500/30">
                                  Carregado
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {app.freight.origin_city}/{app.freight.origin_state} → {app.freight.destination_city}/{app.freight.destination_state}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {app.status === "pending" && !app.loading_order_url && (
                        <>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAccept(app);
                            }}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Aceitar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => handleRejectClick(app, e)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {app.loading_order_url && (
                        <span className="flex items-center gap-1 text-green-500 text-sm">
                          <CheckCircle className="w-4 h-4" />
                          Ordem Enviada
                        </span>
                      )}
                      {expandedCard === app.id ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedCard === app.id && (
                  <div className="border-t border-border p-4 bg-muted/20">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Driver Info */}
                      <div className="bg-card border border-border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-primary">
                          <User className="w-4 h-4" />
                          Motorista
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Nome:</span>
                            <span className="font-medium">{app.profile.full_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Telefone:</span>
                            <span className="font-medium">{formatPhone(app.profile.phone)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">CPF:</span>
                            <span className="font-medium">{maskCPF(app.driver_documents?.cpf || "")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">CNH:</span>
                            <span className="font-medium">
                              {app.driver_documents?.cnh_number} (Cat. {app.driver_documents?.cnh_category})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Validade CNH:</span>
                            <span className="font-medium">
                              {app.driver_documents?.cnh_expiry
                                ? new Date(app.driver_documents.cnh_expiry).toLocaleDateString("pt-BR")
                                : "-"}
                            </span>
                          </div>
                          {app.profile.bank_name && (
                            <>
                              <div className="border-t border-border my-2 pt-2">
                                <span className="text-muted-foreground text-xs">Dados Bancários</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Banco:</span>
                                <span className="font-medium">{app.profile.bank_name}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Ag/Conta:</span>
                                <span className="font-medium">
                                  {app.profile.bank_agency} / {app.profile.bank_account}
                                </span>
                              </div>
                            </>
                          )}
                          {app.profile.pix_key && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">PIX:</span>
                              <span className="font-medium truncate max-w-[120px]" title={app.profile.pix_key}>
                                {app.profile.pix_key}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vehicle Info */}
                      <div className="bg-card border border-border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-primary">
                          <Car className="w-4 h-4" />
                          Veículo
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Tipo:</span>
                            <span className="font-medium">
                              {vehicleTypeLabels[app.vehicle.vehicle_type] || app.vehicle.vehicle_type}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Marca/Modelo:</span>
                            <span className="font-medium">{app.vehicle.brand} {app.vehicle.model}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Placa:</span>
                            <span className="font-medium">{app.vehicle.plate}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">RENAVAM:</span>
                            <span className="font-medium">{app.vehicle.renavam}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Ano:</span>
                            <span className="font-medium">{app.vehicle.year}</span>
                          </div>
                          {app.vehicle.antt_number && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">ANTT:</span>
                              <span className="font-medium">{app.vehicle.antt_number}</span>
                            </div>
                          )}
                          {app.vehicle.cargo_type && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Tipo Carga:</span>
                              <span className="font-medium">
                                {app.vehicle.cargo_type === "cacamba" ? "Caçamba" : 
                                 app.vehicle.cargo_type === "graneleiro" ? "Graneleiro" : 
                                 app.vehicle.cargo_type}
                              </span>
                            </div>
                          )}
                          {(app.vehicle.trailer_plate_1 || app.vehicle.trailer_plate_2 || app.vehicle.trailer_plate_3) && (
                            <>
                              <div className="border-t border-border my-2 pt-2">
                                <span className="text-muted-foreground text-xs">
                                  {app.vehicle.vehicle_type === "rodotrem" ? "Dolly / Carretas" : "Carretas"}
                                </span>
                              </div>
                              {app.vehicle.trailer_plate_1 && (
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      {app.vehicle.vehicle_type === "rodotrem" ? "Dolly:" : "Carreta 1:"}
                                    </span>
                                    <span className="font-medium">{app.vehicle.trailer_plate_1}</span>
                                  </div>
                                  {app.vehicle.trailer_renavam_1 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">RENAVAM:</span>
                                      <span className="font-medium">{app.vehicle.trailer_renavam_1}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {app.vehicle.trailer_plate_2 && (
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      {app.vehicle.vehicle_type === "rodotrem" ? "Carreta 1:" : "Carreta 2:"}
                                    </span>
                                    <span className="font-medium">{app.vehicle.trailer_plate_2}</span>
                                  </div>
                                  {app.vehicle.trailer_renavam_2 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">RENAVAM:</span>
                                      <span className="font-medium">{app.vehicle.trailer_renavam_2}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {app.vehicle.trailer_plate_3 && (
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                      {app.vehicle.vehicle_type === "rodotrem" ? "Carreta 2:" : "Carreta 3:"}
                                    </span>
                                    <span className="font-medium">{app.vehicle.trailer_plate_3}</span>
                                  </div>
                                  {app.vehicle.trailer_renavam_3 && (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">RENAVAM:</span>
                                      <span className="font-medium">{app.vehicle.trailer_renavam_3}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Freight Info */}
                      <div className="bg-card border border-border rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-primary">
                          <Truck className="w-4 h-4" />
                          Frete
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="font-medium">{app.freight.origin_city}/{app.freight.origin_state}</p>
                              <p className="text-muted-foreground">→ {app.freight.destination_city}/{app.freight.destination_state}</p>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Empresa:</span>
                            <span className="font-medium">{app.freight.company_name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Carga:</span>
                            <span className="font-medium">{app.freight.cargo_type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Peso:</span>
                            <span className="font-medium">{app.freight.weight_kg.toLocaleString("pt-BR")} kg</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor:</span>
                            <span className="font-medium text-green-500">
                              {app.freight.value_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Coleta:</span>
                            <span className="font-medium">
                              {new Date(app.freight.pickup_date).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Solicitação:</span>
                            <span className="font-medium">
                              {new Date(app.applied_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons for Pending */}
                    {app.status === "pending" && !app.loading_order_url && (
                      <div className="flex gap-3 mt-4 pt-4 border-t border-border">
                        <Button
                          className="flex-1 bg-green-600 hover:bg-green-700"
                          onClick={() => handleAccept(app)}
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Aceitar
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={(e) => handleRejectClick(app, e)}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Rejeitar Ordem
                        </Button>
                      </div>
                    )}

                    {/* Actions for approved applications */}
                    {app.status === "approved" && app.loading_order_url && (
                      <div className="mt-4 pt-4 border-t border-border space-y-4">
                        {/* Loading Proof Section */}
                        <div className="bg-secondary/30 rounded-lg p-4">
                          <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            Comprovante de Carregamento
                          </h5>
                          {app.loading_proof_url ? (
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-green-600 flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" />
                                Recebido em {new Date(app.loading_proof_sent_at!).toLocaleDateString("pt-BR")}
                              </p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewLoadingProof(app)}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Visualizar
                              </Button>
                            </div>
                          ) : (
                            <p className="text-sm text-yellow-600 flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Aguardando envio pelo motorista
                            </p>
                          )}
                        </div>

                        {/* Payment Section */}
                        {app.loading_proof_url && (
                          <div className="bg-secondary/30 rounded-lg p-4">
                            <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                              <Banknote className="w-4 h-4" />
                              Pagamento do Adiantamento
                            </h5>
                            
                            {app.payment_status === "pending" && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-yellow-600 flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  Aguardando solicitação
                                </p>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenPaymentModal(app, "request")}
                                >
                                  <Send className="w-4 h-4 mr-2" />
                                  Solicitar Pagamento
                                </Button>
                              </div>
                            )}
                            
                            {app.payment_status === "requested" && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-blue-600 flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  Pagamento solicitado
                                </p>
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleOpenPaymentModal(app, "confirm")}
                                >
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Confirmar Pagamento
                                </Button>
                              </div>
                            )}
                            
                            {app.payment_status === "paid" && (
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-green-600 flex items-center gap-1">
                                  <CheckCircle className="w-4 h-4" />
                                  Pago em {new Date(app.payment_completed_at!).toLocaleDateString("pt-BR")}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Accept & Upload Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent 
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Enviar Ordem de Carregamento</DialogTitle>
            <DialogDescription>
              Anexe o PDF da ordem de carregamento para aprovar esta candidatura.
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
                  {selectedApp.profile.full_name} • {selectedApp.vehicle.plate}
                </p>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Anexar Ordem (PDF, DOC, JPG)</Label>
                <div 
                  className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        console.log("File selected via dynamic input:", file.name);
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
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 w-full" style={{ maxWidth: '100%' }}>
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div className="overflow-hidden" style={{ maxWidth: 'calc(100% - 28px)' }}>
                      <p className="text-sm font-medium text-green-800 dark:text-green-200 overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: '100%' }}>
                        {selectedFile.name.length > 30 ? selectedFile.name.substring(0, 30) + '...' : selectedFile.name}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleUploadAndSend}
                disabled={!selectedFile || uploadingFile}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {uploadingFile ? (
                  "Enviando..."
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Aprovar e Enviar Ordem
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-display text-destructive">Rejeitar Candidatura</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. O motorista será notificado.
            </DialogDescription>
          </DialogHeader>

          {appToReject && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-semibold">
                    {appToReject.freight.origin_city}/{appToReject.freight.origin_state} → {appToReject.freight.destination_city}/{appToReject.freight.destination_state}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {appToReject.profile.full_name} • {appToReject.vehicle.plate}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reject-reason">Motivo da rejeição *</Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Informe o motivo..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectModalOpen(false)}
                  disabled={rejecting}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleRejectConfirm}
                  disabled={rejecting || !rejectReason.trim()}
                >
                  {rejecting ? "Rejeitando..." : "Confirmar Rejeição"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent 
          className="max-w-md"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-display">
              {paymentAction === "request" ? "Solicitar Pagamento" : "Confirmar Pagamento"}
            </DialogTitle>
            <DialogDescription>
              {paymentAction === "request"
                ? "Informe que o pagamento do adiantamento foi solicitado."
                : "Anexe o comprovante de pagamento para confirmar o depósito."}
            </DialogDescription>
          </DialogHeader>

          {paymentApp && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="w-4 h-4 text-primary" />
                  <span className="font-semibold">
                    {paymentApp.freight.origin_city}/{paymentApp.freight.origin_state} → {paymentApp.freight.destination_city}/{paymentApp.freight.destination_state}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {paymentApp.profile.full_name}
                </p>
                <p className="text-lg font-bold text-primary mt-2">
                  {paymentApp.freight.value_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              </div>

              {paymentAction === "confirm" && (
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
                          setPaymentFile(file);
                        }
                      };
                      input.click();
                    }}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {paymentFile ? "Clique para alterar o arquivo" : "Clique para selecionar um arquivo"}
                    </p>
                  </div>
                  {paymentFile && (
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 w-full">
                      <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                      <div className="overflow-hidden flex-1">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200 truncate">
                          {paymentFile.name}
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          {(paymentFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={handlePaymentAction}
                disabled={processingPayment || (paymentAction === "confirm" && !paymentFile)}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {processingPayment ? (
                  "Processando..."
                ) : paymentAction === "request" ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Sinalizar Pagamento Solicitado
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirmar Pagamento
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
