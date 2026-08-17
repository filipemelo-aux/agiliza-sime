import { useState, useEffect } from "react";
import { maskPhone, maskCNPJ } from "@/lib/masks";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Search, Pencil, Trash2, Car, Eye, FileText, KeyRound } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { PersonEditDialog, PersonCreateDialog, type PersonProfile } from "@/components/PersonEditDialog";
import { GlobalToolbar, ToolbarAction } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";

const TAB_LABELS: Record<string, string> = {
  __all__: "Todos",
  motorista: "Motoristas",
  colaborador: "Colaboradores",
  cliente: "Clientes",
  proprietario: "Proprietários",
  fornecedor: "Fornecedores",
};

const CATEGORY_COLORS: Record<string, string> = {
  motorista: "bg-blue-500/20 text-blue-400",
  colaborador: "bg-teal-500/20 text-teal-400",
  cliente: "bg-amber-500/20 text-amber-400",
  proprietario: "bg-emerald-500/20 text-emerald-400",
  fornecedor: "bg-purple-500/20 text-purple-400",
};

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: "Truck", bitruck: "Bitruck", carreta: "Carreta", carreta_ls: "LS",
  rodotrem: "Rodotrem", bitrem: "Bitrem", treminhao: "Treminhão",
  utilitario: "Utilitário", passeio: "Passeio",
};

const TRAILER_LABELS: Record<string, string[]> = {
  carreta: ["Carreta"], carreta_ls: ["Carreta"],
  bitrem: ["1ª Carreta", "2ª Carreta"],
  rodotrem: ["1ª Carreta", "Dolly", "2ª Carreta"],
  treminhao: ["1º Reboque", "2º Reboque"],
};

interface VehicleRow {
  id: string; plate: string; brand: string; model: string; year: number;
  vehicle_type: string; driver_id: string | null; owner_id: string | null;
  driver_name?: string; owner_name?: string;
  trailer_plate_1: string | null; trailer_plate_2: string | null; trailer_plate_3: string | null;
}

export default function AdminPeople() {
  const { isAdmin, isModerator, isOperador, hasAdminAccess, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<PersonProfile[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("__all__");
  // Filtro de PAPEL (independente do tipo): all | rh | non_rh
  const [roleFilter, setRoleFilter] = useState<"all" | "rh" | "non_rh">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [editPerson, setEditPerson] = useState<PersonProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deletePerson, setDeletePerson] = useState<PersonProfile | null>(null);
  const [resetPerson, setResetPerson] = useState<PersonProfile | null>(null);
  const [resetting, setResetting] = useState(false);

  const [viewPerson, setViewPerson] = useState<PersonProfile | null>(null);
  const [viewPersonDocs, setViewPersonDocs] = useState<{ cpf: string | null; cnh_number: string | null; cnh_category: string | null; cnh_expiry: string | null } | null>(null);
  const [viewPersonHarvests, setViewPersonHarvests] = useState<{ farm_name: string; client_name: string | null }[]>([]);

  useEffect(() => {
    if (!roleLoading && !hasAdminAccess) {
      const timer = setTimeout(() => navigate("/"), 100);
      return () => clearTimeout(timer);
    }
  }, [roleLoading]);

  useEffect(() => {
    if (hasAdminAccess) fetchAll();
  }, [isAdmin, isModerator]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [profilesRes, servicesRes, vehiclesRes] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("driver_services" as any).select("*"),
        supabase.from("vehicles").select("*").order("brand"),
      ]);

      // Exibir TODOS os usuários (incluindo admin/moderador) — todos são colaboradores
      const profiles = profilesRes.data || [];
      const services = (servicesRes.data as any[]) || [];

      const driversWithServices: PersonProfile[] = profiles.map((p: any) => ({
        id: p.id, user_id: p.user_id, full_name: p.full_name, phone: p.phone,
        person_type: p.person_type, cnpj: p.cnpj, razao_social: p.razao_social,
        nome_fantasia: p.nome_fantasia, category: p.category || "motorista",
        categories_extra: Array.isArray(p.categories_extra) ? p.categories_extra : [],
        email: p.email, address_street: p.address_street, address_number: p.address_number,
        address_complement: p.address_complement, address_neighborhood: p.address_neighborhood,
        address_city: p.address_city, address_state: p.address_state, address_zip: p.address_zip,
        notes: p.notes, bank_name: p.bank_name, bank_agency: p.bank_agency,
        bank_account: p.bank_account, bank_account_type: p.bank_account_type,
        pix_key_type: p.pix_key_type, pix_key: p.pix_key,
        cargo: p.cargo, departamento: p.departamento, data_admissao: p.data_admissao,
        salario: p.salario, is_employee: p.is_employee, is_colaborador_rh: p.is_colaborador_rh,
        services: services.filter((s: any) => s.user_id === p.user_id).map((s: any) => s.service_type),
      }));
      setDrivers(driversWithServices);

      const vehicleRows: VehicleRow[] = (vehiclesRes.data || []).map((v: any) => {
        const driver = profiles.find((p: any) => p.user_id === v.driver_id);
        const owner = profiles.find((p: any) => p.user_id === v.owner_id);
        return { ...v, driver_name: driver?.full_name, owner_name: owner?.full_name };
      });
      setVehicles(vehicleRows);
      setSelected(new Set());
    } catch (error: any) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
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

  const handleResetPassword = async () => {
    if (!resetPerson) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-user-password", {
        body: { target_user_id: resetPerson.user_id, full_name: resetPerson.full_name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Senha resetada com sucesso!",
        description: `Nova senha: ${data.new_password}`,
        duration: 15000,
      });
      setResetPerson(null);
    } catch (error: any) {
      toast({ title: "Erro ao resetar senha", description: error.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const filterByTab = (d: PersonProfile, tab: string) => {
    if (tab === "__all__") return true;
    // Regra GLOBAL: colaborador é definido EXCLUSIVAMENTE pelo flag is_colaborador_rh.
    if (tab === "colaborador") return !!(d as any).is_colaborador_rh;
    const extras: string[] = Array.isArray((d as any).categories_extra) ? (d as any).categories_extra : [];
    return d.category === tab || extras.includes(tab);
  };

  const filteredDrivers = drivers.filter((d) => {
    const matchCategory = filterByTab(d, activeTab);
    // Filtro de papel RH (cruza com tipo): permite combinações Motorista+Colaborador.
    const isRH = !!(d as any).is_colaborador_rh;
    const matchRole = roleFilter === "all" || (roleFilter === "rh" ? isRH : !isRH);
    const matchSearch =
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (d.cnpj && d.cnpj.includes(search)) ||
      (d.razao_social && d.razao_social.toLowerCase().includes(search.toLowerCase())) ||
      (d.email && d.email.toLowerCase().includes(search.toLowerCase()));
    return matchCategory && matchRole && matchSearch;
  });

  const selectedRows = filteredDrivers.filter((d) => selected.has(d.id));

  const openView = async (driver: PersonProfile) => {
    setViewPerson(driver);
    setViewPersonDocs(null);
    setViewPersonHarvests([]);
    if (driver.category === "motorista" || driver.category === "colaborador") {
      const [docsRes, assignmentsRes] = await Promise.all([
        supabase.from("driver_documents").select("cpf, cnh_number, cnh_category, cnh_expiry").eq("user_id", driver.user_id).maybeSingle(),
        supabase.from("harvest_assignments").select("harvest_job_id").eq("user_id", driver.user_id).eq("status", "active"),
      ]);
      setViewPersonDocs(docsRes.data || null);
      const assignments = assignmentsRes.data || [];
      if (assignments.length > 0) {
        const jobIds = assignments.map((a: any) => a.harvest_job_id);
        const { data: jobs } = await supabase.from("harvest_jobs").select("farm_name, client_id").in("id", jobIds);
        const clientIds = (jobs || []).map((j: any) => j.client_id).filter(Boolean);
        const clientMap: Record<string, string> = {};
        if (clientIds.length > 0) {
          const { data: clients } = await supabase.from("profiles").select("id, full_name").in("id", clientIds);
          (clients || []).forEach((c: any) => { clientMap[c.id] = c.full_name; });
        }
        setViewPersonHarvests((jobs || []).map((j: any) => ({
          farm_name: j.farm_name,
          client_name: j.client_id ? clientMap[j.client_id] || null : null,
        })));
      }
    }
  };

  const personColumns: DataGridColumn<PersonProfile>[] = [
    {
      key: "nome",
      header: "Nome",
      sortValue: (d) => d.full_name || "",
      cell: (d) => {
        const driverVehicles = d.category === "motorista" ? vehicles.filter((v) => v.driver_id === d.user_id) : [];
        return (
          <div>
            <div className="font-medium text-foreground">{d.full_name}</div>
            {d.person_type === "cnpj" && d.razao_social && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{d.razao_social}</div>
            )}
            {driverVehicles.length > 0 && (
              <div className="flex flex-wrap gap-x-2 mt-0.5 text-[11px] text-muted-foreground">
                {driverVehicles.map((v) => (
                  <span key={v.id}>
                    <Car className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                    {v.plate}{v.owner_name ? ` · ${v.owner_name}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "categoria",
      header: "Categoria",
      width: "180px",
      sortValue: (d) => d.category || "",
      cell: (d) => (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge className={`text-[10px] ${CATEGORY_COLORS[d.category] || "bg-muted text-muted-foreground"}`}>
            {d.category.charAt(0).toUpperCase() + d.category.slice(1)}
          </Badge>
          {Array.isArray((d as any).categories_extra) && (d as any).categories_extra.map((cat: string) => (
            <Badge key={cat} variant="outline" className={`text-[10px] ${CATEGORY_COLORS[cat] || "border-border text-muted-foreground"}`}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Badge>
          ))}
          {(d as any).is_colaborador_rh && d.category !== "colaborador" && (
            <Badge variant="outline" className="text-[10px] border-teal-500/40 text-teal-400">RH</Badge>
          )}
        </div>
      ),
    },
    {
      key: "contato",
      header: "Contato",
      sortValue: (d) => d.email || d.phone || "",
      cell: (d) => (
        <div className="text-muted-foreground">
          {d.email && <div className="truncate max-w-[220px]">{d.email}</div>}
          {d.phone && <div>{maskPhone(d.phone)}</div>}
          {!d.email && !d.phone && <span>—</span>}
        </div>
      ),
    },
    {
      key: "cidade",
      header: "Cidade/UF",
      width: "140px",
      sortValue: (d) => `${d.address_state || ""} ${d.address_city || ""}`,
      cell: (d) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {d.address_city && d.address_state ? `${d.address_city}/${d.address_state}` : "—"}
        </span>
      ),
    },
  ];

  const toolbarActions: ToolbarAction[] = [
    { key: "new", label: "Novo Cadastro", icon: Plus, mode: "create", variant: "default", onClick: () => setCreateOpen(true) },
    { key: "view", label: "Visualizar", icon: Eye, mode: "single", onClick: () => selectedRows[0] && openView(selectedRows[0]) },
    { key: "edit", label: "Editar", icon: Pencil, mode: "single", onClick: () => { if (selectedRows[0]) { setEditPerson(selectedRows[0]); setEditOpen(true); } } },
    {
      key: "reset",
      label: "Resetar Senha",
      icon: KeyRound,
      mode: "single",
      onClick: () => selectedRows[0] && setResetPerson(selectedRows[0]),
      hidden: !isAdmin,
      disabled: !selectedRows[0]?.user_id || selectedRows[0]?.category !== "colaborador",
    },
    { key: "delete", label: "Excluir", icon: Trash2, mode: "single", variant: "destructive", onClick: () => selectedRows[0] && setDeletePerson(selectedRows[0]) },
  ];

  const countByTab = (tab: string) => {
    return drivers.filter((d) => filterByTab(d, tab)).length;
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }
  if (!hasAdminAccess) return null;

  return (
    <AdminLayout>
      <main className="p-4 md:p-6 space-y-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Pessoas</h1>
          <p className="text-xs text-muted-foreground">Cadastro unificado de motoristas, clientes, fornecedores e proprietários</p>
        </div>

        <GlobalToolbar actions={toolbarActions} selectedCount={selected.size}>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60 shrink-0 flex-nowrap first:ml-auto">
            {Object.entries(TAB_LABELS).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={activeTab === key ? "default" : "ghost"}
                className="h-7 px-2 text-[11px] rounded-sm gap-1 whitespace-nowrap"
                onClick={() => { setActiveTab(key); setSearch(""); setSelected(new Set()); }}
              >
                {label}
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">{countByTab(key)}</Badge>
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60 shrink-0 flex-nowrap">
            {([
              { v: "all", label: "Todos os papéis" },
              { v: "rh", label: "Apenas RH" },
              { v: "non_rh", label: "Sem RH" },
            ] as const).map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={roleFilter === opt.v ? "default" : "ghost"}
                className="h-7 px-2 text-[11px] rounded-sm whitespace-nowrap"
                onClick={() => setRoleFilter(opt.v)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <div className="relative w-full md:w-64 basis-full md:basis-auto shrink-0 order-last">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CNPJ, razão social ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </GlobalToolbar>

        <DataGrid
          rows={filteredDrivers}
          columns={personColumns}
          rowId={(d) => d.id}
          selected={selected}
          onSelectedChange={setSelected}
          loading={loading}
          minWidth={900}
          emptyMessage="Nenhum cadastro encontrado."
          footer={<div className="text-[11px] text-muted-foreground">{filteredDrivers.length} cadastro(s)</div>}
        />
      </main>

      <PersonEditDialog person={editPerson} open={editOpen} onOpenChange={setEditOpen} onSaved={fetchAll} />
      <PersonCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={fetchAll} defaultCategory={activeTab !== "__all__" ? activeTab : undefined} />

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

      <AlertDialog open={!!resetPerson} onOpenChange={(open) => !open && setResetPerson(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resetar senha?</AlertDialogTitle>
            <AlertDialogDescription>
              A senha de <strong>{resetPerson?.full_name}</strong> será redefinida para uma senha temporária (primeira letra do nome + 5 números aleatórios). A nova senha será exibida após a confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword} disabled={resetting}>
              {resetting ? "Resetando..." : "Resetar Senha"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewPerson} onOpenChange={(open) => { if (!open) { setViewPerson(null); setViewPersonDocs(null); setViewPersonHarvests([]); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Cadastro</DialogTitle>
          </DialogHeader>
          {viewPerson && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base">{viewPerson.full_name}</span>
                <Badge className={`text-xs ${CATEGORY_COLORS[viewPerson.category] || "bg-muted text-muted-foreground"}`}>
                  {viewPerson.category.charAt(0).toUpperCase() + viewPerson.category.slice(1)}
                </Badge>
              </div>
              {viewPerson.person_type === "cnpj" && viewPerson.razao_social && (
                <p className="text-muted-foreground">{viewPerson.razao_social}</p>
              )}
              {viewPerson.cnpj && <p><span className="text-muted-foreground">CNPJ:</span> {maskCNPJ(viewPerson.cnpj)}</p>}
              {viewPersonDocs?.cpf && <p><span className="text-muted-foreground">CPF:</span> {viewPersonDocs.cpf}</p>}
              {viewPerson.phone && <p><span className="text-muted-foreground">Telefone:</span> {maskPhone(viewPerson.phone)}</p>}
              {viewPerson.email && <p><span className="text-muted-foreground">E-mail:</span> {viewPerson.email}</p>}
              {viewPerson.address_city && viewPerson.address_state && (
                <p><span className="text-muted-foreground">Cidade:</span> {viewPerson.address_city}/{viewPerson.address_state}</p>
              )}
              {viewPerson.address_street && (
                <p><span className="text-muted-foreground">Endereço:</span> {viewPerson.address_street}{viewPerson.address_number ? `, ${viewPerson.address_number}` : ""}{viewPerson.address_complement ? ` - ${viewPerson.address_complement}` : ""}</p>
              )}
              {/* Employee details */}
              {viewPerson.category === "colaborador" && (
                <div className="pt-1 border-t border-border">
                  <p className="text-muted-foreground font-medium mb-1">👤 Dados Funcionais</p>
                  {(viewPerson as any).cargo && <p className="ml-4"><span className="text-muted-foreground">Cargo:</span> {(viewPerson as any).cargo}</p>}
                  {(viewPerson as any).departamento && <p className="ml-4"><span className="text-muted-foreground">Departamento:</span> {(viewPerson as any).departamento}</p>}
                  {(viewPerson as any).data_admissao && <p className="ml-4"><span className="text-muted-foreground">Admissão:</span> {new Date((viewPerson as any).data_admissao).toLocaleDateString("pt-BR")}</p>}
                  {(viewPerson as any).salario && <p className="ml-4"><span className="text-muted-foreground">Salário:</span> R$ {Number((viewPerson as any).salario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                </div>
              )}
              {(viewPerson as any).is_employee && viewPerson.category === "motorista" && (
                <div className="pt-1">
                  <Badge variant="outline" className="text-xs border-teal-500/50 text-teal-500">Funcionário (Frota Própria)</Badge>
                </div>
              )}
              {viewPersonDocs && (viewPersonDocs.cnh_number || viewPersonDocs.cnh_category) && (
                <div className="pt-1 border-t border-border">
                  <p className="text-muted-foreground flex items-center gap-1 mb-1"><FileText className="h-3.5 w-3.5" /> Habilitação (CNH)</p>
                  {viewPersonDocs.cnh_number && <p className="ml-4"><span className="text-muted-foreground">Número:</span> {viewPersonDocs.cnh_number}</p>}
                  {viewPersonDocs.cnh_category && <p className="ml-4"><span className="text-muted-foreground">Categoria:</span> {viewPersonDocs.cnh_category}</p>}
                  {viewPersonDocs.cnh_expiry && <p className="ml-4"><span className="text-muted-foreground">Validade:</span> {new Date(viewPersonDocs.cnh_expiry).toLocaleDateString("pt-BR")}</p>}
                </div>
              )}
              {viewPerson.category === "motorista" && (() => {
                const driverVehicles = vehicles.filter(v => v.driver_id === viewPerson.user_id);
                if (driverVehicles.length === 0) return null;
                return (
                  <div className="pt-1 border-t border-border">
                    <p className="text-muted-foreground flex items-center gap-1 mb-1"><Car className="h-3.5 w-3.5" /> Veículos</p>
                    {driverVehicles.map(v => {
                      const trailerLabels = TRAILER_LABELS[v.vehicle_type] || [];
                      const trailerPlates = [v.trailer_plate_1, v.trailer_plate_2, v.trailer_plate_3].filter(Boolean);
                      return (
                        <div key={v.id} className="ml-4 mb-2">
                          <p><span className="text-muted-foreground">Cavalo:</span> <strong>{v.plate}</strong> — {v.brand} {v.model} ({VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type})</p>
                          {trailerPlates.map((plate, i) => (
                            <p key={i} className="ml-2"><span className="text-muted-foreground">{trailerLabels[i] || `Impl. ${i+1}`}:</span> {plate}</p>
                          ))}
                          {v.owner_name && <p><span className="text-muted-foreground">Patrão:</span> {v.owner_name}</p>}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              {viewPerson.bank_name && (
                <p><span className="text-muted-foreground">Banco:</span> {viewPerson.bank_name} | Ag: {viewPerson.bank_agency} | Conta: {viewPerson.bank_account}</p>
              )}
              {viewPerson.pix_key && (
                <p><span className="text-muted-foreground">PIX:</span> {viewPerson.pix_key}</p>
              )}
              {viewPerson.notes && (
                <p><span className="text-muted-foreground">Obs:</span> {viewPerson.notes}</p>
              )}
              {viewPersonHarvests.length > 0 && (
                <div className="pt-1 border-t border-border">
                  <p className="text-muted-foreground mb-1">🌾 Colheita</p>
                  {viewPersonHarvests.map((h, i) => (
                    <p key={i} className="ml-4">
                      <span className="text-muted-foreground">Colheita:</span>{" "}
                      {h.client_name ? <strong>{h.client_name}</strong> : h.farm_name}
                      {h.client_name && <span className="text-muted-foreground"> ({h.farm_name})</span>}
                    </p>
                  ))}
                </div>
              )}
              {viewPerson.services.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <span className="text-muted-foreground">Serviços:</span>
                  {viewPerson.services.map((s) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s === "fretes" ? "Fretes" : "Colheita"}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
