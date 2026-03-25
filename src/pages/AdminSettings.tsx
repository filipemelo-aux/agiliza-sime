import { useState, useEffect } from "react";
import {
  Settings, UserPlus, Shield, ShieldCheck, Trash2, Search, Pencil, Eye,
  RefreshCw, Building2, User, Users, ChevronRight, Mail as MailIcon, PenLine,
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { maskName } from "@/lib/masks";
import { EstablishmentsList } from "@/components/fiscal/EstablishmentsList";
import { CertificatesList } from "@/components/fiscal/CertificatesList";
import { SmtpSettingsForm } from "@/components/settings/SmtpSettingsForm";
import { SignaturePad } from "@/components/SignaturePad";

interface SystemUser {
  id: string;
  email: string;
  roles: string[];
  profile_name: string | null;
}

interface ProfileData {
  full_name: string;
  email: string;
  phone: string;
}

export default function AdminSettings() {
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const { currentVersion, applyUpdate } = useVersionCheck();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("geral");

  // Create
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", name: "", role: "moderator", profileId: "" });
  const [creating, setCreating] = useState(false);
  const [colaboradores, setColaboradores] = useState<{ id: string; full_name: string; email: string | null; user_id: string }[]>([]);

  // Edit
  const [editUser, setEditUser] = useState<SystemUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "" });
  const [saving, setSaving] = useState(false);

  // View
  const [viewUser, setViewUser] = useState<SystemUser | null>(null);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<SystemUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Profile
  const [profile, setProfile] = useState<ProfileData>({ full_name: "", email: "", phone: "" });
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const isCurrentUserAdmin = isAdmin;
  const isCurrentUserModerator = roles.includes("moderator");
  const isCurrentUserOperador = roles.includes("operador");
  const hasAccess = isCurrentUserAdmin || isCurrentUserModerator || isCurrentUserOperador;

  const fetchColaboradores = async () => {
    try {
      // Get all user_ids that already have auth accounts (user_roles)
      const { data: roles } = await supabase.from("user_roles").select("user_id");
      const linkedIds = new Set((roles || []).map((r: any) => r.user_id));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, user_id")
        .eq("category", "colaborador")
        .order("full_name");

      // Only show colaboradores without an auth account
      setColaboradores((profiles || []).filter((p: any) => !linkedIds.has(p.user_id)));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: allRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      if (profilesError) throw profilesError;

      const roleMap: Record<string, string[]> = {};
      const userIds = new Set<string>();
      (allRoles || []).forEach((r) => {
        userIds.add(r.user_id);
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });

      const profileMap: Record<string, { name: string; email: string | null }> = {};
      (profiles || []).forEach((p) => {
        profileMap[p.user_id] = { name: p.full_name, email: p.email };
      });

      const systemUsers: SystemUser[] = Array.from(userIds).map((uid) => ({
        id: uid,
        email: profileMap[uid]?.email || "",
        roles: roleMap[uid] || [],
        profile_name: profileMap[uid]?.name || null,
      }));

      setUsers(systemUsers);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro", description: "Falha ao carregar usuários.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, email, phone, signature_data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setProfile({
          full_name: data.full_name || "",
          email: data.email || "",
          phone: data.phone || "",
        });
        setSignatureData((data as any).signature_data || null);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (hasAccess && (isCurrentUserAdmin || isCurrentUserModerator)) {
      fetchUsers();
      fetchColaboradores();
    }
  }, [hasAccess, isCurrentUserAdmin, isCurrentUserModerator]);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  // --- Create User ---
  const handleCreateUser = async () => {
    if (!createForm.profileId && (!createForm.email || !createForm.password || !createForm.name)) {
      toast({ title: "Preencha todos os campos ou selecione um colaborador", variant: "destructive" });
      return;
    }
    if (createForm.profileId && !createForm.password) {
      toast({ title: "Defina uma senha para o usuário", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      if (createForm.profileId) {
        const selected = colaboradores.find(c => c.id === createForm.profileId);
        if (!selected) throw new Error("Colaborador não encontrado");
        const email = selected.email || createForm.email;
        if (!email) {
          toast({ title: "O colaborador precisa ter um e-mail cadastrado", variant: "destructive" });
          setCreating(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke("create-employee-account", {
          body: {
            email,
            full_name: selected.full_name,
            profile_id: selected.id,
            password: createForm.password,
            role: createForm.role,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast({
          title: "Usuário criado com sucesso!",
          description: `Senha: ${createForm.password}`,
          duration: 15000,
        });
      } else {
        const { data, error } = await supabase.functions.invoke("create-moderator", {
          body: {
            email: createForm.email,
            password: createForm.password,
            name: createForm.name,
            role: createForm.role,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast({ title: "Usuário criado com sucesso!" });
      }

      setShowCreateDialog(false);
      setCreateForm({ email: "", password: "", name: "", role: "user", profileId: "" });
      fetchUsers();
      fetchColaboradores();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // --- Edit User ---
  const openEdit = (u: SystemUser) => {
    const mainRole = u.roles.includes("admin") ? "admin" : u.roles.includes("moderator") ? "moderator" : u.roles.includes("operador") ? "operador" : "user";
    setEditForm({ name: u.profile_name || "", email: u.email || "", role: mainRole });
    setEditUser(u);
  };

  const handleSaveEdit = async () => {
    if (!editUser || !editForm.name) return;
    setSaving(true);
    try {
      const { error: profError } = await supabase
        .from("profiles")
        .update({ full_name: editForm.name, email: editForm.email })
        .eq("user_id", editUser.id);
      if (profError) throw profError;

      const currentRole = editUser.roles.includes("admin") ? "admin" : editUser.roles.includes("moderator") ? "moderator" : editUser.roles.includes("operador") ? "operador" : "user";
      if ((isCurrentUserAdmin || isCurrentUserModerator) && editForm.role !== currentRole && !editUser.roles.includes("admin")) {
        await supabase.from("user_roles").delete().eq("user_id", editUser.id).in("role", ["moderator", "operador", "user"]);
        if (editForm.role === "moderator" || editForm.role === "operador") {
          await supabase.from("user_roles").insert({ user_id: editUser.id, role: editForm.role });
        }
      }

      toast({ title: "Usuário atualizado!" });
      setEditUser(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Delete User ---
  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-system-user", {
        body: { userId: confirmDelete.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Usuário excluído!" });
      setConfirmDelete(null);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // --- Save Profile ---
  const handleSaveProfile = async () => {
    if (!user || !profile.full_name) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          email: profile.email,
          phone: profile.phone,
        })
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Perfil atualizado com sucesso!" });
      fetchUsers(); // refresh user list too
    } catch (err: any) {
      toast({ title: "Erro ao salvar perfil", description: err.message, variant: "destructive" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleForceUpdate = () => {
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    applyUpdate();
  };

  const handleSaveSignature = async (dataUrl: string) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ signature_data: dataUrl } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      setSignatureData(dataUrl);
      toast({ title: "Assinatura salva", description: "Sua assinatura será usada nas ordens de abastecimento." });
    } catch (err: any) {
      toast({ title: "Erro ao salvar assinatura", description: err.message, variant: "destructive" });
    }
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.profile_name || "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.roles.some((r) => r.includes(q))
    );
  });

  if (!hasAccess) {
    return (
      <AdminLayout>
        <div className="p-6 text-center text-muted-foreground">Acesso negado.</div>
      </AdminLayout>
    );
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500/20 text-red-400 text-xs"><ShieldCheck className="w-3 h-3 mr-1" />Admin</Badge>;
      case "moderator":
        return <Badge className="bg-purple-500/20 text-purple-400 text-xs"><Shield className="w-3 h-3 mr-1" />Moderador</Badge>;
      case "operador":
        return <Badge className="bg-blue-500/20 text-blue-400 text-xs"><Shield className="w-3 h-3 mr-1" />Operador</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground text-xs">{role}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Configurações</h1>
              <p className="text-sm text-muted-foreground">Gerencie o sistema, usuários e preferências</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1.5 h-7 px-3">
              v{currentVersion}
            </Badge>
            <Button variant="outline" size="sm" className="gap-2 h-8" onClick={handleForceUpdate}>
              <RefreshCw className="w-3.5 h-3.5" />
              Atualizar Sistema
            </Button>
          </div>
        </div>

        <Separator />

        {/* Tabs */}
        <Tabs value={isCurrentUserOperador && !isCurrentUserAdmin && !isCurrentUserModerator ? "perfil" : activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full max-w-xl ${isCurrentUserOperador && !isCurrentUserAdmin && !isCurrentUserModerator ? "grid-cols-1 max-w-xs" : "grid-cols-4"}`}>
            {(isCurrentUserAdmin || isCurrentUserModerator) && (
              <TabsTrigger value="geral" className="gap-2 text-xs sm:text-sm">
                <Users className="w-4 h-4" />
                Geral
              </TabsTrigger>
            )}
            {(isCurrentUserAdmin || isCurrentUserModerator) && (
              <TabsTrigger value="fiscal" className="gap-2 text-xs sm:text-sm">
                <Building2 className="w-4 h-4" />
                Fiscal
              </TabsTrigger>
            )}
            {(isCurrentUserAdmin || isCurrentUserModerator) && (
              <TabsTrigger value="email" className="gap-2 text-xs sm:text-sm">
                <MailIcon className="w-4 h-4" />
                E-mail
              </TabsTrigger>
            )}
            <TabsTrigger value="perfil" className="gap-2 text-xs sm:text-sm">
              <User className="w-4 h-4" />
              Meu Perfil
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB GERAL ===== */}
          <TabsContent value="geral" className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold">Usuários do Sistema</h2>
                <p className="text-sm text-muted-foreground">Gerencie contas e permissões de acesso</p>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2" size="sm">
                <UserPlus className="w-4 h-4" />
                Novo Usuário
              </Button>
            </div>

            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou perfil..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum usuário encontrado.</p>
              ) : (
                filtered.map((u) => {
                  const isTargetAdmin = u.roles.includes("admin");
                  const isTargetModerator = u.roles.includes("moderator");
                  const isSelf = u.id === user?.id;
                  const canEdit = isSelf || (isCurrentUserAdmin && !isTargetAdmin) || (isCurrentUserModerator && !isTargetAdmin);
                  const canDelete = !isSelf && ((isCurrentUserAdmin && !isTargetAdmin) || (isCurrentUserModerator && !isTargetAdmin));

                  return (
                    <Card key={u.id} className="border border-border hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold truncate text-sm">{u.profile_name || "Sem nome"}</span>
                              {u.roles.map((r) => (
                                <span key={r}>{getRoleBadge(r)}</span>
                              ))}
                              {isSelf && <Badge variant="outline" className="text-xs">Você</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{u.email || "—"}</span>
                          </div>
                        </div>

                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setViewUser(u)} title="Visualizar">
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)} title="Editar">
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(u)} title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Version / System Info */}
            <Card className="max-w-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Informações do Sistema</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Versão atual</span>
                  <Badge variant="outline" className="text-xs">v{currentVersion}</Badge>
                </div>
                <Separator />
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleForceUpdate}>
                  <RefreshCw className="w-4 h-4" />
                  Verificar e Atualizar
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB FISCAL ===== */}
          <TabsContent value="fiscal" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Configurações Fiscais</h2>
              <p className="text-sm text-muted-foreground">Gerencie estabelecimentos e certificados digitais</p>
            </div>

            <Tabs defaultValue="establishments" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 max-w-md">
                <TabsTrigger value="establishments" className="gap-2 text-xs sm:text-sm">
                  <Building2 className="w-4 h-4" />
                  Estabelecimentos
                </TabsTrigger>
                <TabsTrigger value="certificates" className="gap-2 text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4" />
                  Certificados
                </TabsTrigger>
              </TabsList>

              <TabsContent value="establishments">
                <EstablishmentsList />
              </TabsContent>

              <TabsContent value="certificates">
                <CertificatesList />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ===== TAB EMAIL ===== */}
          <TabsContent value="email" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Configurações de E-mail</h2>
              <p className="text-sm text-muted-foreground">Configure o servidor SMTP para envio de e-mails pelo sistema</p>
            </div>
            <SmtpSettingsForm />
          </TabsContent>

          {/* ===== TAB MEU PERFIL ===== */}
          <TabsContent value="perfil" className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Meu Perfil</h2>
              <p className="text-sm text-muted-foreground">Edite suas informações pessoais</p>
            </div>

            <Card className="max-w-lg">
              <CardContent className="p-6 space-y-5">
                {profileLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{profile.full_name || "Sem nome"}</p>
                        <div className="flex items-center gap-2">
                          {roles.map((r) => (
                            <span key={r}>{getRoleBadge(r)}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Nome completo</Label>
                        <Input
                          value={profile.full_name}
                          onChange={(e) => setProfile((p) => ({ ...p, full_name: maskName(e.target.value) }))}
                          placeholder="Seu nome completo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>E-mail</Label>
                        <Input
                          type="email"
                          value={profile.email}
                          onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                          placeholder="seu@email.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input
                          value={profile.phone}
                          onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveProfile} disabled={profileSaving} className="w-full">
                      {profileSaving ? "Salvando..." : "Salvar Perfil"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Assinatura Digital */}
            <Card className="max-w-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PenLine className="w-4 h-4 text-primary" />
                  Minha Assinatura
                </CardTitle>
                <CardDescription>
                  Desenhe sua assinatura abaixo. Ela será utilizada automaticamente nas ordens de abastecimento.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {signatureData && (
                  <div className="p-3 border border-border rounded-lg bg-card inline-block">
                    <img src={signatureData} alt="Assinatura atual" className="max-h-24" />
                  </div>
                )}
                <SignaturePad
                  initialData={signatureData}
                  onSave={handleSaveSignature}
                />
              </CardContent>
            </Card>

          </TabsContent>
        </Tabs>
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) setCreateForm({ email: "", password: "", name: "", role: "moderator", profileId: "" });
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie uma conta de acesso ao sistema. Você pode vincular a um colaborador já cadastrado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Select existing colaborador */}
            {colaboradores.length > 0 && (
              <div className="space-y-2">
                <Label>Vincular a Colaborador (opcional)</Label>
                <Select
                  value={createForm.profileId || "__none__"}
                  onValueChange={(v) => {
                    const profileId = v === "__none__" ? "" : v;
                    if (profileId) {
                      const selected = colaboradores.find(c => c.id === profileId);
                      setCreateForm((p) => ({
                        ...p,
                        profileId,
                        name: selected?.full_name || "",
                        email: selected?.email || "",
                      }));
                    } else {
                      setCreateForm((p) => ({ ...p, profileId: "", name: "", email: "" }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um colaborador..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum (criar manualmente)</SelectItem>
                    {colaboradores.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} {c.email ? `(${c.email})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!createForm.profileId && (
              <>
                <div className="space-y-2">
                  <Label>Nome completo</Label>
                  <Input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: maskName(e.target.value) }))}
                    placeholder="Nome do usuário"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="usuario@email.com"
                  />
                </div>
              </>
            )}

            {createForm.profileId && !colaboradores.find(c => c.id === createForm.profileId)?.email && (
              <div className="space-y-2">
                <Label>E-mail (obrigatório para login)</Label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@email.com"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div className="space-y-2">
              <Label>Perfil de acesso</Label>
              <Select value={createForm.role} onValueChange={(v) => setCreateForm((p) => ({ ...p, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="operador">Operador</SelectItem>
                  {(isCurrentUserAdmin || isCurrentUserModerator) && <SelectItem value="moderator">Moderador</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleCreateUser} disabled={creating} className="w-full">
              {creating ? "Criando..." : "Criar Usuário"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Atualize as informações do usuário.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: maskName(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            {(isCurrentUserAdmin || isCurrentUserModerator) && editUser && !editUser.roles.includes("admin") && (
              <div className="space-y-2">
                <Label>Perfil de acesso</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
                    <SelectItem value="operador">Operador</SelectItem>
                    <SelectItem value="moderator">Moderador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleSaveEdit} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete */}
      <AlertDialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.profile_name || confirmDelete?.email} será removido permanentemente do sistema. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View User Dialog */}
      <Dialog open={!!viewUser} onOpenChange={() => setViewUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do Usuário</DialogTitle>
            <DialogDescription>Informações da conta do sistema.</DialogDescription>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-3 mt-2">
              <div>
                <span className="text-sm text-muted-foreground">Nome</span>
                <p className="font-medium">{viewUser.profile_name || "Sem nome"}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">E-mail</span>
                <p className="font-medium">{viewUser.email || "—"}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Perfil de acesso</span>
                <div className="flex gap-2 mt-1">
                  {viewUser.roles.map((r) => (
                    <span key={r}>{getRoleBadge(r)}</span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
