import { AdminLayout } from "@/components/AdminLayout";
import { FinancialReceivables } from "@/components/financial/FinancialReceivables";
import { FinancialPayables } from "@/components/financial/FinancialPayables";
import { FinancialPaid } from "@/components/financial/FinancialPaid";
import { FinancialCategories } from "@/components/financial/FinancialCategories";
import { FinancialInvoices } from "@/components/financial/FinancialInvoices";

const titles: Record<string, string> = {
  receivables: "Contas a Receber",
  payables: "Contas a Pagar",
  paid: "Contas Pagas",
  invoices: "Faturamento",
  categories: "Cadastros Financeiros",
};

export default function AdminFinancial({ section = "receivables" }: { section?: string }) {
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{titles[section] || "Financeiro"}</h1>
        {section === "receivables" && <FinancialReceivables />}
        {section === "payables" && <FinancialPayables />}
        {section === "paid" && <FinancialPaid />}
        {section === "invoices" && <FinancialInvoices />}
        {section === "categories" && <FinancialCategories />}
      </div>
    </AdminLayout>
  );
}
