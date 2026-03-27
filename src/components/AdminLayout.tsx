import "@fontsource/exo/800-italic.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, LogOut, Menu, Settings, Sprout, FileCheck, Car, Package, ClipboardList, DollarSign, Fuel, Wrench, FolderTree, HandCoins, TrendingUp, Wallet, Receipt, BarChart3 } from "lucide-react";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { NotificationBell } from "@/components/NotificationBell";
import { UserAvatar } from "@/components/UserAvatar";
import {
  Sidebar,
  SidebarContent as SidebarContentUI,
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
  {
    title: "Transporte",
    icon: Car,
    children: [
      { title: "CT-e", url: "/admin/freight/cte", icon: FileText },
      { title: "MDF-e", url: "/admin/freight/mdfe", icon: FileCheck },
      { title: "Colheita", url: "/admin/harvest", icon: Sprout },
      { title: "Cotações", url: "/admin/quotations", icon: ClipboardList },
      { title: "Ordens de Carregamento", url: "/admin/applications", icon: FileText },
      { title: "Ordens de Abastecimento", url: "/admin/fuel-orders", icon: Fuel },
    ],
  },
  {
    title: "Cadastros",
    icon: Users,
    children: [
      { title: "Pessoas", url: "/admin/people", icon: Users },
      { title: "Veículos", url: "/admin/vehicles", icon: Car },
      { title: "Natureza de Cargas", url: "/admin/cargas", icon: Package },
      { title: "Plano de Contas", url: "/admin/financial/chart", icon: FolderTree },
    ],
  },
  {
    title: "Financeiro",
    icon: DollarSign,
    children: [
      { title: "Faturamento", url: "/admin/financial/invoicing", icon: Receipt },
      { title: "Previsões", url: "/admin/financial/forecasts", icon: TrendingUp },
      { title: "Contas a Receber", url: "/admin/financial/receivables", icon: HandCoins },
      { title: "Contas a Pagar", url: "/admin/financial/payables", icon: DollarSign },
      { title: "Fluxo de Caixa", url: "/admin/financial/cashflow", icon: Wallet },
      { title: "Manutenções", url: "/admin/maintenances", icon: Wrench },
      { title: "Abastecimentos", url: "/admin/fuelings", icon: Fuel },
    ],
  },
  { title: "_spacer", url: "", icon: Settings },
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];

function SidebarNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  const isTransporteActive = location.pathname.startsWith("/admin/freight") || location.pathname.startsWith("/admin/harvest") || location.pathname.startsWith("/admin/applications") || location.pathname.startsWith("/admin/quotations") || location.pathname.startsWith("/admin/fuel-orders");
  const isCadastrosActive = location.pathname.startsWith("/admin/people") || location.pathname.startsWith("/admin/vehicles") || location.pathname.startsWith("/admin/cargas") || location.pathname === "/admin/financial/chart";
  
  const isContasPagarActive = ["/admin/financial/payables", "/admin/financial/forecasts", "/admin/financial/receivables", "/admin/financial/receipts", "/admin/fuelings", "/admin/maintenances"].some(p => location.pathname.startsWith(p));

  // These variables are used for styling purposes only

  return (
    <Sidebar collapsible="icon" className="border-r border-border fixed inset-y-0 left-0 z-30">
      {/* Branding no topo da sidebar */}
      <div className="h-16 flex items-center px-3 border-b border-sidebar-border shrink-0">
        <span className="text-base text-primary whitespace-nowrap group-data-[collapsible=icon]:hidden" style={{ fontFamily: "'Exo', sans-serif", fontWeight: 800, fontStyle: 'italic' }}>
          SIME <span className="text-accent">TRANSPORTES</span>
        </span>
      </div>

      <SidebarContentUI className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                if ('children' in item && item.children) {
                  return (
                    <div key={item.title} className="pt-4 first:pt-0">
                      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </div>
                      {item.children.map((child) => (
                        <SidebarMenuItem key={child.title}>
                          <SidebarMenuButton asChild isActive={isActive(child.url)} tooltip={child.title}>
                            <Link to={child.url} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                              <child.icon className="h-4 w-4" />
                              <span>{child.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </div>
                  );
                }
                if (item.title === "_spacer") {
                  return <div key="_spacer" className="pt-6" />;
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url!, (item as any).exact)}
                      tooltip={item.title}
                    >
                      <Link to={item.url!} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
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
      </SidebarContentUI>
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
        <SidebarContentInner handleLogout={handleLogout} user={user}>
          {children}
        </SidebarContentInner>
      </div>
    </SidebarProvider>
  );
}

function SidebarContentInner({ children, handleLogout, user }: { children: React.ReactNode; handleLogout: () => void; user: any }) {
  const { state, isMobile } = useSidebar();
  const isExpanded = state === "expanded";
  const headerLeft = isMobile ? "0px" : isExpanded ? "var(--sidebar-width)" : "var(--sidebar-width-icon)";

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header
        className="fixed top-0 right-0 z-30 h-16 border-b border-border/50 backdrop-blur-xl bg-background/70 flex items-center justify-between px-4 transition-[left] duration-200"
        style={{ left: headerLeft }}
      >
        <div className="flex items-center gap-3">
          <SidebarTrigger className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-accent transition-colors">
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
      <div className="h-16 shrink-0" />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
