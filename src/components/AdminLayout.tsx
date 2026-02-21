import "@fontsource/exo/800-italic.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Package, Sprout, Users, LogOut, Menu } from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Ordens", url: "/admin/applications", icon: FileText },
  { title: "Fretes", url: "/freights", icon: Package },
  { title: "Colheita", url: "/admin/harvest", icon: Sprout },
  { title: "Cadastros", url: "/admin/drivers", icon: Users },
];

function SidebarNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      {/* Branding no topo da sidebar */}
      <div className="h-16 flex items-center gap-2 px-3 border-b border-sidebar-border shrink-0">
        <img src={logo} alt="SIME" className="h-8 w-auto shrink-0" />
        <span className="text-base text-primary whitespace-nowrap group-data-[collapsible=icon]:hidden" style={{ fontFamily: "'Exo', sans-serif", fontWeight: 800, fontStyle: 'italic' }}>
          SIME <span className="text-accent">TRANSPORTES</span>
        </span>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.exact)}
                    tooltip={item.title}
                  >
                    <Link to={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useUserRole();

  const handleLogout = async () => {
    try {
      localStorage.removeItem('sb-hepdqbkiwdxqkgnwbxdc-auth-token');
      sessionStorage.clear();
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
    window.location.href = "/";
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-50 h-16 border-b border-border glass-effect flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </SidebarTrigger>
              <img src={logo} alt="SIME" className="h-9 w-auto" />
            </div>
            {user && (
              <div className="flex items-center gap-2 sm:gap-3">
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
              </div>
            )}
          </header>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
