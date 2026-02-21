import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Auth from "./pages/Auth";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import DriverDashboard from "./pages/DriverDashboard";
import Index from "./pages/Index";
import AdminDashboard from "./pages/AdminDashboard";
import AdminApplications from "./pages/AdminApplications";
import AdminDrivers from "./pages/AdminDrivers";
import AdminHarvest from "./pages/AdminHarvest";
import AdminServices from "./pages/AdminServices";
import HarvestDetail from "./pages/HarvestDetail";
import MyApplications from "./pages/MyApplications";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/driver" element={<DriverDashboard />} />
            <Route path="/freights" element={<Index />} />
            <Route path="/my-applications" element={<MyApplications />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/applications" element={<AdminApplications />} />
            <Route path="/admin/drivers" element={<AdminDrivers />} />
            <Route path="/admin/services" element={<AdminServices />} />
            <Route path="/admin/harvest" element={<AdminHarvest />} />
            <Route path="/admin/harvest/:id" element={<HarvestDetail />} />
            {/* Redirects for removed standalone vehicle pages */}
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
