import { useState, useEffect } from "react";
import { Settings, UserPlus, Shield, ShieldCheck, Trash2, Search } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

interface SystemUser {
  id: string;
  email: string;
  created_at: string;
  roles: string[];
  profile_name: string | null;
}

export default function AdminSettings() {
  const { user, isAdmin, roles } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", password: "", name: "" });
  const [creating, setCreating] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<SystemUser | null>(null);
  const [confirmPromote, setConfirmPromote] = useState<SystemUser | null>(null);

  const isCurrentUserAdmin = isAdmin;
  const isCurrentUserModerator = roles.includes("moderator");
  const hasAccess = isCurrentUserAdmin || isCurrentUserModerator;

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Get all user_roles
      const { data: allRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Get profiles for names
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");

      if (profilesError) throw profilesError;

      // Group roles by user_id
      const roleMap: Record<string, string[]> = {};
      const userIds = new Set<string>();
      (allRoles || []).forEach((r) => {
        userIds.add(r.user_id);
        if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
        roleMap[r.user_id].push(r.role);
      });

      // Build user list from roles (only users that have roles)
      const profileMap: Record<string, { name: string; email: string | null }> = {};
      (profiles || []).forEach((p) => {
        profileMap[p.user_id] = { name: p.full_name, email: p.email };
      });

      const systemUsers: SystemUser[] = Array.from(userIds).map((uid) => ({
        id: uid,
        email: profileMap[uid]?.email || "",
        created_at: "",
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

  const handleCreateModerator = async () => {
    if (!createForm.email || !createForm.password || !createForm.name) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      // Create auth user via edge function
      const { data, error } = await supabase.functions.invoke("create-moderator", {
        body: {
          email: createForm.email,
          password: createForm.password,
          name: createForm.name,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "Moderador criado com sucesso!" });
      setShowCreateDialog(false);
      setCreateForm({ email: "", password: "", name: "" });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro ao criar moderador", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleModeratorRole = async (targetUser: SystemUser, action: "add" | "remove") => {
    // Moderators can't change admin roles
    if (!isCurrentUserAdmin && targetUser.roles.includes("admin")) {
      toast({ title: "Sem permissão", description: "Moderadores não podem alterar perfis de administradores.", variant: "destructive" });
      return;
    }

    try {
      if (action === "add") {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: targetUser.id, role: "moderator" });
        if (error) throw error;
        toast({ title: "Papel de moderador adicionado!" });
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", targetUser.id)
          .eq("role", "moderator");
        if (error) throw error;
        toast({ title: "Papel de moderador removido!" });
      }
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setConfirmRemove(null);
    setConfirmPromote(null);
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
          {isCurrentUserAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Novo Moderador
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar usuários..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Users list */}
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
              // Moderators can't touch admins
              const canManage = isCurrentUserAdmin || (!isTargetAdmin && !isSelf);

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

                    {canManage && !isSelf && (
                      <div className="flex gap-2">
                        {!isTargetModerator && !isTargetAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmPromote(u)}
                            className="gap-1 text-purple-400 border-purple-400/30 hover:bg-purple-500/10"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            Tornar Moderador
                          </Button>
                        )}
                        {isTargetModerator && isCurrentUserAdmin && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmRemove(u)}
                            className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remover Moderador
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Create Moderator Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Moderador</DialogTitle>
            <DialogDescription>Crie uma conta de moderador com acesso ao CRM.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Nome do moderador"
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="moderador@email.com"
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
            <Button onClick={handleCreateModerator} disabled={creating} className="w-full">
              {creating ? "Criando..." : "Criar Moderador"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Promote */}
      <AlertDialog open={!!confirmPromote} onOpenChange={() => setConfirmPromote(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tornar Moderador?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPromote?.profile_name || confirmPromote?.email} terá acesso ao CRM com permissões de moderador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmPromote && handleToggleModeratorRole(confirmPromote, "add")}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Remove */}
      <AlertDialog open={!!confirmRemove} onOpenChange={() => setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover papel de Moderador?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.profile_name || confirmRemove?.email} perderá acesso ao CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && handleToggleModeratorRole(confirmRemove, "remove")}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
