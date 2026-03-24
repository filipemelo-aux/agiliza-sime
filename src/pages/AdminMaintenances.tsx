import { useState, useEffect, useMemo } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Wrench, Car, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface Maintenance {
  id: string;
  veiculo_id: string;
  expense_id: string | null;
  data_manutencao: string;
  odometro: number;
  tipo_manutencao: string;
  descricao: string;
  custo_total: number;
  fornecedor: string | null;
  status: string;
  proxima_manutencao_km: number | null;
  data_proxima_manutencao: string | null;
  created_at: string;
}

interface Vehicle { id: string; plate: string; brand: string; model: string; }

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  realizada: { label: "Realizada", variant: "default" },
  pendente: { label: "Pendente", variant: "secondary" },
};

export default function AdminMaintenances() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Maintenance[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVeiculo, setFilterVeiculo] = useState("all");
  const [filterTipo, setFilterTipo] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    const [{ data: mData }, { data: vData }] = await Promise.all([
      supabase.from("maintenances" as any).select("*").order("data_manutencao", { ascending: false }),
      supabase.from("vehicles").select("id, plate, brand, model").eq("is_active", true),
    ]);
    setItems((mData as any) || []);
    setVehicles((vData as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const vehicleMap = useMemo(() => {
    const m: Record<string, Vehicle> = {};
    vehicles.forEach(v => { m[v.id] = v; });
    return m;
  }, [vehicles]);

  const filtered = useMemo(() => {
    return items.filter(i => {
      const v = vehicleMap[i.veiculo_id];
      const matchSearch = !search ||
        i.descricao.toLowerCase().includes(search.toLowerCase()) ||
        (v?.plate || "").toLowerCase().includes(search.toLowerCase()) ||
        (i.fornecedor || "").toLowerCase().includes(search.toLowerCase());
      const matchVeiculo = filterVeiculo === "all" || i.veiculo_id === filterVeiculo;
      const matchTipo = filterTipo === "all" || i.tipo_manutencao === filterTipo;
      return matchSearch && matchVeiculo && matchTipo;
    });
  }, [items, search, filterVeiculo, filterTipo, vehicleMap]);

  const totalCusto = filtered.reduce((s, i) => s + Number(i.custo_total), 0);

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Manutenções</h1>
          <Button size="sm" onClick={() => navigate("/admin/financial/payables")} variant="outline" className="gap-1.5 text-xs">
            <Wrench className="h-3.5 w-3.5" /> Nova via Contas a Pagar
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-primary">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Registros</p>
              <p className="text-xl font-bold text-foreground">{filtered.length}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-warning">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Custo Total</p>
              <p className="text-xl font-bold text-foreground">R$ {totalCusto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
            </CardContent>
          </Card>
          <Card className="hidden md:block border-l-4 border-l-success">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Veículos Atendidos</p>
              <p className="text-xl font-bold text-foreground">{new Set(filtered.map(i => i.veiculo_id)).size}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por descrição, placa ou fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
          </div>
          <Select value={filterVeiculo} onValueChange={setFilterVeiculo}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Veículo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Veículos</SelectItem>
              {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="corretiva">Corretiva</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Wrench className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-muted-foreground text-sm">Nenhuma manutenção encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">Crie uma despesa de manutenção em Contas a Pagar para registrar automaticamente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(item => {
              const v = vehicleMap[item.veiculo_id];
              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{v?.plate || "—"}</p>
                          {v && <p className="text-[11px] text-muted-foreground">{v.brand} {v.model}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="text-[10px]">
                          {item.tipo_manutencao === "preventiva" ? "Preventiva" : "Corretiva"}
                        </Badge>
                        <Badge variant={STATUS_MAP[item.status]?.variant || "outline"} className="text-[10px]">
                          {STATUS_MAP[item.status]?.label || item.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-foreground line-clamp-2">{item.descricao}</p>
                    {item.fornecedor && <p className="text-xs text-muted-foreground">Fornecedor: {item.fornecedor}</p>}

                    {/* Info grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Data</span>
                        <p className="font-medium text-foreground">{format(new Date(item.data_manutencao + "T12:00:00"), "dd/MM/yyyy")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">KM</span>
                        <p className="font-mono font-medium text-foreground">{Number(item.odometro).toLocaleString("pt-BR")}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Custo</span>
                        <p className="font-mono font-semibold text-foreground">
                          R$ {Number(item.custo_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {item.expense_id && (
                      <div className="pt-1 border-t border-border">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-primary"
                          onClick={() => navigate("/admin/financial/payables", { state: { highlightExpenseId: item.expense_id } })}
                        >
                          <DollarSign className="h-3.5 w-3.5" /> Ver conta vinculada
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
