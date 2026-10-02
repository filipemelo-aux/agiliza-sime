import "@fontsource/exo/800-italic.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X, ArrowLeftRight, LayoutDashboard, FileText, Users, LogOut, Menu, Settings, Sprout, Car, Package, ClipboardList, DollarSign, Fuel, Wrench, FolderTree, HandCoins, TrendingUp, Wallet, Receipt, BarChart3, CheckCircle2, FileSpreadsheet, UserCog, ListChecks, Percent, Settings2, Landmark, CreditCard, FileSignature, ChevronRight, WalletCards } from "lucide-react";
import { MdfeIcon } from "@/components/icons/MdfeIcon";
import logo from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { usePageAccess } from "@/hooks/usePageAccess";
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
import { useState, useEffect, useRef, useCallback, type UIEvent } from "react";

export const allMenuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  {
    title: "Financeiro",
    icon: DollarSign,
    children: [
      { title: "Contas a Pagar", url: "/admin/financial/payables", icon: DollarSign },
      { title: "Cheques", url: "/admin/financial/checks", icon: WalletCards },
      { title: "Contas Pagas", url: "/admin/financial/paid", icon: CheckCircle2 },
      { title: "Faturas e Contas a Receber", url: "/admin/financial/invoicing", icon: Receipt },
      
      { title: "Previsões a Receber", url: "/admin/financial/forecasts", icon: TrendingUp },
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
          { title: "Cheques", url: "/admin/financial/reports/checks", icon: WalletCards },
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
      { title: "MDF-e", url: "/admin/freight/mdfe", icon: MdfeIcon },
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
  { title: "_spacer", url: "", icon: Settings },
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];


function CollapsibleMenu({
  title,
  Icon,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <SidebarMenuItem>
      <Collapsible open={open} onOpenChange={onOpenChange} className="w-full">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={title} className="h-9 text-[13px] font-medium px-2.5 gap-3 w-full">
            <Icon className="!h-4 !w-4 text-foreground/80" />
            <span className="flex-1 text-left">{title}</span>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 ml-4 border-l-0 pl-2 pr-0 py-0.5 gap-0.5">
            {children}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

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
          <SidebarMenuButton tooltip={title} className="h-8 text-[13px] px-2 gap-2 w-full">
            <ChevronRight className={`!h-3 !w-3 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="flex-1 text-left">{title}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mx-0 ml-4 border-l-0 pl-2 pr-0 py-0.5 gap-0.5">
            {children}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}



/** Lista plana de todas as páginas do menu (para gerenciamento de acesso). */
export function listSystemPages(): { url: string; title: string; group: string }[] {
  const out: { url: string; title: string; group: string }[] = [];
  (allMenuItems as any[]).forEach((i) => {
    if (i.title === "_spacer") return;
    if (i.children) i.children.forEach((c: any) => {
      if (c.submenu) c.submenu.forEach((s: any) => out.push({ url: s.url, title: s.title, group: `${i.title} › ${c.title}` }));
      else out.push({ url: c.url, title: c.title, group: i.title });
    });
    else out.push({ url: i.url, title: i.title, group: "Geral" });
  });
  return out;
}

export function matchPageUrl(pathname: string): string | null {
  const pages = listSystemPages().map((p) => p.url).sort((a, b) => b.length - a.length);
  if (pathname === "/admin") return "/admin";
  return pages.find((u) => u !== "/admin" && (pathname === u || pathname.startsWith(u + "/"))) || null;
}

function filterMenu(items: any[], hidden: (u: string) => boolean): any[] {
  return items
    .map((i) => {
      if (i.children) {
        const children = i.children
          .map((c: any) => (c.submenu ? { ...c, submenu: c.submenu.filter((s: any) => !hidden(s.url)) } : c))
          .filter((c: any) => (c.submenu ? c.submenu.length > 0 : !hidden(c.url)));
        return children.length ? { ...i, children } : null;
      }
      return i.url && hidden(i.url) ? null : i;
    })
    .filter(Boolean);
}

function SidebarNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { canAccessSettings } = useUserRole();
  const { getRule } = usePageAccess();
  const baseMenuItems = filterMenu(
    allMenuItems.filter((i: any) => canAccessSettings || i.url !== "/admin/settings"),
    (u) => getRule(u).mode === "hidden",
  );

  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nq = norm(q);
  const menuItems = !q ? baseMenuItems : (baseMenuItems as any[]).map((i) => {
    if (i.title === "_spacer") return null;
    if (norm(i.title).includes(nq)) return i;
    if (!i.children) return null;
    const children = i.children.map((c: any) => {
      if (norm(c.title).includes(nq)) return c;
      if (c.submenu) { const sub = c.submenu.filter((x: any) => norm(x.title).includes(nq)); return sub.length ? { ...c, submenu: sub } : null; }
      return null;
    }).filter(Boolean);
    return children.length ? { ...i, children } : null;
  }).filter(Boolean);

  const isActive = (url: string, exact?: boolean) => {
    if (exact) return location.pathname === url;
    return location.pathname.startsWith(url);
  };

  // Acordeão: apenas um grupo de menu aberto por vez
  const findActiveTopLevel = () =>
    (baseMenuItems as any[]).find((i) => i.children?.some((c: any) =>
      c.submenu ? c.submenu.some((s: any) => isActive(s.url)) : isActive(c.url)
    ))?.title ?? null;
  const [openMenu, setOpenMenu] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem("sidebar-open-menu");
      if (stored) return stored;
    } catch {}
    return findActiveTopLevel();
  });
  const handleMenuOpenChange = (title: string, v: boolean) => {
    setOpenMenu(v ? title : null);
    try {
      if (v) localStorage.setItem("sidebar-open-menu", title);
      else localStorage.removeItem("sidebar-open-menu");
    } catch {}
  };

  const isTransporteActive = location.pathname.startsWith("/admin/freight") || location.pathname.startsWith("/admin/harvest") || location.pathname.startsWith("/admin/applications") || location.pathname.startsWith("/admin/quotations") || location.pathname.startsWith("/admin/fuel-orders");
  const isCadastrosActive = location.pathname.startsWith("/admin/people") || location.pathname.startsWith("/admin/vehicles") || location.pathname.startsWith("/admin/cargas") || location.pathname === "/admin/financial/chart" || location.pathname.startsWith("/admin/reports");
  
  const isContasPagarActive = ["/admin/financial/payables", "/admin/financial/forecasts", "/admin/financial/receipts", "/admin/maintenances"].some(p => location.pathname.startsWith(p));

  // These variables are used for styling purposes only

  // Preserva a posição de rolagem do menu lateral entre navegações
  const sidebarScrollRef = useRef<HTMLDivElement | null>(null);
  const handleSidebarScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem("sidebar-scroll", String(e.currentTarget.scrollTop));
  }, []);
  useEffect(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    const saved = Number(sessionStorage.getItem("sidebar-scroll") || 0);
    if (saved > 0) el.scrollTop = saved;
  }, [location.pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r border-border fixed inset-y-0 left-0 z-30">
      {/* Branding no topo da sidebar */}
      <div className="h-16 flex items-center justify-between gap-2 px-3 shrink-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <div className="min-w-0 leading-none group-data-[collapsible=icon]:hidden">
          <span className="block text-[16px] font-extrabold tracking-tight text-foreground">
            SIME <span className="text-muted-foreground font-semibold">TRANSPORTES</span>
          </span>
        </div>
        <SidebarTrigger className="h-9 w-9 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90 [&_svg]:!h-4 [&_svg]:!w-4" title="Recolher menu">
          <ArrowLeftRight />
        </SidebarTrigger>
      </div>
      <div className="px-3 pb-2 shrink-0 group-data-[collapsible=icon]:hidden">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
            placeholder="Pesquisar"
            className="h-8 w-full rounded-md border border-accent/40 bg-accent/15 pl-2.5 pr-7 text-xs text-foreground placeholder:text-foreground/60 outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-foreground/70 hover:text-foreground" aria-label="Limpar busca">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <SidebarContentUI
        ref={sidebarScrollRef}
        className="overflow-y-auto"
        onScroll={handleSidebarScroll}
      >
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                if ('children' in item && item.children) {
                  return (
                    <CollapsibleMenu
                      key={item.title}
                      title={item.title}
                      Icon={item.icon}
                      open={!!q || openMenu === item.title}
                      onOpenChange={(v) => handleMenuOpenChange(item.title, v)}
                    >
                      {item.children.map((child: any) => {
                        if (child.submenu) {
                          const anySubActive = child.submenu.some((s: any) => isActive(s.url));
                          return (
                            <CollapsibleSubmenu
                              key={child.title}
                              title={child.title}
                              Icon={child.icon}
                              defaultOpen={anySubActive || !!q}
                            >
                              {child.submenu.map((sub: any) => (
                                <SidebarMenuSubItem key={sub.title}>
                                  <SidebarMenuSubButton asChild isActive={isActive(sub.url)} className="h-7 text-[12.5px] px-2 gap-2">
                                    <Link to={sub.url} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                                      <ChevronRight className="!h-3 !w-3 text-muted-foreground" />
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
                            <SidebarMenuButton asChild isActive={isActive(child.url)} tooltip={child.title} className="h-8 text-[13px] px-2 gap-2">
                              <Link to={child.url} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                                <ChevronRight className="!h-3 !w-3 text-muted-foreground" />
                                <span>{child.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </CollapsibleMenu>
                  );
                }
                if (item.title === "_spacer") {
                  return q ? null : <div key="_spacer" className="pt-4" />;
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url!, (item as any).exact)}
                      tooltip={item.title}
                      className="h-9 text-[13px] font-medium px-2.5 gap-3"
                    >
                      <Link to={item.url!} state={{ fromNav: true }} onClick={() => setOpenMobile(false)}>
                        <item.icon className="!h-4 !w-4 text-foreground/80" />
                        <span className="flex-1">{item.title}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContentUI>
      <ReadOnlyBanner />
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
  const navigate = useNavigate();
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
            <button type="button" onClick={() => navigate("/admin/settings")} title="Meu perfil" className="rounded-md px-1 hover:bg-accent transition-colors">
              <UserAvatar userId={user.id} showName size="sm" />
            </button>
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
        <PageGate>{children}</PageGate>
      </main>
    </div>
  );
}

function ReadOnlyBanner() {
  const { isConsultor } = useUserRole();
  if (!isConsultor) return null;
  return (
    <div className="px-3 py-2 text-[10px] leading-snug border-t border-sidebar-border/60 text-muted-foreground shrink-0 group-data-[collapsible=icon]:hidden">
      Modo consulta: você pode visualizar tudo e emitir relatórios, mas não pode alterar informações.
    </div>
  );
}

function PageGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { getRule } = usePageAccess();
  const url = matchPageUrl(location.pathname);
  const rule = url ? getRule(url) : { mode: "active" as const, message: null };
  if (rule.mode === "active") return <>{children}</>;
  const maint = rule.mode === "maintenance";
  return (
    <div className="flex items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-md text-center space-y-3 border border-border rounded-lg p-8 bg-card">
        {maint ? <Wrench className="h-10 w-10 mx-auto text-accent" /> : <Settings className="h-10 w-10 mx-auto text-muted-foreground" />}
        <h2 className="text-lg font-semibold">{maint ? "Página em manutenção" : "Página indisponível"}</h2>
        <p className="text-sm text-muted-foreground">
          {rule.message || (maint ? "Esta área está passando por ajustes e volta em breve." : "Esta página não está liberada para o seu acesso.")}
        </p>
        <Button asChild variant="outline" className="h-10"><Link to="/admin">Voltar ao início</Link></Button>
      </div>
    </div>
  );
}
