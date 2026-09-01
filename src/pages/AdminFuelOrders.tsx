import { useState, useEffect } from "react";
import { rowToneClass, StatusLegend } from "@/components/ui/status-row";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { GlobalToolbar } from "@/components/ui/global-toolbar";
import { DataGrid, DataGridColumn } from "@/components/ui/data-grid";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Fuel, Printer, Loader2, Mail, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useUnifiedCompany } from "@/hooks/useUnifiedCompany";
import { useToast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { format } from "date-fns";
import { FuelOrderFormDialog } from "@/components/fuel/FuelOrderFormDialog";
import { FuelOrderEmailDialog } from "@/components/fuel/FuelOrderEmailDialog";
import { printFuelOrderPDF } from "@/components/fuel/exportFuelOrderPdf";
import { resolveSupplierEmail, sendFuelOrderEmail } from "@/components/fuel/sendFuelOrderEmail";

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
  const { user, isAdmin, isModerator } = useUserRole();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { matrizId, unifiedLabel, unifiedCnpjs, establishments } = useUnifiedCompany();
  const [orders, setOrders] = useState<any[]>([]);
  const [driverMap, setDriverMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [emailOrder, setEmailOrder] = useState<any | null>(null);
  const canDelete = isAdmin || isModerator;

  const handleDelete = async (order: any) => {
    const ok = await confirm({
      title: "Excluir ordem",
      description: `Tem certeza que deseja excluir a ordem #${order.order_number}? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.from("fuel_orders").delete().eq("id", order.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    toast({ title: "Ordem excluída", description: `Ordem #${order.order_number} removida.` });
  };

  const fetchData = async () => {
    setLoading(true);
    const { data: ordersData } = await supabase
      .from("fuel_orders")
      .select("*")
      .order("created_at", { ascending: false });
    const ordersList = ordersData || [];
    setOrders(ordersList);

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
    toast({ title: "Ordem criada", description: `Ordem #${order.order_number} gerada com sucesso.` });

    // Refresh the list immediately so the new order appears right away
    await fetchData();

    // Resolve driver_name for PDF
    let driverName = "";
    if (order.vehicle_id) {
      const { data: veh } = await supabase
        .from("vehicles")
        .select("driver_id")
        .eq("id", order.vehicle_id)
        .maybeSingle();
      if ((veh as any)?.driver_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", (veh as any).driver_id)
          .maybeSingle();
        driverName = (prof as any)?.full_name || "";
      }
    }
    const orderWithDriver = { ...order, driver_name: driverName };

    // Auto-send by email if supplier has email registered
    const supplierEmail = await resolveSupplierEmail(order);
    if (supplierEmail) {
      const sendingToast = toast({
        title: "Enviando e-mail...",
        description: `Enviando ordem #${order.order_number} para ${supplierEmail}`,
      });
      try {
        await sendFuelOrderEmail({
          order: orderWithDriver,
          to: supplierEmail,
          unifiedLabel,
          unifiedCnpjs,
        });
        sendingToast.dismiss();
        toast({
          title: "E-mail enviado!",
          description: `Ordem #${order.order_number} enviada para ${supplierEmail}.`,
        });
        // Refresh again to reflect the "enviada" status and email_sent_at
        await fetchData();
      } catch (err: any) {
        sendingToast.dismiss();
        toast({
          title: "Falha no envio automático",
          description: err?.message || "Você pode tentar reenviar manualmente.",
          variant: "destructive",
        });
        setEmailOrder(orderWithDriver);
      }
    } else {
      toast({
        title: "Fornecedor sem e-mail cadastrado",
        description: "Abrindo envio manual para você informar o destinatário.",
      });
      setEmailOrder(orderWithDriver);
    }
  };


  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
  const single = selectedOrders.length === 1 ? selectedOrders[0] : null;
  const withDriver = (o: any) => ({ ...o, driver_name: o.vehicle_id ? driverMap.get(o.vehicle_id) || "" : "" });

  const columns: DataGridColumn<any>[] = [
    { key: "numero", header: "Nº", width: "80px", sortValue: (o) => o.order_number, cell: (o) => <span className="font-semibold tabular-nums">#{o.order_number}</span> },
    { key: "data", header: "Data", width: "110px", sortValue: (o) => o.created_at, cell: (o) => <span className="tabular-nums">{format(new Date(o.created_at), "dd/MM/yyyy")}</span> },
    { key: "fornecedor", header: "Fornecedor", sortValue: (o) => o.supplier_name || "", cell: (o) => <span className="truncate block">{o.supplier_name}</span> },
    { key: "veiculo", header: "Veículo", width: "110px", sortValue: (o) => o.vehicle_plate || "", cell: (o) => <span className="font-medium">{o.vehicle_plate}</span> },
    { key: "motorista", header: "Motorista", width: "180px", sortValue: (o) => (o.vehicle_id ? driverMap.get(o.vehicle_id) || "" : ""), cell: (o) => <span className="truncate block text-muted-foreground">{(o.vehicle_id && driverMap.get(o.vehicle_id)) || "—"}</span> },
    { key: "combustivel", header: "Combustível", width: "120px", sortValue: (o) => o.fuel_type, cell: (o) => FUEL_LABELS[o.fuel_type] || o.fuel_type },
    { key: "qtd", header: "Quantidade", width: "110px", align: "right", sortValue: (o) => (o.fill_mode === "completar" ? -1 : Number(o.liters) || 0), cell: (o) => <span className="font-mono">{o.fill_mode === "completar" ? "Completar" : `${o.liters} L`}</span> },
    { key: "email", header: "E-mail", width: "130px", sortValue: (o) => o.email_sent_at || "", cell: (o) => <span className="text-[11px] text-muted-foreground">{o.email_sent_at ? format(new Date(o.email_sent_at), "dd/MM/yy HH:mm") : "—"}</span> },
    { key: "status", header: "Status", width: "110px", align: "center", sortValue: (o) => o.status, cell: (o) => <Badge className={STATUS_COLORS[o.status] || ""}>{o.status}</Badge> },
  ];

  const actions = [
    { key: "new", label: "Nova Ordem", icon: Plus, mode: "create" as const, variant: "default" as const, onClick: () => setShowForm(true) },
    { key: "print", label: "Imprimir", icon: Printer, mode: "single" as const, disabled: !single, onClick: () => single && printFuelOrderPDF(withDriver(single), unifiedLabel, unifiedCnpjs) },
    { key: "email", label: "E-mail", icon: Mail, mode: "single" as const, disabled: !single, onClick: () => single && setEmailOrder(withDriver(single)) },
    ...(canDelete ? [{ key: "delete", label: "Excluir", icon: Trash2, mode: "single" as const, variant: "destructive" as const, disabled: !single, onClick: () => single && handleDelete(single) }] : []),
  ];

  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Ordens de Abastecimento</h1>
          <p className="text-sm text-muted-foreground">Gerencie ordens de abastecimento de veículos</p>
        </div>

        <GlobalToolbar actions={actions} selectedCount={selectedIds.size} />

        <DataGrid
          rows={orders}
          columns={columns}
          rowId={(o) => o.id}
          selected={selectedIds}
          rowClassName={(o) => rowToneClass(o.status === "aprovada" ? "resolved" : o.status === "cancelada" ? "overdue" : "pending")}
          onSelectedChange={setSelectedIds}
          loading={loading}
          minWidth={1160}
          emptyMessage="Nenhuma ordem de abastecimento encontrada"
        />

        <StatusLegend className="px-1" items={[{ tone: "pending", label: "Pendente / enviada" }, { tone: "resolved", label: "Aprovada" }, { tone: "overdue", label: "Cancelada" }]} />


        <FuelOrderFormDialog
          open={showForm}
          onOpenChange={setShowForm}
          matrizId={matrizId}
          user={user}
          onCreated={handleCreated}
        />

        {emailOrder && (
          <FuelOrderEmailDialog
            open={!!emailOrder}
            onOpenChange={(v) => !v && setEmailOrder(null)}
            order={emailOrder}
            unifiedLabel={unifiedLabel}
            unifiedCnpjs={unifiedCnpjs}
            onStatusChanged={(id, newStatus) => {
              setOrders((prev) =>
                prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
              );
              fetchData();
            }}
          />
        )}
        {ConfirmDialog}
      </main>
    </AdminLayout>
  );
}
