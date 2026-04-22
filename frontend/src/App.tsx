import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalLayout } from "@/components/GlobalLayout";
import { NtrLayout } from "@/components/ntr/NtrLayout";
import { NutritionLayout } from "@/components/nutrition/NutritionLayout";
import ToolAccessGuard from "@/components/ToolAccessGuard";
import RequirePassAccess from "@/components/RequirePassAccess";

// Public pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import OAuthCallback from "./pages/OAuthCallback";
import About from "./pages/About";
import Privacy from "./pages/Privacy";

// Global platform pages (InsightPilot level)
import GlobalDashboard from "./pages/GlobalDashboard";
import Tools from "./pages/Tools";
import Billing from "./pages/Billing";
import BillingOrderDetail from "./pages/BillingOrderDetail";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";

// NTR TOOL WORKSPACE PAGES
import NtrDashboard from "./pages/ntr/NtrDashboard";
import NtrAutomations from "./pages/ntr/NtrAutomations";
import NtrReports from "./pages/ntr/NtrReports";
import NtrAIAssistant from "./pages/ntr/NtrAIAssistant";
import NtrHistory from "./pages/ntr/NtrHistory";
import NtrIntegrations from "./pages/ntr/NtrIntegrations";
import NutritionOverview from "./pages/nutrition/NutritionOverview";
import NutritionLogs from "./pages/nutrition/NutritionLogs";
import NutritionInsights from "./pages/nutrition/NutritionInsights";
import NutritionReports from "./pages/nutrition/NutritionReports";

// Auth guard
import RequireAuth from "./components/RequireAuth";

const queryClient = new QueryClient();

const GlobalLayoutWrapper = () => (
  <GlobalLayout>
    <Outlet />
  </GlobalLayout>
);

const NtrLayoutWrapper = () => (
  <NtrLayout>
    <Outlet />
  </NtrLayout>
);

const NutritionLayoutWrapper = () => (
  <NutritionLayout>
    <Outlet />
  </NutritionLayout>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Global theme toggle so light/dark works on every page */}
        <div className="fixed right-4 top-4 z-50">
          <ThemeToggle />
        </div>

        <Routes>
          {/* PUBLIC ROUTES */}
          <Route path="/" element={<Index />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />

          {/* ========== GLOBAL PLATFORM AREA (InsightPilot) ========== */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <GlobalLayoutWrapper />
              </RequireAuth>
            }
          >
            <Route index element={<GlobalDashboard />} />
            <Route
              path="tools"
              element={
                <RequirePassAccess>
                  <Tools />
                </RequirePassAccess>
              }
            />
            <Route path="billing" element={<Billing />} />
            <Route path="billing/orders/:orderId" element={<BillingOrderDetail />} />
            <Route
              path="notifications"
              element={
                <RequirePassAccess>
                  <Notifications />
                </RequirePassAccess>
              }
            />
            <Route path="profile" element={<Profile />} />
            <Route
              path="settings"
              element={
                <RequirePassAccess>
                  <Settings />
                </RequirePassAccess>
              }
            />
          </Route>

          {/* Legacy global tools entry point */}
          <Route path="/tools" element={<Navigate to="/dashboard/tools" replace />} />

          {/* ========== NICHE TRENDRADAR TOOL WORKSPACE ========== */}
          <Route
            path="/tools/ntr"
            element={
              <RequireAuth>
                <ToolAccessGuard toolKey="ntr">
                  <NtrLayoutWrapper />
                </ToolAccessGuard>
              </RequireAuth>
            }
          >
            <Route index element={<NtrDashboard />} />
            <Route path="automations" element={<NtrAutomations />} />
            <Route path="reports" element={<NtrReports />} />
            <Route path="ai-assistant" element={<NtrAIAssistant />} />
            <Route path="history" element={<NtrHistory />} />
            <Route path="integrations" element={<NtrIntegrations />} />
          </Route>

          {/* ========== NUTRITION TOOL WORKSPACE ========== */}
          <Route
            path="/tools/nutrition"
            element={
              <RequireAuth>
                <ToolAccessGuard toolKey="nutrition">
                  <NutritionLayoutWrapper />
                </ToolAccessGuard>
              </RequireAuth>
            }
          >
            <Route index element={<NutritionOverview />} />
            <Route path="logs" element={<NutritionLogs />} />
            <Route path="insights" element={<NutritionInsights />} />
            <Route path="reports" element={<NutritionReports />} />
          </Route>

          {/* CATCH-ALL (always last) */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
