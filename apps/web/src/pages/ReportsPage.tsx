import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  AnalyticsFilterBar,
  defaultAnalyticsFilters,
  type AnalyticsFilters,
} from "../components/analytics/AnalyticsFilterBar";
import { HelpTip } from "../components/HelpTip";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import {
  ApiError,
  apiDownload,
  apiFetch,
  createSavedReportView,
  deleteSavedReportView,
  listSavedReportViews,
  SavedReportView,
  type MisActionRow,
  type WorkflowSummary,
} from "../lib/api";
import { formatDateTime } from "../lib/datetime";
import { getToken } from "../lib/auth";
import { canAccessReports } from "../lib/roles";

const REPORT_TYPE = "mis_actions";

function misQueryString(filters: AnalyticsFilters): string {
  const p = new URLSearchParams();
  if (filters.from) p.set("from", `${filters.from}T00:00:00`);
  if (filters.to) p.set("to", `${filters.to}T23:59:59`);
  if (filters.workflowId) p.set("workflow_id", filters.workflowId);
  if (filters.status) p.set("status", filters.status);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function filtersToSaved(f: AnalyticsFilters): Record<string, unknown> {
  return {
    from: f.from,
    to: f.to,
    workflow_id: f.workflowId,
    status: f.status,
  };
}

function savedToFilters(raw: Record<string, unknown>): AnalyticsFilters {
  return {
    from: String(raw.from ?? ""),
    to: String(raw.to ?? ""),
    workflowId: String(raw.workflow_id ?? raw.workflowId ?? ""),
    status: String(raw.status ?? ""),
  };
}

export function ReportsPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [applied, setApplied] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [rows, setRows] = useState<MisActionRow[]>([]);
  const [savedViews, setSavedViews] = useState<SavedReportView[]>([]);
  const [viewName, setViewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (f: AnalyticsFilters) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<MisActionRow[]>(
        `/api/v1/reports/mis/actions${misQueryString(f)}`,
        {},
        getToken()
      );
      setRows(data);
      setApplied(f);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Failed to load report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadViews = useCallback(async () => {
    try {
      setSavedViews(await listSavedReportViews(REPORT_TYPE, getToken()));
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    if (!canAccessReports(user?.roles)) return;
    apiFetch<WorkflowSummary[]>("/api/v1/workflows", {}, getToken())
      .then(setWorkflows)
      .catch(() => {});
    const initial = defaultAnalyticsFilters();
    load(initial);
    loadViews();
  }, [user?.roles, load, loadViews]);

  if (!canAccessReports(user?.roles)) {
    return <Navigate to="/" replace />;
  }

  function applyFilters() {
    load({ ...filters });
  }

  async function exportCsv() {
    await apiDownload(
      `/api/v1/reports/mis/actions.csv${misQueryString(applied)}`,
      "mis-actions.csv",
      getToken()
    );
  }

  async function exportXlsx() {
    await apiDownload(
      `/api/v1/reports/mis/actions/export.xlsx${misQueryString(applied)}`,
      "mis-actions.xlsx",
      getToken()
    );
  }

  async function saveView() {
    if (!viewName.trim()) return;
    setError("");
    try {
      await createSavedReportView(
        {
          name: viewName.trim(),
          report_type: REPORT_TYPE,
          filters: filtersToSaved(filters),
        },
        getToken()
      );
      setViewName("");
      await loadViews();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not save view");
    }
  }

  async function removeView(id: string) {
    try {
      await deleteSavedReportView(id, getToken());
      await loadViews();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail ?? e.message : "Could not delete view");
    }
  }

  return (
    <div>
      <PageHeader
        title="Actions report"
        subtitle="Timestamped audit trail of workflow events for management and MIS export."
        help={
          <HelpTip text="Every approval, rejection, return, and submission is listed with reference number, actor, and time. Filter by date range, workflow, or request status, then export to CSV or Excel." />
        }
        actions={
          <>
            <Link
              to="/analytics"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Analytics hub
            </Link>
            <button
              type="button"
              onClick={() =>
                exportCsv().catch((e) =>
                  setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
                )
              }
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() =>
                exportXlsx().catch((e) =>
                  setError(e instanceof ApiError ? e.detail ?? e.message : "Export failed")
                )
              }
              className="px-3 py-2 text-sm wf-btn-primary text-sm"
            >
              Export Excel
            </button>
          </>
        }
      />

      <div className="wf-card p-4 mb-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Saved report views</h3>
        {savedViews.length === 0 ? (
          <p className="text-xs text-slate-500 mb-3">Save filter combinations you use often.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 mb-3">
            {savedViews.map((v) => (
              <li key={v.id} className="flex items-center gap-1 text-sm border rounded-lg px-2 py-1">
                <button
                  type="button"
                  className="wf-link"
                  onClick={() => {
                    const next = savedToFilters(v.filters);
                    setFilters(next);
                    load(next);
                  }}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  className="text-red-500 text-xs px-1"
                  aria-label={`Delete ${v.name}`}
                  onClick={() => removeView(v.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Name this view…"
            className="wf-input flex-1 min-w-[10rem] max-w-xs text-sm"
          />
          <button type="button" onClick={() => void saveView()} className="wf-btn-secondary text-sm px-3">
            Save current filters
          </button>
        </div>
      </div>

      <AnalyticsFilterBar
        workflows={workflows}
        filters={filters}
        onChange={setFilters}
        onApply={applyFilters}
        loading={loading}
        showStatus
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="wf-card overflow-hidden">
        <div className="wf-data-table-wrap">
          <table className="wf-data-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Event</th>
                <th>When</th>
                <th>Actor</th>
                <th>Step</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="wf-data-table-empty">
                    Loading actions…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="wf-data-table-empty">
                    No actions match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={`${row.reference_number}-${row.action_at}-${i}`}>
                    <td className="font-mono text-xs font-semibold text-[rgb(var(--wf-brand-700))]">
                      {row.reference_number ?? "—"}
                    </td>
                    <td>{row.workflow_name}</td>
                    <td>
                      <StatusBadge status={row.request_status} />
                    </td>
                    <td>{row.event_label}</td>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(row.action_at)}</td>
                    <td>{row.actor_name ?? "—"}</td>
                    <td className="text-xs text-slate-500">{row.step_id ?? "—"}</td>
                    <td
                      className="text-sm text-slate-600 max-w-[14rem] truncate"
                      title={row.comment ?? ""}
                    >
                      {row.comment ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && rows.length > 0 && (
          <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-100">
            {rows.length} action{rows.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}
