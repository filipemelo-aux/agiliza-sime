import { Link, useLocation, useNavigate } from "react-router-dom";
import { Truck, User, LogOut, Menu, X, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { NotificationBell } from "@/components/NotificationBell";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useUserRole();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border glass-effect">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold font-display text-foreground">
            Trans<span className="text-accent">Porta</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/"
            className={`text-sm font-medium transition-colors ${
              isActive("/") 
                ? "text-primary" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Fretes
          </Link>
          {user && (
            <>
              <Link
                to="/my-vehicles"
                className={`text-sm font-medium transition-colors ${
                  isActive("/my-vehicles") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Meus Veículos
              </Link>
              <Link
                to="/profile"
                className={`text-sm font-medium transition-colors ${
                  isActive("/profile") 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Meu Perfil
              </Link>
              {isAdmin && (
                <Link
                  to="/admin/freights"
                  className={`text-sm font-medium transition-colors flex items-center gap-1 ${
                    isActive("/admin/freights") 
                      ? "text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  Admin
                </Link>
              )}
            </>
          )}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <NotificationBell userId={user.id} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sair
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button variant="ghost" size="sm">
                  Entrar
                </Button>
              </Link>
              <Link to="/auth?mode=signup">
                <Button className="btn-transport-accent" size="sm">
                  Cadastrar
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center gap-2">
          {user && <NotificationBell userId={user.id} />}
          <button
            className="p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background animate-slide-up">
          <nav className="container mx-auto px-4 py-4 flex flex-col gap-3">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="py-2 text-sm font-medium"
            >
              Fretes
            </Link>
            {user ? (
              <>
                <Link
                  to="/my-vehicles"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-sm font-medium"
                >
                  Meus Veículos
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-sm font-medium"
                >
                  Meu Perfil
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin/freights"
                    onClick={() => setMobileMenuOpen(false)}
                    className="py-2 text-sm font-medium flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    Admin - Gerenciar Fretes
                  </Link>
                )}
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="py-2 text-sm font-medium text-destructive text-left"
                >
                  Sair
                </button>
              </>
            ) : (
              <div className="flex gap-3 pt-2">
                <Link to="/auth" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Entrar
                  </Button>
                </Link>
                <Link to="/auth?mode=signup" className="flex-1">
                  <Button className="btn-transport-accent w-full">
                    Cadastrar
                  </Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
