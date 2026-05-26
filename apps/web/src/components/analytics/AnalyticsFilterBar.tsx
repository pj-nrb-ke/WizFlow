import type { WorkflowSummary } from "../../lib/api";

export type AnalyticsFilters = {
  from: string;
  to: string;
  workflowId: string;
  status?: string;
};

const REQUEST_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "in_progress", label: "In progress" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "returned", label: "Returned" },
] as const;

type AnalyticsFilterBarProps = {
  filters: AnalyticsFilters;
  workflows: WorkflowSummary[];
  onChange: (next: AnalyticsFilters) => void;
  onApply: () => void;
  loading?: boolean;
  showStatus?: boolean;
};

/** Date range and workflow filter for analytics tabs. */
export function AnalyticsFilterBar({
  filters,
  workflows,
  onChange,
  onApply,
  loading,
  showStatus,
}: AnalyticsFilterBarProps) {
  return (
    <div className="wf-analytics-filter-bar wf-card p-4">
      <div className="wf-analytics-filter-fields">
        <label className="wf-analytics-filter-field">
          <span>From</span>
          <input
            type="date"
            className="wf-input"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </label>
        <label className="wf-analytics-filter-field">
          <span>To</span>
          <input
            type="date"
            className="wf-input"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </label>
        <label className="wf-analytics-filter-field wf-analytics-filter-field--grow">
          <span>Workflow</span>
          <select
            className="wf-input"
            value={filters.workflowId}
            onChange={(e) => onChange({ ...filters, workflowId: e.target.value })}
          >
            <option value="">All workflows</option>
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {showStatus && (
          <label className="wf-analytics-filter-field">
            <span>Status</span>
            <select
              className="wf-input"
              value={filters.status ?? ""}
              onChange={(e) => onChange({ ...filters, status: e.target.value })}
              aria-label="Filter by request status"
            >
              {REQUEST_STATUSES.map((s) => (
                <option key={s.value || "all"} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="wf-btn-primary px-5 py-2 text-sm shrink-0 self-end"
          onClick={onApply}
          disabled={loading}
        >
          {loading ? "Loading…" : "Apply filters"}
        </button>
      </div>
    </div>
  );
}

export function defaultAnalyticsFilters(): AnalyticsFilters {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    workflowId: "",
  };
}

export function filtersToParams(filters: AnalyticsFilters) {
  return {
    from: filters.from || undefined,
    to: filters.to || undefined,
    workflow_id: filters.workflowId || undefined,
  };
}
