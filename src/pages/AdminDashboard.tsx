import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  FileText,
  DollarSign,
  ClipboardList,
  Fuel,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import { ExpenseFormDialog } from "@/components/financial/ExpenseFormDialog";
import { FuelingFormDialog } from "@/components/fueling/FuelingFormDialog";

interface DueItem {
  id: string;
  expense_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  status: string;
  descricao: string;
  favorecido_nome: string | null;
}

export default function AdminDashboard() {
  const { isAdmin, isModerator, isOperador, hasAdminAccess, loading: roleLoading } = useUserRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);
  const [fuelingFormOpen, setFuelingFormOpen] = useState(false);
  const [empresaId, setEmpresaId] = useState("");
  const [loading, setLoading] = useState(true);

  const [dueToday, setDueToday] = useState<DueItem[]>([]);
  const [dueWeek, setDueWeek] = useState<DueItem[]>([]);
  const [totalToday, setTotalToday] = useState(0);
  const [totalWeek, setTotalWeek] = useState(0);

  useEffect(() => {
    supabase.from("fiscal_establishments").select("id").limit(1).maybeSingle()
      .then(({ data }) => { if (data) setEmpresaId(data.id); });
  }, []);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) setUserName(data.full_name.split(" ")[0]); });
    }
  }, [user]);

  useEffect(() => {
    if (!roleLoading && !hasAdminAccess) {
      navigate("/");
    }
  }, [isAdmin, isModerator, roleLoading, navigate]);

  useEffect(() => {
    if (hasAdminAccess) {
      fetchFinancialPreview();
    }
  }, [isAdmin, isModerator]);

  const fetchFinancialPreview = async () => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];

      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + 7);
      const endWeekStr = endOfWeek.toISOString().split("T")[0];

      // Fetch installments due today through end of week OR overdue (before today)
      const { data: installments } = await supabase
        .from("expense_installments")
        .select("id, expense_id, numero_parcela, valor, data_vencimento, status")
        .in("status", ["pendente", "atrasado"])
        .lte("data_vencimento", endWeekStr)
        .order("data_vencimento", { ascending: true });

      if (!installments || installments.length === 0) {
        setDueToday([]);
        setDueWeek([]);
        setTotalToday(0);
        setTotalWeek(0);
        setLoading(false);
        return;
      }

      // Fetch parent expenses for descriptions + filter out deleted
      const expenseIds = [...new Set(installments.map((i) => i.expense_id))];
      const { data: expenses } = await supabase
        .from("expenses")
        .select("id, descricao, favorecido_nome, deleted_at")
        .in("id", expenseIds);

      const activeExpenses = (expenses || []).filter(e => !e.deleted_at);
      const expenseMap = new Map(activeExpenses.map((e) => [e.id, e]));

      // Only keep installments whose parent expense is active
      const enriched: DueItem[] = installments
        .filter((inst) => expenseMap.has(inst.expense_id))
        .map((inst) => {
          const exp = expenseMap.get(inst.expense_id);
          return {
            ...inst,
            descricao: exp?.descricao || "—",
            favorecido_nome: exp?.favorecido_nome || null,
          };
        });

      // "Vencendo Hoje" includes today + overdue (past due)
      const todayItems = enriched.filter((i) => i.data_vencimento <= todayStr);
      const weekItems = enriched.filter((i) => i.data_vencimento > todayStr && i.data_vencimento <= endWeekStr);

      setDueToday(todayItems);
      setDueWeek(weekItems);
      setTotalToday(todayItems.reduce((s, i) => s + Number(i.valor), 0));
      setTotalWeek(weekItems.reduce((s, i) => s + Number(i.valor), 0));
    } catch (err) {
      console.error("Erro ao buscar previsão financeira:", err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAdminAccess) return null;

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          {userName && (
            <p className="text-lg text-muted-foreground mb-1">Olá, <span className="font-semibold text-foreground">{userName}</span>!</p>
          )}
          <h1 className="text-3xl font-bold font-display">Visão Geral</h1>
        </div>

        {/* Atalhos rápidos */}
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 ml-1">Acesso Rápido</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 w-full gap-2 mb-8">
          <Link
            to="/admin/freight/cte"
            className="group flex items-center gap-2 rounded-xl px-3 py-2.5 bg-[#2B4C7E] text-white shadow-md hover:bg-[#F5C518] hover:text-[#2B4C7E] hover:shadow-lg hover:scale-105 transition-all duration-200"
          >
            <FileText className="h-4 w-4 lg:h-5 lg:w-5" />
            <span className="text-xs font-semibold leading-none">CT-e</span>
          </Link>

          <Popover>
            <PopoverTrigger asChild>
              <button className="group flex items-center gap-2 rounded-xl px-3 py-2.5 bg-[#2B4C7E] text-white shadow-md hover:bg-[#F5C518] hover:text-[#2B4C7E] hover:shadow-lg hover:scale-105 transition-all duration-200 w-full">
                <DollarSign className="h-4 w-4 lg:h-5 lg:w-5" />
                <span className="text-xs font-semibold leading-none">Contas a Pagar</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="center">
              <button onClick={() => setExpenseFormOpen(true)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors w-full text-left">
                <DollarSign className="h-4 w-4" /> Nova Conta
              </button>
              <Link to="/admin/financial/payables" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                <ClipboardList className="h-4 w-4" /> Ver Contas
              </Link>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button className="group flex items-center gap-2 rounded-xl px-3 py-2.5 bg-[#2B4C7E] text-white shadow-md hover:bg-[#F5C518] hover:text-[#2B4C7E] hover:shadow-lg hover:scale-105 transition-all duration-200 w-full">
                <ClipboardList className="h-4 w-4 lg:h-5 lg:w-5" />
                <span className="text-xs font-semibold leading-none">Ordens</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="center">
              <Link to="/admin/fuel-orders" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                <Fuel className="h-4 w-4" /> Abastecimento
              </Link>
              <Link to="/admin/applications" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors">
                <ClipboardList className="h-4 w-4" /> Carregamento
              </Link>
            </PopoverContent>
          </Popover>

          <button
            onClick={() => setFuelingFormOpen(true)}
            className="group flex items-center gap-2 rounded-xl px-3 py-2.5 bg-[#2B4C7E] text-white shadow-md hover:bg-[#F5C518] hover:text-[#2B4C7E] hover:shadow-lg hover:scale-105 transition-all duration-200"
          >
            <Fuel className="h-4 w-4 lg:h-5 lg:w-5" />
            <span className="text-xs font-semibold leading-none">Abastecimento</span>
          </button>
        </div>

        <ExpenseFormDialog
          open={expenseFormOpen}
          onOpenChange={setExpenseFormOpen}
          empresaId={empresaId}
          chartAccounts={[]}
          onSaved={() => {}}
        />

        <FuelingFormDialog
          open={fuelingFormOpen}
          onOpenChange={setFuelingFormOpen}
          empresaId={empresaId}
          userId={user?.id || ""}
          fueling={null}
          onSaved={() => {}}
        />

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Vencendo Hoje */}
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive/70" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vencendo Hoje</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground/80">{fmt(totalToday)}</span>
                  <Link to="/admin/financial/payables" state={{ quickFilter: "hoje" }}>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground transition-colors" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                {dueToday.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma conta vencendo hoje 🎉</p>
                ) : (
                  <div className="space-y-1">
                    {dueToday.map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 px-2.5 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground/90 truncate">{item.favorecido_nome || item.descricao}</p>
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            {item.favorecido_nome ? item.descricao : ""} {item.numero_parcela > 0 && `• P${item.numero_parcela}`}
                          </p>
                        </div>
                        <span className="text-[13px] font-medium text-destructive/80 whitespace-nowrap ml-3">{fmt(item.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Próximos 7 dias */}
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-primary/70" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Próximos 7 dias</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground/80">{fmt(totalWeek)}</span>
                  <Link to="/admin/financial/payables" state={{ quickFilter: "semana" }}>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-foreground transition-colors" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1">
                {dueWeek.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhuma conta nos próximos 7 dias</p>
                ) : (
                  <div className="space-y-1">
                    {dueWeek.slice(0, 10).map((item) => (
                      <div key={item.id} className="flex items-center justify-between py-2 px-2.5 rounded-md hover:bg-muted/40 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground/90 truncate">{item.favorecido_nome || item.descricao}</p>
                          <p className="text-[10px] text-muted-foreground/70 truncate">
                            {item.favorecido_nome ? item.descricao : ""} {item.numero_parcela > 0 && `• P${item.numero_parcela}`}
                          </p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-[13px] font-medium text-foreground/80 whitespace-nowrap">{fmt(item.valor)}</p>
                          <p className="text-[10px] text-muted-foreground/60">{fmtDate(item.data_vencimento)}</p>
                        </div>
                      </div>
                    ))}
                    {dueWeek.length > 10 && (
                      <p className="text-[10px] text-muted-foreground/60 text-center pt-1">
                        + {dueWeek.length - 10} parcelas
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </AdminLayout>
  );
}
