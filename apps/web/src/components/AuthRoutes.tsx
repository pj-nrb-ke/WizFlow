import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { USE_AUTH_COOKIES, isAuthenticated } from "../lib/auth";
import { AppLayout } from "../layouts/AppLayout";
import { AdminPage } from "../pages/AdminPage";
import { DashboardPage } from "../pages/DashboardPage";
import { InboxPage } from "../pages/InboxPage";
import { LoginPage } from "../pages/LoginPage";
import { MyRequestsPage } from "../pages/MyRequestsPage";
import { RequestDetailPage } from "../pages/RequestDetailPage";
import { SubmitRequestPage } from "../pages/SubmitRequestPage";
import { AiWorkflowPage } from "../pages/AiWorkflowPage";
import { SettingsPage } from "../pages/SettingsPage";
import { WorkflowsPage } from "../pages/WorkflowsPage";
import { FormDesignerPage } from "../pages/FormDesignerPage";
import { CustomWorkflowPage } from "../pages/CustomWorkflowPage";
import { PublicApprovePage } from "../pages/PublicApprovePage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { SetupWizardPage } from "../pages/SetupWizardPage";
import { TemplatesPage } from "../pages/TemplatesPage";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { ReportsPage } from "../pages/ReportsPage";
import { IntegrationsPage } from "../pages/IntegrationsPage";
import { MasterDataPage } from "../pages/MasterDataPage";
import { HelpPage } from "../pages/HelpPage";
import { AcceptInvitePage } from "../pages/AcceptInvitePage";
import { RemindersPage } from "../pages/RemindersPage";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-500 bg-[rgb(var(--wf-page-bg))]">
      Loading…
    </div>
  );
}

/** Logged-out users only (login). */
export function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user || (!USE_AUTH_COOKIES && isAuthenticated())) {
    return <Navigate to="/" replace />;
  }
  return <LoginPage />;
}

/** Redirect unknown paths based on session. */
function CatchAllRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  const authed = Boolean(user) || (!USE_AUTH_COOKIES && isAuthenticated());
  return <Navigate to={authed ? "/" : "/login"} replace />;
}

/** Requires a valid session. */
export function RequireAuth() {
  const { user, loading } = useAuth();

  if (!USE_AUTH_COOKIES && !isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/approve/:token" element={<PublicApprovePage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="workflows" element={<WorkflowsPage />} />
          <Route path="form-designer" element={<FormDesignerPage />} />
          <Route path="custom-workflow" element={<CustomWorkflowPage />} />
          <Route path="ai" element={<AiWorkflowPage />} />
          <Route path="submit" element={<SubmitRequestPage />} />
          <Route path="requests" element={<MyRequestsPage />} />
          <Route path="requests/:id" element={<RequestDetailPage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="setup" element={<SetupWizardPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="master-data" element={<MasterDataPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
        </Route>
      </Route>
      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  );
}
