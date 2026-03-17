import { AdminLayout } from "@/components/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { FinancialReceivables } from "@/components/financial/FinancialReceivables";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialCategories } from "@/components/financial/FinancialCategories";
import { FinancialInvoices } from "@/components/financial/FinancialInvoices";

export default function AdminFinancial() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "receivables";

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>

        <Tabs value={tab} onValueChange={(v) => setSearchParams({ tab: v })}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
            <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
            <TabsTrigger value="invoices">Faturas</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>

          <TabsContent value="receivables">
            <FinancialReceivables />
          </TabsContent>
          <TabsContent value="payables">
            <FinancialPayables />
          </TabsContent>
          <TabsContent value="invoices">
            <FinancialInvoices />
          </TabsContent>
          <TabsContent value="categories">
            <FinancialCategories />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
