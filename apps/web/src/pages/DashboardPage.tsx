import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);

  useEffect(() => {
    apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken())
      .then(setWorkflows)
      .catch(() => setWorkflows([]));
  }, []);

  const published = workflows.filter((w) => w.status === "published").length;
  const drafts = workflows.filter((w) => w.status === "draft").length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Dashboard</h1>
      <p className="text-slate-600 mb-6">
        Welcome, <span className="font-medium">{user?.full_name}</span>
        {user?.company_name && (
          <> · <span className="text-slate-500">{user.company_name}</span></>
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {[
          { label: "Pending approvals", value: "—", phase: "P4" },
          { label: "My open requests", value: "—", phase: "P3" },
          { label: "Published workflows", value: String(published) },
          { label: "Draft workflows", value: String(drafts) },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm"
          >
            <p className="text-xs text-slate-500 uppercase tracking-wide">{card.label}</p>
            <p className="text-2xl font-semibold text-slate-800 mt-1">{card.value}</p>
            {card.phase && (
              <p className="text-xs text-slate-400 mt-1">{card.phase}</p>
            )}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800 mb-2">Quick links</h2>
        <ul className="text-sm text-brand-600 space-y-1">
          <li>
            <Link to="/workflows">Manage workflows</Link>
          </li>
          <li>
            <Link to="/admin">Admin setup (departments, users)</Link>
          </li>
        </ul>
        <p className="text-xs text-slate-400 mt-3">
          Roles: {user?.roles.join(", ") || "—"}
        </p>
      </div>
    </div>
  );
}
