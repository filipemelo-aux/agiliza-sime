import { Link, useLocation, useNavigate } from "react-router-dom";
import { Truck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useUserRole();

  const handleLogout = async () => {
    try {
      // Limpa storage local primeiro para garantir logout
      localStorage.removeItem('sb-hepdqbkiwdxqkgnwbxdc-auth-token');
      sessionStorage.clear();
      
      // Tenta signOut no servidor (pode falhar se sessão já expirou)
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
    // Força reload completo da página
    window.location.href = "/";
  };

  const isActive = (path: string) => location.pathname === path;
  const isActivePrefix = (prefix: string) => location.pathname.startsWith(prefix);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border glass-effect">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={isAdmin ? "/admin" : "/"} className="flex items-center gap-2 shrink-0">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold font-display text-foreground hidden sm:block">
            Trans<span className="text-accent">Porta</span>
          </span>
        </Link>

        {/* Navigation - Always Visible */}
        <nav className="flex items-center gap-2 sm:gap-4 md:gap-6 overflow-x-auto">
          {/* Admin Navigation */}
          {user && !loading && isAdmin && (
            <>
              <Link
                to="/admin"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/admin") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Fretes
              </Link>
              <Link
                to="/admin/applications"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/admin/applications") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ordens
              </Link>
            </>
          )}
          
          {/* User Navigation */}
          {user && !loading && !isAdmin && (
            <>
              <Link
                to="/"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Fretes
              </Link>
              <Link
                to="/my-vehicles"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/my-vehicles") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Veículos
              </Link>
              <Link
                to="/my-applications"
                className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive("/my-applications") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Ordens
              </Link>
            </>
          )}
          
          {/* Not logged in */}
          {!user && !loading && (
            <Link
              to="/"
              className={`text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                isActive("/") 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Fretes
            </Link>
          )}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user ? (
            <>
              <NotificationBell userId={user.id} />
              <UserAvatar userId={user.id} showName size="sm" />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground h-8 w-8"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                  Entrar
                </Button>
              </Link>
              <Link to="/auth?mode=signup" className="hidden sm:block">
                <Button className="btn-transport-accent" size="sm">
                  Cadastrar
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
