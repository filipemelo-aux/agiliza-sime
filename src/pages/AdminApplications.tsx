import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, User, FileText, Upload, Download, Send, Phone, CreditCard, Car, CheckCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

interface ApplicationWithDetails {
  id: string;
  status: string;
  applied_at: string;
  loading_order_url: string | null;
  loading_order_sent_at: string | null;
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

      // Fetch all related data with better error handling
      const applicationDetails = await Promise.all(
        apps.map(async (app) => {
          try {
            const [freightRes, profileRes, docsRes, vehicleRes] = await Promise.all([
              supabase.from("freights").select("*").eq("id", app.freight_id).maybeSingle(),
              supabase.from("profiles").select("*").eq("user_id", app.user_id).maybeSingle(),
              supabase.from("driver_documents").select("*").eq("user_id", app.user_id).maybeSingle(),
              supabase.from("vehicles").select("*").eq("id", app.vehicle_id).maybeSingle(),
            ]);

            // Log errors but don't throw
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

      // Filter out nulls and incomplete data
      const validApplications = applicationDetails.filter(
        (app): app is ApplicationWithDetails => 
          app !== null && app.freight !== null && app.profile !== null && app.vehicle !== null
      );
      
      setApplications(validApplications);
    } catch (error) {
      console.error("Error fetching applications:", error);
      toast({
        title: "Erro ao carregar candidaturas",
        description: "Tente recarregar a página.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUploadAndSend = async () => {
    if (!selectedApp || !selectedFile) return;

    setUploadingFile(true);

    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${selectedApp.id}_${Date.now()}.${fileExt}`;
      const filePath = `orders/${fileName}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("loading-orders")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("loading-orders")
        .getPublicUrl(filePath);

      // Update application with file URL
      const { error: updateError } = await supabase
        .from("freight_applications")
        .update({
          loading_order_url: filePath,
          loading_order_sent_at: new Date().toISOString(),
          status: "approved",
        })
        .eq("id", selectedApp.id);

      if (updateError) throw updateError;

      // Send notification to driver
      const { error: notifError } = await supabase.from("notifications").insert({
        user_id: selectedApp.user_id,
        title: "Ordem de Carregamento Recebida",
        message: `Sua ordem de carregamento para o frete ${selectedApp.freight.origin_city}/${selectedApp.freight.origin_state} → ${selectedApp.freight.destination_city}/${selectedApp.freight.destination_state} está disponível para download.`,
        type: "loading_order",
        data: JSON.parse(JSON.stringify({
          application_id: selectedApp.id,
          freight_id: selectedApp.freight_id,
          loading_order_url: filePath,
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

  const openDetail = (app: ApplicationWithDetails) => {
    setSelectedApp(app);
    setDetailOpen(true);
    setSelectedFile(null);
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
          <h1 className="text-3xl font-bold font-display">Candidaturas</h1>
          <p className="text-muted-foreground">Gerencie as solicitações de ordem de carregamento</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma candidatura</h3>
            <p className="text-muted-foreground">As solicitações de motoristas aparecerão aqui.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {applications.map((app) => (
              <div
                key={app.id}
                className="freight-card cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => openDetail(app)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-primary" />
                      <span className="font-semibold">{app.profile.full_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        app.status === "approved"
                          ? "bg-green-500/20 text-green-500"
                          : app.status === "pending"
                          ? "bg-yellow-500/20 text-yellow-500"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {app.status === "approved" ? "Aprovado" : app.status === "pending" ? "Pendente" : app.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <Truck className="w-3 h-3 inline mr-1" />
                      {app.freight.origin_city}/{app.freight.origin_state} → {app.freight.destination_city}/{app.freight.destination_state}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <Car className="w-3 h-3 inline mr-1" />
                      {app.vehicle.brand} {app.vehicle.model} - {app.vehicle.plate}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {app.loading_order_url ? (
                      <span className="flex items-center gap-1 text-green-500 text-sm">
                        <CheckCircle className="w-4 h-4" />
                        Ordem Enviada
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        className="btn-transport-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDetail(app);
                        }}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Anexar Ordem
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Detalhes da Candidatura</DialogTitle>
          </DialogHeader>

          {selectedApp && (
            <Tabs defaultValue="applicant" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="applicant">Motorista</TabsTrigger>
                <TabsTrigger value="vehicle">Veículo</TabsTrigger>
                <TabsTrigger value="order">Ordem de Carregamento</TabsTrigger>
              </TabsList>

              <TabsContent value="applicant" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Nome Completo</Label>
                    <p className="font-semibold">{selectedApp.profile.full_name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Telefone</Label>
                    <p className="font-semibold flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {formatPhone(selectedApp.profile.phone)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">CPF</Label>
                    <p className="font-semibold">{maskCPF(selectedApp.driver_documents?.cpf || "")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">CNH</Label>
                    <p className="font-semibold">
                      {selectedApp.driver_documents?.cnh_number} - Cat. {selectedApp.driver_documents?.cnh_category}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Validade CNH</Label>
                    <p className="font-semibold">
                      {selectedApp.driver_documents?.cnh_expiry
                        ? new Date(selectedApp.driver_documents.cnh_expiry).toLocaleDateString("pt-BR")
                        : "-"}
                    </p>
                  </div>
                </div>

                {/* Bank Info */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Dados Bancários
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Banco</Label>
                      <p className="font-semibold">{selectedApp.profile.bank_name || "Não informado"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Agência</Label>
                      <p className="font-semibold">{selectedApp.profile.bank_agency || "Não informado"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Conta</Label>
                      <p className="font-semibold">
                        {selectedApp.profile.bank_account || "Não informado"}
                        {selectedApp.profile.bank_account_type && ` (${selectedApp.profile.bank_account_type})`}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">PIX</Label>
                      <p className="font-semibold">
                        {selectedApp.profile.pix_key || "Não informado"}
                        {selectedApp.profile.pix_key_type && ` (${selectedApp.profile.pix_key_type})`}
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="vehicle" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Tipo de Veículo</Label>
                    <p className="font-semibold">
                      {vehicleTypeLabels[selectedApp.vehicle.vehicle_type] || selectedApp.vehicle.vehicle_type}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Marca / Modelo</Label>
                    <p className="font-semibold">{selectedApp.vehicle.brand} {selectedApp.vehicle.model}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Placa do Cavalo</Label>
                    <p className="font-semibold">{selectedApp.vehicle.plate}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">RENAVAM</Label>
                    <p className="font-semibold">{selectedApp.vehicle.renavam}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Ano</Label>
                    <p className="font-semibold">{selectedApp.vehicle.year}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">ANTT</Label>
                    <p className="font-semibold">{selectedApp.vehicle.antt_number || "Não informado"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-sm">Tipo de Carga</Label>
                    <p className="font-semibold">
                      {selectedApp.vehicle.cargo_type === "cacamba" ? "Caçamba" : 
                       selectedApp.vehicle.cargo_type === "graneleiro" ? "Graneleiro" : 
                       selectedApp.vehicle.cargo_type || "Não informado"}
                    </p>
                  </div>
                </div>

                {/* Trailer Info */}
                {(selectedApp.vehicle.trailer_plate_1 || selectedApp.vehicle.trailer_plate_2 || selectedApp.vehicle.trailer_plate_3) && (
                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold mb-3">Carretas</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {selectedApp.vehicle.trailer_plate_1 && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <p className="text-sm text-muted-foreground">Carreta 1</p>
                          <p className="font-semibold">Placa: {selectedApp.vehicle.trailer_plate_1}</p>
                          <p className="text-sm">RENAVAM: {selectedApp.vehicle.trailer_renavam_1 || "-"}</p>
                        </div>
                      )}
                      {selectedApp.vehicle.trailer_plate_2 && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <p className="text-sm text-muted-foreground">Carreta 2</p>
                          <p className="font-semibold">Placa: {selectedApp.vehicle.trailer_plate_2}</p>
                          <p className="text-sm">RENAVAM: {selectedApp.vehicle.trailer_renavam_2 || "-"}</p>
                        </div>
                      )}
                      {selectedApp.vehicle.trailer_plate_3 && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <p className="text-sm text-muted-foreground">Carreta 3</p>
                          <p className="font-semibold">Placa: {selectedApp.vehicle.trailer_plate_3}</p>
                          <p className="text-sm">RENAVAM: {selectedApp.vehicle.trailer_renavam_3 || "-"}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="order" className="space-y-4 mt-4">
                {/* Freight Info Summary */}
                <div className="bg-secondary/30 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold mb-2">Frete</h4>
                  <p className="text-sm">
                    {selectedApp.freight.origin_city}/{selectedApp.freight.origin_state} → {selectedApp.freight.destination_city}/{selectedApp.freight.destination_state}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedApp.freight.company_name} • {selectedApp.freight.cargo_type} • {selectedApp.freight.weight_kg.toLocaleString("pt-BR")} kg
                  </p>
                </div>

                {selectedApp.loading_order_url ? (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                    <p className="font-semibold text-green-600">Ordem de Carregamento Enviada</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Enviada em {selectedApp.loading_order_sent_at 
                        ? new Date(selectedApp.loading_order_sent_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="loadingOrder">Anexar Ordem de Carregamento (PDF)</Label>
                      <Input
                        id="loadingOrder"
                        type="file"
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        onChange={handleFileChange}
                        className="mt-2"
                      />
                      {selectedFile && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Arquivo selecionado: {selectedFile.name}
                        </p>
                      )}
                    </div>

                    <Button
                      onClick={handleUploadAndSend}
                      disabled={!selectedFile || uploadingFile}
                      className="w-full btn-transport-accent"
                    >
                      {uploadingFile ? (
                        "Enviando..."
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Enviar Ordem para o Motorista
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
