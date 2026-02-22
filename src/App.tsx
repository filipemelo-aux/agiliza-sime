import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
// Register page removed — admin handles all registrations
// Profile page moved into AdminSettings
import Index from "./pages/Index";
import AdminDashboard from "./pages/AdminDashboard";
import AdminApplications from "./pages/AdminApplications";
import AdminDrivers from "./pages/AdminDrivers";
import AdminHarvest from "./pages/AdminHarvest";
import AdminServices from "./pages/AdminServices";
import AdminSettings from "./pages/AdminSettings";
import HarvestDetail from "./pages/HarvestDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/register" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/drivers" element={<AdminDrivers />} />
            <Route path="/admin/services" element={<AdminServices />} />
            <Route path="/admin/harvest" element={<AdminHarvest />} />
            <Route path="/admin/harvest/:id" element={<HarvestDetail />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/freights" element={<Index />} />
            {/* Redirects for removed pages */}
            <Route path="/profile" element={<Navigate to="/admin/settings" replace />} />
            <Route path="/driver" element={<Navigate to="/admin" replace />} />
            <Route path="/my-applications" element={<Navigate to="/admin/applications" replace />} />
            <Route path="/my-vehicles" element={<Navigate to="/admin/drivers" replace />} />
            <Route path="/add-vehicle" element={<Navigate to="/admin/drivers" replace />} />
            <Route path="/edit-vehicle/:id" element={<Navigate to="/admin/drivers" replace />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
