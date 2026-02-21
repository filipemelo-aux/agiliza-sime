import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Truck, Wheat, Search, Pencil, Trash2, Car } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { PersonEditDialog, PersonCreateDialog, type PersonProfile } from "@/components/PersonEditDialog";

const TAB_LABELS: Record<string, string> = {
  __all__: "Todos",
  motorista: "Motoristas",
  cliente: "Clientes",
  fornecedor: "Fornecedores",
  veiculos: "Veículos",
};

const CATEGORY_COLORS: Record<string, string> = {
  motorista: "bg-blue-500/20 text-blue-400",
  cliente: "bg-amber-500/20 text-amber-400",
  fornecedor: "bg-purple-500/20 text-purple-400",
};

interface VehicleRow {
  id: string;
  user_id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  vehicle_type: string;
  cargo_type: string | null;
  owner_name?: string;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: "Truck",
  bitruck: "Bitruck",
  carreta: "Carreta",
  carreta_ls: "LS",
  rodotrem: "Rodotrem",
  bitrem: "Bitrem",
  treminhao: "Treminhão",
};

export default function AdminDrivers() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<PersonProfile[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("__all__");

  // Service assignment
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<PersonProfile | null>(null);
  const [selectedService, setSelectedService] = useState("");

  // Edit / Create / Delete
  const [editPerson, setEditPerson] = useState<PersonProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletePerson, setDeletePerson] = useState<PersonProfile | null>(null);

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate("/");
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [profilesRes, servicesRes, vehiclesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("driver_services" as any).select("*"),
        supabase.from("vehicles").select("*").order("brand"),
      ]);

      const profiles = profilesRes.data || [];
      const services = (servicesRes.data as any[]) || [];

      const driversWithServices: PersonProfile[] = profiles.map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        full_name: p.full_name,
        phone: p.phone,
        person_type: p.person_type,
        cnpj: p.cnpj,
        razao_social: p.razao_social,
        nome_fantasia: p.nome_fantasia,
        category: p.category || "motorista",
        email: p.email,
        address_street: p.address_street,
        address_number: p.address_number,
        address_complement: p.address_complement,
        address_neighborhood: p.address_neighborhood,
        address_city: p.address_city,
        address_state: p.address_state,
        address_zip: p.address_zip,
        notes: p.notes,
        bank_name: p.bank_name,
        bank_agency: p.bank_agency,
        bank_account: p.bank_account,
        bank_account_type: p.bank_account_type,
        pix_key_type: p.pix_key_type,
        pix_key: p.pix_key,
        services: services.filter((s: any) => s.user_id === p.user_id).map((s: any) => s.service_type),
      }));
      setDrivers(driversWithServices);

      const vehicleRows: VehicleRow[] = (vehiclesRes.data || []).map((v: any) => {
        const owner = profiles.find((p: any) => p.user_id === v.user_id);
        return { ...v, owner_name: owner?.full_name || "—" };
      });
      setVehicles(vehicleRows);
    } catch (error: any) {
      console.error("Error fetching data:", error);
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
        .insert({ user_id: selectedDriver.user_id, service_type: selectedService, assigned_by: user?.id } as any);
      if (error) {
        if (error.code === "23505") { toast({ title: "Serviço já vinculado", variant: "destructive" }); return; }
        throw error;
      }
      toast({ title: "Serviço vinculado!" });
      setAssignDialogOpen(false);
      setSelectedService("");
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveService = async (userId: string, serviceType: string) => {
    try {
      const { error } = await supabase.from("driver_services" as any).delete().eq("user_id", userId).eq("service_type", serviceType);
      if (error) throw error;
      toast({ title: "Serviço removido!" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletePerson) return;
    try {
      await supabase.from("driver_services" as any).delete().eq("user_id", deletePerson.user_id);
      const { error } = await supabase.from("profiles").delete().eq("id", deletePerson.id);
      if (error) throw error;
      toast({ title: "Cadastro excluído!" });
      setDeletePerson(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  const isVehicleTab = activeTab === "veiculos";

  const filteredDrivers = drivers.filter((d) => {
    const matchCategory = activeTab === "__all__" || d.category === activeTab;
    const matchSearch =
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.cnpj && d.cnpj.includes(search)) ||
      (d.razao_social && d.razao_social.toLowerCase().includes(search.toLowerCase())) ||
      (d.email && d.email.toLowerCase().includes(search.toLowerCase()));
    return matchCategory && matchSearch;
  });

  const filteredVehicles = vehicles.filter((v) =>
    v.plate.toLowerCase().includes(search.toLowerCase()) ||
    v.brand.toLowerCase().includes(search.toLowerCase()) ||
    v.model.toLowerCase().includes(search.toLowerCase()) ||
    (v.owner_name && v.owner_name.toLowerCase().includes(search.toLowerCase()))
  );

  const countByTab = (tab: string) => {
    if (tab === "__all__") return drivers.length;
    if (tab === "veiculos") return vehicles.length;
    return drivers.filter((d) => d.category === tab).length;
  };

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold font-display">Cadastros</h1>
            <p className="text-muted-foreground">Gerencie pessoas e veículos do sistema</p>
          </div>
          {!isVehicleTab && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo Cadastro
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearch(""); }} className="mb-6">
          <TabsList className="flex-wrap h-auto gap-1">
            {Object.entries(TAB_LABELS).map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="gap-1.5">
                {key === "veiculos" && <Car className="h-3.5 w-3.5" />}
                {label}
                <Badge variant="secondary" className="text-xs h-5 px-1.5">
                  {countByTab(key)}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isVehicleTab ? "Buscar por placa, marca, modelo ou proprietário..." : "Buscar por nome, CNPJ, razão social ou e-mail..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isVehicleTab ? (
          /* Vehicles Tab */
          filteredVehicles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum veículo encontrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredVehicles.map((v) => (
                <Card key={v.id} className="border-border">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold">{v.plate}</h3>
                          <Badge variant="outline" className="text-xs">{VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type}</Badge>
                          {v.cargo_type && <Badge variant="secondary" className="text-xs">{v.cargo_type}</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{v.brand} {v.model} • {v.year}</p>
                        <p className="text-xs text-muted-foreground">Proprietário: {v.owner_name}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/edit-vehicle/${v.id}`)}>
                        <Pencil className="h-4 w-4 mr-1" /> Editar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* People tabs */
          filteredDrivers.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">Nenhum cadastro encontrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {filteredDrivers.map((driver) => (
                <Card key={driver.id} className="border-border">
                  <CardContent className="py-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold truncate">{driver.full_name}</h3>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {driver.person_type === "cnpj" ? "CNPJ" : "CPF"}
                          </Badge>
                          <Badge className={`text-xs shrink-0 ${CATEGORY_COLORS[driver.category] || "bg-muted text-muted-foreground"}`}>
                            {driver.category.charAt(0).toUpperCase() + driver.category.slice(1)}
                          </Badge>
                        </div>
                        {driver.person_type === "cnpj" && driver.razao_social && (
                          <p className="text-sm text-muted-foreground">{driver.razao_social}</p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0 text-sm text-muted-foreground">
                          {driver.phone && <span>{driver.phone}</span>}
                          {driver.email && <span>{driver.email}</span>}
                          {driver.address_city && driver.address_state && (
                            <span>{driver.address_city}/{driver.address_state}</span>
                          )}
                        </div>

                        {driver.category === "motorista" && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {driver.services.map((svc) => (
                              <Badge
                                key={svc}
                                className={`cursor-pointer ${svc === "fretes" ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-green-500/20 text-green-400 hover:bg-green-500/30"}`}
                                onClick={() => handleRemoveService(driver.user_id, svc)}
                                title="Clique para remover"
                              >
                                {svc === "fretes" ? <Truck className="h-3 w-3 mr-1" /> : <Wheat className="h-3 w-3 mr-1" />}
                                {svc === "fretes" ? "Fretes" : "Colheita"}
                                <span className="ml-1 text-xs opacity-60">×</span>
                              </Badge>
                            ))}
                            {driver.services.length === 0 && (
                              <span className="text-xs text-muted-foreground italic">Sem serviço vinculado</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {driver.category === "motorista" && (
                          <Dialog
                            open={assignDialogOpen && selectedDriver?.id === driver.id}
                            onOpenChange={(open) => { setAssignDialogOpen(open); if (open) { setSelectedDriver(driver); setSelectedService(""); } }}
                          >
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> Serviço</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader><DialogTitle>Vincular Serviço - {driver.full_name}</DialogTitle></DialogHeader>
                              <div className="space-y-4 pt-4">
                                <Select value={selectedService} onValueChange={setSelectedService}>
                                  <SelectTrigger><SelectValue placeholder="Selecione o serviço" /></SelectTrigger>
                                  <SelectContent>
                                    {!driver.services.includes("fretes") && <SelectItem value="fretes">Fretes</SelectItem>}
                                    {!driver.services.includes("colheita") && <SelectItem value="colheita">Colheita</SelectItem>}
                                  </SelectContent>
                                </Select>
                                <Button className="w-full" onClick={handleAssignService} disabled={!selectedService}>Vincular</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setEditPerson(driver); setEditOpen(true); }} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletePerson(driver)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </main>

      <PersonEditDialog person={editPerson} open={editOpen} onOpenChange={setEditOpen} onSaved={fetchAll} />
      <PersonCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchAll} defaultCategory={!isVehicleTab && activeTab !== "__all__" ? activeTab : undefined} />

      <AlertDialog open={!!deletePerson} onOpenChange={(open) => !open && setDeletePerson(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cadastro de <strong>{deletePerson?.full_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
