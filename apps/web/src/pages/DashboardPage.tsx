import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, InboxItem, RequestSummary, WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [openRequests, setOpenRequests] = useState(0);

  useEffect(() => {
    const token = getToken();
    Promise.all([
      apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, token).catch(() => []),
      apiFetch<InboxItem[]>("/api/v1/inbox", {}, token).catch(() => []),
      apiFetch<RequestSummary[]>("/api/v1/requests", {}, token).catch(() => []),
    ]).then(([w, inbox, reqs]) => {
      setWorkflows(w);
      setInboxCount(inbox.length);
      setOpenRequests(reqs.filter((r) => r.status === "in_progress" || r.status === "returned").length);
    });
  }, []);

  const published = workflows.filter((w) => w.status === "published").length;

  return (
    <div>
      <h1 className="wf-page-title mb-1">Dashboard</h1>
      <p className="text-slate-600 mb-6">
        Welcome, <span className="font-medium">{user?.full_name}</span>
        {user?.company_name && (
          <> · <span className="text-slate-500">{user.company_name}</span></>
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: "Pending approvals", value: String(inboxCount), link: "/inbox" },
          { label: "My open requests", value: String(openRequests), link: "/requests" },
          { label: "Published workflows", value: String(published), link: "/workflows" },
          { label: "New request", value: "+", link: "/submit" },
        ].map((card) => (
          <Link key={card.label} to={card.link} className="wf-card p-4 hover:shadow-md transition-shadow">
            <p className="text-xs text-slate-500 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-semibold text-slate-800 mt-1">{card.value}</p>
          </Link>
        ))}
      </div>
      <div className="wf-card p-4">
        <h2 className="font-semibold text-slate-800 mb-2">Quick links</h2>
        <ul className="text-sm space-y-1">
          <li>
            <Link to="/submit" className="wf-link">
              Submit a request
            </Link>
          </li>
          <li>
            <Link to="/inbox" className="wf-link">
              Review approval inbox
            </Link>
          </li>
          <li>
            <Link to="/workflows" className="wf-link">
              Manage workflows & themes
            </Link>
          </li>
        </ul>
        <p className="text-xs text-slate-400 mt-3">Roles: {user?.roles.join(", ") || "—"}</p>
      </div>
    </div>
  );
}
