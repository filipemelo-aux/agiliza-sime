import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Fuel, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { FuelOrderFormDialog } from "@/components/fuel/FuelOrderFormDialog";
import { exportFuelOrderPDF } from "@/components/fuel/exportFuelOrderPdf";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const FUEL_LABELS: Record<string, string> = {
  gasolina: "Gasolina",
  diesel: "Diesel",
  diesel_s10: "Diesel S10",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-amber-500/10 text-amber-500",
  aprovada: "bg-emerald-500/10 text-emerald-500",
  cancelada: "bg-red-500/10 text-red-500",
};

export default function AdminFuelOrders() {
  const { user } = useUserRole();
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [establishments, setEstablishments] = useState<any[]>([]);

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
    setOrders(ordersRes.data || []);
    setEstablishments(estRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreated = (order: any) => {
    setShowForm(false);
    fetchData();
    exportFuelOrderPDF(order, establishments);
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
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Combustível</TableHead>
                    <TableHead>Qtde</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">#{o.order_number}</TableCell>
                      <TableCell>{format(new Date(o.created_at), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{o.supplier_name}</TableCell>
                      <TableCell>{o.vehicle_plate}</TableCell>
                      <TableCell>{FUEL_LABELS[o.fuel_type] || o.fuel_type}</TableCell>
                      <TableCell>
                        {o.fill_mode === "completar" ? "Completar" : `${o.liters} L`}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[o.status] || ""}>{o.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => exportFuelOrderPDF(o, establishments)}
                          title="Imprimir"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <FuelOrderFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          establishments={establishments}
          user={user}
          onCreated={handleCreated}
        />
      </main>
    </AdminLayout>
  );
}
