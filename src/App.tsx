import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import { DashboardLayout } from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Clients from "./pages/Clients";
import Plans from "./pages/Plans";
import Panels from "./pages/Panels";
import Servers from "./pages/Servers";
import Templates from "./pages/Templates";
import Reminders from "./pages/Reminders";
import Financial from "./pages/Financial";
import PaymentSettings from "./pages/PaymentSettings";
import PaymentConfig from "./pages/PaymentConfig";
import ChangePassword from "./pages/ChangePassword";
import RenewPlan from "./pages/RenewPlan";
import RenewalLogs from "./pages/RenewalLogs";
import NotFound from "./pages/NotFound";
import PublicPayment from "./pages/PublicPayment";
import PublicRecurrent from "./pages/PublicRecurrent";
import MessageLogs from "@/pages/MessageLogs";
import ClientImporter from "./pages/ClientImporter";
import Campaigns from "./pages/Campaigns";
import LandingPages from "./pages/LandingPages";
import RecurrentPayments from "./pages/RecurrentPayments";
import Promotions from "./pages/Promotions";
import GameSettings from "./pages/GameSettings";
import PublicGame from "./pages/PublicGame";

// Admin routes
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminPlatformPlans from "./pages/admin/AdminPlatformPlans";
// Super Admin routes
import SuperAdminLogin from "./pages/super-admin/SuperAdminLogin";
import SuperAdminLayout from "./pages/super-admin/SuperAdminLayout";
import SuperAdminUsers from "./pages/super-admin/SuperAdminUsers";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/pay/:token" element={<PublicPayment />} />
            <Route path="/jogar/:token" element={<PublicGame />} />
            <Route path="/recorrente/:token" element={<PublicRecurrent />} />
            {/* User routes */}
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="plans" element={<Plans />} />
              <Route path="panels" element={<Panels />} />
              <Route path="servers" element={<Servers />} />
              <Route path="templates" element={<Templates />} />
              <Route path="reminders" element={<Reminders />} />
              <Route path="message-logs" element={<MessageLogs />} />
              <Route path="financial" element={<Financial />} />
              <Route path="payments" element={<PaymentSettings />} />
              <Route path="payment-config" element={<PaymentConfig />} />
              <Route path="change-password" element={<ChangePassword />} />
              <Route path="renew-plan" element={<RenewPlan />} />
              <Route path="renewal-logs" element={<RenewalLogs />} />
              <Route path="client-importer" element={<ClientImporter />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="landing-pages" element={<LandingPages />} />
              <Route path="recurrent-payments" element={<RecurrentPayments />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="game" element={<GameSettings />} />
            </Route>
            {/* Admin routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="platform-plans" element={<AdminPlatformPlans />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
            {/* Super Admin routes */}
            <Route path="/super-admin/login" element={<SuperAdminLogin />} />
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route index element={<Navigate to="/super-admin/admins" replace />} />
              <Route path="admins" element={<SuperAdminUsers />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
