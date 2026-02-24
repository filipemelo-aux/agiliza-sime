import { AdminLayout } from "@/components/AdminLayout";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function FreightMdfe() {
  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8">
        <BackButton to="/admin" label="Dashboard" />
        <h1 className="text-3xl font-bold font-display mb-6">MDF-e</h1>
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Em desenvolvimento</h3>
            <p className="text-muted-foreground">
              O módulo de MDF-e será implementado na próxima fase, após a conclusão do CT-e.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
