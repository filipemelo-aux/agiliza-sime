import "@fontsource/exo/800-italic.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, LogOut, Menu, Settings, Sprout, FileCheck, Car, ChevronDown } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Ordens de Carregamento", url: "/admin/applications", icon: FileText },
  { title: "CT-e", url: "/admin/freight/cte", icon: FileText },
  { title: "MDF-e", url: "/admin/freight/mdfe", icon: FileCheck },
  { title: "Colheita", url: "/admin/harvest", icon: Sprout },
  {
    title: "Cadastros",
    icon: Users,
    children: [
      { title: "Pessoas", url: "/admin/people", icon: Users },
      { title: "Veículos", url: "/admin/vehicles", icon: Car },
    ],
  },
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];

function SidebarNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  const isCadastrosActive = location.pathname.startsWith("/admin/people") || location.pathname.startsWith("/admin/vehicles") || location.pathname === "/admin/drivers";

  return (
    <Sidebar collapsible="icon" className="border-r border-border fixed inset-y-0 left-0 z-40">
      {/* Branding no topo da sidebar */}
      <div className="h-16 flex items-center px-3 border-b border-sidebar-border shrink-0">
        <span className="text-base text-primary whitespace-nowrap group-data-[collapsible=icon]:hidden" style={{ fontFamily: "'Exo', sans-serif", fontWeight: 800, fontStyle: 'italic' }}>
          SIME <span className="text-accent">TRANSPORTES</span>
        </span>
      </div>

      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                if ('children' in item && item.children) {
                  return (
                    <Collapsible key={item.title} defaultOpen={isCadastrosActive} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.title} isActive={isCadastrosActive}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.title}>
                                <SidebarMenuSubButton asChild isActive={isActive(child.url)}>
                                  <Link to={child.url} onClick={() => setOpenMobile(false)}>
                                    <child.icon className="h-4 w-4" />
                                    <span>{child.title}</span>
                                  </Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url!, (item as any).exact)}
                      tooltip={item.title}
                    >
                      <Link to={item.url!} onClick={() => setOpenMobile(false)}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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
          {/* Top bar - fixed with glass effect */}
          <header className="fixed top-0 right-0 left-0 z-50 h-16 border-b border-border/50 backdrop-blur-xl bg-background/70 flex items-center justify-between px-4 peer-data-[state=expanded]:md:pl-[calc(var(--sidebar-width)+1rem)]">
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
          {/* Spacer for fixed header */}
          <div className="h-16 shrink-0" />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
