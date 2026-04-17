import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { SummaryCard } from "@/components/SummaryCard";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Wallet, HandCoins, Briefcase, Search, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
type RHSettings = { folhaAccountId?: string; adiantamentoAccountId?: string; payDay?: string };

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
};

export default function AdminRH() {
  const [loading, setLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState<ColaboradorRH[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
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

      // Group own-fleet vehicles by driver
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
      setAccounts((accRes.data as any) || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const colabIds = colaboradores.map((c) => c.id);
      if (colabIds.length === 0) {
        setExpenses([]);
        return;
      }
      const { start, end } = monthRange(month);
      // Pull a wide window (current month +/- to allow vencimento/pagamento spans)
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

  const filteredColabs = colaboradores.filter((c) => {
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

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">Recursos Humanos</h1>
            <p className="text-xs text-muted-foreground">
              Visão consolidada da folha, adiantamentos e colaboradores
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
          <TabsList>
            <TabsTrigger value="colaboradores">Colaboradores</TabsTrigger>
            <TabsTrigger value="folha">Folha de Pagamento</TabsTrigger>
            <TabsTrigger value="adiantamentos">Adiantamentos</TabsTrigger>
            <TabsTrigger value="config">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="colaboradores" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, cargo ou departamento..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="folha" className="mt-4">
            <Card>
              <CardContent className="p-4">
                <ExpenseList
                  items={folhaExpenses}
                  emptyHint={
                    settings.folhaAccountId
                      ? "Nenhum lançamento de folha neste mês."
                      : "Defina a conta contábil de Folha em Configurações para ativar esta visão."
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
                  emptyHint={
                    settings.adiantamentoAccountId
                      ? "Nenhum adiantamento neste mês."
                      : "Defina a conta contábil de Adiantamentos em Configurações para ativar esta visão."
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-4 max-w-xl">
                <div className="space-y-1.5">
                  <Label className="text-xs">Conta contábil padrão — Folha de Pagamento</Label>
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
                  <Label className="text-xs">Conta contábil padrão — Adiantamentos / Vales</Label>
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
                  As configurações são armazenadas localmente neste dispositivo.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
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

function ExpenseList({ items, emptyHint }: { items: Expense[]; emptyHint: string }) {
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
                {e.favorecido_nome || "—"} · Emissão {new Date(e.data_emissao).toLocaleDateString("pt-BR")}
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
