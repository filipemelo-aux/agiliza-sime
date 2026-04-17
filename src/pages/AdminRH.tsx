import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { SummaryCard } from "@/components/SummaryCard";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Users, Wallet, HandCoins, Briefcase, Search, Save, History, Radio, Play, Pencil, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";

type ColaboradorRH = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  cargo: string | null;
  departamento: string | null;
  data_admissao: string | null;
  salario: number | null;
  tipo: "colaborador" | "motorista_frota_propria";
  ativo: boolean;
  vehicle_plates?: string[];
};

type ChartAccount = { id: string; codigo: string; nome: string; tipo: string };

type Expense = {
  id: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  status: string;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  favorecido_id: string | null;
  favorecido_nome: string | null;
  plano_contas_id: string | null;
};

const SETTINGS_KEY = "rh:settings:v1";
type RHSettings = {
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  payDay?: string;
  salaryOverrides?: Record<string, number>;
};

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const isFolhaAccount = (a: ChartAccount) => {
  const n = norm(a.nome);
  return n.includes("salario") || n.includes("folha");
};
const isAdiantAccount = (a: ChartAccount) => {
  const n = norm(a.nome);
  return n.includes("adiantamento") || n.includes("vale");
};

export default function AdminRH() {
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState<ColaboradorRH[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<"all" | "colaborador" | "motorista_frota_propria">("all");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [settings, setSettings] = useState<RHSettings>(() => {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [historyFor, setHistoryFor] = useState<ColaboradorRH | null>(null);
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [, setRefreshTick] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  // Initial load: colaboradores + motoristas frota própria + plano de contas
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [colabRes, vehRes, accRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, phone, cargo, departamento, data_admissao, salario")
          .eq("category", "colaborador")
          .order("full_name"),
        supabase
          .from("vehicles")
          .select("plate, driver_id, is_active, fleet_type")
          .eq("fleet_type", "propria")
          .not("driver_id", "is", null),
        supabase
          .from("chart_of_accounts")
          .select("id, codigo, nome, tipo")
          .eq("ativo", true)
          .order("codigo"),
      ]);

      const colaboradoresList: ColaboradorRH[] = ((colabRes.data as any[]) || []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        cargo: p.cargo,
        departamento: p.departamento,
        data_admissao: p.data_admissao,
        salario: p.salario,
        tipo: "colaborador",
        ativo: true,
      }));

      const driverVehicles = new Map<string, { plates: string[]; anyActive: boolean }>();
      ((vehRes.data as any[]) || []).forEach((v) => {
        const entry = driverVehicles.get(v.driver_id) || { plates: [], anyActive: false };
        entry.plates.push(v.plate);
        if (v.is_active) entry.anyActive = true;
        driverVehicles.set(v.driver_id, entry);
      });

      let motoristasList: ColaboradorRH[] = [];
      const driverIds = Array.from(driverVehicles.keys());
      if (driverIds.length > 0) {
        const { data: drivers } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone, cargo, departamento, data_admissao, salario")
          .in("id", driverIds);
        motoristasList = ((drivers as any[]) || [])
          .filter((d) => !colaboradoresList.some((c) => c.id === d.id))
          .map((d) => {
            const info = driverVehicles.get(d.id)!;
            return {
              id: d.id,
              full_name: d.full_name,
              email: d.email,
              phone: d.phone,
              cargo: d.cargo || "Motorista",
              departamento: d.departamento || "Frota Própria",
              data_admissao: d.data_admissao,
              salario: d.salario,
              tipo: "motorista_frota_propria" as const,
              ativo: info.anyActive,
              vehicle_plates: info.plates,
            };
          });
      }

      const merged = [...colaboradoresList, ...motoristasList].sort((a, b) =>
        a.full_name.localeCompare(b.full_name)
      );

      setColaboradores(merged);
      const accs = (accRes.data as any[]) || [];
      setAccounts(accs);

      // Auto-detect default accounts if not set yet
      setSettings((prev) => {
        const next = { ...prev };
        if (!next.folhaAccountId) {
          const found = accs.find((a) => a.tipo === "despesa" && isFolhaAccount(a));
          if (found) next.folhaAccountId = found.id;
        }
        if (!next.adiantamentoAccountId) {
          const found = accs.find((a) => a.tipo === "despesa" && isAdiantAccount(a));
          if (found) next.adiantamentoAccountId = found.id;
        }
        if (next.folhaAccountId !== prev.folhaAccountId || next.adiantamentoAccountId !== prev.adiantamentoAccountId) {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
        }
        return next;
      });
      setLoading(false);
    })();
  }, []);

  // Load expenses for current colaboradores + month (re-runs on refreshTick)
  useEffect(() => {
    (async () => {
      const colabIds = colaboradores.map((c) => c.id);
      if (colabIds.length === 0) {
        setExpenses([]);
        return;
      }
      const { start, end } = monthRange(month);
      const { data } = await supabase
        .from("expenses")
        .select(
          "id, descricao, valor_total, valor_pago, status, data_emissao, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id"
        )
        .in("favorecido_id", colabIds)
        .is("deleted_at", null)
        .gte("data_emissao", start)
        .lt("data_emissao", end)
        .order("data_emissao", { ascending: false });
      setExpenses((data as any) || []);
    })();
  }, [colaboradores, month]);

  // Realtime listeners: refresh whenever a relevant expense or payment changes
  useEffect(() => {
    if (colaboradores.length === 0) return;
    const colabSet = new Set(colaboradores.map((c) => c.id));
    const folhaId = settings.folhaAccountId;
    const adiantId = settings.adiantamentoAccountId;

    const isRelevant = (row: any) => {
      if (!row) return false;
      if (row.favorecido_id && colabSet.has(row.favorecido_id)) {
        if (!folhaId && !adiantId) return true;
        return row.plano_contas_id === folhaId || row.plano_contas_id === adiantId;
      }
      return false;
    };

    const channel = supabase
      .channel("rh-financial-listener")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses" },
        (payload) => {
          if (isRelevant(payload.new) || isRelevant(payload.old)) {
            bumpRefresh();
            // Force re-fetch by toggling month dependency indirectly:
            setExpenses((prev) => [...prev]);
            // Re-run loader
            (async () => {
              const colabIds = colaboradores.map((c) => c.id);
              const { start, end } = monthRange(month);
              const { data } = await supabase
                .from("expenses")
                .select(
                  "id, descricao, valor_total, valor_pago, status, data_emissao, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id"
                )
                .in("favorecido_id", colabIds)
                .is("deleted_at", null)
                .gte("data_emissao", start)
                .lt("data_emissao", end)
                .order("data_emissao", { ascending: false });
              setExpenses((data as any) || []);
            })();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expense_payments" },
        () => {
          // Payments don't carry favorecido directly — refresh defensively
          bumpRefresh();
        }
      )
      .subscribe((status) => {
        setRealtimeActive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setRealtimeActive(false);
    };
  }, [colaboradores, month, settings.folhaAccountId, settings.adiantamentoAccountId, bumpRefresh]);

  const colabById = useMemo(() => {
    const m = new Map<string, ColaboradorRH>();
    colaboradores.forEach((c) => m.set(c.id, c));
    return m;
  }, [colaboradores]);

  const folhaExpenses = useMemo(
    () =>
      expenses.filter((e) =>
        settings.folhaAccountId ? e.plano_contas_id === settings.folhaAccountId : false
      ),
    [expenses, settings.folhaAccountId]
  );
  const adiantExpenses = useMemo(
    () =>
      expenses.filter((e) =>
        settings.adiantamentoAccountId
          ? e.plano_contas_id === settings.adiantamentoAccountId
          : false
      ),
    [expenses, settings.adiantamentoAccountId]
  );

  const totalFolha = folhaExpenses.reduce((s, e) => s + Number(e.valor_total || 0), 0);
  const totalAdiant = adiantExpenses.reduce((s, e) => s + Number(e.valor_total || 0), 0);
  const totalAtivos = colaboradores.filter((c) => c.ativo).length;

  // Per-colaborador derived metrics for the selected month — 100% from financeiro
  const metricsByColab = useMemo(() => {
    const m = new Map<string, { recebido: number; adiantamentos: number; folhaTotal: number; folhaPago: number; saldoDevedor: number }>();
    colaboradores.forEach((c) => m.set(c.id, { recebido: 0, adiantamentos: 0, folhaTotal: 0, folhaPago: 0, saldoDevedor: 0 }));
    folhaExpenses.forEach((e) => {
      if (!e.favorecido_id) return;
      const r = m.get(e.favorecido_id);
      if (!r) return;
      r.folhaTotal += Number(e.valor_total || 0);
      r.folhaPago += Number(e.valor_pago || 0);
      r.recebido += Number(e.valor_pago || 0);
    });
    adiantExpenses.forEach((e) => {
      if (!e.favorecido_id) return;
      const r = m.get(e.favorecido_id);
      if (!r) return;
      r.adiantamentos += Number(e.valor_total || 0);
    });
    // Saldo devedor: o que ainda falta receber da folha do mês (lançado - já pago)
    m.forEach((r) => {
      r.saldoDevedor = Math.max(0, r.folhaTotal - r.folhaPago);
    });
    return m;
  }, [colaboradores, folhaExpenses, adiantExpenses]);

  const filteredColabs = colaboradores.filter((c) => {
    if (tipoFilter !== "all" && c.tipo !== tipoFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.full_name?.toLowerCase().includes(q) ||
      c.cargo?.toLowerCase().includes(q) ||
      c.departamento?.toLowerCase().includes(q)
    );
  });

  const saveSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    toast.success("Configurações salvas");
  };

  const enrichName = (e: Expense) =>
    (e.favorecido_id && colabById.get(e.favorecido_id)?.full_name) || e.favorecido_nome || "—";

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Recursos Humanos</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              Visão consolidada da folha, adiantamentos e colaboradores
              {realtimeActive && (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <Radio className="h-3 w-3 animate-pulse" /> em tempo real
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Mês</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 w-[160px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard icon={Wallet} label="Folha do mês" value={formatBRL(totalFolha)} valueColor="primary" />
          <SummaryCard icon={HandCoins} label="Adiantamentos" value={formatBRL(totalAdiant)} valueColor="default" />
          <SummaryCard icon={Users} label="Colaboradores ativos" value={totalAtivos} valueColor="green" />
        </div>

        <Tabs defaultValue="colaboradores" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
            <TabsTrigger value="folha_mensal">Folha Mensal</TabsTrigger>
            <TabsTrigger value="folha">Lançamentos Folha</TabsTrigger>
            <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="colaboradores" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative max-w-sm flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por nome, cargo ou departamento..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v as typeof tipoFilter)}>
                    <SelectTrigger className="h-9 w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="colaborador">Colaborador</SelectItem>
                      <SelectItem value="motorista_frota_propria">Motorista (Frota Própria)</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {filteredColabs.length} de {colaboradores.length}
                  </span>
                </div>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : filteredColabs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredColabs.map((c) => (
                      <Card key={`${c.tipo}-${c.id}`} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-3.5 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm truncate">{c.full_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.cargo || "—"}</p>
                            </div>
                            {c.salario != null && (
                              <Badge variant="secondary" className="shrink-0">
                                {formatBRL(Number(c.salario))}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {c.tipo === "colaborador" ? "Colaborador" : "Motorista (Frota Própria)"}
                            </Badge>
                            <Badge
                              className={`text-[10px] px-1.5 py-0 ${
                                c.ativo
                                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                                  : "bg-muted text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {c.ativo ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground space-y-0.5">
                            {c.departamento && (
                              <div className="flex items-center gap-1">
                                <Briefcase className="h-3 w-3" />
                                <span>{c.departamento}</span>
                              </div>
                            )}
                            {c.vehicle_plates && c.vehicle_plates.length > 0 && (
                              <div className="truncate">Veículo(s): {c.vehicle_plates.join(", ")}</div>
                            )}
                            {c.data_admissao && (
                              <div>Admissão: {new Date(c.data_admissao).toLocaleDateString("pt-BR")}</div>
                            )}
                            {c.email && <div className="truncate">{c.email}</div>}
                          </div>
                          <div className="pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => setHistoryFor(c)}
                            >
                              <History className="h-3 w-3" /> Histórico financeiro
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="folha_mensal" className="mt-4">
            <FolhaMensalTab
              colaboradores={colaboradores}
              month={month}
              expenses={expenses}
              folhaAccountId={settings.folhaAccountId}
              adiantamentoAccountId={settings.adiantamentoAccountId}
              salaryOverrides={settings.salaryOverrides || {}}
              payDay={settings.payDay}
              onSalaryOverride={(id, value) => {
                setSettings((s) => {
                  const next = { ...s, salaryOverrides: { ...(s.salaryOverrides || {}), [id]: value } };
                  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
                  return next;
                });
              }}
              onGenerated={bumpRefresh}
            />
          </TabsContent>

          <TabsContent value="folha" className="mt-4">
            <Card>
              <CardContent className="p-4">
                <ExpenseList
                  items={folhaExpenses}
                  enrichName={enrichName}
                  emptyHint={
                    settings.folhaAccountId
                      ? "Nenhum lançamento de folha neste mês."
                      : "Nenhuma conta 'Salários' detectada. Defina em Configurações."
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="adiantamentos" className="mt-4">
            <Card>
              <CardContent className="p-4">
                <ExpenseList
                  items={adiantExpenses}
                  enrichName={enrichName}
                  emptyHint={
                    settings.adiantamentoAccountId
                      ? "Nenhum adiantamento neste mês."
                      : "Nenhuma conta 'Adiantamentos / Vales' detectada. Defina em Configurações."
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-4 max-w-xl">
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta contábil — Folha de Pagamento (Salários)</Label>
                  <Select
                    value={settings.folhaAccountId || ""}
                    onValueChange={(v) => setSettings((s) => ({ ...s, folhaAccountId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.tipo === "despesa")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.codigo} — {a.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta contábil — Adiantamentos / Vales</Label>
                  <Select
                    value={settings.adiantamentoAccountId || ""}
                    onValueChange={(v) => setSettings((s) => ({ ...s, adiantamentoAccountId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter((a) => a.tipo === "despesa")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.codigo} — {a.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dia padrão de pagamento da folha</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={settings.payDay || ""}
                    onChange={(e) => setSettings((s) => ({ ...s, payDay: e.target.value }))}
                    className="h-9 w-32"
                    placeholder="Ex: 5"
                  />
                </div>
                <Button onClick={saveSettings} className="gap-2">
                  <Save className="h-4 w-4" /> Salvar configurações
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  As contas padrão são detectadas automaticamente pelos nomes "Salários" e
                  "Adiantamentos / Vales". Você pode sobrescrever a seleção aqui.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <ColaboradorHistorySheet
        colaborador={historyFor}
        onClose={() => setHistoryFor(null)}
        folhaAccountId={settings.folhaAccountId}
        adiantamentoAccountId={settings.adiantamentoAccountId}
      />
    </AdminLayout>
  );
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pago: { label: "Pago", cls: "bg-green-100 text-green-700" },
    pendente: { label: "Pendente", cls: "bg-amber-100 text-amber-700" },
    parcial: { label: "Parcial", cls: "bg-blue-100 text-blue-700" },
    atrasado: { label: "Atrasado", cls: "bg-red-100 text-red-700" },
    cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[s] || { label: s, cls: "bg-muted text-muted-foreground" };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${v.cls}`}>{v.label}</span>;
}

function ExpenseList({
  items,
  emptyHint,
  enrichName,
}: {
  items: Expense[];
  emptyHint: string;
  enrichName?: (e: Expense) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }
  const total = items.reduce((s, e) => s + Number(e.valor_total || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{items.length} lançamento(s)</span>
        <span className="font-semibold text-foreground">Total: {formatBRL(total)}</span>
      </div>
      <div className="divide-y divide-border rounded-md border border-border">
        {items.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{e.descricao}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {(enrichName ? enrichName(e) : e.favorecido_nome) || "—"} · Emissão{" "}
                {new Date(e.data_emissao).toLocaleDateString("pt-BR")}
                {e.data_vencimento ? ` · Venc. ${new Date(e.data_vencimento).toLocaleDateString("pt-BR")}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {statusBadge(e.status)}
              <span className="font-semibold tabular-nums">{formatBRL(Number(e.valor_total))}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColaboradorHistorySheet({
  colaborador,
  onClose,
  folhaAccountId,
  adiantamentoAccountId,
}: {
  colaborador: ColaboradorRH | null;
  onClose: () => void;
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
}) {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!colaborador) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const accountIds = [folhaAccountId, adiantamentoAccountId].filter(Boolean) as string[];
      let q = supabase
        .from("expenses")
        .select(
          "id, descricao, valor_total, valor_pago, status, data_emissao, data_vencimento, data_pagamento, favorecido_id, favorecido_nome, plano_contas_id"
        )
        .eq("favorecido_id", colaborador.id)
        .is("deleted_at", null)
        .order("data_emissao", { ascending: false })
        .limit(100);
      if (accountIds.length > 0) q = q.in("plano_contas_id", accountIds);
      const { data } = await q;
      if (!cancelled) {
        setItems((data as any) || []);
        setLoading(false);
      }
    };
    load();

    // Realtime per-colaborador
    const channel = supabase
      .channel(`rh-history-${colaborador.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `favorecido_id=eq.${colaborador.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [colaborador, folhaAccountId, adiantamentoAccountId]);

  const total = items.reduce((s, e) => s + Number(e.valor_total || 0), 0);
  const totalPago = items.reduce((s, e) => s + Number(e.valor_pago || 0), 0);

  const now = new Date();
  const ymCurrent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const inCurrentMonth = (d: string | null) => !!d && d.slice(0, 7) === ymCurrent;

  const folhaItems = items.filter((e) => folhaAccountId && e.plano_contas_id === folhaAccountId);
  const adiantItems = items.filter((e) => adiantamentoAccountId && e.plano_contas_id === adiantamentoAccountId);

  const totalRecebidoMes = folhaItems
    .filter((e) => inCurrentMonth(e.data_pagamento))
    .reduce((s, e) => s + Number(e.valor_pago || 0), 0);
  const totalAdiantMes = adiantItems
    .filter((e) => inCurrentMonth(e.data_pagamento) || inCurrentMonth(e.data_emissao))
    .reduce((s, e) => s + Number(e.valor_total || 0), 0);
  const saldoAtual = totalRecebidoMes - totalAdiantMes;

  return (
    <Sheet open={!!colaborador} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalhes do colaborador</SheetTitle>
          <SheetDescription>{colaborador?.full_name}</SheetDescription>
        </SheetHeader>

        {colaborador && (
          <div className="mt-4 space-y-4">
            {/* Dados básicos */}
            <div className="rounded-md border border-border p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {colaborador.tipo === "colaborador" ? "Colaborador" : "Motorista (Frota Própria)"}
                </Badge>
                <Badge
                  className={`text-[10px] ${
                    colaborador.ativo
                      ? "bg-green-100 text-green-700 hover:bg-green-100"
                      : "bg-muted text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {colaborador.ativo ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1">
                {colaborador.cargo && <div><span className="text-foreground font-medium">Cargo:</span> {colaborador.cargo}</div>}
                {colaborador.departamento && <div><span className="text-foreground font-medium">Depto:</span> {colaborador.departamento}</div>}
                {colaborador.email && <div className="col-span-2 truncate"><span className="text-foreground font-medium">Email:</span> {colaborador.email}</div>}
                {colaborador.phone && <div><span className="text-foreground font-medium">Tel:</span> {colaborador.phone}</div>}
                {colaborador.data_admissao && <div><span className="text-foreground font-medium">Admissão:</span> {new Date(colaborador.data_admissao).toLocaleDateString("pt-BR")}</div>}
                {colaborador.salario != null && <div><span className="text-foreground font-medium">Salário:</span> {formatBRL(Number(colaborador.salario))}</div>}
                {colaborador.vehicle_plates && colaborador.vehicle_plates.length > 0 && (
                  <div className="col-span-2"><span className="text-foreground font-medium">Veículos:</span> {colaborador.vehicle_plates.join(", ")}</div>
                )}
              </div>
            </div>

            {/* Resumo do mês */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-border p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Recebido no mês</p>
                <p className="text-sm font-semibold text-green-600">{formatBRL(totalRecebidoMes)}</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Adiantamentos</p>
                <p className="text-sm font-semibold text-amber-600">{formatBRL(totalAdiantMes)}</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="text-[10px] uppercase text-muted-foreground">Saldo atual</p>
                <p className={`text-sm font-semibold ${saldoAtual >= 0 ? "text-foreground" : "text-destructive"}`}>
                  {formatBRL(saldoAtual)}
                </p>
              </div>
            </div>

            {/* Totais gerais */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Total lançado (geral)</p>
                <p className="text-base font-semibold">{formatBRL(total)}</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Total pago (geral)</p>
                <p className="text-base font-semibold text-green-600">{formatBRL(totalPago)}</p>
              </div>
            </div>

            {/* Histórico financeiro */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Histórico financeiro (somente leitura)</p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem lançamentos para este colaborador.</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {items.map((e) => {
                    const isAdiant = adiantamentoAccountId && e.plano_contas_id === adiantamentoAccountId;
                    return (
                      <div key={e.id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium truncate">{e.descricao}</p>
                          <span className="font-semibold tabular-nums">{formatBRL(Number(e.valor_total))}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 mr-1">
                              {isAdiant ? "Adiantamento" : "Folha"}
                            </Badge>
                            {new Date(e.data_emissao).toLocaleDateString("pt-BR")}
                            {e.data_vencimento ? ` · Venc. ${new Date(e.data_vencimento).toLocaleDateString("pt-BR")}` : ""}
                            {e.data_pagamento ? ` · Pago ${new Date(e.data_pagamento).toLocaleDateString("pt-BR")}` : ""}
                          </p>
                          {statusBadge(e.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ===========================
// Folha Mensal — generation
// ===========================
function FolhaMensalTab({
  colaboradores,
  month,
  expenses,
  folhaAccountId,
  adiantamentoAccountId,
  salaryOverrides,
  payDay,
  onSalaryOverride,
  onGenerated,
}: {
  colaboradores: ColaboradorRH[];
  month: string;
  expenses: Expense[];
  folhaAccountId?: string;
  adiantamentoAccountId?: string;
  salaryOverrides: Record<string, number>;
  payDay?: string;
  onSalaryOverride: (id: string, value: number) => void;
  onGenerated: () => void;
}) {
  const { matrizId } = useUnifiedCompany();
  const { user } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [generating, setGenerating] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const baseSalary = (c: ColaboradorRH) => {
    const ov = salaryOverrides[c.id];
    if (typeof ov === "number" && !isNaN(ov)) return ov;
    return Number(c.salario || 0);
  };

  const folhaThisMonthByColab = useMemo(() => {
    const map = new Map<string, Expense>();
    if (!folhaAccountId) return map;
    expenses
      .filter((e) => e.plano_contas_id === folhaAccountId && e.favorecido_id)
      .forEach((e) => {
        if (!map.has(e.favorecido_id!)) map.set(e.favorecido_id!, e);
      });
    return map;
  }, [expenses, folhaAccountId]);

  const adiantByColab = useMemo(() => {
    const map = new Map<string, number>();
    if (!adiantamentoAccountId) return map;
    expenses
      .filter((e) => e.plano_contas_id === adiantamentoAccountId && e.favorecido_id)
      .forEach((e) => {
        map.set(e.favorecido_id!, (map.get(e.favorecido_id!) || 0) + Number(e.valor_total || 0));
      });
    return map;
  }, [expenses, adiantamentoAccountId]);

  const dueDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const day = Math.min(Math.max(parseInt(payDay || "5", 10) || 5, 1), 28);
    const next = new Date(y, m, day);
    return next.toISOString().slice(0, 10);
  }, [month, payDay]);

  const emissionDate = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m, 0).toISOString().slice(0, 10);
  }, [month]);

  const rows = useMemo(() => {
    return colaboradores
      .filter((c) => c.ativo)
      .map((c) => {
        const salary = baseSalary(c);
        const adiant = adiantByColab.get(c.id) || 0;
        const liquido = Math.max(0, salary - adiant);
        const existing = folhaThisMonthByColab.get(c.id);
        return { c, salary, adiant, liquido, existing };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaboradores, salaryOverrides, adiantByColab, folhaThisMonthByColab]);

  const totalSalarios = rows.reduce((s, r) => s + r.salary, 0);
  const totalAdiant = rows.reduce((s, r) => s + r.adiant, 0);
  const totalLiquido = rows.reduce((s, r) => s + r.liquido, 0);

  const handleGenerate = async (row: (typeof rows)[number]) => {
    if (!folhaAccountId) {
      toast.error("Configure a conta 'Salários' em Configurações antes de gerar a folha.");
      return;
    }
    if (!matrizId) {
      toast.error("Empresa não identificada.");
      return;
    }
    if (!user?.id) {
      toast.error("Usuário não autenticado.");
      return;
    }
    if (row.liquido <= 0) {
      toast.error("Valor líquido deve ser maior que zero.");
      return;
    }

    const ok = await confirm({
      title: "Gerar pagamento de folha?",
      description: `Será criada uma despesa em Contas a Pagar para ${row.c.full_name} no valor de ${formatBRL(row.liquido)} (vencimento ${new Date(dueDate).toLocaleDateString("pt-BR")}).`,
      confirmLabel: "Gerar",
    });
    if (!ok) return;

    setGenerating(row.c.id);
    const { error } = await supabase.from("expenses").insert({
      empresa_id: matrizId,
      created_by: user.id,
      descricao: `Folha de pagamento ${month} — ${row.c.full_name}`,
      valor_total: row.liquido,
      data_emissao: emissionDate,
      data_vencimento: dueDate,
      favorecido_id: row.c.id,
      favorecido_nome: row.c.full_name,
      plano_contas_id: folhaAccountId,
      tipo_despesa: "outros",
      centro_custo: "administrativo",
      origem: "manual",
      status: "pendente",
      observacoes: `Gerado pelo módulo RH. Salário base: ${formatBRL(row.salary)}. Adiantamentos descontados: ${formatBRL(row.adiant)}.`,
    } as any);
    setGenerating(null);

    if (error) {
      toast.error("Erro ao gerar pagamento: " + error.message);
      return;
    }
    toast.success(`Folha gerada para ${row.c.full_name}`);
    onGenerated();
  };

  const startEdit = (id: string, current: number) => {
    setEditingId(id);
    setEditValue(String(current));
  };
  const commitEdit = (id: string) => {
    const n = parseFloat(editValue.replace(",", "."));
    if (!isNaN(n) && n >= 0) onSalaryOverride(id, n);
    setEditingId(null);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>
            Mês de referência: <span className="font-semibold text-foreground">{month}</span> · Vencimento padrão:{" "}
            <span className="font-semibold text-foreground">
              {new Date(dueDate).toLocaleDateString("pt-BR")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>Salários: <span className="font-semibold text-foreground">{formatBRL(totalSalarios)}</span></span>
            <span>Adiant.: <span className="font-semibold text-amber-600">{formatBRL(totalAdiant)}</span></span>
            <span>Líquido: <span className="font-semibold text-primary">{formatBRL(totalLiquido)}</span></span>
          </div>
        </div>

        {!folhaAccountId && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Configure a conta "Salários" em Configurações para habilitar a geração de pagamentos.
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum colaborador ativo.</p>
        ) : (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-right px-3 py-2">Salário base</th>
                  <th className="text-right px-3 py-2">Adiantamentos</th>
                  <th className="text-right px-3 py-2">Líquido</th>
                  <th className="text-right px-3 py-2">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.c.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.c.full_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {r.c.tipo === "colaborador" ? "Colaborador" : "Motorista"}
                        {r.c.cargo ? ` · ${r.c.cargo}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editingId === r.c.id ? (
                        <div className="inline-flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-7 w-28 text-right"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(r.c.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => commitEdit(r.c.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => startEdit(r.c.id, r.salary)}
                          title="Editar salário base"
                        >
                          {formatBRL(r.salary)}
                          <Pencil className="h-3 w-3 opacity-60" />
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">
                      {r.adiant > 0 ? `- ${formatBRL(r.adiant)}` : formatBRL(0)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {formatBRL(r.liquido)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.existing ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
                          Gerado · {statusLabel(r.existing.status)}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() => handleGenerate(r)}
                          disabled={!folhaAccountId || generating === r.c.id || r.liquido <= 0}
                        >
                          <Play className="h-3 w-3" />
                          {generating === r.c.id ? "Gerando..." : "Gerar pagamento"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          A geração cria uma despesa em <span className="font-medium">Contas a Pagar</span> na categoria "Salários".
          A quitação e a movimentação de caixa seguem o fluxo financeiro existente.
        </p>
      </CardContent>
      {ConfirmDialog}
    </Card>
  );
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pago: "Pago",
    pendente: "Pendente",
    parcial: "Parcial",
    atrasado: "Atrasado",
    cancelado: "Cancelado",
  };
  return map[s] || s;
}
