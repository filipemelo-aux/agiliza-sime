import { AdminLayout } from "@/components/AdminLayout";
import { FinancialReceivables } from "@/components/financial/FinancialReceivables";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialPaid } from "@/components/financial/FinancialPaid";
import { FinancialInvoices } from "@/components/financial/FinancialInvoices";
import { FinancialReceipts } from "@/components/financial/FinancialReceipts";
import { ChartOfAccounts } from "@/components/financial/ChartOfAccounts";

export default function AdminFinancial({ section = "receivables" }: { section?: string }) {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {section === "receivables" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Contas a Receber</h1>
            <FinancialReceivables />
          </>
        )}
        {section === "invoices" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Faturamento</h1>
            <FinancialInvoices />
          </>
        )}
        {section === "payables" && (
          <>
            <FinancialPayables />
          </>
        )}
        {section === "paid" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Contas Pagas</h1>
            <FinancialPaid />
          </>
        )}
        {section === "receipts" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Recibos</h1>
            <FinancialReceipts />
          </>
        )}
        {section === "chart" && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Plano de Contas</h1>
            <ChartOfAccounts />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
