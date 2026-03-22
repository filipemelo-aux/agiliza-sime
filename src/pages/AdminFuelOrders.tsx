import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Fuel, Printer, Loader2, Mail, FileDown, ShieldCheck } from "lucide-react";
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
  const [emailOrder, setEmailOrder] = useState<any | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);

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

  const handleCreated = async (order: any) => {
    setShowForm(false);
    fetchData();

    // Gerar PDF assinado automaticamente
    generateSignedPdf(order);

    toast({ title: "Ordem criada", description: `Ordem #${order.order_number} gerada com sucesso.` });
  };

  const generateSignedPdf = async (order: any) => {
    setSigningId(order.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-signed-fuel-pdf", {
        body: { order_id: order.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.pdf_base64) {
        // Converter base64 para blob e abrir download
        const pdfBytes = Uint8Array.from(atob(data.pdf_base64), (c) => c.charCodeAt(0));
        const blob = new Blob([pdfBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);

        // Abrir em nova aba para impressão
        const win = window.open(url, "_blank");
        if (win) {
          win.addEventListener("load", () => {
            setTimeout(() => win.print(), 500);
          });
        }

        toast({
          title: "PDF assinado gerado!",
          description: `Ordem #${order.order_number} assinada digitalmente com certificado A1.`,
        });
      } else if (data?.pdf_url) {
        window.open(data.pdf_url, "_blank");
        toast({ title: "PDF assinado disponível", description: "O download foi iniciado." });
      }
    } catch (err: any) {
      console.error("Erro ao gerar PDF assinado:", err);
      // Fallback: imprimir versão HTML sem assinatura
      printFuelOrderPDF(order, establishments);
      toast({
        title: "PDF gerado sem assinatura digital",
        description: err.message || "Não foi possível assinar com certificado A1. Verifique se há um certificado vinculado.",
        variant: "destructive",
      });
    } finally {
      setSigningId(null);
    }
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
              const isSigning = signingId === o.id;
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
                        disabled={isSigning}
                        onClick={() => generateSignedPdf(o)}
                      >
                        {isSigning ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4 mr-1" />
                        )}
                        {isSigning ? "Assinando..." : "PDF Assinado"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEmailOrder(o)}
                      >
                        <Mail className="h-4 w-4 mr-1" /> E-mail
                      </Button>
                    </div>

                    {/* Fallback: imprimir sem assinatura */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground"
                      onClick={() => printFuelOrderPDF(o, establishments)}
                    >
                      <Printer className="h-3 w-3 mr-1" /> Imprimir sem assinatura
                    </Button>
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
          />
        )}
      </main>
    </AdminLayout>
  );
}
