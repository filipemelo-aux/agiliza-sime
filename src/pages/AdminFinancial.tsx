import { AdminLayout } from "@/components/AdminLayout";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialReceipts } from "@/components/financial/FinancialReceipts";
import { FinancialReceivables } from "@/components/financial/FinancialReceivables";
import { ChartOfAccounts } from "@/components/financial/ChartOfAccounts";
import { RevenueForecasts } from "@/components/financial/RevenueForecasts";
import { FinancialCashFlow } from "@/components/financial/FinancialCashFlow";
import { FinancialInvoicing } from "@/components/financial/FinancialInvoicing";
import { FinancialPaid } from "@/components/financial/FinancialPaid";

export default function AdminFinancial({ section = "payables" }: { section?: string }) {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {section === "payables" && <FinancialPayables />}
        {section === "invoicing" && <FinancialInvoicing />}
        {section === "forecasts" && <RevenueForecasts />}
        {section === "receivables" && <FinancialReceivables />}
        {section === "receipts" && (
          <>
            <h1 className="text-lg font-bold text-foreground">Recibos</h1>
            <FinancialReceipts />
          </>
        )}
        {section === "chart" && (
          <>
            <h1 className="text-lg font-bold text-foreground">Plano de Contas</h1>
            <ChartOfAccounts />
          </>
        )}
        {section === "cashflow" && <FinancialCashFlow />}
      </div>
    </AdminLayout>
  );
}
