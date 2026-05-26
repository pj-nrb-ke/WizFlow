import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { HelpTip } from "../components/HelpTip";
import { StatusBadge } from "../components/StatusBadge";
import {
  ApiError,
  apiDownload,
  listMyRequests,
  RequestSummary,
} from "../lib/api";
import { formatDateTimeShort } from "../lib/datetime";
import { getToken } from "../lib/auth";
import { isRequestOverdue } from "../lib/sla";

type TabKey = "all" | "in_progress" | "returned" | "approved" | "rejected";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "in_progress", label: "In progress" },
  { key: "returned", label: "Returned" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
  all: {
    title: "No requests yet",
    body: "Start a petty cash, purchase, or leave request to see it tracked here.",
  },
  in_progress: {
    title: "Nothing in progress",
    body: "Submitted requests waiting for approval will appear here.",
  },
  returned: {
    title: "No returned requests",
    body: "When an approver sends a request back for edits, it will show up here.",
  },
  approved: {
    title: "No approved requests",
    body: "Completed approvals are listed here for your records.",
  },
  rejected: {
    title: "No rejected requests",
    body: "Declined requests appear here with their final status.",
  },
};

export function MyRequestsPage() {
  const [requests, setRequests] = useState<RequestSummary[]>([]);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(search), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listMyRequests({ q: debouncedQ || undefined }, getToken());
      setRequests(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (tab === "all") return requests;
    return requests.filter((r) => r.status === tab);
  }, [requests, tab]);

  async function exportCsv() {
    await apiDownload("/api/v1/requests/export.csv", "my-requests.csv", getToken());
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h1 className="wf-page-title">My requests</h1>
          <HelpTip text="Track every request you submitted. Use tabs to filter by status, search by reference or workflow name, and export a spreadsheet for reporting." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportCsv().catch((e) =>
              setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
            )}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            Export CSV
          </button>
          <Link to="/submit" className="px-4 py-2 wf-btn-primary text-sm">
            New request
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reference, workflow…"
          className="wf-input flex-1 max-w-md"
          aria-label="Search requests"
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200 pb-px">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              tab === key
                ? "border-[rgb(var(--wf-brand-600))] text-[rgb(var(--wf-brand-700))]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1.5 text-xs text-slate-400">
                ({requests.filter((r) => r.status === key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="wf-card divide-y">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-slate-800 mb-1">{EMPTY_COPY[tab].title}</p>
            <p className="text-sm text-slate-500 mb-4">{EMPTY_COPY[tab].body}</p>
            {tab === "all" && (
              <Link to="/submit" className="text-sm wf-link font-medium">
                Submit your first request →
              </Link>
            )}
          </div>
        ) : (
          filtered.map((r) => {
            const overdue = isRequestOverdue(r.submitted_at, r.sla_hours, r.status);
            return (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="block p-4 hover:bg-slate-50"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    {r.reference_number && (
                      <p className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                        {r.reference_number}
                      </p>
                    )}
                    <p className="font-medium text-slate-800">{r.workflow_name}</p>
                    {r.submitted_at && (
                      <p className="text-[10px] text-slate-400">
                        {formatDateTimeShort(r.submitted_at)}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {r.current_step_name
                        ? `Pending: ${r.current_step_name}`
                        : "Completed"}
                    </p>
                    {r.amount_preview && (
                      <p className="text-xs text-slate-600 mt-0.5 font-medium">
                        {r.amount_preview}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={r.status} />
                    {overdue && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
