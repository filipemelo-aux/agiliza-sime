import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { NoticeHost } from "@/components/NoticeHost";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminApplications = lazy(() => import("./pages/AdminApplications"));
const AdminDrivers = lazy(() => import("./pages/AdminDrivers"));
const AdminPeople = lazy(() => import("./pages/AdminPeople"));
const AdminVehicles = lazy(() => import("./pages/AdminVehicles"));
const AdminVehicleAssignments = lazy(() => import("./pages/AdminVehicleAssignments"));
const AdminHarvest = lazy(() => import("./pages/AdminHarvest"));

const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const HarvestDetail = lazy(() => import("./pages/HarvestDetail"));
const FreightDashboard = lazy(() => import("./pages/FreightDashboard"));
const FreightCte = lazy(() => import("./pages/FreightCte"));
const NotasFiscaisConsulta = lazy(() => import("./pages/NotasFiscaisConsulta"));
const NotasFiscaisDownloadXml = lazy(() => import("./pages/NotasFiscaisDownloadXml"));
const FreightContracts = lazy(() => import("./pages/FreightContracts"));
const FreightSettings = lazy(() => import("./pages/FreightSettings"));
const FreightCiot = lazy(() => import("./pages/FreightCiot"));
const FreightMdfe = lazy(() => import("./pages/FreightMdfe"));
const FreightFiscalSettings = lazy(() => import("./pages/FreightFiscalSettings"));
const AdminCargas = lazy(() => import("./pages/AdminCargas"));
const AdminQuotations = lazy(() => import("./pages/AdminQuotations"));
const AdminFinancial = lazy(() => import("./pages/AdminFinancial"));
const AdminFuelOrders = lazy(() => import("./pages/AdminFuelOrders"));
const AdminFuelings = lazy(() => import("./pages/AdminFuelings"));
const AdminMaintenances = lazy(() => import("./pages/AdminMaintenances"));
const AdminReports = lazy(() => import("./pages/AdminReports"));
const AdminTransportReports = lazy(() => import("./pages/AdminTransportReports"));
const AdminFleetMetrics = lazy(() => import("./pages/AdminFleetMetrics"));
const AdminRH = lazy(() => import("./pages/AdminRH"));
const ContabilidadeFechamento = lazy(() => import("./pages/ContabilidadeFechamento"));
import NotFound from "./pages/NotFound";
import DriverPortal from "./pages/DriverPortal";
const SuperAdminTenants = lazy(() => import("./pages/superadmin/SuperAdminTenants"));
import { UpdateNotification } from "./components/UpdateNotification";
import { GlobalWriteOverlay } from "./components/ui/global-write-overlay";

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
      <NoticeHost />
      <UpdateNotification />
      <GlobalWriteOverlay />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="min-h-screen" />}>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/motorista" element={<DriverPortal />} />
            <Route path="/register" element={<Navigate to="/admin" replace />} />
            <Route path="/superadmin" element={<SuperAdminTenants />} />
            <Route path="/superadmin/*" element={<Navigate to="/superadmin" replace />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/fuel-orders" element={<AdminFuelOrders />} />
            <Route path="/admin/fuelings" element={<AdminFuelings />} />
            <Route path="/admin/maintenances" element={<AdminMaintenances />} />
            <Route path="/admin/fleet/metrics" element={<AdminFleetMetrics />} />
            <Route path="/admin/people" element={<AdminPeople />} />
            <Route path="/admin/vehicles" element={<AdminVehicles />} />
            <Route path="/admin/vehicle-assignments" element={<AdminVehicleAssignments />} />
            <Route path="/admin/drivers" element={<Navigate to="/admin/people" replace />} />
            <Route path="/admin/services" element={<Navigate to="/admin" replace />} />
            <Route path="/admin/harvest" element={<AdminHarvest />} />
            <Route path="/admin/harvest/:id" element={<HarvestDetail />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/freight/dashboard" element={<FreightDashboard />} />
            <Route path="/admin/freight/cte" element={<FreightCte />} />
            <Route path="/admin/notas-fiscais/consulta" element={<NotasFiscaisConsulta />} />
            <Route path="/admin/notas-fiscais/download-xml" element={<NotasFiscaisDownloadXml />} />
            <Route path="/admin/freight/contracts" element={<FreightContracts />} />
            <Route path="/admin/freight/settings" element={<FreightSettings />} />
            <Route path="/admin/freight/ciot" element={<FreightCiot />} />
            <Route path="/admin/freight/mdfe" element={<FreightMdfe />} />
            <Route path="/admin/freight/fiscal-settings" element={<FreightFiscalSettings />} />
            <Route path="/admin/cargas" element={<AdminCargas />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/freight/reports" element={<AdminTransportReports />} />
            <Route path="/admin/rh" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/motoristas" element={<AdminRH section="motoristas" />} />
            <Route path="/admin/rh/administrativo" element={<AdminRH section="administrativo" />} />
            <Route path="/admin/rh/colaboradores" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/movimentacoes" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/folha" element={<AdminRH section="folha_pagamento" />} />
            <Route path="/admin/rh/lancamentos" element={<Navigate to="/admin/rh/folha" replace />} />
            <Route path="/admin/rh/adiantamentos" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/comissoes" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/descontos" element={<Navigate to="/admin/rh/motoristas" replace />} />
            <Route path="/admin/rh/configuracoes" element={<AdminRH section="config" />} />
            <Route path="/admin/contabilidade/fechamento" element={<ContabilidadeFechamento />} />
            <Route path="/admin/quotations" element={<AdminQuotations />} />
            <Route path="/admin/financial" element={<Navigate to="/admin/financial/invoicing" replace />} />
            <Route path="/admin/financial/invoicing" element={<AdminFinancial section="invoicing" />} />
            <Route path="/admin/financial/forecasts" element={<AdminFinancial section="forecasts" />} />
            <Route path="/admin/financial/remessas" element={<AdminFinancial section="remessas" />} />
            
            <Route path="/admin/financial/payables" element={<AdminFinancial section="payables" />} />
            <Route path="/admin/financial/paid" element={<AdminFinancial section="paid" />} />
            
             <Route path="/admin/financial/cashflow" element={<AdminFinancial section="cashflow" />} />
             <Route path="/admin/financial/credit-card" element={<AdminFinancial section="credit-card" />} />
             <Route path="/admin/financial/reconciliation" element={<AdminFinancial section="reconciliation" />} />
             <Route path="/admin/financial/checks" element={<AdminFinancial section="checks" />} />
             <Route path="/admin/financial/receipts" element={<AdminFinancial section="receipts" />} />
             <Route path="/admin/financial/chart" element={<AdminFinancial section="chart" />} />
             <Route path="/admin/financial/invoices" element={<Navigate to="/admin/financial/invoicing" replace />} />
             <Route path="/admin/financial/bank-accounts" element={<Navigate to="/admin/financial/cashflow" replace />} />
             <Route path="/admin/financial/transactions" element={<Navigate to="/admin/financial/cashflow" replace />} />
             <Route path="/admin/financial/reports" element={<AdminFinancial section="reports" />} />
             <Route path="/admin/financial/reports/payables" element={<AdminFinancial section="reports-payables" />} />
             <Route path="/admin/financial/reports/receivables" element={<AdminFinancial section="reports-receivables" />} />
             <Route path="/admin/financial/reports/cashflow" element={<AdminFinancial section="reports-cashflow" />} />
             <Route path="/admin/financial/reports/checks" element={<AdminFinancial section="reports-checks" />} />
             <Route path="/admin/financial/reports/forecasts" element={<AdminFinancial section="reports-forecasts" />} />
             <Route path="/admin/financial/reports/dre" element={<AdminFinancial section="reports-dre" />} />
            <Route path="/freights" element={<Navigate to="/admin" replace />} />
            <Route path="/my-applications" element={<Navigate to="/admin" replace />} />
            {/* Redirects for removed pages */}
            <Route path="/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/driver" element={<Navigate to="/admin/applications" replace />} />
            <Route path="/my-vehicles" element={<Navigate to="/admin/vehicles" replace />} />
            <Route path="/add-vehicle" element={<Navigate to="/admin/vehicles" replace />} />
            <Route path="/edit-vehicle/:id" element={<Navigate to="/admin/vehicles" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
