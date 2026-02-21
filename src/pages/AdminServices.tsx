import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Sprout } from "lucide-react";
import { Link } from "react-router-dom";

const services = [
  {
    title: "Fretes",
    description: "Gerencie cargas disponíveis, candidaturas e ordens de carregamento.",
    icon: Package,
    url: "/freights",
  },
  {
    title: "Colheita",
    description: "Gerencie serviços de colheita terceirizados, motoristas e pagamentos.",
    icon: Sprout,
    url: "/admin/harvest",
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
        <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
          {services.map((service) => (
            <Link key={service.title} to={service.url}>
              <Card className="border-border bg-card hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full">
                <CardContent className="flex flex-col items-center text-center py-10 gap-4">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <service.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold font-display mb-1">{service.title}</h2>
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </AdminLayout>
  );
}
