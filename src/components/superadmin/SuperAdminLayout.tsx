import "@fontsource/exo/800-italic.css";
import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function SuperAdminLayout({ children }: { children: ReactNode }) {
  const { user, isSuperAdmin, supportTenantId, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate("/", { replace: true });
    else if (!isSuperAdmin) navigate("/admin", { replace: true });
  }, [loading, user, isSuperAdmin, navigate]);

  useEffect(() => {
    if (supportTenantId) (supabase.rpc as any)("set_support_tenant", { _tenant_id: null });
  }, [supportTenantId]);

  const logout = async () => {
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/";
  };

  if (loading || !isSuperAdmin) {
    return <div className="h-[100dvh] flex items-center justify-center text-sm text-muted-foreground">Carregando…</div>;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/30">
      <header className="h-14 border-b bg-primary text-primary-foreground flex items-center px-4 gap-3">
        <ShieldCheck className="h-5 w-5 text-secondary" />
        <span className="font-[Exo] italic font-extrabold text-[17px] tracking-tight">
          ERP AGILIZA <span className="text-secondary">TRANSPORTE</span>
        </span>
        <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
          SuperAdmin
        </span>
        <nav className="ml-6 hidden md:flex items-center gap-1 text-sm">
          <span className="flex items-center gap-1.5 rounded-md bg-primary-foreground/10 px-3 py-1.5">
            <Building2 className="h-4 w-4" /> Empresas
          </span>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="hidden sm:inline opacity-80">{user?.email}</span>
          <Button size="sm" variant="ghost" onClick={logout} className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </header>
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}
