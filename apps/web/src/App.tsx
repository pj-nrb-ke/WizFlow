import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AppLayout } from "./layouts/AppLayout";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InboxPage } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { SubmitRequestPage } from "./pages/SubmitRequestPage";
import { AiWorkflowPage } from "./pages/AiWorkflowPage";
import { WorkflowsPage } from "./pages/WorkflowsPage";
import { isAuthenticated } from "./lib/auth";

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated() ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="workflows" element={<WorkflowsPage />} />
            <Route path="ai" element={<AiWorkflowPage />} />
            <Route path="submit" element={<SubmitRequestPage />} />
            <Route path="requests" element={<MyRequestsPage />} />
            <Route path="requests/:id" element={<RequestDetailPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
    </ThemeProvider>
  );
}
