import { AdminLayout } from "@/components/AdminLayout";
import { FinancialReceivables } from "@/components/financial/FinancialReceivables";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialPaid } from "@/components/financial/FinancialPaid";
import { FinancialCategories } from "@/components/financial/FinancialCategories";
import { FinancialInvoices } from "@/components/financial/FinancialInvoices";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminFinancial({ section = "receivables" }: { section?: string }) {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {section === "receivables" && (
          <Tabs defaultValue="receivables" className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">Contas a Receber</h1>
              <TabsList>
                <TabsTrigger value="receivables">Contas a Receber</TabsTrigger>
                <TabsTrigger value="invoices">Faturamento</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="receivables"><FinancialReceivables /></TabsContent>
            <TabsContent value="invoices"><FinancialInvoices /></TabsContent>
          </Tabs>
        )}
        {section === "payables" && (
          <Tabs defaultValue="payables" className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">Contas a Pagar</h1>
              <TabsList>
                <TabsTrigger value="payables">Contas a Pagar</TabsTrigger>
                <TabsTrigger value="paid">Contas Pagas</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="payables"><FinancialPayables /></TabsContent>
            <TabsContent value="paid"><FinancialPaid /></TabsContent>
          </Tabs>
        )}
        {section === "categories" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Cadastros Financeiros</h1>
            <FinancialCategories />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
