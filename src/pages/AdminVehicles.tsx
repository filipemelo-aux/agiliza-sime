import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Plus, Search, Pencil, Trash2, Eye, Truck, Fuel, Gauge, DollarSign, Droplet } from "lucide-react";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { VehicleFormModal } from "@/components/VehicleFormModal";
import { useSortableTable } from "@/hooks/useSortableTable";
import { SortableTh } from "@/components/ui/sortable-th";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: "Truck", bitruck: "Bitruck", carreta: "Carreta", carreta_ls: "LS",
  rodotrem: "Rodotrem", bitrem: "Bitrem", treminhao: "Treminhão",
  utilitario: "Utilitário", passeio: "Passeio",
};

const TRUCK_TYPES = new Set(["truck", "bitruck", "carreta", "carreta_ls", "rodotrem", "bitrem", "treminhao"]);

const TRAILER_LABELS: Record<string, string[]> = {
  carreta: ["Carreta"], carreta_ls: ["Carreta"],
  bitrem: ["1ª Carreta", "2ª Carreta"],
  rodotrem: ["1ª Carreta", "Dolly", "2ª Carreta"],
  treminhao: ["1º Reboque", "2º Reboque"],
};

interface VehicleRow {
  id: string; user_id: string; plate: string; brand: string; model: string;
  year: number; vehicle_type: string; cargo_type: string | null;
  trailer_plate_1: string | null; trailer_plate_2: string | null; trailer_plate_3: string | null;
  driver_id: string | null; owner_id: string | null;
  driver_name?: string; owner_name?: string;
}

interface FuelingRow {
  id: string; veiculo_id: string; data_abastecimento: string;
  quantidade_litros: number; valor_total: number; km_atual: number | null;
  posto_combustivel: string | null; tipo_combustivel: string;
}

interface VehicleMetrics {
  lastKm: number | null;
  litersMonth: number;
  spentMonth: number;
  avgKmL: number | null;
  history: FuelingRow[];
}

function computeMetrics(fuelings: FuelingRow[]): VehicleMetrics {
  const sorted = [...fuelings].sort((a, b) => {
    const d = a.data_abastecimento.localeCompare(b.data_abastecimento);
    if (d !== 0) return d;
    return (Number(a.km_atual) || 0) - (Number(b.km_atual) || 0);
  });
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let litersMonth = 0, spentMonth = 0;
  for (const f of sorted) {
    if ((f.data_abastecimento || "").startsWith(ym)) {
      litersMonth += Number(f.quantidade_litros) || 0;
      spentMonth += Number(f.valor_total) || 0;
    }
  }
  // avg km/L using consecutive pairs
  let totalKm = 0, totalL = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    const kmPrev = Number(prev.km_atual) || 0;
    const kmCur = Number(cur.km_atual) || 0;
    const liters = Number(cur.quantidade_litros) || 0;
    if (kmPrev > 0 && kmCur > kmPrev && liters > 0) {
      totalKm += kmCur - kmPrev;
      totalL += liters;
    }
  }
  const avgKmL = totalL > 0 ? totalKm / totalL : null;
  const lastWithKm = [...sorted].reverse().find(f => Number(f.km_atual) > 0);
  return {
    lastKm: lastWithKm ? Number(lastWithKm.km_atual) : null,
    litersMonth, spentMonth, avgKmL,
    history: [...sorted].reverse(),
  };
}

export default function AdminVehicles() {
  const { isAdmin, isModerator, isOperador, hasAdminAccess, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [fuelingsByVehicle, setFuelingsByVehicle] = useState<Record<string, FuelingRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("__all__");

  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [deleteVehicle, setDeleteVehicle] = useState<VehicleRow | null>(null);
  const [viewVehicle, setViewVehicle] = useState<VehicleRow | null>(null);

  useEffect(() => {
    if (!roleLoading && !hasAdminAccess) {
      const timer = setTimeout(() => navigate("/"), 100);
      return () => clearTimeout(timer);
    }
  }, [roleLoading]);

  useEffect(() => {
    if (hasAdminAccess) fetchVehicles();
  }, [isAdmin, isModerator]);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const [vehiclesRes, profilesRes, fuelingsRes] = await Promise.all([
        supabase.from("vehicles").select("*").order("brand"),
        supabase.from("profiles").select("user_id, full_name"),
        supabase.from("fuelings")
          .select("id, veiculo_id, data_abastecimento, quantidade_litros, valor_total, km_atual, posto_combustivel, tipo_combustivel")
          .is("deleted_at", null)
          .order("data_abastecimento", { ascending: false })
          .limit(5000),
      ]);
      const profiles = profilesRes.data || [];
      const vehicleRows: VehicleRow[] = (vehiclesRes.data || []).map((v: any) => {
        const driver = profiles.find((p: any) => p.user_id === v.driver_id);
        const owner = profiles.find((p: any) => p.user_id === v.owner_id);
        return { ...v, driver_name: driver?.full_name, owner_name: owner?.full_name };
      });
      const fuelMap: Record<string, FuelingRow[]> = {};
      for (const f of (fuelingsRes.data || []) as FuelingRow[]) {
        if (!fuelMap[f.veiculo_id]) fuelMap[f.veiculo_id] = [];
        fuelMap[f.veiculo_id].push(f);
      }
      setFuelingsByVehicle(fuelMap);
      setVehicles(vehicleRows);
    } catch (error: any) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setLoading(false);
    }
  };

  const metricsByVehicle = useMemo(() => {
    const out: Record<string, VehicleMetrics> = {};
    for (const vid of Object.keys(fuelingsByVehicle)) {
      out[vid] = computeMetrics(fuelingsByVehicle[vid] || []);
    }
    return out;
  }, [fuelingsByVehicle]);

  const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtNum = (v: number, d = 0) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });


  const handleDeleteVehicle = async () => {
    if (!deleteVehicle) return;
    try {
      const { error } = await supabase.from("vehicles").delete().eq("id", deleteVehicle.id);
      if (error) throw error;
      toast({ title: "Veículo excluído!" });
      setDeleteVehicle(null);
      fetchVehicles();
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    }
  };

  const filteredVehicles = vehicles.filter((v) => {
    const matchType = filterType === "__all__" ||
      (filterType === "caminhao" && TRUCK_TYPES.has(v.vehicle_type)) ||
      (filterType === "leve" && !TRUCK_TYPES.has(v.vehicle_type));
    const matchSearch =
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      v.brand.toLowerCase().includes(search.toLowerCase()) ||
      v.model.toLowerCase().includes(search.toLowerCase()) ||
      (v.driver_name && v.driver_name.toLowerCase().includes(search.toLowerCase())) ||
      (v.owner_name && v.owner_name.toLowerCase().includes(search.toLowerCase()));
    return matchType && matchSearch;
  });

  type VehicleSortKey = "plate" | "vehicle" | "type" | "driver" | "owner" | "avg" | "spent";
  const { sort, toggle, sorted } = useSortableTable<VehicleRow, VehicleSortKey>(
    filteredVehicles,
    { key: "plate", direction: "asc" },
    {
      plate: (v) => v.plate || "",
      vehicle: (v) => `${v.brand || ""} ${v.model || ""}`,
      type: (v) => VEHICLE_TYPE_LABELS[v.vehicle_type] || v.vehicle_type || "",
      driver: (v) => v.driver_name || "",
      owner: (v) => v.owner_name || "",
      avg: (v) => metricsByVehicle[v.id]?.avgKmL ?? 0,
      spent: (v) => metricsByVehicle[v.id]?.spentMonth ?? 0,
    },
  );

  const countByFilter = (f: string) => {
    if (f === "__all__") return vehicles.length;
    if (f === "caminhao") return vehicles.filter(v => TRUCK_TYPES.has(v.vehicle_type)).length;
    return vehicles.filter(v => !TRUCK_TYPES.has(v.vehicle_type)).length;
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
      <main className="p-4 md:p-6 space-y-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Veículos</h1>
          <p className="text-xs text-muted-foreground">Gerencie a frota de veículos do sistema</p>
        </div>

        {(() => {
          const totals = Object.values(metricsByVehicle).reduce(
            (acc, m) => {
              acc.liters += m.litersMonth;
              acc.spent += m.spentMonth;
              return acc;
            },
            { liters: 0, spent: 0 }
          );
          const withAvg = Object.values(metricsByVehicle).filter(m => m.avgKmL && m.avgKmL > 0);
          const fleetAvg = withAvg.length
            ? withAvg.reduce((s, m) => s + (m.avgKmL || 0), 0) / withAvg.length
            : null;
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card><CardContent className="p-3 flex items-center gap-2"><Droplet className="h-4 w-4 text-primary" /><div><p className="text-[10px] uppercase text-muted-foreground">Litros (mês)</p><p className="text-sm font-semibold">{fmtNum(totals.liters, 1)} L</p></div></CardContent></Card>
              <Card><CardContent className="p-3 flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /><div><p className="text-[10px] uppercase text-muted-foreground">Gasto (mês)</p><p className="text-sm font-semibold">{fmtBRL(totals.spent)}</p></div></CardContent></Card>
              <Card><CardContent className="p-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><div><p className="text-[10px] uppercase text-muted-foreground">Média Frota</p><p className="text-sm font-semibold">{fleetAvg ? `${fmtNum(fleetAvg, 2)} km/L` : "—"}</p></div></CardContent></Card>
              <Card><CardContent className="p-3 flex items-center gap-2"><Fuel className="h-4 w-4 text-primary" /><div><p className="text-[10px] uppercase text-muted-foreground">Veículos c/ Abast.</p><p className="text-sm font-semibold">{Object.keys(metricsByVehicle).length}</p></div></CardContent></Card>
            </div>
          );
        })()}

        <GlobalToolbar actions={toolbarActions} selectedCount={selected.size}>
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-muted/60 shrink-0">
            {[
              { v: "__all__", label: "Todos" },
              { v: "caminhao", label: "Caminhões" },
              { v: "leve", label: "Leves" },
            ].map((opt) => (
              <Button
                key={opt.v}
                size="sm"
                variant={filterType === opt.v ? "default" : "ghost"}
                className="h-7 px-2 text-[11px] rounded-sm gap-1"
                onClick={() => { setFilterType(opt.v); setSelected(new Set()); }}
              >
                {opt.label}
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">{countByFilter(opt.v)}</Badge>
              </Button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar placa, marca, modelo ou proprietário..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </GlobalToolbar>

        <DataGrid
          rows={filteredVehicles}
          columns={vehicleColumns}
          rowId={(v) => v.id}
          selected={selected}
          onSelectedChange={setSelected}
          loading={loading}
          minWidth={900}
          emptyMessage="Nenhum veículo encontrado."
          footer={<div className="text-[11px] text-muted-foreground">{filteredVehicles.length} veículo(s)</div>}
        />
      </main>


      <VehicleFormModal open={vehicleModalOpen} onOpenChange={setVehicleModalOpen} vehicleId={editVehicleId} onSaved={fetchVehicles} />

      <AlertDialog open={!!deleteVehicle} onOpenChange={(open) => !open && setDeleteVehicle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir veículo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o veículo <strong>{deleteVehicle?.plate}</strong> ({deleteVehicle?.brand} {deleteVehicle?.model})? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteVehicle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewVehicle} onOpenChange={(open) => !open && setViewVehicle(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Veículo</DialogTitle>
          </DialogHeader>
          {viewVehicle && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-base">{TRUCK_TYPES.has(viewVehicle.vehicle_type) ? "🚛" : "🚗"} {viewVehicle.plate}</span>
                <Badge variant="outline">{VEHICLE_TYPE_LABELS[viewVehicle.vehicle_type] || viewVehicle.vehicle_type}</Badge>
                {viewVehicle.cargo_type && <Badge variant="secondary" className="capitalize">{viewVehicle.cargo_type}</Badge>}
              </div>
              <p><span className="text-muted-foreground">Veículo:</span> {viewVehicle.brand} {viewVehicle.model} • {viewVehicle.year}</p>
              {(() => {
                const trailerLabels = TRAILER_LABELS[viewVehicle.vehicle_type] || [];
                const trailerPlates = [viewVehicle.trailer_plate_1, viewVehicle.trailer_plate_2, viewVehicle.trailer_plate_3].filter(Boolean);
                return trailerPlates.length > 0 ? (
                  <div className="space-y-1.5">
                    <span className="text-muted-foreground">Conjunto:</span>
                    {trailerPlates.map((plate, i) => (
                      <p key={i} className="ml-2">{trailerLabels[i] || `Impl. ${i+1}`}: <strong>{plate}</strong></p>
                    ))}
                  </div>
                ) : null;
              })()}
              {viewVehicle.driver_name && <p><span className="text-muted-foreground">Motorista:</span> {viewVehicle.driver_name}</p>}
              {viewVehicle.owner_name && <p><span className="text-muted-foreground">Proprietário:</span> {viewVehicle.owner_name}</p>}

              {(() => {
                const m = metricsByVehicle[viewVehicle.id];
                if (!m) return <p className="text-muted-foreground italic pt-2 border-t">Nenhum abastecimento registrado.</p>;
                return (
                  <div className="pt-3 border-t space-y-3">
                    <h4 className="font-semibold flex items-center gap-2"><Fuel className="h-4 w-4" /> Performance da Frota</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="rounded border p-2"><p className="text-[10px] uppercase text-muted-foreground">Média KM/L</p><p className="font-semibold">{m.avgKmL ? fmtNum(m.avgKmL, 2) : "—"}</p></div>
                      <div className="rounded border p-2"><p className="text-[10px] uppercase text-muted-foreground">Litros (mês)</p><p className="font-semibold">{fmtNum(m.litersMonth, 1)} L</p></div>
                      <div className="rounded border p-2"><p className="text-[10px] uppercase text-muted-foreground">Gasto (mês)</p><p className="font-semibold">{fmtBRL(m.spentMonth)}</p></div>
                      <div className="rounded border p-2"><p className="text-[10px] uppercase text-muted-foreground">Último KM</p><p className="font-semibold">{m.lastKm != null ? fmtNum(m.lastKm, 0) : "—"}</p></div>
                    </div>

                    <div>
                      <h5 className="text-xs font-semibold mb-2 text-muted-foreground uppercase">Histórico de abastecimentos</h5>
                      {m.history.length === 0 ? (
                        <p className="text-muted-foreground italic text-xs">Sem registros.</p>
                      ) : (
                        <div className="max-h-64 overflow-y-auto rounded border">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2">Data</th>
                                <th className="text-right p-2">KM</th>
                                <th className="text-right p-2">Litros</th>
                                <th className="text-right p-2">Valor</th>
                                <th className="text-left p-2">Posto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.history.slice(0, 50).map(f => (
                                <tr key={f.id} className="border-t">
                                  <td className="p-2">{f.data_abastecimento?.split("-").reverse().join("/")}</td>
                                  <td className="p-2 text-right">{f.km_atual ? fmtNum(Number(f.km_atual), 0) : "—"}</td>
                                  <td className="p-2 text-right">{fmtNum(Number(f.quantidade_litros), 1)}</td>
                                  <td className="p-2 text-right">{fmtBRL(Number(f.valor_total))}</td>
                                  <td className="p-2 truncate max-w-[140px]">{f.posto_combustivel || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
