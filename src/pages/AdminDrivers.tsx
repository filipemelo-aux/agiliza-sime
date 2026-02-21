import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Truck, Wheat, Search } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

interface DriverProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  person_type: string | null;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  services: string[];
}

export default function AdminDrivers() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<DriverProfile | null>(null);
  const [selectedService, setSelectedService] = useState("");

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchDrivers();
  }, [isAdmin]);

  const fetchDrivers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      if (error) throw error;

      // Fetch all driver services
      const { data: services } = await supabase
        .from("driver_services" as any)
        .select("*");

      const driversWithServices = (profiles || []).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
        person_type: p.person_type,
        cnpj: p.cnpj,
        razao_social: p.razao_social,
        nome_fantasia: p.nome_fantasia,
        services: ((services as any[]) || [])
          .filter((s: any) => s.user_id === p.user_id)
          .map((s: any) => s.service_type),
      }));

      setDrivers(driversWithServices);
    } catch (error: any) {
      console.error("Error fetching drivers:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignService = async () => {
    if (!selectedDriver || !selectedService) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("driver_services" as any)
        .insert({
          user_id: selectedDriver.user_id,
          service_type: selectedService,
          assigned_by: user?.id,
        } as any);

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Serviço já vinculado",
            description: "Este motorista já possui este serviço vinculado.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Serviço vinculado!",
        description: `Serviço "${selectedService}" vinculado a ${selectedDriver.full_name}.`,
      });

      setAssignDialogOpen(false);
      setSelectedService("");
      fetchDrivers();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveService = async (userId: string, serviceType: string) => {
    try {
      const { error } = await supabase
        .from("driver_services" as any)
        .delete()
        .eq("user_id", userId)
        .eq("service_type", serviceType);

      if (error) throw error;

      toast({ title: "Serviço removido!" });
      fetchDrivers();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.cnpj && d.cnpj.includes(search)) ||
      (d.razao_social && d.razao_social.toLowerCase().includes(search.toLowerCase()))
  );

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold font-display">Gerenciar Motoristas</h1>
            <p className="text-muted-foreground">Vincule serviços aos motoristas cadastrados</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, CNPJ ou razão social..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filteredDrivers.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">Nenhum motorista encontrado.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredDrivers.map((driver) => (
              <Card key={driver.id} className="border-border">
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{driver.full_name}</h3>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {driver.person_type === "cnpj" ? "CNPJ" : "CPF"}
                        </Badge>
                      </div>
                      {driver.person_type === "cnpj" && driver.razao_social && (
                        <p className="text-sm text-muted-foreground">{driver.razao_social}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{driver.phone}</p>
                      
                      {/* Services */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {driver.services.map((svc) => (
                          <Badge
                            key={svc}
                            className={`cursor-pointer ${
                              svc === "fretes"
                                ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                                : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            }`}
                            onClick={() => handleRemoveService(driver.user_id, svc)}
                            title="Clique para remover"
                          >
                            {svc === "fretes" ? (
                              <Truck className="h-3 w-3 mr-1" />
                            ) : (
                              <Wheat className="h-3 w-3 mr-1" />
                            )}
                            {svc === "fretes" ? "Fretes" : "Colheita"}
                            <span className="ml-1 text-xs opacity-60">×</span>
                          </Badge>
                        ))}
                        {driver.services.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">Sem serviço vinculado</span>
                        )}
                      </div>
                    </div>

                    <Dialog
                      open={assignDialogOpen && selectedDriver?.id === driver.id}
                      onOpenChange={(open) => {
                        setAssignDialogOpen(open);
                        if (open) {
                          setSelectedDriver(driver);
                          setSelectedService("");
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Vincular Serviço
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Vincular Serviço - {driver.full_name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <Select value={selectedService} onValueChange={setSelectedService}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o serviço" />
                            </SelectTrigger>
                            <SelectContent>
                              {!driver.services.includes("fretes") && (
                                <SelectItem value="fretes">Fretes</SelectItem>
                              )}
                              {!driver.services.includes("colheita") && (
                                <SelectItem value="colheita">Colheita</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            className="w-full"
                            onClick={handleAssignService}
                            disabled={!selectedService}
                          >
                            Vincular
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
