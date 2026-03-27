import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import MyApplications from "./pages/MyApplications";
import Index from "./pages/Index";
import AdminDashboard from "./pages/AdminDashboard";
import AdminApplications from "./pages/AdminApplications";
import AdminDrivers from "./pages/AdminDrivers";
import AdminPeople from "./pages/AdminPeople";
import AdminVehicles from "./pages/AdminVehicles";
import AdminHarvest from "./pages/AdminHarvest";

import AdminSettings from "./pages/AdminSettings";
import HarvestDetail from "./pages/HarvestDetail";
import FreightDashboard from "./pages/FreightDashboard";
import FreightCte from "./pages/FreightCte";
import FreightMdfe from "./pages/FreightMdfe";
import FreightFiscalSettings from "./pages/FreightFiscalSettings";
import AdminCargas from "./pages/AdminCargas";
import AdminQuotations from "./pages/AdminQuotations";
import AdminFinancial from "./pages/AdminFinancial";
import AdminFuelOrders from "./pages/AdminFuelOrders";
import AdminFuelings from "./pages/AdminFuelings";
import AdminMaintenances from "./pages/AdminMaintenances";
import NotFound from "./pages/NotFound";
import { UpdateNotification } from "./components/UpdateNotification";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdateNotification />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/register" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/fuel-orders" element={<AdminFuelOrders />} />
            <Route path="/admin/fuelings" element={<AdminFuelings />} />
            <Route path="/admin/maintenances" element={<AdminMaintenances />} />
            <Route path="/admin/people" element={<AdminPeople />} />
            <Route path="/admin/vehicles" element={<AdminVehicles />} />
            <Route path="/admin/drivers" element={<Navigate to="/admin/people" replace />} />
            <Route path="/admin/services" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/harvest" element={<AdminHarvest />} />
            <Route path="/admin/harvest/:id" element={<HarvestDetail />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/freight/dashboard" element={<FreightDashboard />} />
            <Route path="/admin/freight/cte" element={<FreightCte />} />
            <Route path="/admin/freight/mdfe" element={<FreightMdfe />} />
            <Route path="/admin/freight/fiscal-settings" element={<FreightFiscalSettings />} />
            <Route path="/admin/cargas" element={<AdminCargas />} />
            <Route path="/admin/quotations" element={<AdminQuotations />} />
            <Route path="/admin/financial" element={<Navigate to="/admin/financial/receivables" replace />} />
            <Route path="/admin/financial/receivables" element={<AdminFinancial section="receivables" />} />
            <Route path="/admin/financial/invoices" element={<AdminFinancial section="invoices" />} />
            <Route path="/admin/financial/payables" element={<AdminFinancial section="payables" />} />
            <Route path="/admin/financial/paid" element={<Navigate to="/admin/financial/payables" replace />} />
            <Route path="/admin/financial/receipts" element={<AdminFinancial section="receipts" />} />
            <Route path="/admin/financial/chart" element={<AdminFinancial section="chart" />} />
            <Route path="/admin/financial/bank-accounts" element={<Navigate to="/admin/financial/payables" replace />} />
            <Route path="/admin/financial/transactions" element={<Navigate to="/admin/financial/payables" replace />} />
            <Route path="/admin/financial/reports" element={<Navigate to="/admin/financial/payables" replace />} />
            <Route path="/freights" element={<Index />} />
            <Route path="/my-applications" element={<MyApplications />} />
            {/* Redirects for removed pages */}
            <Route path="/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/driver" element={<Navigate to="/admin/applications" replace />} />
            <Route path="/my-vehicles" element={<Navigate to="/admin/vehicles" replace />} />
            <Route path="/add-vehicle" element={<Navigate to="/admin/vehicles" replace />} />
            <Route path="/edit-vehicle/:id" element={<Navigate to="/admin/vehicles" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
