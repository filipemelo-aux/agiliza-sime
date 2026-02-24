import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, ShieldCheck } from "lucide-react";
import { EstablishmentsList } from "@/components/fiscal/EstablishmentsList";
import { CertificatesList } from "@/components/fiscal/CertificatesList";

export default function FreightFiscalSettings() {
  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <BackButton to="/admin/services" label="Serviços" />
        <h1 className="text-3xl font-bold font-display mb-6">Configurações Fiscais</h1>

        <Tabs defaultValue="establishments" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="establishments" className="gap-2">
              <Building2 className="w-4 h-4" />
              Estabelecimentos
            </TabsTrigger>
            <TabsTrigger value="certificates" className="gap-2">
              <ShieldCheck className="w-4 h-4" />
              Certificados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="establishments">
            <EstablishmentsList />
          </TabsContent>

          <TabsContent value="certificates">
            <CertificatesList />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
