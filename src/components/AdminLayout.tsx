import "@fontsource/exo/800-italic.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, LogOut, Menu, Settings, Sprout, FileCheck, Car, Package, ClipboardList, DollarSign, Fuel, Wrench, FolderTree, HandCoins, TrendingUp, Wallet, Receipt, BarChart3, CheckCircle2, FileSpreadsheet, UserCog, ListChecks, Percent, Settings2, Landmark, CreditCard, FileSignature, ChevronRight } from "lucide-react";
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
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useEffect, useRef, useCallback } from "react";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  {
    title: "Financeiro",
    icon: DollarSign,
    children: [
      { title: "Contas a Pagar", url: "/admin/financial/payables", icon: DollarSign },
      
      { title: "Contas Pagas", url: "/admin/financial/paid", icon: CheckCircle2 },
      { title: "Faturas e Contas a Receber", url: "/admin/financial/invoicing", icon: Receipt },
      
      { title: "Previsões a Receber", url: "/admin/financial/forecasts", icon: TrendingUp },
    ],
  },
  {
    title: "Bancos",
    icon: Landmark,
    children: [
      { title: "Conciliação", url: "/admin/financial/reconciliation", icon: FileSpreadsheet },
      { title: "Fluxo de Caixa", url: "/admin/financial/cashflow", icon: Wallet },
      { title: "Cartão de Crédito", url: "/admin/financial/credit-card", icon: CreditCard },
      {
        title: "Relatórios",
        icon: BarChart3,
        submenu: [
          { title: "Contas a Pagar", url: "/admin/financial/reports/payables", icon: DollarSign },
          { title: "Contas a Receber", url: "/admin/financial/reports/receivables", icon: Receipt },
          { title: "Fluxo de Caixa", url: "/admin/financial/reports/cashflow", icon: Wallet },
          { title: "Previsões", url: "/admin/financial/reports/forecasts", icon: TrendingUp },
          { title: "DRE Gerencial", url: "/admin/financial/reports/dre", icon: BarChart3 },
        ],
      },
    ],
  },
  {
    title: "Transporte",
    icon: Car,
    children: [
      { title: "CT-e", url: "/admin/freight/cte", icon: FileText },
      { title: "Contratos de Frete", url: "/admin/freight/contracts", icon: FileSignature },
      { title: "MDF-e", url: "/admin/freight/mdfe", icon: FileCheck },
      { title: "Colheita", url: "/admin/harvest", icon: Sprout },
      { title: "Cotações", url: "/admin/quotations", icon: ClipboardList },
      { title: "Relatórios", url: "/admin/freight/reports", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Frota",
    icon: Car,
    children: [
      { title: "Abastecimentos", url: "/admin/fuelings", icon: Fuel },
      { title: "Ordens de Abastecimento", url: "/admin/fuel-orders", icon: Fuel },
      { title: "Ordens de Carregamento", url: "/admin/applications", icon: FileText },
      { title: "Manutenções", url: "/admin/maintenances", icon: Wrench },
      { title: "Métricas por Veículo", url: "/admin/fleet/metrics", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Cadastros",
    icon: Users,
    children: [
      { title: "Natureza de Cargas", url: "/admin/cargas", icon: Package },
      { title: "Pessoas", url: "/admin/people", icon: Users },
      { title: "Plano de Contas", url: "/admin/financial/chart", icon: FolderTree },
      { title: "Relatórios", url: "/admin/reports", icon: FileSpreadsheet },
      { title: "Veículos", url: "/admin/vehicles", icon: Car },
    ],
  },
  {
    title: "Recursos Humanos",
    icon: UserCog,
    children: [
      { title: "Colaboradores", url: "/admin/rh/colaboradores", icon: UserCog },
      { title: "Movimentações", url: "/admin/rh/movimentacoes", icon: HandCoins },
      { title: "Folha de Pagamento", url: "/admin/rh/folha", icon: ListChecks },
      { title: "Configurações RH", url: "/admin/rh/configuracoes", icon: Settings2 },
    ],
  },
  { title: "_spacer", url: "", icon: Settings },
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];

function CollapsibleSubmenu({
  title,
  Icon,
  defaultOpen,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);
  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={setOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={title} className="h-7 text-xs px-2 gap-2 w-full">
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">{title}</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mr-0 pr-0">
            {children}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}



function SidebarNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  const isTransporteActive = location.pathname.startsWith("/admin/freight") || location.pathname.startsWith("/admin/harvest") || location.pathname.startsWith("/admin/applications") || location.pathname.startsWith("/admin/quotations") || location.pathname.startsWith("/admin/fuel-orders");
  const isCadastrosActive = location.pathname.startsWith("/admin/people") || location.pathname.startsWith("/admin/vehicles") || location.pathname.startsWith("/admin/cargas") || location.pathname === "/admin/financial/chart" || location.pathname.startsWith("/admin/reports");
  
  const isContasPagarActive = ["/admin/financial/payables", "/admin/financial/forecasts", "/admin/financial/receipts", "/admin/maintenances"].some(p => location.pathname.startsWith(p));

  // These variables are used for styling purposes only

  return (
    <Sidebar collapsible="icon" className="border-r border-border fixed inset-y-0 left-0 z-30">
      {/* Branding no topo da sidebar */}
        <div className="h-16 flex items-center px-3 border-b border-sidebar-border/60 shrink-0">
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
                    <div key={item.title} className="pt-2 first:pt-0">
                      <div className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
                        {item.title}
                      </div>
                      {item.children.map((child: any) => {
                        if (child.submenu) {
                          const anySubActive = child.submenu.some((s: any) => isActive(s.url));
                          return (
                            <CollapsibleSubmenu
                              key={child.title}
                              title={child.title}
                              Icon={child.icon}
                              defaultOpen={anySubActive}
                            >
                              {child.submenu.map((sub: any) => (
                                <SidebarMenuSubItem key={sub.title}>
                                  <SidebarMenuSubButton asChild isActive={isActive(sub.url)} className="h-6 text-[11px] px-2 gap-2">
                                    <Link to={sub.url} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                                      <sub.icon className="h-3 w-3" />
                                      <span>{sub.title}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </CollapsibleSubmenu>
                          );
                        }
                        return (
                          <SidebarMenuItem key={child.title}>
                            <SidebarMenuButton asChild isActive={isActive(child.url)} tooltip={child.title} className="h-7 text-xs px-2 gap-2">
                              <Link to={child.url} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                                <child.icon className="h-3.5 w-3.5" />
                                <span>{child.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
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
                      className="h-7 text-xs px-2 gap-2"
                    >
                      <Link to={item.url!} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                        <item.icon className="h-3.5 w-3.5" />
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
      <div className="h-[100dvh] flex w-full overflow-hidden">
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
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <header
        className="fixed top-0 right-0 z-30 h-14 border-b border-border/40 backdrop-blur-xl bg-background/80 flex items-center justify-between px-4 transition-[left] duration-200 ease-out"
        style={{ left: headerLeft }}
      >
        <div className="flex items-center gap-4">
          <SidebarTrigger className="h-9 w-9 flex items-center justify-center rounded-md border border-border hover:bg-accent transition-colors">
            <Menu className="h-5 w-5" />
          </SidebarTrigger>
          <img src={logo} alt="SIME" className="h-9 w-auto" />
        </div>
        {user && (
          <div className="flex items-center gap-2 sm:gap-4">
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
      <div className="h-14 shrink-0" />
      <main className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
