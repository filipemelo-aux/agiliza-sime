import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Fuel, Printer, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { FuelOrderFormDialog } from "@/components/fuel/FuelOrderFormDialog";
import { FuelOrderEmailDialog } from "@/components/fuel/FuelOrderEmailDialog";
import { printFuelOrderPDF } from "@/components/fuel/exportFuelOrderPdf";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-500",
  enviada: "bg-blue-500/10 text-blue-500",
  aprovada: "bg-emerald-500/10 text-emerald-500",
  cancelada: "bg-red-500/10 text-red-500",
};

export default function AdminFuelOrders() {
  const { user } = useUserRole();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [driverMap, setDriverMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [emailOrder, setEmailOrder] = useState<any | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [ordersRes, estRes] = await Promise.all([
      supabase
        .from("fuel_orders")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("fiscal_establishments")
        .select("id, razao_social, cnpj, nome_fantasia, type")
        .eq("active", true)
        .order("type"),
    ]);
    const ordersList = ordersRes.data || [];
    setOrders(ordersList);
    setEstablishments(estRes.data || []);

    // Fetch driver names for vehicles linked to orders
    const vehicleIds = [...new Set(ordersList.map((o) => o.vehicle_id).filter(Boolean))];
    if (vehicleIds.length > 0) {
      const { data: vehs } = await supabase
        .from("vehicles")
        .select("id, driver_id")
        .in("id", vehicleIds);
      const driverIds = [...new Set((vehs || []).map((v) => v.driver_id).filter(Boolean))];
      if (driverIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, full_name")
          .in("user_id", driverIds);
        const vehDriverMap = new Map((vehs || []).map((v) => [v.id, v.driver_id]));
        const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
        const finalMap = new Map<string, string>();
        vehDriverMap.forEach((dId, vId) => {
          if (dId && nameMap.has(dId)) finalMap.set(vId, nameMap.get(dId)!);
        });
        setDriverMap(finalMap);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreated = async (order: any) => {
    setShowForm(false);
    fetchData();
    toast({ title: "Ordem criada", description: `Ordem #${order.order_number} gerada com sucesso.` });
  };

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-display">Ordens de Abastecimento</h1>
            <p className="text-sm text-muted-foreground">Gerencie ordens de abastecimento de veículos</p>
          </div>
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova Ordem
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 gap-3">
              <Fuel className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma ordem de abastecimento encontrada</p>
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Criar primeira ordem
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders.map((o) => {
              const est = establishments.find((e) => e.id === o.establishment_id);
              return (
                <Card key={o.id} className="flex flex-col">
                  <CardContent className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-base">#{o.order_number}</span>
                      <Badge className={STATUS_COLORS[o.status] || ""}>{o.status}</Badge>
                    </div>

                    <div className="space-y-1.5 text-sm flex-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data</span>
                        <span>{format(new Date(o.created_at), "dd/MM/yyyy")}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Empresa</span>
                        <span className="text-right truncate max-w-[55%]">{est?.nome_fantasia || est?.razao_social || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fornecedor</span>
                        <span className="text-right truncate max-w-[55%]">{o.supplier_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Veículo</span>
                        <span>{o.vehicle_plate}</span>
                      </div>
                      {o.vehicle_id && driverMap.get(o.vehicle_id) && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Motorista</span>
                          <span className="text-right truncate max-w-[55%]">{driverMap.get(o.vehicle_id)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Combustível</span>
                        <span>{FUEL_LABELS[o.fuel_type] || o.fuel_type}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span className="text-muted-foreground">Quantidade</span>
                        <span>{o.fill_mode === "completar" ? "Completar" : `${o.liters} L`}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => printFuelOrderPDF({ ...o, driver_name: o.vehicle_id ? driverMap.get(o.vehicle_id) || "" : "" }, establishments)}
                      >
                        <Printer className="h-4 w-4 mr-1" /> Imprimir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEmailOrder({ ...o, driver_name: o.vehicle_id ? driverMap.get(o.vehicle_id) || "" : "" })}
                      >
                        <Mail className="h-4 w-4 mr-1" /> E-mail
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <FuelOrderFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          establishments={establishments}
          user={user}
          onCreated={handleCreated}
        />

        {emailOrder && (
          <FuelOrderEmailDialog
            open={!!emailOrder}
            onOpenChange={(v) => !v && setEmailOrder(null)}
            order={emailOrder}
            establishments={establishments}
            onStatusChanged={(id, newStatus) => {
              setOrders((prev) =>
                prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
              );
            }}
          />
        )}
      </main>
    </AdminLayout>
  );
}
