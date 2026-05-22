import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { AppThemeSwitcher } from "../components/ThemeSwitcher";
import { useAuth } from "../context/AuthContext";
import { useAppTheme } from "../context/ThemeContext";
import { apiFetch, InboxItem, Notification, RequestSummary, WorkflowSummary } from "../lib/api";
import { getToken } from "../lib/auth";
import { THEME_META } from "../lib/themes";

export function DashboardPage() {
  const { user } = useAuth();
  const { appTheme } = useAppTheme();
  const meta = THEME_META[appTheme];
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    Promise.all([
      apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, token).catch(() => []),
      apiFetch<InboxItem[]>("/api/v1/inbox", {}, token).catch(() => []),
      apiFetch<RequestSummary[]>("/api/v1/requests", {}, token).catch(() => []),
      apiFetch<Notification[]>("/api/v1/notifications", {}, token).catch(() => []),
    ])
      .then(([w, ib, reqs, notifs]) => {
        setWorkflows(w);
        setInbox(ib);
        setRequests(reqs);
        setNotifCount(notifs.filter((n) => !n.read).length);
      })
      .finally(() => setLoading(false));
  }, []);

  const published = workflows.filter((w) => w.status === "published").length;
  const openRequests = requests.filter(
    (r) => r.status === "in_progress" || r.status === "returned"
  ).length;
  const approved = requests.filter((r) => r.status === "approved").length;

  const stats = [
    { label: "Pending approvals", value: inbox.length, link: "/inbox", icon: "◎" },
    { label: "Open requests", value: openRequests, link: "/requests", icon: "↻" },
    { label: "Approved (mine)", value: approved, link: "/requests", icon: "✓" },
    { label: "Live workflows", value: published, link: "/workflows", icon: "⚡" },
  ];

  const actions = [
    { to: "/submit", title: "Submit request", desc: "Start petty cash, purchase, leave…", icon: "＋" },
    { to: "/inbox", title: "Approval inbox", desc: "Review items waiting on you", icon: "✉" },
    { to: "/workflows", title: "Workflows", desc: "Publish, test, themes", icon: "⚙" },
    { to: "/ai", title: "AI creator", desc: "Draft a process in plain English", icon: "✦" },
  ];

  if (loading) {
    return <p className="text-slate-500 py-12 text-center">Loading your workspace…</p>;
  }

  return (
    <div className="wf-home">
      <section className="wf-home-hero">
        <div>
          <p className="text-sm font-medium opacity-80 uppercase tracking-widest mb-1">
            {meta.label} workspace
          </p>
          <h1>Welcome back, {user?.full_name?.split(" ")[0] ?? "there"}</h1>
          <p>
            {user?.company_name ?? "Your company"} — {meta.tagline}. You have{" "}
            <strong>{inbox.length}</strong> approval{inbox.length === 1 ? "" : "s"} waiting
            {notifCount > 0 && (
              <>
                {" "}
                and <strong>{notifCount}</strong> unread notification{notifCount === 1 ? "" : "s"}
              </>
            )}
            .
          </p>
        </div>
        {appTheme === "operations" && (
          <Link to="/inbox" className="wf-btn-primary px-5 py-2.5 text-sm shrink-0">
            Open inbox →
          </Link>
        )}
      </section>

      <div className="wf-stat-grid">
        {stats.map((s) => (
          <Link key={s.label} to={s.link} className="wf-stat-card">
            <span className="text-lg opacity-60" aria-hidden>
              {s.icon}
            </span>
            <p className="wf-stat-value">{s.value}</p>
            <p className="wf-stat-label">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 wf-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Recent requests</h2>
            <Link to="/requests" className="text-sm wf-link">
              View all
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No requests yet. Submit your first one.</p>
          ) : (
            <div>
              {requests.slice(0, 6).map((r) => (
                <Link key={r.id} to={`/requests/${r.id}`} className="wf-list-row">
                  <div>
                    <p className="font-medium text-slate-800">{r.workflow_name}</p>
                    <p className="text-xs text-slate-500">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleDateString()
                        : "Draft"}
                      {r.current_step_name ? ` · ${r.current_step_name}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="wf-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Inbox preview</h2>
            <Link to="/inbox" className="text-sm wf-link">
              Open inbox
            </Link>
          </div>
          {inbox.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Inbox clear — nothing pending.</p>
          ) : (
            <div>
              {inbox.slice(0, 5).map((item) => (
                <Link key={item.request_id} to="/inbox" className="wf-list-row">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{item.workflow_name}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {item.originator_name} · {item.step_name}
                    </p>
                  </div>
                  {item.amount_preview && (
                    <span
                      className="text-sm font-semibold shrink-0"
                      style={{ fontFamily: "var(--wf-font-mono)" }}
                    >
                      {item.amount_preview}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="wf-page-title mb-3">Quick actions</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {actions.map((a) => (
          <Link key={a.to} to={a.to} className="wf-action-tile">
            <span className="wf-action-icon" aria-hidden>
              {a.icon}
            </span>
            <span className="font-semibold text-slate-800">{a.title}</span>
            <span className="text-xs text-slate-500">{a.desc}</span>
          </Link>
        ))}
      </div>

      <section className="wf-card p-5">
        <h2 className="font-semibold text-slate-800 mb-1">Interface theme</h2>
        <p className="text-sm text-slate-500 mb-4">
          Each theme changes <strong>fonts</strong>, <strong>layout density</strong>, navigation
          style, and home page structure. Try Executive vs People vs Operations.
        </p>
        <AppThemeSwitcher />
      </section>
    </div>
  );
}
