import { AdminLayout } from "@/components/AdminLayout";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialReceipts } from "@/components/financial/FinancialReceipts";


import { ChartOfAccounts } from "@/components/financial/ChartOfAccounts";
import { RevenueForecasts } from "@/components/financial/RevenueForecasts";
import { FinancialCashFlow } from "@/components/financial/FinancialCashFlow";
import { FinancialInvoicing } from "@/components/financial/FinancialInvoicing";
import { FinancialPaid } from "@/components/financial/FinancialPaid";
import { BankReconciliation } from "@/components/financial/BankReconciliation";
import { CreditCardInvoices } from "@/components/financial/CreditCardInvoices";
import { FinancialReports } from "@/components/financial/FinancialReports";
import { FinancialChecks } from "@/components/financial/FinancialChecks";
import { useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quickPrintVisibleTable } from "@/lib/pdfDownload";

function QuickPrint({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasRows, setHasRows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setHasRows(el.querySelectorAll("table tbody tr").length > 0);
    check();
    const obs = new MutationObserver(check);
    obs.observe(el, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={!hasRows} onClick={() => quickPrintVisibleTable(ref.current, title)}>
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </Button>
      </div>
      {children}
    </div>
  );
}

export default function AdminFinancial({ section = "payables" }: { section?: string }) {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        {section === "payables" && <FinancialPayables />}
        {section === "invoicing" && <FinancialInvoicing />}
        {section === "forecasts" && <RevenueForecasts />}
        
        {section === "paid" && <FinancialPaid />}
        
        {section === "receipts" && (
          <>
            <h1 className="text-lg font-bold text-foreground">Recibos</h1>
            <QuickPrint title="Recibos"><FinancialReceipts /></QuickPrint>
          </>
        )}
        {section === "chart" && (
          <>
            <h1 className="text-lg font-bold text-foreground">Plano de Contas</h1>
            <ChartOfAccounts />
          </>
        )}
        {section === "cashflow" && <QuickPrint title="Fluxo de Caixa"><FinancialCashFlow /></QuickPrint>}
        {section === "reconciliation" && <BankReconciliation />}
        {section === "credit-card" && <CreditCardInvoices />}
        {section === "checks" && <FinancialChecks />}
        {section === "reports" && <FinancialReports />}
        {section === "reports-payables" && <FinancialReports fixedReportType="payables" />}
        {section === "reports-receivables" && <FinancialReports fixedReportType="receivables" />}
        {section === "reports-cashflow" && <FinancialReports fixedReportType="cashflow" />}
        {section === "reports-checks" && <FinancialChecks reportMode />}
        {section === "reports-forecasts" && <FinancialReports fixedReportType="forecasts" />}
        {section === "reports-dre" && <FinancialReports fixedReportType="dre" />}
      </div>
    </AdminLayout>
  );
}
