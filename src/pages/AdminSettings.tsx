import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Settings, UserPlus, Shield, ShieldCheck, Trash2, Search, Pencil, Eye } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { maskName } from "@/lib/masks";

interface SystemUser {
  id: string;
  email: string;
  roles: string[];
  profile_name: string | null;
}

export default function AdminSettings() {
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", name: "", role: "user" });
  const [creating, setCreating] = useState(false);

  // Edit
  const [editUser, setEditUser] = useState<SystemUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "" });
  const [saving, setSaving] = useState(false);

  // View
  const [viewUser, setViewUser] = useState<SystemUser | null>(null);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState<SystemUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCurrentUserAdmin = isAdmin;
  const isCurrentUserModerator = roles.includes("moderator");
  const hasAccess = isCurrentUserAdmin || isCurrentUserModerator;

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

  useEffect(() => {
    if (hasAccess) fetchUsers();
  }, [hasAccess]);

  // --- Create User ---
  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
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
      setShowCreateDialog(false);
      setCreateForm({ email: "", password: "", name: "", role: "user" });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao criar usuário", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // --- Edit User ---
  const openEdit = (u: SystemUser) => {
    const mainRole = u.roles.includes("admin") ? "admin" : u.roles.includes("moderator") ? "moderator" : "user";
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

      const currentRole = editUser.roles.includes("admin") ? "admin" : editUser.roles.includes("moderator") ? "moderator" : "user";
      if (isCurrentUserAdmin && editForm.role !== currentRole && !editUser.roles.includes("admin")) {
        await supabase.from("user_roles").delete().eq("user_id", editUser.id).in("role", ["moderator", "user"]);
        if (editForm.role === "moderator") {
          await supabase.from("user_roles").insert({ user_id: editUser.id, role: "moderator" });
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
      default:
        return <Badge className="bg-muted text-muted-foreground text-xs">{role}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Configurações</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/freight/fiscal-settings">
              <Button variant="outline" className="gap-2">
                <ShieldCheck className="w-4 h-4" />
                Config. Fiscais
              </Button>
            </Link>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Novo Usuário
            </Button>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Usuários do Sistema</h2>
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
              const canEdit = isSelf || (isCurrentUserAdmin && !isTargetAdmin) || (isCurrentUserModerator && !isTargetAdmin && !isTargetModerator);
              const canDelete = !isSelf && ((isCurrentUserAdmin && !isTargetAdmin) || (isCurrentUserModerator && !isTargetAdmin && !isTargetModerator));

              return (
                <Card key={u.id} className="border border-border">
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{u.profile_name || "Sem nome"}</span>
                        {u.roles.map((r) => (
                          <span key={r}>{getRoleBadge(r)}</span>
                        ))}
                        {isSelf && <Badge variant="outline" className="text-xs">Você</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground truncate">{u.email || "—"}</span>
                    </div>

                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewUser(u)} title="Visualizar">
                        <Eye className="w-4 h-4" />
                      </Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)} title="Editar">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(u)} title="Excluir" className="text-destructive hover:text-destructive">
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
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie uma conta de acesso ao sistema.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
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
                  {isCurrentUserAdmin && <SelectItem value="moderator">Moderador</SelectItem>}
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
            {isCurrentUserAdmin && editUser && !editUser.roles.includes("admin") && (
              <div className="space-y-2">
                <Label>Perfil de acesso</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuário</SelectItem>
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
