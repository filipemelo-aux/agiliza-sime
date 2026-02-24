import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Sprout, BarChart3, FileText, FileCheck, Users, Truck, Settings } from "lucide-react";
import { Link } from "react-router-dom";

const serviceGroups = [
  {
    title: "Fretes — Documentos Fiscais",
    items: [
      { title: "Dashboard", description: "Visão geral de CT-e emitidos, faturamento e ICMS.", icon: BarChart3, url: "/admin/freight/dashboard" },
      { title: "CT-e", description: "Criar, validar e enviar Conhecimentos de Transporte.", icon: FileText, url: "/admin/freight/cte" },
      { title: "MDF-e", description: "Gerar e encerrar Manifestos de Documentos Fiscais.", icon: FileCheck, url: "/admin/freight/mdfe" },
      { title: "Config. Fiscais", description: "CNPJ, séries, certificado A1 e ambiente SEFAZ.", icon: Settings, url: "/admin/freight/fiscal-settings" },
    ],
  },
  {
    title: "Operações",
    items: [
      { title: "Cargas", description: "Gerencie cargas disponíveis, candidaturas e ordens de carregamento.", icon: Package, url: "/freights" },
      { title: "Colheita", description: "Gerencie serviços de colheita terceirizados, motoristas e pagamentos.", icon: Sprout, url: "/admin/harvest" },
    ],
  },
];

export default function AdminServices() {
  return (
    <AdminLayout>
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold font-display">Serviços</h1>
          <p className="text-muted-foreground">Selecione o tipo de serviço para gerenciar</p>
        </div>

        {serviceGroups.map((group) => (
          <div key={group.title} className="mb-8">
            <h2 className="text-lg font-semibold font-display text-muted-foreground mb-4">{group.title}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {group.items.map((service) => (
                <Link key={service.title} to={service.url}>
                  <Card className="border-border bg-card hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full">
                    <CardContent className="flex flex-col items-center text-center py-8 gap-3">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <service.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold font-display mb-1">{service.title}</h3>
                        <p className="text-xs text-muted-foreground">{service.description}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </main>
    </AdminLayout>
  );
}
